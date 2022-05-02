// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/

export default class LBuffer {
  constructor(opt){
    this.array = [];
  }
  add(s){ this.array.unshift(s); }
  add_tail(s){ this.array.push(s); }
  to_str(){
    let h = '', d='';
    if (this.array.length<=1)
      return '\0'+(this.array[0]||'');
    this.array.forEach(s=>{
      h += (h ? ' ' : '')+s.length;
      d += s;
    });
    return h+'\0'+d;
  }
}

LBuffer.from = function(s){
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
