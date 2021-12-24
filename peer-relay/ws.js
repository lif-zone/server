'use strict'; /*jslint node:true, browser:true*/
import {inherits} from 'util';
import {EventEmitter} from 'events';
import _debug from 'debug';
import WS, {WebSocketServer} from 'ws';
import fs from 'fs';
import https from 'https';
const debug = _debug('peer-relay:ws');
const WebSocket = getWebSocket();

export default WsConnector;

inherits(WsConnector, EventEmitter);
// XXX: use opts instead of id,port,host
function WsConnector(id, port, host){
  var self = this;
  self.id = id;
  self.destroyed = false;
  self._wss = null;
  self.url = null;
  if (port != null)
  {
    // XXX create: move to nconf
    const https_opt = {
      key: fs.readFileSync('/var/lif/ssl/STAR_lif_zone.key'),
      cert: fs.readFileSync('/var/lif/ssl/STAR_lif_zone.crt')};
    self.https_server = https.createServer(https_opt).listen(port, '0.0.0.0');
    self._wss = new WebSocketServer({server: self.https_server});
    self._wss.on('connection', onConnection);
    self._wss.on('listening', onListen);
    if (port !== 0)
      self.url = 'wss://'+host+':' + port;
  }

  function onConnection(ws){ self._onConnection(ws); }

  function onListen(){
    if (self.destroyed)
      return;
    self.url = 'wss://'+host+':' + self._wss._server.address().port;
  }
}

WsConnector.prototype.connect = function(url){
  var self = this;
  self._onConnection(new WebSocket(url));
};

WsConnector.prototype._onConnection = function(ws){
  var self = this;
  if (self.destroyed)
  {
    ws.close();
    return;
  }
  var channel = new WsChannel(self.id, ws);
  channel.on('open', onOpen);
  channel.on('close', onClose);
  channel.on('error', onError);

  function onOpen(){
    channel.removeListener('open', onOpen);
    channel.removeListener('close', onClose);
    channel.removeListener('error', onError);
    if (self.destroyed)
    {
      channel.destroy();
      return;
    }
    self.emit('connection', channel);
  }

  function onClose(){
    channel.removeListener('open', onOpen);
    channel.removeListener('close', onClose);
    channel.removeListener('error', onError);
  }

  function onError(err){
    console.error('ws.js error %s %o', err.message, err);
    self._debug(err, err.stack);
  }
};

WsConnector.prototype.destroy = function(cb){
  var self = this;
  if (self.destroyed)
    return;
  self.destroyed = true;
  if (self._wss)
    self._wss.close(()=>this.https_server.close(cb));
  else if (cb)
    cb();
  self._wss = null;
};

WsConnector.prototype._debug = function(){
  var self = this;
  var prepend = '[' + self.id.toString('hex', 0, 2) + ']  ';
  arguments[0] = prepend + arguments[0];
  debug.apply(null, arguments);
};

inherits(WsChannel, EventEmitter);
function WsChannel(localID, ws){
  var self = this;
  self.localID = localID;
  self.id = undefined;
  self.destroyed = false;
  self.ws = ws;
  ws.onopen = onOpen;
  ws.onmessage = onMessage;
  ws.onclose = onClose;
  ws.onerror = onError;
  if (ws.readyState === 1)
    onOpen(); // if already open

  function onOpen(){ self._onOpen(); }

  function onMessage(data){ self._onMessage(data.data); }

  function onClose(){ self.destroy(); }

  function onError(err){ self._onError(err); }
}

WsChannel.prototype._onOpen = function(){
  var self = this;
  if (self.destroyed)
    return;
  self.ws.send(JSON.stringify(self.localID));
};

WsChannel.prototype.send = function(data){
  var self = this;
  if (self.destroyed)
    return;
  if (self.ws.readyState === 2)
    return; // readyState === CLOSING
  if (self.ws.readyState !== 1)
    throw new Error('WebSocket is not ready');
  var str = JSON.stringify(data);
  self.ws.send(str);
};

WsChannel.prototype._onMessage = function(data){
  var self = this;
  if (self.destroyed)
    return;
  var json = JSON.parse(data);
  if (self.id == null)
  {
    self.id = new Buffer(json, 'hex');
    self._debug('OPEN');
    self.emit('open');
  }
  else
    self.emit('message', json);
};

WsChannel.prototype._onError = function(err){
  var self = this;
  if (self.destroyed)
    return;
  self._debug('ERROR', err);
  self.emit('error', err);
};

WsChannel.prototype._debug = function(){
  var self = this;
  var remote = self.id ? self.id.toString('hex', 0, 2) : '?';
  var prepend = '[' + self.localID.toString('hex', 0, 2) + '->' +
    remote + ']  ';
  arguments[0] = prepend + arguments[0];
  debug.apply(null, arguments);
};

WsChannel.prototype.destroy = function(){
  var self = this;
  if (self.destroyed)
    return;
  self._debug('CLOSE');
  self.destroyed = true;
  self.ws.close();
  self.ws = null;
  self.emit('close');
};

function getWebSocket(){
  if (typeof window !== 'undefined' && window.WebSocket)
    return window.WebSocket;
  return WS;
}
