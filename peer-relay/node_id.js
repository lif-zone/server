// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/ /*global BigInt*/
import {EventEmitter} from 'events';
import {Buffer} from 'buffer';
import assert from 'assert';
import buf_util from './buf_util.js';
const s2b = buf_util.buf_from_str, b2s = buf_util.buf_to_str;
const BITS=160, CHARS=BITS/4, DIV=Math.pow(2, 56), MAX = Math.pow(2, 52)-1;

export default class NodeId extends EventEmitter {
constructor(id){
  super();
  if (typeof id=='string' && (id=='0' || id=='1' || /^0?\.[\d]+/.test(id)))
    id = +id;
  if (typeof id=='string'){
    this.s = id;
    this.d = Number(BigInt('0x'+this.s.slice(0, 14))) / DIV;
  } else if (typeof id=='number'){
    assert(id>=0 && id<=1, 'invalid id '+id);
    let s = parseInt(id*MAX).toString(16).slice(0, 13)+'0'.repeat(CHARS-13);
    this.s = '0'.repeat(CHARS-s.length)+s;
    this.d = Number(BigInt('0x'+this.s.slice(0, 14))) / DIV;
  } else if (Buffer.isBuffer(id)){
    this._b = id;
    this.s = b2s(this._b);
    this.d = Number(BigInt('0x'+this.s.slice(0, 14))) / DIV;
  } else
    assert.fail('invalid id '+id);
  if (0) // XXX: TODO
  assert.equal(this.s.length, CHARS, 'invalid id len '+this.s.length+'!='+
    CHARS);
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
eq(id){ return !this.cmp(id); }
cmp(id){
  let d = this.d - id.d;
  if (d)
    return d > 0 ? 1 : -1;
  if (this.s===id.s)
    return 0;
  return this.s < id.s ? -1 : 1;
}
in_range(range){
  return range.min.cmp(range.max)>=0 ?
    this.cmp(range.min)>0 || this.cmp(range.max)<0 :
    this.cmp(range.min)>0 && this.cmp(range.max)<0;
}
dist(id){ return dist(this, id); }
dist_bits(id){ return dist_bits(this, id); }

rtt_pb_via(dst, via, via_rtt){ return rtt_pb_via(this, dst, via, via_rtt); }
}

function dist(a, b){
  let d = Math.abs(a.d-b.d);
  return d>=0.5 ? 1-d : d;
}

function dist_bits(a, b){
  let d = b===undefined ? a : dist(a, b);
  return !d ? 0 : Math.max(53+Math.log2(d), 0);
}
function rtt_pb_via(src, dst, via, via_rtt){
  let src_dst_diff = src.dist(dst);
  let via_dst_diff = via.dist(dst);
  if (src_dst_diff<=via_dst_diff){
    // XXX: when src/via/dst are so close that they appear the same because
    // we just use 53 bits for the float value
    // 0.5**53 1.1102230246251565e-16 1e-16
    if (src_dst_diff!=via_dst_diff)
      return {good: false};
    if (!(via.cmp(src)>0 && via.cmp(dst)<0 ||
      via.cmp(src)<0 && via.cmp(dst)>0))
      return {good: false};
  }
  let ret = {good: true};
  let bits_done = dst.dist_bits(src) - dst.dist_bits(via);
  ret.dist_dst = via_dst_diff;
  ret.dist_done = src_dst_diff-via_dst_diff;
  ret.bits_done = bits_done;
  ret.rtt_pb = bits_done ? via_rtt/bits_done : 1000000000;
  return ret;
}

function range_from_msg(range){ return range &&
  {min: NodeId.from(range.min), max: NodeId.from(range.max)}; }
function range_to_msg(range){ return range &&
  {min: range.min.s, max: range.max.s}; }

NodeId.from = function(id){ return new NodeId(id); };
NodeId.cmp = function(a, b){ return a.cmp(b); };
NodeId.bits = BITS; // XXX: check correct value
NodeId.dist = dist;
NodeId.dist_bits = dist_bits;
NodeId.rtt_pb_via = rtt_pb_via;
NodeId.range_from_msg = range_from_msg;
NodeId.range_to_msg = range_to_msg;
