// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import etask from '../util/etask.js';
import xerr from '../util/xerr.js';
import xutil from '../util/util.js';
import {dbg_msg} from './util.js';
import xlog from '../util/xlog.js';
const log = xlog('router');
const b2s = xutil.buf_to_str, s2b = xutil.buf_from_str;

// XXX: need safe emit support
export default class Router extends EventEmitter {
  constructor(opt){
    super();
    let {channels, id, wallet} = opt;
    this.wallet = wallet;
    this.id = id;
    this.concurrency = 1;
    this.maxHops = 20;
    // XXX: rm _ from properites + methods
    // XXX: memory leak - no cleanup for all
    this._touched = {};
    this._queue = [];
    this._channels = channels;
    this._channels.on('added', channel=>this._onChannelAdded(channel));
    this._channels.on('removed', channel=>this._onChannelRemoved(channel));
    this.on('message', this._on_msg);
    for (let c of this._channels.toArray())
      this._onChannelAdded(c);
  }
  _on_msg = msg=>{
    let {req_id, type} = msg;
    if (!req_id)
      return;
    log.debug('msg %s', dbg_msg(msg));
    if (!['req', 'req_start', 'req_next', 'req_end', 'res', 'res_start',
      'res_next', 'res_end'].includes(type)){
      xerr('invalid msg type %s %s', type, req_id);
    }
  }
  send_msg(dst, msg){
    let nonce=''+Math.floor(1e15*Math.random());
    this._touched[nonce] = true;
    msg.from = b2s(this.id);
    msg.to = dst;
    msg.nonce = nonce; // XXX: need test that will fail is this is missing
    msg.path = [];
    msg.sign = this.wallet.sign(msg);
    this._send(msg);
  }
  _send = msg=>etask({'this': this}, function*(){
    let _this = this.this;
    if (msg.path.length >= _this.maxHops)
      return; // throw new Error('Max hops exceeded nonce=' + msg.nonce)
    if (!_this._channels.count) // XXX: verify and test it
      return _this._queue.push(msg);
    msg.path.push(b2s(_this.id));
    let channel = _this._channels.get_closest(msg.to);
    if (b2s(channel.id)==msg.from)
      return;
    // TODO BUG Sometimes the WS on closest in not in the ready state
    yield channel.send(msg);
  });
  _on_channel_msg = msg=>etask({'this': this}, function*_on_channel_msg(){
    let _this = this.this, nonce = msg.nonce;
    if (!nonce)
      return log('invalid message nonce %s', dbg_msg(msg));
    if (nonce in _this._touched)
      return log.debug('channel-msg dup %s', dbg_msg(msg));
    log.debug('channel-msg %s', dbg_msg(msg));
    let from = s2b(msg.from), to = s2b(msg.to);
    if (!_this.wallet.verify(msg, msg.sign, from))
      return log('invalid message signature %s', dbg_msg(msg));
    _this._touched[nonce] = true;
    assert(typeof msg.from=='string', 'invalid from');
    assert(typeof msg.to=='string', 'invalid to');
    if (to.equals(_this.id))
      _this.emit('message', msg);
    else // relay
      yield _this._send(msg);
  });
  _onChannelAdded(channel){
    channel.on('message', this._on_channel_msg);
    // XXX: check if this can happen during test and add yield
    while (this._queue.length)
      this._send(this._queue.shift());
  }
  _onChannelRemoved = function(channel){
    channel.removeListener('message', this._on_channel_msg); }
}
