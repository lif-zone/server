// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/ /*global BigInt*/
import {EventEmitter} from 'events';
import {Buffer} from 'buffer';
import assert from 'assert';
import buf_util from './buf_util.js';
const s2b = buf_util.buf_from_str, b2s = buf_util.buf_to_str;
const BITS = 160, DIV = Math.pow(2, 56), MAX = Math.pow(2, 52)-1;

export default class NodeId extends EventEmitter {
constructor(id){
  super();
  if (typeof id=='string'){
    this.s = id;
    this.d = Number(BigInt('0x'+this.s.slice(0, 14))) / DIV;
  } else if (typeof id=='number'){
    assert(id>=0 && id<=1, 'invalid id '+id);
    let s = (id*MAX).toString(16).slice(0, 13)+'0'.repeat(BITS/4-13);
    this.s = '0'.repeat(BITS/4-s.length)+s;
    this.d = Number(BigInt('0x'+this.s.slice(0, 14))) / DIV;
  } else if (Buffer.isBuffer(id)){
    this._b = id;
    this.s = b2s(this._b);
    this.d = Number(BigInt('0x'+this.s.slice(0, 14))) / DIV;
  }
  else
    assert.fail('invalid id '+id);
}
get b(){
  if (this._b===undefined)
    this._b = s2b(this.s);
  return this._b;
}
get i(){
    if (this._i===undefined)
      this._i = BigInt.asUintN(53, BigInt('0x'+this.s.slice(0, 14)));
    return this._i;
}
eq(id){ return this.s===id.s; }
cmp(id){
  let d = this.d - id.d;
  if (d)
    return d > 0 ? 1 : -1;
  if (this.s===id.s)
    return 0;
  return this.s < id.s ? -1 : 1;
}
distance(id){
debugger;
  let d = Math.abs(this.d-id.d);
  return d = d>=0.5 ? 1-d : d;
}
distance_bits(id){
  let d = this.distance(id);
  return !d ? 0 : Math.max(53+Math.log2(d), 0);
}
}

NodeId.from = function(id){ return new NodeId(id); };
NodeId.cmp = function(a, b){ return a.cmp(b); };
NodeId.bits = BITS; // XXX: check correct value
