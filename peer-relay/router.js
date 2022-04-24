// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import etask from '../util/etask.js';
import xerr from '../util/xerr.js';
import date from '../util/date.js';
import xutil from '../util/util.js';
import {dbg_msg} from './util.js';
import xlog from '../util/xlog.js';
const log = xlog('router');
const b2s = xutil.buf_to_str, s2b = xutil.buf_from_str;

// XXX: need safe emit support
export default class Router extends EventEmitter {
  constructor(opt){
    super();
    let {channels, id, wallet, state_timeout} = opt;
    this.wallet = wallet;
    this.id = id;
    this.concurrency = 1;
    this.state_timeout = state_timeout||60*date.ms.SEC;
    this.maxHops = 20;
    // XXX: rm _ from properites + methods
    // XXX: memory leak - no cleanup for all
    this._touched = {};
    this.req = {};
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
    let _this = this.this, channel;
    if (msg.path.length >= _this.maxHops)
      return; // throw new Error('Max hops exceeded nonce=' + msg.nonce)
    if (!_this._channels.count) // XXX: verify and test it
      return _this._queue.push(msg);
    msg.path.push(b2s(_this.id));
    if (channel = _this.get_out_channel(msg));
    else
      channel = _this._channels.get_closest(msg.to, msg.range);
    if (b2s(channel.id)==msg.from)
      return;
    _this.track_out(msg, channel);
    msg.range = {min: b2s(channel.id), max: msg.dst};
    // TODO BUG Sometimes the WS on closest in not in the ready state
    yield channel.send(msg);
  });
  _on_channel_msg = (msg, channel)=>etask({'this': this},
    function*_on_channel_msg(){
    let _this = this.this, nonce = msg.nonce;
    if (!nonce)
      return log('invalid message nonce %s', dbg_msg(msg));
    if (nonce in _this._touched)
      return log.debug('channel-msg dup %s', dbg_msg(msg));
    log.debug('channel-msg %s', dbg_msg(msg));
    _this.track_in(msg, channel);
    let from = s2b(msg.from), to = s2b(msg.to);
    // XXX: enable verify
    if (false && !_this.wallet.verify(msg, msg.sign, from))
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
  get_out_channel(msg){
    let {req_id, from, to} = msg, req = this.req[req_id];
    if (!req)
      return;
    if (xutil.get(req, [to, 'ch_out']))
      return this._channels.get(req[to].ch_out);
    if (xutil.get(req, [from, 'ch_in']))
      return this._channels.get(req[from].ch_in);
  }
  track_in = (msg, channel)=>this.track(msg, b2s(channel.id), '');
  track_out = (msg, channel)=>this.track(msg, '', b2s(channel.id));
  track(msg, ch_in, ch_out){
    let {req_id, from, to} = msg, ts = date.monotonic(), req, o;
    if (!req_id)
      return;
    if (!(req = this.req[req_id]))
      req = this.req[req_id] = {ts};
    if (!(o = req[to]))
      o = req[to] = {req_id, from, to, ch_in, ch_out, ts};
    req.ts = o.ts = ts;
    if (req.et_timeout)
      req.et_timeout.return();
    req.et_timeout = etask({'this': this}, function*track_timeout(){
      yield etask.sleep(this.this.state_timeout);
      delete this.this.req[req_id];
    });
  }
}
