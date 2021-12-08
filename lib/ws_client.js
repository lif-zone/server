'use strict'; /*jslint node:true*/
// XXX: rename file to signal_client.js
const events = require('events');
const through2 = require('through2');
const util = require('../util/util.js');
// XXX: const json6 = require('json-6');
// XXX: use npm ws instead?
const WebSocket = window.WebSocket;
const SEC = 1000; // XXX: use util.ms.SEC

class SignalClient extends events.EventEmitter {
  // XXX arik: need auto-reconnect
  constructor(opt){
    super();
    this.req_id = 0;
    if (!opt.url)
      throw new Error('signal_client: missing url');
    const ws = this.ws = new WebSocket(opt.url);
    ws.addEventListener('open', ()=>{
      console.log('signal_client: open');
      this.opened = true;
      this.emit('open');
    });
    ws.addEventListener('close', ()=>{
      console.log('signal_client: close');
      this.opened = false;
      this.emit('close');
    });
    ws.addEventListener('error', err=>{
      console.log('signal_client: error %o', err);
      this.emit('error', err);
    });
    ws.addEventListener('message', o=>{
      console.log('signal_client: message %o', o);
      this.emit('message', o);
    });
  }
  send(o){
    this.ws.send(JSON.stringify(o));
  }
  cmd(cmd, params, opt){
    let wait = util.wait();
    opt = opt||{};
    let timer, timeout = opt.timeout||10*SEC, req_id = ++this.req_id;
    this.send({req_id, cmd, params});
    let timeout_cb = ()=>{
      this.off('message', cb);
      wait.throw('signal_client: cmd timeout '+cmd);
    };
    let cb = o=>{
      if (!o.data)
        return;
      let data;
      // XXX: not efficient, parse it once in message, and emit 'json'
      try { data = JSON.parse(o.data); }
      catch(err){
        return console.error('signal_client: parse error %o', o.data); }
      if (data.resp_id!=req_id)
        return;
      clearTimeout(timer);
      wait.continue(data.resp);
    };
    this.on('message', cb);
    timer = setTimeout(timeout_cb, timeout);
    return wait;
  }
  broadcast(message){
    console.log('signal_client: broadcast %o', message);
    if (!this.opened)
      throw new Error('signal_client: closed');
    this.ws.send(JSON.stringify({cmd: 'broadcast', message}));
  }
}

module.exports = SignalClient;

function SignalhubWs(opt, WebSocketClass){
  let {urls} = opt;
  this.opened = false;
  this.sockets = [];
  const channels = this.channels = new Map();
  this.subscribers = {get length(){ return channels.size; }};

  if (typeof urls=='string' && urls)
    urls = [urls];
  if (!Array.isArray(urls) || !urls.length)
    throw Error('ws_client: no url specified');
  let countOpen = 0;
  for (let index = 0; index < urls.length; index++)
  {
    const socket = new WebSocketClass(`${urls[index]}/`);
    this.sockets.push(socket);
    socket.addEventListener('open', ()=>{
      if (++countOpen===urls.length)
      {
        this.opened = true;
        this.emit('open');
      }
      for (let channel of this.channels.values())
        channel.emit('open');
    });
    socket.addEventListener('message', message=>this.onMessage(message));
    socket.addEventListener('error', event=>{
      if (this.listeners('error').length > 0)
        this.emit('error', {event, url: urls[index]});
      else
        console.error(event);
    });
  }
}

SignalhubWs.prototype.subscribe = function(channel){
  if (this.closed)
    throw new Error('ws_client: cannot subscribe after close');
  if (this.channels.has(channel))
    return this.channels.get(channel);
  this.channels.set(channel, through2.obj());
  this.channels.get(channel).on('close', ()=>this.channels.delete(channel));
  if (this.opened)
  {
    process.nextTick(()=>{
      if (this.channels.has(channel)){
        this.channels.get(channel).emit('open');
      }
    });
  }
  return this.channels.get(channel);
};

SignalhubWs.prototype.broadcast = function(channel, message, cb){
  if (this.closed)
    throw new Error('ws_client: annot broadcast after close');
  const data = {channel, message};
  this.sockets.forEach(socket=>socket.send(JSON.stringify(data)));
  cb && cb();
};

SignalhubWs.prototype.onMessage = function(message){
  message = JSON.parse(message.data);
  for (let key of this.channels.keys())
  {
    if (message.channel===key)
    {
      this.channels.get(key).write(message.message);
      continue;
    }
    if (!Array.isArray(key))
      continue;
    for (let i=0; i<key.length; i++)
    {
      if (key[i]===message.channel)
        this.channels.get(key).write(message.message);
    }
  }
};

SignalhubWs.prototype.close = function(cb){
  if (this.closed)
  {
    if (cb)
      process.nextTick(cb);
    return;
  }
  this.once('close', ()=>{
    if (cb)
      cb();
    this.closed = true;
  });
  const len = this.sockets.length;
  if (len===0)
  {
    this.emit('close');
    return;
  }
  this.once('close:socket', ()=>this._closeChannels());
  let closed = 0;
  this.sockets.forEach(socket=>{
    socket.addEventListener('close', ()=>{
      if (++closed===len)
        this.emit('close:socket');
    });
    process.nextTick(()=>socket.close());
  });
};

SignalhubWs.prototype._closeChannels = function(){
  const len = this.channels.size;
  if (!len)
  {
    this.emit('close');
    return;
  }
  let closed = 0;
  for (let channel of this.channels.values())
  {
    process.nextTick(()=>{
      channel.end(()=>{
        if (++closed===len)
        {
          this.channels.clear();
          this.emit('close');
        }
      });
    });
  }
};

if (0) // XXX: rm
module.exports = function(opt){
  return new SignalhubWs(opt, WebSocket); };
