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
import LBuffer from './lbuffer.js';
const log = xlog('router');
const b2s = xutil.buf_to_str;

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
    this.state = {};
    this._queue = [];
    this._channels = channels;
    this._channels.on('added', channel=>this._onChannelAdded(channel));
    this._channels.on('removed', channel=>this._onChannelRemoved(channel));
    for (let c of this._channels.toArray())
      this._onChannelAdded(c);
  }
  send_msg(dst, msg){
    let nonce=''+Math.floor(1e15*Math.random());
    this._touched[nonce] = true;
    msg.from = b2s(this.id);
    msg.to = dst;
    msg.nonce = nonce; // XXX: need test that will fail is this is missing
    msg.path = [];
    msg.sign = this.wallet.sign(msg);
    let lbuffer = new LBuffer(msg); // XXX: WIP
    this._send(lbuffer);
  }
  _send = lbuffer=>etask({'this': this}, function*(){
    let msg = lbuffer.get_json(0); // XXX WIP
    let _this = this.this, channel;
    if (msg.path.length >= _this.maxHops)
      return xerr('drop msg max hop reached');
    if (!_this._channels.count) // XXX: verify and test it
      return _this._queue.push(lbuffer);
    if (channel = _this.get_channel_from_rt(msg));
    else if (channel = _this.get_channel_from_state(msg));
    else {
      // XXX: use rt instead of rt.range and if rt.path exists channel from it
      channel = _this._channels.get_closest(msg.to,
        xutil.get(msg, ['rt', 'range']));
    }
    if (!channel || b2s(channel.id)==msg.from)
      return; // XXX: add err msg
    msg.path.push(b2s(_this.id));
    if (!xutil.get(msg, ['rt', 'path']))
      msg.rt = {range: {min: b2s(channel.id), max: msg.to}};
    _this.track_out(msg, channel);
    let lbuffer2 = new LBuffer(msg); // XXX: WIP
    // TODO BUG Sometimes the WS on closest in not in the ready state
    yield channel.send(lbuffer2.to_str());
  });
  _on_channel_msg = (data, channel)=>etask({'this': this},
    function*_on_channel_msg(){
    let lbuffer = LBuffer.from(data); // XXX: WIP
    let msg = lbuffer.get_json(0);
    let _this = this.this, nonce = msg.nonce;
    if (!nonce)
      return log('invalid message nonce %s', dbg_msg(msg));
    if (nonce in _this._touched)
      return log.debug('channel-msg dup %s', dbg_msg(msg));
    log.debug('channel-msg %s', dbg_msg(msg));
    _this.track_in(msg, channel);
    _this._touched[nonce] = true;
    assert(typeof msg.from=='string', 'invalid from');
    assert(typeof msg.to=='string', 'invalid to');
    if (msg.to==b2s(_this.id))
      _this.emit('message', lbuffer);
    else // relay
      yield _this._send(lbuffer);
  });
  _onChannelAdded(channel){
    channel.on('message', this._on_channel_msg);
    // XXX: check if this can happen during test and add yield
    while (this._queue.length)
      this._send(this._queue.shift());
  }
  _onChannelRemoved = function(channel){
    channel.removeListener('message', this._on_channel_msg); }
  get_channel_from_rt(msg){
    let path = xutil.get(msg, ['rt', 'path']);
    if (!path)
      return;
    let id = b2s(this.id);
    for (let i=0; i<path.length; i++){
      if (id!=path[i])
        continue;
      return this._channels.get(path[i+1]);
    }
  }
  get_channel_from_state(msg){
    let {from, to} = msg, state = this.state[state_hash(from, to)];
    if (!state)
      return;
    if (xutil.get(state, [to, 'ch_out']))
      return this._channels.get(state[to].ch_out);
    if (xutil.get(state, [from, 'ch_in']))
      return this._channels.get(state[from].ch_in);
  }
  track_in = (msg, channel)=>this.track(msg, b2s(channel.id), '');
  track_out = (msg, channel)=>this.track(msg, '', b2s(channel.id));
  track(msg, ch_in, ch_out){
    let {from, to} = msg, ts = date.monotonic(), state, o;
    let hash = state_hash(from, to);
    if (!(state = this.state[hash]))
      state = this.state[hash] = {ts};
    if (!(o = state[to]))
      o = state[to] = {hash, from, to, ch_in, ch_out, ts};
    state.ts = o.ts = ts;
    if (state.et_timeout)
      state.et_timeout.return();
    state.et_timeout = etask({'this': this}, function*track_timeout(){
      yield etask.sleep(this.this.state_timeout);
      delete this.this.state[hash];
    });
  }
}

function state_hash(from, to){
  return from.localeCompare(to)<0 ? from+'_'+to : to+'_'+from; }
