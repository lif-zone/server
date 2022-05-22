// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import Tree from 'avl';
import NodeId from './node_id.js';

export default class NodeMap extends EventEmitter {
constructor(){
  super();
  this.map = new Map();
  this.tree = new Tree(NodeId.cmp, true);
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
constructor(id, self){
  super();
  this.id = id;
  this.self = self;
}
}

NodeMap.Node = Node;
NodeMap.NodeConn = NodeConn;
