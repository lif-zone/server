// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';

/* XXX:
let node = new Node({bootstrap: a})
node.on('connect', ()=>{
  let req = new Req({cmd: get_peer, dst: '~'+self.id, body: {id: self.id});
  req.on('res', ()=>{
  });
});
export default class Ring extends EventEmitter {
  constructor(opt){
    super();
    if (!opt)
      opt = {};
  }
}
