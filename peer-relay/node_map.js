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
get(id){ return this.map.get(id.s); }
del(id){
  this.map.delete(id.s);
  this.tree.remove(id);
}
get_conn(opt){
  let {ids, create, self} = opt, hash = conn_hash(ids);
  let conn = this.conn.get(hash);
  if (!create || conn){
    assert(!conn || !self , 'XXX: support update of connection self');
    return conn;
  }
  conn = new NodeMap.NodeConn({ids, self});
  this.conn.set(hash, conn);
  return conn;
}
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
  let {ids, self} = opt;
  assert(ids.length==2, 'invalid conn ids '+ids);
  this.ids = Array.from(ids);
  this.self = self;
}
}

function conn_hash(ids){ return ids[0].cmp(ids[1])<0 ?
  ids[0].s+'_'+ids[1].s : ids[1].s+'_'+ids[0].s; }

NodeMap.Node = Node;
NodeMap.NodeConn = NodeConn;
NodeMap.conn_hash = conn_hash;
