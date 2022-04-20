// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import KBucket from 'k-bucket';
import {EventEmitter} from 'events';
import assert from 'assert';
import Router from './router.js';
import Req from './req.js';
import ReqHandler from './req_handler.js';
import Wallet from './wallet.js';
import WsConnector from './ws.js';
import WrtcConnector from './wrtc.js';
import {dbg_id} from './util.js';
import util from '../util/util.js';
import xerr from '../util/xerr.js';
import etask from '../util/etask.js';
import xlog from '../util/xlog.js';
const log = xlog('node');
const s2b = util.buf_from_str, b2s = util.buf_to_str;

export default class Node extends EventEmitter {
  constructor(opt){
    super();
    if (!opt)
      opt = {};
    // XXX: change id string
    this.wallet = new Wallet({keys: opt.keys});
    this.id = this.wallet.keys.pub;
    // XXX: need cleanup for all internal structures
    this.pending = {};
    this.peers = new KBucket({localNodeId: this.id});
    this.peers.on('removed', channel=>channel.destroy());
    this.router = new Router({channels: this.peers, id: this.id,
      wallet: this.wallet});
    this.conn_handler = new ReqHandler({node: this, cmd: 'conn_info'})
    .on('req', (msg, res)=>{
     let from = s2b(msg.from);
      if (this.peers.get(from))
          return;
      if (this.pending[from]==null || from.compare(this.id)<0){
        this.pending[from] = true;
        res.send({ws: this.wsConnector.url,
          wrtc: this.wrtcConnector.supported});
      }
    });
    if (opt.port)
      xerr.notice('peer-relay: listen on %s id %s', opt.port, b2s(this.id));
    this.wsConnector = new Node.WsConnector(this.id, opt.port, opt.host,
      opt.http);
    this.wsConnector.on('connection', channel=>this._onConnection(channel));
    this.wrtcConnector = new Node.WrtcConnector(this.id, this.router,
      opt.wrtc);
    this.wrtcConnector.on('connection', channel=>this._onConnection(channel));
    setTimeout(()=>{ // XXX HACK: rm timeout
      for (var uri of opt.bootstrap||[])
        this.wsConnector.connect(uri);
    });
  }
  // XXX derry: update js_code and fix existing code
  // if (...){
  // switch (a){
  // for (...){
  // } else {
  _onConnection = channel=>etask({'this': this}, function*_onConnection(){
    let _this = this.this;
    const onClose = ()=>{
      delete _this.pending[channel.id];
      _this.peers.remove(channel.id);
    };
    assert(!_this.destroyed, 'node already destroyed');
    channel.on('close', onClose);
    // XXX: decide how to handle errors
    channel.on('error', err=>xerr('Error', err));
    delete _this.pending[channel.id];
    if (_this.peers.get(channel.id)){
      if (channel.id.compare(_this.id) >= 0)
        channel.destroy();
      return;
    }
    _this.peers.add(channel);
    _this.emit('connection', channel);
    if (util.test_on_connection)
      yield util.test_on_connection(channel);
    _this.emit('peer', b2s(channel.id));
    return channel;
  });
  connect_wrtc(id){ return this.wrtcConnector.connect(id); }
  connect = id=>{
    if (this.destroyed) // XXX: print error (or assert)
      return;
    if (id in this.pending)
      return;
    if (this.peers.get(id))
      return;
    if (id.equals(this.id))
      return;
    this.pending[id] = true;
    // XXX: allow empty body
    log.debug('conn_info');
    let req = new Req({node: this, dst: id, cmd: 'conn_info'});
    req.on('res', msg=>this._on_conn_info_r(msg));
    req.send({});
  };
  disconnect(id){
    if (this.destroyed)
      return;
    if (!this.peers.get(id))
      return;
    this.peers.get(id).destroy();
  }
  send = function(dst, body){
    assert(typeof dst=='string', 'invalid dst');
    log.debug('send %s', dbg_id(dst));
    if (this.destroyed)
      return;
    let req = new Req({node: this, dst});
    req.send(body);
  }
  _on_conn_info_r = msg=>etask({'this': this}, function*(){
    let {from} = msg;
    let _this = this.this;
    from = s2b(from);
    log.debug('conn_info_r');
    if (_this.peers.get(from))
      return;
    if (msg.body == null)
      return;
    if (Node.t_conn_info_r_hook)
      yield Node.t_conn_info_r_hook(msg);
    if (msg.body.wrtc && _this.wrtcConnector.supported)
      yield _this.connect_wrtc(from);
    else if (msg.body.ws)
      yield _this.wsConnector.connect(msg.body.ws);
  });
  destroy(cb){
    if (this.destroyed)
      return;
    this.emit('destroy');
    this.destroyed = true;
    this.wsConnector.destroy(cb);
    this.wrtcConnector.destroy();
    var peers = this.peers.toArray();
    for (var i = 0; i < peers.length; i++)
      peers[i].destroy();
  }
  get_peers(){ return this.peers; }
}
Node.WsConnector = WsConnector;
Node.WrtcConnector = WrtcConnector;
