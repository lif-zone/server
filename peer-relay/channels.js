// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import xerr from '../util/xerr.js';
import buf_util from './buf_util.js';
import xutil from '../util/util.js';
const b2s = xutil.buf_to_str, s2b = xutil.buf_from_str;

// XXX: need test
export default class Channels extends EventEmitter {
  constructor(opt){
    super();
    this.map = {};
    this.count = 0;
  }
  add(channel){
    let id = b2s(channel.id);
    if (this.map[id]){
      xerr('channel already added %s', id);
      return channel;
    }
    this.map[id] = channel;
    this.count++;
    this.emit('added', channel);
  }
  remove(id){
    id = typeof id=='string' ? id : b2s(id);
    if (!this.map[id])
      return xerr('channel not found %s', id);
    let channel = this.map[id];
    delete this.map[id];
    this.count--;
    this.emit('removed', channel);
    return channel;
  }
  get(id){
    id = typeof id=='string' ? id : b2s(id);
    return this.map[id];
  }
  // XXX: rm and create iterator
  toArray = function(){
    let a = [];
    for (let id in this.map)
      a.push(this.map[id]);
    return a;
  }
  get_closest(id, range, exclude){
    id = typeof id=='string' ? s2b(id) : id;
    exclude = exclude && (typeof exclude=='string' ? s2b(exclude) : exclude);
    // XXX: wrap it in buf_util.js
    range = range &&
      {min: typeof range.min=='string' ? s2b(range.min) : range.min,
      max: typeof range.max=='string' ? s2b(range.max) : range.max};
    let a = this.toArray(), best;
    for (let i=0; i<a.length; i++){
      let ch = a[i];
      if (exclude && !ch.id.compare(exclude))
        continue;
      if (range && !buf_util.in_range(range, ch.id))
        continue;
      if (!ch.id.compare(id)){
        best = ch;
        break;
      }
      else if (ch.id.compare(id)<0 && (!best || best.id.compare(ch.id)<0))
        best = ch;
    }
    if (best)
      return best;
    // it's a ring, so the minimum is the closest
    for (let i=0; i<a.length; i++){
      let ch = a[i];
      if (exclude && !ch.id.compare(exclude))
        continue;
      if (range && !buf_util.in_range(range, ch.id))
        continue;
      if (!best)
        best = ch;
      else if (ch.id.compare(best.id)>0)
        best = ch;
    }
    return best;
  }
}

