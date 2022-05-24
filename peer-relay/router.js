// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import etask from '../util/etask.js';
import xerr from '../util/xerr.js';
import date from '../util/date.js';
import buf_util from './buf_util.js';
import NodeId from './node_id.js';
import NodeMap from './node_map.js';
import xutil from '../util/util.js';
import {dbg_msg} from './util.js';
import Paths from './paths.js';
import xlog from '../util/xlog.js';
import LBuffer from './lbuffer.js';
const log = xlog('router');
const s2b = buf_util.buf_from_str;
const stringify = JSON.stringify;

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
    this.node_map = new NodeMap();
    this.routes = {};
    this._queue = [];
    this._channels = channels;
    this.node = new NodeMap.Node(id);
    this.node_map.set(id, this.node);
    this._channels.on('added', channel=>this._onChannelAdded(channel));
    this._channels.on('removed', channel=>this._onChannelRemoved(channel));
    for (let c of this._channels.toArray())
      this._onChannelAdded(c);
  }
  send_msg(dst, msg){
    let nonce=''+Math.floor(1e15*Math.random());
    this._touched[nonce] = true;
    msg.from = this.id.s;
    msg.to = dst;
    msg.nonce = nonce; // XXX: need test that will fail is this is missing
    msg.sign = this.wallet.sign(msg);
    let lbuffer = new LBuffer(msg); // XXX: WIP
    this._send(lbuffer);
  }
  _send = lbuffer=>etask({'this': this}, function*(){
    let msg = lbuffer.msg(), msg0 = lbuffer.get_json(0);
    let _this = this.this, channel, rt;
    let from = NodeId.from(msg.from), to = NodeId.from(msg.to);
    if (lbuffer.path().length >= _this.maxHops)
      return xerr('drop msg max hop reached');
    if (!_this._channels.size) // XXX: verify and test it
      return _this._queue.push(lbuffer);
    if (msg.fuzzy=='-' && buf_util.in_range(
      {min: s2b(msg0.from), max: s2b(msg0.to)}, s2b(msg.to)) ||
      msg.fuzzy=='+' && buf_util.in_range(
      {min: s2b(msg0.to), max: s2b(msg0.from)}, s2b(msg.to))){
        return _this.emit('message', lbuffer);
    }
    if (channel = _this.get_channel_from_rt(msg));
    else if ((rt = _this.get_route(msg.to)) &&
      (channel = _this.get_channel_from_path(rt.path)));
    else if (!msg.fuzzy && (channel = _this.get_channel_from_state(msg)));
    else {
      channel = _this._channels.get_closest(msg.to,
        {range: xutil.get(msg, ['rt', 'range']), exclude: msg0.from,
        bigger: msg.fuzzy=='+'});
    }
    if (!channel && msg.fuzzy) // XXX: why it was not handle in fuzzy part
      return _this.emit('message', lbuffer);
    if (!channel || channel.id.eq(from))
      return; // XXX: add err msg
    if (!(channel.local_id.eq(from) && channel.id.eq(to))){
      let msg2 = {from: _this.id.s, to: channel.id.s, type: 'fwd',
        rtt: channel.rtt};
      if (msg.to!=msg2.to){
        rt = rt || xutil.get(msg0, ['rt', 'path']) &&
          {path: xutil.get(msg0, ['rt', 'path'])};
        if (rt && Array.isArray(rt.path)){
          rt = {path: Array.from(rt.path)};
          rt.path.shift();
        }
        if (!rt)
          rt = {range: {min: channel.id.s, max: msg.to}};
        msg2.rt = rt;
      }
      _this.track_out(msg2, channel);
      lbuffer.add_json(msg2);
    }
    yield channel.send(lbuffer.to_str());
  });
  _on_channel_msg = (data, channel)=>etask({'this': this},
    function*_on_channel_msg(){
    let lbuffer = LBuffer.from(data); // XXX: WIP
    let msg = lbuffer.msg();
    let _this = this.this, nonce = lbuffer.nonce();
    _this.update_conn(lbuffer);
    if (!nonce)
      return log('invalid message nonce %s', dbg_msg(msg));
    if (nonce in _this._touched)
      return log.debug('channel-msg dup %s', dbg_msg(msg));
    log.debug('channel-msg %s', dbg_msg(msg));
    _this.track_in(msg, channel);
    _this._touched[nonce] = true;
    if (msg.to==_this.id.s)
      _this.emit('message', lbuffer);
    else // relay
      yield _this._send(lbuffer);
  });
  _onChannelAdded(channel){
    let dst = channel.id, node = this.node_map.get({id: dst, create: true});
    let conn = this.node_map.get_conn({ids: [this.id, dst], create: true});
    conn.update_conn({self: channel, rtt: channel.rtt});
    node.set_conn(this.id, conn);
    this.node.set_conn(dst, conn);
    channel.on('message', this._on_channel_msg);
    // XXX: check if this can happen during test and add yield
    while (this._queue.length)
      this._send(this._queue.shift());
  }
  _onChannelRemoved = function(channel){
    let dst = channel.id, node = this.node_map.get(dst);
    node.del_conn(dst);
    channel.removeListener('message', this._on_channel_msg);
  }
  get_channel_from_id(id){
    return this._channels.get(id.s);
  }
  get_channel_from_path(path){
    let dst = path && path[0] && NodeId.from(path[0]);
    if (!dst)
      return;
    return this.get_channel_from_id(dst);
  }
  get_channel_from_rt(msg){
    return this.get_channel_from_path(xutil.get(msg, ['rt', 'path'])); }
  get_channel_from_state(msg){
    let {from, to} = msg, state = this.state[state_hash(from, to)];
    if (!state)
      return;
    if (xutil.get(state, [to, 'ch_out']))
      return this.get_channel_from_id(NodeId.from(state[to].ch_out));
    if (xutil.get(state, [from, 'ch_in']))
      return this.get_channel_from_id(NodeId.from(state[from].ch_in));
  }
  track_in = (msg, channel)=>this.track(msg, channel.id.s, '');
  track_out = (msg, channel)=>this.track(msg, '', channel.id.s);
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
  get_route(d){
    let routes=this.routes;
    return routes[d] && routes[d][0];
  }
  has_route(path){
    let routes=this.routes, d=path[path.length-1];
    if (!routes[d])
      return false;
    return !!routes[d].find(rt=>Paths.eq(rt.path, path));
  }
  add_route(path){
    let routes=this.routes;
    assert(path[0]!=this.id.s, 'path contains self id '+stringify(path));
    let d = path[path.length-1];
    routes[d] = routes[d]||[];
    if (this.has_route(path))
      return;
    routes[d].push({path: Array.from(path)});
  }
  update_conn(lbuffer){
    for (let i=0; i<lbuffer.size(); i++){
      let msg = lbuffer.get_json(i);
      if (msg.type!='fwd') // XXX: still need to update RTT
        break;
      let f = NodeId.from(msg.from), t = NodeId.from(msg.to);
      let nf = this.node_map.get({id: f, create: true});
      let nt = this.node_map.get({id: t, create: true});
      let conn = this.node_map.get_conn({ids: [f, t], create: true});
      conn.update_conn({rtt: msg.rtt});
      nf.set_conn(t, conn);
      nt.set_conn(f, conn);
    }
  }
}

function state_hash(from, to){
  return from.localeCompare(to)<0 ? from+'_'+to : to+'_'+from; }
