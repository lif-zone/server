// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/

export default class LBuffer {
  constructor(opt){
    this.array = [];
  }
  add(s){ this.array.unshift(s); }
  to_str(){
    let h = '', d='';
    for (let i=0; i<this.array.length-1; i++)
      h += (h ? ' ' : '')+this.array[i].length;
    for (let i=0; i<this.array.length; i++)
      d += this.array[i];
    return h+'\0'+d;
  }
  from_str(s){
  }
}
