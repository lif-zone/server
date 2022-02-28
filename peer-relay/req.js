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
  if (!req_id || !['res', 'res_start', 'res_next', 'res_end'].includes(type))
    return;
  // XXX: if final response, remove from this.reqs
  if (!reqs[req_id]) // XXX: change to LERR
    return xerr.notice('req not found %s', req_id);
  let req = reqs[req_id].req;
  if (type=='res')
    del_req(req_id);
  req.clr_timeout(msg.seq);
  req.emit('res', msg);
}

function del_req(req_id){
  let req = util.get(reqs, [req_id, 'req']);
  if (!req)
    return;
  for (let seq in reqs[req_id].seq)
    req.clr_timeout(seq);
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
    assert(util.is_mocha() || !req_id, 'manual req_id only in tests '+req_id);
    req_id = req_id || ''+free_req_id++;
    reqs[req_id] = {req: this, seq: {}};
    this.req_id = req_id; // XXX: change to id
    if (!router.res_handler_attached){ // XXX: cleanup
      router.on('message', res_handler);
      node.once('destroy', destroy_cb);
      router.res_handler_attached = true;
    }
  }
  send_end(body){ return this.send({end: true}, body); }
  send(opt, body){
    if (arguments.length<2){
      body = opt;
      opt = {};
    }
    opt = opt||{};
    let ts=date.monotonic(), req_id = this.req_id, seq = this.seq++;
    let type = !this.stream ? 'req' : opt.end ? 'req_end' : !seq ?
      'req_start' : 'req_next';
    let msg = {ts, type, req_id, seq, cmd: this.cmd, body};
    reqs[req_id].seq[seq] = {};
    this.set_timeout(seq);
    this.router.send_msg(this.dst, msg);
    if (Req.t_send_hook)
      Req.t_send_hook(msg);
  }
  set_timeout(seq){
    let {req_id, timeout} = this;
    assert(!reqs[req_id].seq[seq].et_timeout, 'timeout already set');
    reqs[req_id].seq[seq].et_timeout = etask({'this': this},
      function*req_timeout(){
      yield etask.sleep(timeout);
      delete reqs[req_id].seq[seq];
      this.this.emit('fail', {error: 'timeout', req_id, seq});
    });
  }
  clr_timeout(seq){
    let {req_id} = this;
    if (!util.get(reqs, [req_id, 'seq', seq, 'et_timeout']))
      return;
    reqs[req_id].seq[seq].et_timeout.return();
    delete reqs[req_id].seq[seq];
  }
}

if (util.is_mocha())
  Req.t = {reqs, res_handler};
