// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {inherits} from 'util';
import {EventEmitter} from 'events';
import xutil from '../util/util.js';
import {dbg_id, dbg_sd, dbg_msg} from './util.js';
import ws_util from '../util/ws.js';
import fs from 'fs';
import https from 'https';
import http from 'http';
import xlog from '../util/xlog.js';
const log = xlog('ws');
// XXX HACK: need to add root ca certificate
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
export default WsConnector;

inherits(WsConnector, EventEmitter);
// XXX: use opts instead of id,port,host
function WsConnector(id, port, host, is_http){
  var self = this;
  self.id = id;
  // XXX HACK: review tmp_id_n+channels - it's a quick hack to cleanup
  // open channels - need to properly rewrite everything
  self.tmp_id_n = 0;
  self.channels = {};
  self.destroyed = false;
  self._wss = null;
  self.url = null;
  if (port>=0)
  {
    // XXX create: move to nconf
    const https_opts = {
      port,
      key: fs.readFileSync('/var/lif/ssl/STAR_lif_zone.key'),
      cert: fs.readFileSync('/var/lif/ssl/STAR_lif_zone.crt')};
    self.https_server = is_http ?
      http.createServer(https_opts).listen(port, '0.0.0.0') :
      https.createServer(https_opts).listen(port, '0.0.0.0');
    self._wss = new ws_util.WebSocketServer({server: self.https_server});
    self._wss.on('connection', onConnection);
    self._wss.on('listening', onListen);
    if (port !== 0){
      self.url = (is_http ? 'ws://' : 'wss://')+(host||'localhost')+':' + port;
      log.notice('wss %s', self.url);
      log.debug('%s wss %s', self.dbg_str(), self.url);
    }
  }

  function onConnection(ws){ self._onConnection(ws); }

  function onListen(){
    if (self.destroyed)
      return;
    let port = self._wss._server.address().port;
    self.emit('listen', {port, url: self.url});
  }
}

WsConnector.prototype.connect = function(url){
  var self = this;
  self._onConnection(getWebSocket(url));
};

WsConnector.prototype._onConnection = function(ws){
  var self = this;
  if (self.destroyed)
  {
    ws.close();
    return;
  }
  var channel = new WsChannel(self.id, ws);
  channel.tmp_id = ++self.tmp_id_n;
  self.channels[channel.tmp_id] = channel;
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
    delete self.channels[channel.tmp_id];
  }

  function onError(err){ log.err('%s error %s %s', self.dbg_str(),
    err.message, xutil.get(err, 'error.stack')); }
};

WsConnector.prototype.destroy = function(cb){
  var self = this;
  if (self.destroyed)
    return;
  self.destroyed = true;
  for (let i in self.channels)
    self.channels[i].destroy();
  if (self._wss)
    self._wss.close(()=>this.https_server.close(cb));
  else if (cb)
    cb();
  self._wss = null;
};

WsConnector.prototype.dbg_str = function(){ return dbg_id(this.id); };

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
  if (self.ws.readyState==2)
    return; // readyState === CLOSING
  if (self.ws.readyState!=1)
    throw new Error('WebSocket is not ready');
  var str = JSON.stringify(data);
  log.debug('%s send %s nonce %s', this.dbg_str(), dbg_msg(data), data.nonce);
  self.ws.send(str);
};

WsChannel.prototype._onMessage = function(data){
  var self = this;
  if (self.destroyed)
    return;
  // XXX: protect all external JSON.parse
  var json = JSON.parse(data);
  log.debug('%s msg %s nonce %s', this.dbg_str(), dbg_msg(json), data.nonce);
  if (self.id == null)
  {
    self.id = new Buffer(json, 'hex');
    log.debug('%s open', self.dbg_str());
    self.emit('open');
  }
  else
    self.emit('message', json);
};

WsChannel.prototype._onError = function(err){
  log.err('_onError %s', err);
  var self = this;
  if (self.destroyed)
    return;
  log.err('ERROR', err);
  self.emit('error', err);
};

WsChannel.prototype.dbg_str = function(){
  return dbg_sd(this.id, this.localID); };

WsChannel.prototype.destroy = function(){
  var self = this;
  if (self.destroyed)
    return;
  log.debug('%s CLOSE', self.dbg_str());
  self.destroyed = true;
  self.ws.close();
  self.ws = null;
  self.emit('close');
};

function getWebSocket(url){
  // XXX: rm special handling for browser
  if (typeof window !== 'undefined' && window.WebSocket)
    return new window.WebSocket(url);
  return new ws_util.WS(url);
}
