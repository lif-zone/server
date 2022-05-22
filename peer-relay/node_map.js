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
  this.map.set(id, node);
  this.tree.insert(id, node);
}
get(id){ return this.map.get(id); }
del(id){
  this.map.delete(id);
  this.tree.remove(id);
}
}

