// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import assert from 'assert';
import {EventEmitter} from 'events';
import util from '../util/util.js';
import xerr from '../util/xerr.js';
import date from '../util/date.js';
const b2s = util.buf_to_str, assign = Object.assign;

const nodes = {};

function destroy_cb(){ delete nodes[b2s(this.id)]; }

class Res extends EventEmitter {
  constructor(opt){
    super();
    this.req_handler = opt.req_handler;
    this.router = this.req_handler.router;
    this.cmd = this.req_handler.cmd;
    this.dst = b2s(opt.from);
    this.stream = opt.stream;
    this.req_id = opt.req_id;
    this.seq = 0;
  }
  send(opt, body){
    if (arguments.length<2){
      body = opt;
      opt = {};
    }
    opt = opt||{};
    let ts=date.monotonic(), seq = this.seq++, type;
    let {dst, req_id, req_seq, cmd} = this;
    if (!this.stream){
      type = 'res';
      if (seq)
        return xerr('multiple call to res');
    } else
      type = opt.end ? 'res_end' : !seq ? 'res_start' : 'res_next';
    if (util.is_mocha() && opt.req_seq)
      req_seq = opt.req_seq;
    let msg = {ts, type, req_id, seq, req_seq, cmd, body};
    this.router.send_msg(dst, msg); // XXX: what if error
    if (ReqHandler.t_send_hook)
      ReqHandler.t_send_hook(this.router, msg);
  }
  send_end(opt, body){ return this.send(assign({}, opt, {end: true}), body); }
}

function req_handler_cb(body, from, msg){
  let {req_id, type, cmd, seq} = msg;
  cmd = cmd||'';
  if (!req_id || !['req', 'req_start', 'req_next', 'req_end'].includes(type))
    return;
  seq = seq||0;
  if (!Number.isInteger(seq) || seq<0)
    return xerr('invalid seq '+seq);
  let id = b2s(msg.to);
  let req_handler = util.get(nodes, [id, 'cmd', cmd, 'req_handler']);
  if (!req_handler)
    return;
  req_handler.req_seq = Math.max(req_handler.req_seq, seq);
  let res = util.get(nodes, [id, 'req_id', req_id]);
  if (!res){
    if (!['req', 'req_start'].includes(type))
      return xerr('req not started '+type);
    res = new Res({req_handler, from: b2s(from), req_id, stream: type!='req'});
    util.set(nodes, [id, 'req_id', req_id], {res});
  }
  req_handler.emit(type, msg, res);
}

export default class ReqHandler extends EventEmitter {
  constructor(opt){
    super();
    let {node} = opt;
    let cmd = this.cmd = opt.cmd||'';
    let router = node.router;
    this.node = node;
    this.router = router;
    this.req_seq = -1;
    let id = b2s(router.id);
    // XXX: need unregister + cleanup
    assert(!util.get(nodes, [id, cmd]), 'handler already exists '+cmd);
    nodes[id] = nodes[id]||{cmd: {}};
    nodes[id].cmd[cmd] = {req_handler: this};
    if (!router.req_handler_attached){ // XXX: cleanup
      router.on('message', req_handler_cb);
      node.once('destroy', destroy_cb);
      router.req_handler_attached = true;
    }
  }
}

if (util.is_mocha())
  ReqHandler.t = {nodes, req_handler_cb};
