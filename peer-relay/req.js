// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import xerr from '../util/xerr.js';
import date from '../util/date.js';
import etask from '../util/etask.js';
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
  if (req.timeout)
    req.timeout.return();
  req.emit('res', msg);
}

export default class Req extends EventEmitter {
  constructor(opt){
    super();
    let {node, dst, stream, req_id, cmd} = opt;
    assert(node, 'must provide node');
    assert(dst, 'must provide dst');
    this.node = node;
    let router = this.router = node.router;
    this.dst = dst;
    this.cmd = cmd;
    this.stream = stream;
    assert(util.is_mocha() || !req_id, 'manual req_id only in tests '+req_id);
    req_id = req_id || ''+free_req_id++;
    reqs[req_id] = this;
    this.req_id = req_id; // XXX: change to id
    this.timeout = etask({'this': this}, function*req_timeout(){
      yield etask.sleep(REQ_TIMEOUT);
      delete reqs[req_id];
      this.this.emit('fail', {error: 'timeout', req_id});
    });
    if (!router.res_handler_attached){
      router.on('message', res_handler);
      router.res_handler_attached = true;
    }
  }
  send(body){
    let ts=date.monotonic(), path=[], router = this.router;
    let nonce=''+Math.floor(1e15*Math.random());
    let msg = {req_id: this.req_id, ts, type: 'req', to: this.dst,
      from: b2s(router.id), nonce, cmd: this.cmd, body, path};
    router._touched[nonce] = true; // XXX: mv out of here (and path)
    msg.sign = router.wallet.sign(msg); // XXX: mv out of here
    this.router._send(msg);
    if (Req.t_new_hook)
      Req.t_new_hook(msg);
  }
}

Req.t = {reqs, res_handler};
