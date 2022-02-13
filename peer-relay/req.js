// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import assert from 'assert';

export default class Req extends EventEmitter {
  // {node, dst, hdr, body}
  constructor(opt){
    super();
    assert(opt.node, 'must provide node');
    assert(opt.dst, 'must provide dst');
    this.node = opt.node;
    this.dst = opt.dst;
    this.req = this.node.router.send_req(this.dst, opt.hdr, opt.body);
    this.req_id = this.req.__meta.req_id;
    this.req.on('res', msg=>this.emit('res', msg));
    this.req.on('fail', err=>this.emit('fail', err));
  }
  test_send(){ return this.req.test_send(); }
}
