// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import etask from '../util/etask.js';
import xerr from '../util/xerr.js';
import util from '../util/util.js';
import date from '../util/date.js';
const b2s = util.buf_to_str, s2b = util.buf_from_str;
const REQ_TIMEOUT = 20*date.ms.SEC;

// XXX: need safe emit support
export default class Router extends EventEmitter {
  constructor(opt){
    super();
    let {channels, id, wallet} = opt;
    this.wallet = wallet;
    this.id = id;
    this.req_id = date.monotonic();
    this.concurrency = 2;
    this.maxHops = 20;
    // XXX: rm _ from properites + methods
    // XXX: memory leak - no cleanup for all
    this._touched = {};
    this._paths = {};
    this._queue = [];
    this.reqs = {};
    this._channels = channels;
    this._channels.on('added', channel=>this._onChannelAdded(channel));
    this._channels.on('removed', channel=>this._onChannelRemoved(channel));
    this.on('message', this._on_msg);
    for (let c of this._channels.toArray())
      this._onChannelAdded(c);
  }
  /* XXX derry TODO:
  send_req(id, data){
    // remember packet. keep in send queue. update parent in 'on'
    this.send(id, data);
  }
  send_req('hi').on('res', ...).on('fail', ..);
  */
  send_req(to, o){
    let req = new EventEmitter(); // XXX: need Request class
    // XXX: use etask
    let timeout = setTimeout(()=>{
      let o = this.reqs[req_id];
      delete this.reqs[req_id];
      o.req.emit('fail', {error: 'timeout', req_id});
    }, REQ_TIMEOUT);
    let req_id=''+this.req_id++, from=b2s(this.id), path=[];
    let nonce=''+Math.floor(1e15*Math.random()), ts=date.monotonic();
    let msg = {req_id, ts, type: 'req', to, from, nonce,
      cmd: o.cmd, data: o.body, __meta: {path}};
    this._touched[nonce] = true;
    // XXX: rm __meta: {path} from sign
    util.set(msg, '__meta.sign', this.wallet.sign(msg));
    req.__meta = this.reqs[req_id] = {req_id, req, msg, timeout};
    this._send(msg); // XXX: what if error
    return req;
  }
  send_res(opt, data){
    let req_id=opt.req_id, to=b2s(opt.to), from=b2s(this.id), path=[];
    let nonce=''+Math.floor(1e15*Math.random()), ts=date.monotonic();
    let msg = {req_id, ts, type: 'res', to, from, nonce, data, __meta: {path}};
    this._touched[nonce] = true;
    util.set(msg, '__meta.sign', this.wallet.sign(msg));
    this._send(msg); // XXX: what if error
  }
  _on_msg = (data, from, msg)=>{
    let {req_id, type} = msg, _this = this;
    if (!req_id)
      return;
    if (type=='req'){
      let res = {from, req_id,
        send: function(data){
          return _this.send_res({req_id: this.req_id, to: this.from}, data); },
      };
      this.emit('req', data, res);
    }
    else if (type=='res'){
      // XXX: if final response, remove from this.reqs
      if (!this.reqs[req_id])
        return xerr('req not found %s', req_id);
      let {req, timeout} = this.reqs[req_id];
      delete this.reqs[req_id];
      clearTimeout(timeout);
      req.emit('res', data);
      return xerr('invalid type %s %s', type, req_id);
    }
    else
      return xerr('invalid msg type %s %s', type, req_id);
  }
  send(dst, data){
    let msg = {to: b2s(dst), from: b2s(this.id),
      nonce: '' + Math.floor(1e15 * Math.random()), data: data,
      __meta: {path: []}};
    this._touched[msg.nonce] = true;
    util.set(msg, '__meta.sign', this.wallet.sign(msg));
    return this._send(msg);
  }
  _send = msg=>etask({'this': this}, function*(){
    let _this = this.this;
    if (msg.__meta.path.length >= _this.maxHops)
      return; // throw new Error('Max hops exceeded nonce=' + msg.nonce)
    if (!_this._channels.count())
      _this._queue.push(msg);
    msg.__meta.path.push(b2s(_this.id));
    let closests = _this._channels.closest(s2b(msg.to), 20)
    .filter(c=>msg.__meta.path.indexOf(b2s(c.id))===-1)
    .filter((_, index) => index < _this.concurrency);
    if (msg.to in _this._paths)
    {
      let preferred = _this._channels.closest(s2b(_this._paths[msg.to]), 1)[0];
      if (preferred != null && closests.indexOf(preferred) === -1)
        closests.unshift(preferred);
    }
    for (let channel of closests)
    {
      // TODO BUG Sometimes the WS on closest in not in the ready state
      yield channel.send(msg);
      if (b2s(channel.id)==(typeof msg.to==='string' ? msg.to : b2s(msg.to)))
        break; // XXX: why do we break?
    }
  });
  _on_channel_msg = msg=>etask({'this': this}, function*_on_channel_msg(){
    let _this = this.this;
    if (msg.nonce in _this._touched)
      return;
    let from = s2b(msg.from), to = s2b(msg.to);
    if (!_this.wallet.verify(msg, msg.__meta.sign, from))
      return xerr('invalid message signature');
    _this._touched[msg.nonce] = true;
    assert(typeof msg.from=='string', 'invalid from');
    assert(typeof msg.to=='string', 'invalid to');
    _this._paths[msg.from] = msg.__meta.path[msg.__meta.path.length - 1];
    if (to.equals(_this.id))
      _this.emit('message', msg.data, s2b(msg.from), msg);
    else // relay
      yield _this._send(msg);
  });
  _onChannelAdded(channel){
    channel.on('message', this._on_channel_msg);
    // XXX: check if this can happen during test and add yield
    while (this._queue.length > 0)
      this._send(this._queue.shift());
  }
  _onChannelRemoved = function(channel){
    channel.removeListener('message', this._on_channel_msg); }
}

