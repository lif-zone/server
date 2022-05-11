// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import Req from 'req.js';

export default class API extends EventEmitter {
  constructor(opt){
    super();
    this.node = opt.node;
  }
  get_peer(dst, opt){
    return new Req({node: this.node, dst, fuzzy: opt.fuzzy, cmd: 'get_peer'});
  }
}
