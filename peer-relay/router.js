// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import etask from '../util/etask.js';
import xerr from '../util/xerr.js';
import date from '../util/date.js';
import NodeId from './node_id.js';
import NodeMap from './node_map.js';
import xutil from '../util/util.js';
import {dbg_msg} from './util.js';
import xlog from '../util/xlog.js';
import LBuffer from './lbuffer.js';
const log = xlog('router');
const stringify = JSON.stringify;
const DEF_RTT = 1000;

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
    this.node = new NodeMap.Node({id, self: this});
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
  _send = lbuffer=>etask({_: this}, function*(){
    let msg = lbuffer.msg(), msg0 = lbuffer.get_json(0), range;
    let _this = this._, channel, rt;
    let from = NodeId.from(msg.from), to = NodeId.from(msg.to);
    if (lbuffer.path().length >= _this.maxHops)
      return xerr('drop msg max hop reached');
    if (!_this._channels.size) // XXX: verify and test it
      return _this._queue.push(lbuffer);
    if (msg.fuzzy){
      range = lbuffer.range();
      let route = _this.node_map.get_fuzzy_route(to, from, range);
      channel = _this.get_channel_from_path(route);
      if (!channel)
        return _this.emit('message', lbuffer);
      if (route.length>1){
        rt = {path: Array.from(route)};
        range = undefined;
      }
      else {
        range = !range ? {min: channel.id, max: channel.id} :
          channel.id.cmp(range.min)>0 ? {min: channel.id, max: range.max} :
          {min: range.min, max: channel.id};
      }
    } else {
      if (channel = _this.get_channel_from_id(to));
      else if (channel = _this.get_channel_from_rt(msg0));
      else if ((rt = _this.get_route(msg.to)) &&
        (channel = _this.get_channel_from_path(rt.path)));
      // XXX: need to get also route/path when using state
      else if (channel = _this.get_channel_from_state(msg));
      else {
        let route = _this.node_map.get_best_route(to);
        channel = _this.get_channel_from_path(route);
        if (!channel)
          return;
        if (route.length>1)
          rt = {path: Array.from(route)};
      }
    }
    if (channel.id.eq(from))
      return; // XXX: add err msg
    if (!(channel.local_id.eq(from) && channel.id.eq(to))){
      let msg2 = {from: _this.id.s, to: channel.id.s, type: 'fwd',
        rtt: channel.rtt||DEF_RTT};
      if (msg.to!=msg2.to){
        rt = rt || xutil.get(msg0, ['rt', 'path']) &&
          {path: xutil.get(msg0, ['rt', 'path'])};
        if (rt && Array.isArray(rt.path)){
          if (rt.path.length>1){
            rt = {path: Array.from(rt.path)};
            rt.path.shift();
          } else
            rt = undefined;
        }
        msg2.rt = rt;
        msg2.range = NodeId.range_to_msg(range);
      }
      _this.track_out(msg2, channel);
      lbuffer.add_json(msg2);
    }
    yield channel.send(lbuffer.to_str());
  });
  _on_channel_msg = (data, channel)=>etask({_: this},
    function*_on_channel_msg(){
    let lbuffer = LBuffer.from(data); // XXX: WIP
    let msg = lbuffer.msg();
    let _this = this._, nonce = lbuffer.nonce();
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
    let dst = channel.id;
    this.node_map.update_conn({ids: [this.id, dst], self: channel,
      rtt: channel.rtt||DEF_RTT});
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
    state.et_timeout = etask({_: this}, function*track_timeout(){
      yield etask.sleep(this._.state_timeout);
      delete this._.state[hash];
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
    return !!routes[d].find(rt=>path_eq(rt.path, path));
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
    let path = [], rtt = 0;
    for (let i=0; i<lbuffer.size(); i++){
      let msg = lbuffer.get_json(i);
      if (msg.type!='fwd')
        break;
      let f = NodeId.from(msg.from), t = NodeId.from(msg.to);
      rtt += msg.rtt||DEF_RTT;
      path.push(f.s);
      this.node_map.update_conn({ids: [f, t], rtt: msg.rtt||DEF_RTT});
      let node = this.node_map.get({id: f});
      if (node.graph.rtt===undefined || node.graph.rtt > rtt){
        node.graph.rtt = rtt;
        node.graph.path = Array.from(path);
      }
    }
  }
  destroy(){ this.node_map.destroy(); }
}

function state_hash(from, to){
  return from.localeCompare(to)<0 ? from+'_'+to : to+'_'+from; }

// XXX: mv to other place
function path_eq(p1, p2){
  if (p1.length!=p2.length)
    return false;
  let i;
  for (i=0; i<p1.length && p1[i]==p2[i]; i++);
  return i==p1.length;
}

Router.t = {};
