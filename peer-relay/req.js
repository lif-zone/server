// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import xerr from '../util/xerr.js';
import date from '../util/date.js';
import util from '../util/util.js';
const REQ_TIMEOUT = 20*date.ms.SEC;
const b2s = util.buf_to_str;

const reqs = {};
let free_req_id = date.monotonic();

function res_handler(body, from, msg){
  let {req_id, type} = msg;
  if (!req_id || type!='res')
    return;
  // XXX: if final response, remove from this.reqs
  if (!reqs[req_id]) // XXX: change to LERR
    return xerr.notice('req not found %s', req_id);
  let req = reqs[req_id];
  delete reqs[req_id];
  clearTimeout(req.timeout);
  req.emit('res', msg);
}

export default class Req extends EventEmitter {
  // {node, dst, hdr, body}
  constructor(opt){
    super();
    let {hdr, body, node, dst} = opt;
    assert(node, 'must provide node');
    assert(dst, 'must provide dst');
    let {req_id, cmd} = hdr;
    this.node = node;
    let router = this.router = node.router;
    this.dst = dst;
    let from=b2s(node.id), path=[];
    assert(util.is_mocha() || !req_id, 'manual req_id only in tests '+req_id);
    req_id = req_id || ''+free_req_id++;
    let nonce=''+Math.floor(1e15*Math.random()), ts=date.monotonic();
    let msg = {req_id, ts, type: 'req', to: dst, from, nonce, cmd, body, path};
    router._touched[nonce] = true; // XXX: mv out of here
    msg.sign = router.wallet.sign(msg); // XXX: mv out of here
    // XXX: use etask
    let timeout = setTimeout(()=>{
      delete reqs[req_id];
      this.emit('fail', {error: 'timeout', req_id});
    }, REQ_TIMEOUT);
    reqs[req_id] = this;
    this.req_id = req_id; // XXX: change to id
    this.timeout = timeout;
    // XXX HACK
    if (util.is_mocha())
      this.test_send = ()=>(router._send(msg), this);
    else {
      router._send(msg);
      this.test_send = ()=>this;
    }
    if (!router.res_handler_attached){
      router.on('message', res_handler);
      router.res_handler_attached = true;
    }
  }
  test_send(){ return this.req.test_send(); }
}

