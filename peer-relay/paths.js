// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import Tree from 'avl';
import buf_util from './buf_util.js';
import date from '../util/date.js';
import xutil from '../util/util.js';
const s2b = xutil.buf_from_str;

export default class Paths extends EventEmitter {
constructor(opt){
  super();
  this.tree = new Tree(Paths.cmp, true);
}
add(path){
  let tree=this.tree, id=s2b(path[path.length-1]), ts=date.monotonic();
  path = Array.from(path);
  let o = tree.find(id);
  if (!o)
    return tree.insert(id, {id, paths: [{path, ts}]}).data;
  let paths = o.data.paths;
  for (let i=0; i<paths.length; i++){
    let p = paths[i];
    if (p.path.length==path.length){
      if (Paths.eq(p.path, path)){
        p.ts = ts; // XXX: need to reorder by ts
        return o.data;
      }
    } else if (p.path.length>path.length){
      // XXX: we might need to reoder by ts
      paths.splice(i, 0, {path, ts});
      return o.data;
    }
  }
  paths.push({path, ts});
  return o.data;
}
}

Paths.eq = function(p1, p2){
  if (p1.length!=p2.length)
    return false;
  let i;
  for (i=0; i<p1.length && p1[i]==p2[i]; i++);
  return i==p1.length;
};

Paths.cmp = function(a, b){ return buf_util.cmp(a, b); };
