// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import xerr from '../util/xerr.js';
import buf_util from './buf_util.js';
const b2s = buf_util.buf_to_str;

// XXX: need test
export default class Channels extends EventEmitter {
  constructor(opt){
    super();
    this.map = {};
    this.size = 0;
  }
  add(channel){
    let id = channel.id.s;
    if (this.map[id]){
      xerr('channel already added %s', id);
      return channel;
    }
    this.map[id] = channel;
    this.size++;
    this.emit('added', channel);
  }
  remove(id){
    id = typeof id=='string' ? id : b2s(id);
    if (!this.map[id])
      return xerr('channel not found %s', id);
    let channel = this.map[id];
    delete this.map[id];
    this.size--;
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
}

