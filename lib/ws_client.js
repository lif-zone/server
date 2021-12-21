'use strict'; /*jslint node:true*/
const events = require('events');
// XXX: const json6 = require('json-6');
// XXX: use npm ws instead?
const WebSocket = window.WebSocket;
const uuidv4 = require('uuid').v4;
const log = require('../util/log.js');
import * as date from '../util/date.js';

class SignalClient extends events.EventEmitter {
  // XXX arik: need auto-reconnect
  constructor(opt){
    super();
    if (!opt.url)
      throw new Error('ws: missing url');
    this.uuid = uuidv4();
    console.log(`ws: new client uuid ${this.uuid}`, this);
    const ws = this.ws = new WebSocket(opt.url);
    ws.addEventListener('open', ()=>{
      console.log('ws: open');
      this.opened = true;
      this.emit('open');
      // XXX HACK: mv settings src to this.send command
      this.json({event: 'join', src: this.uuid});
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
      switch (o.event)
      {
        case 'ping':
        case 'pong':
          this.emit(o.event, o);
          break;
        default: this.emit('event-'+o.event, o); // XXX HACK: rm
      }
    });
    this.on('ping', e=>{
      log(`ws: <ping src ${e.src}`, e);
      log(`ws: >pong dst ${e.src}`);
      this.json({event: 'pong', src: this.uuid, dst: e.src, ts: Date.now()});
    });
    this.on('pong', e=>{
      log(`ws: <pong src ${e.src} ts ${date.to_time_ms(+e.ts)}`, e);
    });
  }
  // XXX: rename to send
  json(o){ this.ws.send(JSON.stringify(o)); }
  ping(dst){
    log(`ws: >ping dst ${dst}`);
    this.json({event: 'ping', src: this.uuid, dst, ts: Date.now()});
  }
}

module.exports = SignalClient;
