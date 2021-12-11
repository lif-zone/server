'use strict'; /*jslint node:true*/
// XXX: rename file to signal_client.js
const events = require('events');
const util = require('../util/util.js');
// XXX: const json6 = require('json-6');
// XXX: use npm ws instead?
const WebSocket = window.WebSocket;
const SEC = 1000; // XXX: use util.ms.SEC

class SignalClient extends events.EventEmitter {
  // XXX arik: need auto-reconnect
  constructor(opt){
    super();
    this.req_id = 0; // XXX: change to random uuid
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
    ws.addEventListener('message', (message, bin)=>{
      console.log('signal_client: message %o', message);
      if (bin)
        return console.error('bin not supported');
      const o = JSON.parse(message.data);
      if (!o)
        return console.error('invalid message %o', message);
      if (o.event)
      {
        this.emit('event-'+o.event, o);
        return;
      }
      let {cmd, req_id, src, params} = o;
      switch (cmd)
      {
      case 'ping':
        this.json({cmd: 'pong', dst: src, resp_id: req_id, resp: params});
        break;
      default: this.emit('message', message);
      }
      this.emit(cmd, {req_id, src, params});
    });
  }
  json(o){ this.ws.send(JSON.stringify(o)); }
  cmd(cmd, dst, params, opt){
    let wait = util.wait();
    opt = opt||{};
    let timer, timeout = opt.timeout||10*SEC, req_id = ++this.req_id;
    this.json({cmd, req_id, dst, params});
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
}

module.exports = SignalClient;
