// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import assert from 'assert';
import {EventEmitter} from 'events';
import util from '../util/util.js';
import xerr from '../util/xerr.js';
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
  let res = util.get(nodes, [id, 'cmd', cmd, 'req_id', req_id]);
  if (!res){
    if (!['req', 'req_start'].includes(type))
      return xerr('req not started '+type);
    res = {router: req_handler.router, from: b2s(from), req_id, seq: 0, cmd,
      send: function(body){
        return send_res(this.router, {req_id: this.req_id, cmd: this.cmd,
          to: this.from, body});
      },
    };
    util.set(nodes, [id, 'cmd', cmd, 'req_id', req_id], {res});
  }
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
