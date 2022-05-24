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
    if (cmp<0){
      end = mid;
      best = curr;
    } else if (cmp>0)
      start = mid+1;
    else
      return curr.data;
	}
  return best ? best.data : tree.at(0).data;
}
// XXX: TODO
//  - AVL.find_bidi (closest from both dirs),
//  - AVL.find_next (eq or more)
//  - AVL.find_prev (eq or less)
}

class Node extends EventEmitter {
constructor(id){
  super();
  this.id = id;
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
