// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import Tree from 'avl';
import NodeId from './node_id.js';
import assert from 'assert';

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
find(id){ return this.get(id); }
find_next(id){
  let tree=this.tree, start=0, size=tree.size, end=size, best;
  if (!size)
    return;
  while (end>start){
		var mid = Math.floor((start+end)/2);
    let curr = tree.at(mid), key = curr.key, cmp = id.cmp(key);
    if (cmp>0){
      start = mid+1;
    }
    else if (cmp<0){
      end = mid;
      best = curr;
    } else
        return curr.data;
	}
  return best ? best.data : tree.at(0).data;
}
find_prev(id){
  let tree=this.tree, start=0, size=tree.size, end=size, best;
  if (!size)
    return;
  while (end>start){
		var mid = Math.floor((start+end)/2);
    let curr = tree.at(mid), key = curr.key, cmp = id.cmp(key);
    if (cmp>0){
      start = mid+1;
      best = curr;
    } else if (cmp<0)
      end = mid;
    else
      return curr.data;
	}
  return best ? best.data : tree.at(size-1).data;
}
find_bidi(id){
  let next = this.find_next(id);
  if (!next || id.eq(next.id))
    return next;
  let prev = this.find_prev(id);
  return id.distance_bits(next.id) <= id.distance_bits(prev.id) ? next : prev;
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
