// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/ /*global BigInt*/
import {EventEmitter} from 'events';
import {Buffer} from 'buffer';
import assert from 'assert';
import buf_util from './buf_util.js';
const s2b = buf_util.buf_from_str, b2s = buf_util.buf_to_str;
const divider = Math.pow(2, 56);

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
get i(){
    if (this._i===undefined)
      this._i = BigInt.asUintN(53, BigInt('0x'+this.s.slice(0, 14)));
    return this._i;
}
get n(){
    if (this._n===undefined)
      this._n = Number(BigInt('0x'+this.s.slice(0, 14))) / divider;
    return this._n;
}
cmp(id){
  let d = this.n - id.n;
  if (d)
    return d > 0 ? 1 : -1;
  if (this.s===id.s)
    return 0;
  return this.s < id.s ? -1 : 1;
}
}

NodeId.from = function(id){ return new NodeId(id); };
