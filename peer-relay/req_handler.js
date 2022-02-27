// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import assert from 'assert';
import {EventEmitter} from 'events';
import util from '../util/util.js';
import date from '../util/date.js';
const b2s = util.buf_to_str;

const nodes = {};

function req_handler_cb(body, from, msg){
  let {req_id, type, cmd} = msg;
  cmd = cmd||'';
  if (!req_id || !['req', 'req_start', 'req_next', 'req_end'].includes(type))
    return;
  let id = b2s(msg.to);
  let req_handler = util.get(nodes, [id, 'cmd', cmd, 'req_handler']);
  if (!req_handler)
    return;
  let res = {router: req_handler.router, from: b2s(from), req_id, cmd,
    send: function(body){
      return send_res(this.router, {req_id: this.req_id, type: 'res',
        cmd: this.cmd, to: this.from, body});
    },
  };
  req_handler.emit(type, msg, res);
}

function send_res(router, o){
  let ts=date.monotonic(), seq = 0, type = 'res';
  let {to, req_id, cmd, body} = o;
  let msg = {ts, type, req_id, seq, cmd, body};
  router.send_msg(to, msg); // XXX: what if error
  if (ReqHandler.t_send_hook)
    ReqHandler.t_send_hook(router, msg);
}

export default class ReqHandler extends EventEmitter {
  constructor(opt){
    super();
    let {node} = opt;
    let cmd = this.cmd = opt.cmd||'';
    let router = node.router;
    this.node = node;
    this.router = router;
    let id = b2s(router.id);
    // XXX: need unregister + cleanup
    nodes[id] = nodes[id]||{cmd: {}};
    assert(!nodes[id][cmd], 'handler already exists '+cmd);
    nodes[id].cmd[cmd] = {req_handler: this};
    if (!router.req_handler_attached){ // XXX: cleanup
      router.on('message', req_handler_cb);
      router.req_handler_attached = true;
    }
  }
}

if (util.is_mocha())
  ReqHandler.t = {nodes, req_handler_cb, send_res};
