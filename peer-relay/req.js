// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import xerr from '../util/xerr.js';
import date from '../util/date.js';
import etask from '../util/etask.js';
import util from '../util/util.js';
const REQ_TIMEOUT = 20*date.ms.SEC;

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
  if (req.et_timeout)
    req.et_timeout.return();
  req.emit('res', msg);
}

export default class Req extends EventEmitter {
  constructor(opt){
    super();
    let {node, dst, stream, req_id, cmd, timeout} = opt;
    assert(node, 'must provide node');
    assert(dst, 'must provide dst');
    this.node = node;
    let router = this.router = node.router;
    this.dst = dst;
    this.cmd = cmd;
    this.stream = stream;
    this.timeout = timeout = timeout||REQ_TIMEOUT;
    this.seq = 0;
    assert(util.is_mocha() || !req_id, 'manual req_id only in tests '+req_id);
    req_id = req_id || ''+free_req_id++;
    reqs[req_id] = this;
    this.req_id = req_id; // XXX: change to id
    if (!router.res_handler_attached){ // XXX: cleanup
      router.on('message', res_handler);
      router.res_handler_attached = true;
    }
  }
  send_end(body){ return this.send({end: true}, body); }
  send(opt, body){
    opt = opt||{};
    if (body===undefined)
    {
      body = opt;
      opt = {};
    }
    let ts=date.monotonic(), req_id = this.req_id, seq;
    let type = !this.stream ? 'req' : opt.end ? 'req_end' : !this.seq ?
      'req_start' : 'req_next';
    if (this.stream)
      seq = this.seq++;
    let msg = {ts, type, req_id, seq, cmd: this.cmd, body};
    if (type=='req'){ // XXX: decide what to do for stream timeout
      this.et_timeout = etask({'this': this}, function*req_timeout(){
        yield etask.sleep(this.this.timeout);
        delete reqs[req_id];
        this.this.emit('fail', {error: 'timeout', req_id});
      });
    }
    this.router.send_msg(this.dst, msg);
    if (Req.t_send_hook)
      Req.t_send_hook(msg);
  }
}

if (util.is_mocha())
  Req.t = {reqs, res_handler};
