// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import xutil from '../util/util.js';

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
  add_json(o){ this.add(JSON.stringify(o)); }
  add_tail_json(o){ this.add_tail(JSON.stringify(o)); }
  count(){ return this.array.length; }
  get(i){ return this.array[i].data; }
  get_json(i){
    this.array[i].json = this.array[i].json||JSON.parse(this.array[i].data);
    return this.array[i].json;
  }
  to_str(){
    let h = '', d='';
    if (this.array.length<=1)
      return '\0'+xutil.get(this, ['array', 0, 'data'], '');
    this.array.forEach(o=>{
      h += (h ? ' ' : '')+o.data.length;
      d += o.data;
    });
    return h+'\0'+d;
  }
  path(){
    if (!LBuffer.xxx_fwd_wrap) // XXX: WIP
      return Array.from(this.get_json(0).path||[]);
    let o, p = [];
    for (let i=0; i<this.count && (o=this.get_json(i)) && o.type=='fwd'; i++)
      p.unshift(o.from);
    return p;
  }
  nonce(){ return this.msg().nonce; }
  msg(){ return this.get_json(this.count()-1); }
}

LBuffer.from = function(s){
  if (typeof s!='string')
    throw new Error('invalid buffer');
  let i = s.search('\0');
  if (i==-1)
    throw new Error('invalid buffer');
  let h = s.substr(0, i), a = h.split(' '), lbuffer = new LBuffer();
  i++;
  if (!h){
    lbuffer.add(s.substr(i, Infinity));
    return lbuffer;
  }
  a.forEach(len=>{
    if (!/^[0-9]+$/.test(len)) // XXX: is_number
      throw new Error('invalid buffer');
    len = parseInt(len);
    lbuffer.add_tail(s.substr(i, len));
    i += len;
  });
  if (i != s.length)
    throw new Error('invalid buffer len');
  return lbuffer;
};

LBuffer.xxx_fwd_wrap = true; // XXX WIP
