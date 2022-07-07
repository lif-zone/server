// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import xutil from '../util/util.js';
import NodeId from './node_id.js';
const stringify = JSON.stringify;

export default class LBuffer {
  constructor(opt){
    this.array = [];
    if (typeof opt=='object')
      this.add_json(opt);
    else if (opt)
      this.add(opt);
  }
  // XXX: change internal structure. just save long string and indexes to
  // data start/end to avoid expensive parsing when caling LBuffer.from
  add(data){
    let o = {data};
    this.array.unshift(o);
  }
  add_tail(data){
    let o = {data};
    this.array.push(o);
  }
  add_json(o){ this.add(stringify(o)); }
  add_tail_json(o){ this.add_tail(stringify(o)); }
  size(){ return this.array.length; }
  get(i){ return this.array[i].data; }
  get_json(i){
    this.array[i].json = this.array[i].json||JSON.parse(this.array[i].data);
    return this.array[i].json;
  }
  to_str(){
    let h = [], d='';
    if (this.array.length<=1)
      return '\0'+xutil.get(this, ['array', 0, 'data'], '');
    this.array.forEach(o=>{
      h.push(o.data.length);
      d += o.data;
    });
    return stringify(h)+'\0'+d;
  }
  path(){
    let o, p = [];
    for (let i=0; i<this.size() && (o=this.get_json(i)) && o.type=='fwd'; i++)
      p.unshift(o.from);
    return p;
  }
  msg(){ return this.get_json(this.size()-1); }
  range(){
    for (let i=0; i<this.size(); i++){
      let o = this.get_json(i);
      if (o.range)
        return NodeId.range_from_msg(o.range);
    }
  }
}

LBuffer.from = function(s){
  if (typeof s!='string')
    throw new Error('invalid buffer');
  let i = s.search('\0');
  if (i==-1)
    throw new Error('invalid buffer');
  let a, h = s.substr(0, i), lbuffer = new LBuffer();
  try { a = JSON.parse(h||'""'); }
  catch(err){ throw new Error('invalid buffer'); }
  i++;
  if (!h || a&&a.length==0){
    lbuffer.add(s.substr(i, Infinity));
    return lbuffer;
  }
  if (!Array.isArray(a))
    throw new Error('invalid buffer');
  a.forEach(len=>{
    if (typeof len!='number')
      throw new Error('invalid buffer');
    lbuffer.add_tail(s.substr(i, len));
    i += len;
  });
  if (i != s.length)
    throw new Error('invalid buffer');
  return lbuffer;
};
