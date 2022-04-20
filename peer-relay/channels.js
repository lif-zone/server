// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import xerr from '../util/xerr.js';
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
  get_closest(id){
    id = typeof id=='string' ? s2b(id) : id;
    let a = this.toArray(), best;
    for (let i=0; i<a.length; i++){
      let ch = a[i];
      if (!ch.id.compare(id)){
        best = ch;
        break;
      }
      else if (id.compare(ch.id)<0 && (!best || ch.id.compare(best.id)<0))
        best = ch;
    }
    if (best)
      return best;
    // it's a ring, so the minimum is the closest
    for (let i=0; i<a.length; i++){
      let ch = a[i];
      if (!best)
        best = ch;
      else if (ch.id.compare(best.id)<0)
        best = ch;
    }
    return best;
  }
}
