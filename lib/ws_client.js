'use strict'; /*jslint node:true*/
const events = require('events');
const through2 = require('through2');
const inherits = require('inherits');
const WebSocket = window.WebSocket;

function SignalhubWs(app, urls, WebSocketClass){
  this.opened = false;
  this.sockets = [];
  this.app = app;
  const channels = this.channels = new Map();
  this.subscribers = {get length(){ return channels.size; }};

  if (typeof urls=='string' && urls)
    urls = [urls];
  if (!Array.isArray(urls) || !urls.length)
    throw Error('ws_client: no url specified');
  let countOpen = 0;
  for (let index = 0; index < urls.length; index++)
  {
    const socket = new WebSocketClass(`${urls[index]}/${app}`);
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

inherits(SignalhubWs, events.EventEmitter);

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
  const data = {app: this.app, channel, message};
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

module.exports = function(app, urls){
  return new SignalhubWs(app, urls, WebSocket); };
