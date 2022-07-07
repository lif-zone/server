// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import etask from '../util/etask.js';
import xerr from '../util/xerr.js';
import date from '../util/date.js';
import NodeId from './node_id.js';
import * as util from './util.js';
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
    dst = NodeId.from(dst);
    let nonce=''+Math.floor(1e15*Math.random());
    msg.from = this.id.s;
    msg.to = dst.s;
    msg.nonce = nonce; // XXX: need test that will fail is this is missing
    msg.sign = this.wallet.sign(msg);
    let lbuffer = new LBuffer(msg); // XXX: WIP
    this._send(lbuffer);
  }
  _send = lbuffer=>etask({_: this}, function*(){
    let msg = lbuffer.msg(), msg0 = lbuffer.get_json(0), range;
    let _this = this._, channel;
    let rt = msg0.rt, path = rt?.path;
    let to = NodeId.from(msg.to), from = NodeId.from(msg.from), best;
    if (lbuffer.path().length >= _this.maxHops)
      return xerr('drop msg max hop reached');
    if (!_this._channels.size) // XXX: verify and test it
      return _this._queue.push(lbuffer);
    if (msg.fuzzy){
      range = lbuffer.range();
      if (path){
        if (!(channel = _this.get_channel_from_path(path)))
          return xerr('channel not found in route');
        if (0) // XXX: decide if to enable
        if (['req', 'req_start'].includes(msg.type) && rt?.opt!='!'){
          let rtt_pb_o = _this.id.rtt_pb_via(to,
            NodeId.from(path[path.length-1]), _this.calc_path_rtt(path));
          best = _this.node_map.get_best_route(
            NodeId.from(path[path.length-1]));
          let path2 = best?.path;
          let channel2 = _this.get_channel_from_path(path2);
          if (channel2 && path2 &&
            (!rtt_pb_o?.good || best.rtt_pb < rtt_pb_o.rtt_pb)){
            channel = channel2;
            path = path2;
          }
        }
      } else {
        best = _this.node_map.get_route_by_range(to, from.eq(to) ? to :
          [from, to], range);
        path = best?.path;
        channel = _this.get_channel_from_path(path);
        if (!channel)
          return _this.emit('message', lbuffer);
      }
      if (!path || path.length==1){
        if (!range)
          range = {min: channel.id, max: channel.id};
        else {
          let range2 = {min: channel.id, max: range.max};
          range = to.in_range(range2) ? range2 :
            {min: range.min, max: channel.id};
        }
      }
    } else {
      // XXX TODO: fix state handling
      // else if (channel = _this.get_channel_from_state(msg));
      if (channel = _this.get_channel_from_path(path)){
        // XXX WIP
        if (['req', 'req_start'].includes(msg.type) && rt?.opt!='!'){
          // XXX: copy logic to fuzzy
          let rtt_pb_o = _this.id.rtt_pb_via(to,
            NodeId.from(path[path.length-1]), _this.calc_path_rtt(path));
          best = _this.node_map.get_best_route(to);
          let path2 = best?.path;
          let channel2 = _this.get_channel_from_path(path2);
          if (channel2 && path2 &&
            (!rtt_pb_o?.good || best.rtt_pb < rtt_pb_o.rtt_pb)){
            channel = channel2;
            path = path2;
          }
        }
      }
      // XXX: decide if we need short-path
      // else if (channel = _this.get_channel_from_id(to));
      /* eslint-disable */
      else if ((path = _this.get_route(msg.to)) &&
        (channel = _this.get_channel_from_path(path))); /* eslint-enable */
      else {
        best = _this.node_map.get_best_route(to);
        path = best?.path;
        if (!(channel = _this.get_channel_from_path(path)))
          return;
      }
    }
    if (msg0.type=='fwd' || range || path?.length>1 || !channel.id.eq(to)){
      let msg2 = {from: _this.id.s, to: channel.id.s, type: 'fwd',
        rtt: channel.rtt||DEF_RTT};
      if (path && path.length>1){
        path = Array.from(path);
        path.splice(0, 1);
        msg2.rt = {path, rtt: _this.build_rtt_array(path)};
        if (rt?.opt)
          msg2.rt.opt = rt.opt;
      } else if (range)
        msg2.range = NodeId.range_to_msg(range);
      _this.track_out(msg2, channel);
      lbuffer.add_json(msg2);
    }
    yield channel.send(lbuffer.to_str());
  });
  _on_msg = (data, channel)=>etask({_: this},
    function*_on_msg(){
    let lbuffer = LBuffer.from(data), msg = lbuffer.msg();
    let msg0 = lbuffer.get_json(0), rt = msg0.rt, path = rt?.path;
    let _this = this._, nonce = msg.nonce;
    _this.update_conn(lbuffer);
    if (!nonce && msg.type!='ack') // XXX: TODO ack
      return log('invalid message nonce %s', dbg_msg(msg));
    log.debug('channel-msg %s', dbg_msg(msg));
    _this.track_in(msg, channel);
    if (msg.type!='ack')
      _this.ack(channel);
    if (!path && msg.to==_this.id.s)
      _this.emit('message', lbuffer);
    else
      yield _this._send(lbuffer);
  });
  ack(channel, msgid){
    let nonce=''+Math.floor(1e15*Math.random());
    let msg = {to: channel.id.s, from: this.id.s, nonce, type: 'ack'};
    msg.sign = this.wallet.sign(msg);
    let lbuffer2 = new LBuffer(msg);
    return channel.send(lbuffer2.to_str());
  }
  _onChannelAdded(channel){
    let dst = channel.id;
    this.node_map.update_conn({ids: [this.id, dst], self: channel,
      rtt: channel.rtt||DEF_RTT});
    channel.on('message', this._on_msg);
    // XXX: check if this can happen during test and add yield
    while (this._queue.length)
      this._send(this._queue.shift());
  }
  _onChannelRemoved = function(channel){
    let dst = channel.id, node = this.node_map.get(dst);
    node.del_conn(dst);
    channel.removeListener('message', this._on_msg);
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
    return !!routes[d].find(_path=>path_eq(_path, path));
  }
  add_route(path){
    let routes=this.routes;
    assert(path[0]!=this.id.s, 'path contains self id '+stringify(path));
    let d = path[path.length-1];
    routes[d] = routes[d]||[];
    if (this.has_route(path))
      return;
    routes[d].push(Array.from(path));
  }
  update_conn_from_fwd(lbuffer){
    // XXX: mv logic to node_map.js
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
      let fold = util.path_fold(path);
      if (fold!==path)
        rtt = this.calc_path_rtt(fold);
      if (node.graph.rtt===undefined || node.graph.rtt > rtt){
        node.graph.rtt = rtt;
        node.graph.path = Array.from(fold);
      }
    }
  }
  update_conn_from_path(lbuffer){
    let msg0 = lbuffer.get_json(0);
    let rt = msg0.rt, path = rt?.path, rtt_a = rt?.rtt;
    if (!Array.isArray(path) || !Array.isArray(rtt_a))
      return;
    if (path.length!=rtt_a.length)
      return xerr('invalid path rtt');
    let ret = {};
    for (let i=0, prev=NodeId.from(this.id.s); i<path.length; i++){
      let curr = NodeId.from(path[i]), ids = [prev, curr];
      if (rtt_a[i])
        this.node_map.update_conn({ids, rtt: rtt_a[i]});
      prev = curr;
    }
    return ret;
  }
  update_conn(lbuffer){
    this.update_conn_from_fwd(lbuffer);
    this.update_conn_from_path(lbuffer);
  }
  calc_path_rtt(path){ // XXX: need test
    let rtt = 0;
    for (let i=0, prev=NodeId.from(this.id.s); i<path.length; i++){
      let curr = NodeId.from(path[i]);
      let conn = this.node_map.get_conn({ids: [prev, curr]});
      rtt += conn?.rtt||DEF_RTT;
      prev = curr;
    }
    return rtt;
  }
  build_rtt_array(path){ // XXX: need test
    let a = [];
    for (let i=0, prev=NodeId.from(this.id.s); i<path.length; i++){
      let curr = NodeId.from(path[i]);
      let conn = this.node_map.get_conn({ids: [prev, curr]});
      a.push(conn?.rtt||DEF_RTT);
      prev = curr;
    }
    return a;
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
