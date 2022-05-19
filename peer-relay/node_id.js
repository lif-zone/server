// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';
import util from '../util/util.js';
const s2b = util.buf_from_str, b2s = util.buf_to_str;

export default class NodeId extends EventEmitter {
constructor(id){
  super();
  if (typeof id=='string')
    this.s = id;
  else if (Buffer.isBuffer(id))
    this.b = id;
  else
    assert.fail('invalid id '+id);
}
get s(){
  if (this.s===undefined)
    this.s = b2s(this.b);
  return this.s;
}
get b(){
  if (this.b===undefined)
    this.b = s2b(this.s);
  return this.s;
}
}
