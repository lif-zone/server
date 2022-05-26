// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import Tree from 'avl';
import FibonacciHeap from 'js-fibonacci-heap';
import NodeId from './node_id.js';
import assert from 'assert';
import etask from '../util/etask.js';

export default class NodeMap extends EventEmitter {
constructor(){
  super();
  this.map = new Map();
  this.tree = new Tree(NodeId.cmp, true);
  this.conn = new Map();
}
set(id, node){
  this.map.set(id.s, node);
  if (!node.self)
    this.tree.insert(id, node);
  else {
    assert(!this.self);
    this.id = node.id;
  }
}
get(opt){
  if (opt instanceof NodeId)
    opt = {id: opt};
  let {id, create} = opt;
  let node = this.map.get(id.s);
  if (!create || node)
    return node;
  node = new NodeMap.Node(id);
  this.set(id, node);
  return node;
}
del(id){
  this.map.delete(id.s);
  this.tree.remove(id);
}
get_conn(opt){
  let {ids, create} = opt, hash = conn_hash(ids);
  let conn = this.conn.get(hash);
  if (!create || conn)
    return conn;
  conn = new NodeMap.NodeConn({ids});
  this.conn.set(hash, conn);
  return conn;
}
update_conn(opt){
  let {ids, rtt, self} = opt;
  let n0 = this.get({id: ids[0], create: true});
  let n1 = this.get({id: ids[1], create: true});
  let conn = this.get_conn({ids, create: true});
  if (conn.rtt==rtt && conn.self==self)
    return;
  conn.update_conn({rtt, self});
  if (self){
    let n = this.id.eq(n0.id) ? n1 : n0;
    n.graph.rtt = rtt;
    n.graph.prev = n0===n ? n1 : n0;
  }
  n0.set_conn(n1.id, conn);
  n1.set_conn(n0.id, conn);
  this.schedule_build_rtt_graph();
}
find(id){ return this.get(id); }
find_next(id){
  let best, tree = this.tree;
  if (!tree.size)
    return;
  for (let curr=tree._root; curr;){
    let cmp = id.cmp(curr.key);
    if (!cmp)
      return curr.data;
    if (cmp<0){
      best = curr;
      curr = curr.left;
    } else
      curr = curr.right;
  }
  return best ? best.data : tree.at(0).data;
}
find_prev(id){
  let best, tree = this.tree;
  if (!tree.size)
    return;
  for (let curr=tree._root; curr;){
    let cmp = id.cmp(curr.key);
    if (!cmp)
      return curr.data;
    if (cmp>0){
      best = curr;
      curr = curr.right;
    } else
      curr = curr.left;
  }
  return best ? best.data : tree.at(tree.size-1).data;
}
find_bidi(id){
  let next = this.find_next(id);
  if (!next || id.eq(next.id))
    return next;
  let prev = this.find_prev(id);
  return id.distance_bits(next.id) <= id.distance_bits(prev.id) ? next : prev;
}
schedule_build_rtt_graph(){
  if (this.build_rtt_timer)
    return;
  this.build_rtt_timer = etask({'this': this}, function*build_rtt_timer(){
    yield etask.sleep(1000);
    this.this.build_rtt_timer = undefined;
    this.this.build_rtt_graph();
  });
}
build_rtt_graph(){
  let queue = new FibonacciHeap(), dist={}, prev={};
  let map = {};
  for (let [, node] of this.map){
    let d = this.id.eq(node.id) ? 0 : Infinity;
    node.graph.rtt = dist[node.id.s] = d;
    node.graph.prev = prev[node.id.s] = null;
    map[node.id.s] = queue.insert(d, node.id.s);
  }
  while (!queue.isEmpty()){
    let next_key = queue.extractMinimum().value;
    let next = this.map.get(next_key);
    // XXX: disconnected nodes (can it happen?)
    if (dist[next_key]===Infinity)
      break;
    for (let [, conn] of next.conn){
      let neighbor_key = conn.ids[0].eq(next.id) ?
        conn.ids[1].s : conn.ids[0].s;
      let neighbor = this.map.get(neighbor_key);
      assert(conn.rtt, 'missing rtt for '+next.id.s+neighbor.id.s);
      let alt = dist[next_key] + conn.rtt;
      if (alt < dist[neighbor_key]){
        neighbor.graph.rtt = dist[neighbor_key] = alt;
        neighbor.graph.prev = prev[neighbor_key] = next;
        queue.decreaseKey(map[neighbor.id.s], alt);
      }
    }
  }
  return prev;
}
destroy(){
  if (this.build_rtt_timer)
    this.build_rtt_timer.return();
  this.build_rtt_timer = undefined;
}
}

class Node extends EventEmitter {
constructor(opt){
  super();
  if (opt instanceof NodeId)
    opt = {id: opt};
  let {id, self} = opt;
  this.id = id;
  this.self = self;
  this.conn = new Map();
  this.graph = {};
}
set_conn(id, conn){ this.conn.set(id.s, conn); }
del_conn(id){ throw new Error('XXX del_conn'); }
get_conn(id){ return this.conn.get(id.s); }
}

class NodeConn extends EventEmitter {
constructor(opt){
  super();
  let {ids, self, rtt} = opt;
  assert(ids.length==2, 'invalid conn ids '+ids);
  this.ids = Array.from(ids);
  this.self = self;
  this.rtt = rtt;
}
update_conn(opt){
  let {self, rtt} = opt;
  if (typeof self!==undefined)
    this.self = self;
  if (typeof rtt!==undefined && rtt)
    this.rtt = Math.min(rtt, this.rtt||rtt);
}
}

function conn_hash(ids){ return ids[0].cmp(ids[1])<0 ?
  ids[0].s+'_'+ids[1].s : ids[1].s+'_'+ids[0].s; }

NodeMap.Node = Node;
NodeMap.NodeConn = NodeConn;
NodeMap.conn_hash = conn_hash;
