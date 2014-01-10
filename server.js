var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    princeton = require('./princeton'),
    mongoose = require('mongoose'),
    chatter = require('./chatter.js'),
    crypto = require('crypto'),
    wait = require('wait.for');

var port = process.env.PORT || 3000;
server.listen(port);

var mongoUrl;
app.configure('development', function() {
  mongoUrl = 'mongodb://localhost/test';
});
app.configure('production', function() {
  mongoUrl = process.env.MONGOHQ_URL;
  // Needed to get the client's IP on Heroku for Express
  app.enable('trust proxy');
});
mongoose.connect(mongoUrl);


app.use(express.cookieParser());

app.get('/chat', function(req, res) {
  if (princeton.isValidIP(req.ip)) {
    if (!req.cookies.chatterID) {
      crypto.pseudoRandomBytes(16, function(err, buff) {
       res.cookie('chatterID', buff.toString('hex'), {
         maxAge: 60*60*24*356*1000
       });
     });
    }

    res.sendfile(__dirname + '/public/chat.html');
  } else {
    // FIXME : serve a denial page to non-Princeton users
    res.send('Sorry, this site is only for Princeton students!');
  }
});

app.use(express.static(__dirname + '/public'));

var connectedUsers = {}

io.configure('production', function() {
  io.set('authorization', function(handshakeData, callback) {
    // Check if Princeton IP
    var ipAddr = getClientIP(handshakeData);
    var isValidIP = princeton.isValidIP(ipAddr);
    if (!isValidIP) {
      callback('Sorry, this site is only for Princeton students!', false);
    }
    // Check if already connected to server
    if (ipAddr in connectedUsers) {
      callback('Sorry, you can only chat with one person at a time!', false);
    } else {
      callback(null, true);
    }
  });
});

// Needed to get the client's IP on Heroku for socket.io
function getClientIP(handshakeData) {
  var forwardedIps = handshakeData.headers['x-forwarded-for'];
  if (forwardedIps) {
    return forwardedIps.split(', ')[0];
  } else {
    return handshakeData.address.address;
  }
}

function getValueFromCookie(name, cookie) {
  var pairs = cookie.split('; ');
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i].split('=');
    if (pair[0] === name) {
      return pair[1];
    }
  }
}

io.sockets.on('connection', function(socket) {
  // Add user to list of connected users
  var ipAddr = getClientIP(socket.handshake);
  connectedUsers[ipAddr] = true;
  socket.on('disconnect', function() {
    delete connectedUsers[ipAddr];
  });

  var userID = getValueFromCookie('chatterID', socket.handshake.headers.cookie);
  if (userID) {
    // FIXME
    wait.launchFiber(chatter.connectChatter, socket, userID);
  }
});
