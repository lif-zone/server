// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import assert from 'assert';
import {EventEmitter} from 'events';
import util from '../util/util.js';
import date from '../util/date.js';
const b2s = util.buf_to_str;

function req_handler(body, from, msg){
  let {req_id, type, cmd} = msg;
  cmd = cmd||'';
  if (!req_id || cmd!=this.cmd)
    return;
  if (!['req', 'req_start', 'req_next', 'req_end'].includes(type))
    return;
  let res = {router: this.router, from: b2s(from), req_id, cmd,
    send: function(body){
      return send_res(this.router, {req_id: this.req_id, type: 'res',
        cmd: this.cmd, to: this.from, body});
    },
  };
  this.emit(type, msg, res);
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
    let handlers = this.router.req_handlers = this.router.req_handlers||{};
    assert(!handlers[cmd], 'handler already exists '+cmd);
    // XXX: need unregister + cleanup
    let handler = handlers[cmd] = req_handler.bind(this);
    router.on('message', handler);
  }
}

if (util.is_mocha())
  ReqHandler.t = {send_res};
