// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import Tree from 'avl';
import buf_util from './buf_util.js';
import date from '../util/date.js';
const s2b = buf_util.buf_from_str;

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
        move_to_head(paths, i);
        return o.data;
      }
    } else if (p.path.length>path.length){
      // XXX: we might need to reoder by ts
      paths.splice(i, 0, {path, ts});
      move_to_head(paths, i);
      return o.data;
    }
  }
  paths.push({path, ts});
  move_to_head(paths, paths.length-1);
  return o.data;
}
get_closest(id, opt){
  let {dir, range, skip_self} = opt;
  assert(['+', '-'].includes(dir), 'invalid dir '+dir);
  assert(!range, 'XXX range support');
  let tree=this.tree, start=0, size=tree.size, end=size, best;
  if (!size)
    return;
  while (end>start){
		var mid = Math.floor((start+end)/2);
    let key = tree.at(mid).key, cmp = Paths.cmp(id, key);
    if (dir=='+'){
      if (cmp<0){
        end = mid;
        best = key;
      } else if (cmp>0 || skip_self)
        start = mid+1;
      else
        return key;
    } else {
      if (cmp>0){
        start = mid+1;
        best = key;
      }
      else if (cmp<0 || skip_self)
        end = mid;
      else
        return key;
    }
	}
  return best||(dir=='+' ? tree.at(0).key : tree.at(size-1).key);
}
}

function move_to_head(paths, i){
  let path = paths[i].path, curr = paths[i], j;
  for (j=i; j>=0 && paths[j].path.length==path.length; j--);
  j++;
  if (j==i)
    return;
  paths.splice(i, 1);
  paths.splice(j, 0, curr);
}

Paths.eq = function(p1, p2){
  if (p1.length!=p2.length)
    return false;
  let i;
  for (i=0; i<p1.length && p1[i]==p2[i]; i++);
  return i==p1.length;
};

Paths.cmp = function(a, b){ return buf_util.cmp(a, b); };
