// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import etask from '../util/etask.js';
import xerr from '../util/xerr.js';
import util from '../util/util.js';
import date from '../util/date.js';
const stringify = JSON.stringify;
const b2s = util.buf_to_str, s2b = util.buf_from_str;

export default class Router extends EventEmitter {
  constructor(opt){
    super();
    let {channels, id, wallet} = opt;
    this.wallet = wallet;
    this.id = id;
    this.req_id = date.monotonic();
    this.concurrency = 2;
    this.maxHops = 20;
    // XXX: memory leak - no cleanup for all
    this._touched = {};
    this._channelListeners = {};
    this._paths = {};
    this._queue = [];
    this._requests = {};
    this._channels = channels;
    this._channels.on('added', channel=>this._onChannelAdded(channel));
    this._channels.on('removed', channel=>this._onChannelRemoved(channel));
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
  send_req(dst, data){
    let req_id=this.req_id++, to=b2s(dst), from=b2s(this.id);
    let nonce = ''+Math.floor(1e15*Math.random()), ts = date.monotonic();
    let msg = {req_id, ts, to, from, nonce, data, __meta: {path: []}};
    this._touched[nonce] = true;
    util.set(msg, '__meta.sign', this.wallet.sign(msg));
    this._requests[req_id] = {req_id, msg};
    return this._send(msg);
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
  _onMessage = msg=>etask({'this': this}, function*_onMessage(){
    let _this = this.this;
    if (msg.nonce in _this._touched)
      return;
    let from = s2b(msg.from), to = s2b(msg.to);
    if (!_this.wallet.verify(msg, msg.__meta.sign, from))
      return xerr('invalid message signature');
    _this._touched[msg.nonce] = true;
    assert(typeof msg.from=='string',
      'invalid from _this '+b2s(_this.id)+' '+stringify(msg));
    _this._paths[msg.from] = msg.__meta.path[msg.__meta.path.length - 1];
    if (to.equals(_this.id)){
      // XXX: ugly: we change to/from fields and make code diffiuclt to debug
      msg.to = to;
      msg.from = from;
      yield _this.emit_message(msg.data, msg.from, msg);
    } else // relay
      yield _this._send(msg);
  });
  set_on_message = function(cb){
    if (!cb)
      return this.on_message_cb = cb;
    assert(!this.on_message_cb);
    this.on_message_cb = cb;
  }
  emit_message = (data, from, msg)=>etask({'this': this},
    function*emit_message(){
    let _this = this.this;
    if (_this.on_message_cb)
      yield _this.on_message_cb(data, from, msg);
    _this.emit('message', data, from, msg);
  });
  _onChannelAdded(channel){
    const listener = msg=>this._onMessage(msg);
    channel.on('message', listener);
    this._channelListeners[channel.id] = listener;
    // XXX: check if this can happen during test and add yield
    while (this._queue.length > 0)
      this._send(this._queue.shift());
  }
  _onChannelRemoved = function(channel){
    let listener = this._channelListeners[channel.id];
    channel.removeListener('message', listener);
  }
}

