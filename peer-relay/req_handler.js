// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import assert from 'assert';
import {EventEmitter} from 'events';
import util from '../util/util.js';
import xerr from '../util/xerr.js';
import xescape from '../util/escape.js';
import date from '../util/date.js';
import etask from '../util/etask.js';
const b2s = util.buf_to_str, assign = Object.assign;
const RES_TIMEOUT = 20*date.ms.SEC;

const nodes = {};

function destroy_cb(){ delete nodes[b2s(this.id)]; }

class Res extends EventEmitter {
  constructor(opt){
    super();
    this.req_handler = opt.req_handler;
    this.timeout = this.req_handler.timeout;
    this.router = this.req_handler.router;
    this.node = this.req_handler.node;
    this.cmd = this.req_handler.cmd;
    this.dst = b2s(opt.from);
    this.stream = opt.stream;
    this.req_id = opt.req_id;
    this.seq = 0;
    this.ack = [];
    this.sent = {};
    if (ReqHandler.t_new_res_hook)
      ReqHandler.t_new_res_hook(this);
  }
  send_end(opt, body){ return this.send(assign({}, opt, {end: true}), body); }
  send(opt, body){
    if (arguments.length<2){
      body = opt;
      opt = {};
    }
    opt = opt||{};
    let ts=date.monotonic(), seq = this.seq++, type;
    let {dst, req_id, ack, cmd} = this;
    if (opt.ack){
      ack = opt.ack;
      this.ack = this.ack.filter(s=>!ack.find(
        s2=>new RegExp('^'+xescape.regex(''+s)+'$').test(s2)));
    }
    else
      this.ack = [];
    if (util.is_mocha() && opt.seq)
      seq = opt.seq;
    if (!this.stream){
      type = 'res';
      if (seq)
        return xerr('multiple call to res');
    } else
      type = opt.end ? 'res_end' : !seq ? 'res_start' : 'res_next';
    if (!['res', 'res_end'].includes(type))
      this.set_timeout(seq);
    let msg = {ts, type, req_id, seq, ack, cmd, body};
    this.router.send_msg(dst, msg); // XXX: what if error
    if (ReqHandler.t_send_hook)
      ReqHandler.t_send_hook(this.router, msg);
  }
  set_timeout(seq){
    let {req_id, timeout} = this;
    assert(!this.sent[seq], 'timeout already set '+seq);
    this.sent[seq] = {};
    this.sent[seq].et_timeout = etask({'this': this}, function*res_timeout(){
      yield etask.sleep(timeout);
      delete this.this.sent[seq];
      this.this.emit('fail', {error: 'timeout', req_id, seq});
      // XXX: support per-req timeout and allow to specify if fatal or retry
      // XXX: close req
      this.this.clr_timeout();
    });
  }
  clr_timeout(ack){
    ack = ack || Object.keys(this.sent);
    ack.forEach(seq=>{
      if (!this.sent[seq])
        return;
      this.sent[seq].et_timeout.return();
      delete this.sent[seq];
    });
  }
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
  let res = util.get(nodes, [id, 'req_id', req_id, 'res']);
  if (!res){
    if (!['req', 'req_start'].includes(type))
      return xerr('req not started '+type);
    res = new Res({req_handler, from: b2s(from), req_id, stream: type!='req'});
    util.set(nodes, [id, 'req_id', req_id], {res});
  }
  res.ack.push(seq);
  if (msg.ack)
    res.clr_timeout(msg.ack);
  req_handler.emit(type, msg, res);
}

export default class ReqHandler extends EventEmitter {
  constructor(opt){
    super();
    let {node, timeout} = opt;
    let cmd = this.cmd = opt.cmd||'';
    let router = node.router;
    this.node = node;
    this.router = router;
    this.timeout = timeout||RES_TIMEOUT;
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

ReqHandler.t = {nodes, req_handler_cb};
