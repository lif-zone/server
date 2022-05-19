// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import {Buffer} from 'buffer';
import assert from 'assert';
import buf_util from './buf_util.js';
const s2b = buf_util.buf_from_str, b2s = buf_util.buf_to_str;

export default class NodeId extends EventEmitter {
constructor(id){
  super();
  if (typeof id=='string')
    this._s = id;
  else if (Buffer.isBuffer(id))
    this._b = id;
  else
    assert.fail('invalid id '+id);
}
get s(){
  if (this._s===undefined)
    this._s = b2s(this._b);
  return this._s;
}
get b(){
  if (this._b===undefined)
    this._b = s2b(this._s);
  return this._b;
}
// XXX: optimize with this.n as float of first 53 bits
cmp(id){ return this.b.cmp(id); }
}
