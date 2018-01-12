var winston = require('winston');
var Busboy = require('busboy');

// For handling serving stored urls

var URLHandler = function(options) {
  if (!options) {
    options = {};
  }
  this.keyLength = options.urlKeyLength || URLHandler.defaultKeyLength;
  this.store = options.store;
  this.keyGenerator = options.urlKeyGenerator;
};

URLHandler.defaultKeyLength = 7;

// Handle adding a new URL
URLHandler.prototype.handlePost = function (request, response) {
  var _this = this;
  var buffer = '';
  var cancelled = false;

  // What to do when done
  var onSuccess = function () {
    // And then save if we should
    _this.chooseKey(function (key) {
      _this.store.set(key, buffer, function (res) {
        if (res) {
          winston.verbose('added url', { key: key });
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ key: key }));
        }
        else {
          winston.verbose('error adding url');
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ message: 'Error adding document.' }));
        }
      });
    });
  };

  // If we should, parse a form to grab the data
  var ct = request.headers['content-type'];
  if (ct && ct.split(';')[0] === 'multipart/form-data') {
    var busboy = new Busboy({ headers: request.headers });
    busboy.on('field', function (fieldname, val) {
      if (fieldname === 'data') {
        buffer = val;
      }
    });
    busboy.on('finish', function () {
      onSuccess();
    });
    request.pipe(busboy);
  // Otherwise, use our own and just grab flat data from POST body
  } else {
    request.on('data', function (data) {
      buffer += data.toString();
    });
    request.on('end', function () {
      if (cancelled) { return; }
      onSuccess();
    });
    request.on('error', function (error) {
      winston.error('connection error: ' + error.message);
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'Connection error.' }));
      cancelled = true;
    });
  }
};

// Keep choosing keys until one isn't taken
URLHandler.prototype.chooseKey = function(callback) {
  var key = this.acceptableKey();
  var _this = this;
  this.store.get(key, function(ret) {
    if (ret) {
      _this.chooseKey(callback);
    } else {
      callback(key);
    }
  });
};

URLHandler.prototype.acceptableKey = function() {
  return this.keyGenerator.createKey(this.keyLength);
};

module.exports = URLHandler;