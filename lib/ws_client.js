'use strict'; /*jslint node:true*/
const events = require('events');
// XXX: const json6 = require('json-6');
// XXX: use npm ws instead?
const WebSocket = window.WebSocket;

class SignalClient extends events.EventEmitter {
  // XXX arik: need auto-reconnect
  constructor(opt){
    super();
    if (!opt.url)
      throw new Error('ws: missing url');
    const ws = this.ws = new WebSocket(opt.url);
    ws.addEventListener('open', ()=>{
      console.log('ws: open');
      this.opened = true;
      this.emit('open');
    });
    ws.addEventListener('close', ()=>{
      console.log('ws: close');
      this.opened = false;
      this.emit('close');
    });
    ws.addEventListener('error', err=>{
      console.error('ws: error %o', err);
      this.emit('error', err);
    });
    ws.addEventListener('message', (message, bin)=>{
      console.log('ws: message %o', message);
      if (bin)
        return console.error('bin not supported');
      const o = JSON.parse(message.data);
      if (!o)
        return console.error('invalid message %o', message);
      if (o.event)
        this.emit('event-'+o.event, o);
    });
  }
  json(o){ this.ws.send(JSON.stringify(o)); }
}

module.exports = SignalClient;
