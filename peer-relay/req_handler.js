// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import util from '../util/util.js';
import date from '../util/date.js';
const b2s = util.buf_to_str;

function req_handler(body, from, msg){
  let {req_id, type, cmd} = msg;
  if (!req_id || type!='req')
    return;
  let res = {router: this.router, from: b2s(from), req_id, cmd,
    send: function(body){
      return send_res(this.router, {req_id: this.req_id, type: 'res',
      cmd: this.cmd, to: this.from, body});
    },
  };
  this.emit('req', msg, res);
}

function send_res(router, o){
  // XXX: this api is doing too much low-level. need more generic router api
  let req_id=o.req_id, to=o.to, from=b2s(router.id), path=[];
  let nonce=''+Math.floor(1e15*Math.random()), ts=date.monotonic();
  let msg = {req_id, ts, type: 'res', to, from, nonce, cmd: o.cmd,
    body: o.body, path};
  router._touched[nonce] = true;
  msg.sign = router.wallet.sign(msg);
  router._send(msg); // XXX: what if error
}

export default class ReqHandler extends EventEmitter {
  constructor(opt){
    super();
    let {node} = opt;
    let router = node.router;
    this.node = node;
    this.router = router;
    router.on('message', req_handler.bind(this));
  }
  // XXX: need unregister + cleanup
}

ReqHandler.send_res = send_res;
