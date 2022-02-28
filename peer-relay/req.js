// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import xerr from '../util/xerr.js';
import date from '../util/date.js';
import etask from '../util/etask.js';
import util from '../util/util.js';
const assign = Object.assign;
const REQ_TIMEOUT = 20*date.ms.SEC;

const reqs = {};
let free_req_id = date.monotonic();

function res_handler(body, from, msg){
  let {req_id, type, seq} = msg;
  seq = seq||0;
  if (!req_id || !['res', 'res_start', 'res_next', 'res_end'].includes(type))
    return;
  // XXX: if final response, remove from this.reqs
  if (!reqs[req_id]) // XXX: change to LERR
    return xerr.notice('req not found %s', req_id);
  if (!Number.isInteger(seq) || seq<0)
    return xerr('invalid seq '+seq);
  let req = reqs[req_id].req;
  req.res_seq = Math.max(req.res_seq, seq);
  if (type=='res')
    del_req(req_id);
  else
    req.clr_timeout(msg.req_seq);
  req.emit('res', msg);
}

function del_req(req_id){
  let req = util.get(reqs, [req_id, 'req']);
  if (!req)
    return;
  req.clr_timeout(Infinity);
  delete reqs[req_id];
}

function destroy_cb(){
  for (let id in reqs)
  {
    let req = reqs[id].req;
    if (req.node===this)
      del_req(id);
  }
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
    this.res_seq = -1;
    this.sent = {};
    assert(util.is_mocha() || !req_id, 'manual req_id only in tests '+req_id);
    req_id = req_id || ''+free_req_id++;
    reqs[req_id] = {req: this};
    this.req_id = req_id; // XXX: change to id
    if (!router.res_handler_attached){ // XXX: cleanup
      router.on('message', res_handler);
      node.once('destroy', destroy_cb);
      router.res_handler_attached = true;
    }
  }
  send_end(opt, body){ return this.send(assign({}, opt, {end: true}), body); }
  send(opt, body){
    if (arguments.length<2){
      body = opt;
      opt = {};
    }
    opt = opt||{};
    let ts=date.monotonic(), req_id = this.req_id, seq = this.seq++;
    let type = !this.stream ? 'req' : opt.end ? 'req_end' : !seq ?
      'req_start' : 'req_next';
    let res_seq = this.res_seq;
    if (util.is_mocha() && opt.res_seq)
      res_seq = opt.res_seq;
    let msg = {ts, type, req_id, seq, res_seq, cmd: this.cmd, body};
    this.set_timeout(seq);
    this.router.send_msg(this.dst, msg);
    if (Req.t_send_hook)
      Req.t_send_hook(msg);
  }
  set_timeout(seq){
    let {req_id, timeout} = this;
    assert(!this.sent[seq], 'timeout already set '+seq);
    this.sent[seq] = {};
    this.sent[seq].et_timeout = etask({'this': this}, function*req_timeout(){
      yield etask.sleep(timeout);
      delete this.this.sent[seq];
      this.this.emit('fail', {error: 'timeout', req_id, seq});
      // XXX: support per-req timeout and allow to specify if fatal or retry
      this.this.clr_timeout(Infinity);
    });
  }
  clr_timeout(max_seq){
    for (let seq in this.sent){
      if (seq<=max_seq){
        this.sent[seq].et_timeout.return();
        delete this.sent[seq];
      }
    }
  }
}

Req.t = {reqs, res_handler};
