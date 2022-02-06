// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import KBucket from 'k-bucket';
import {EventEmitter} from 'events';
import assert from 'assert';
import Router from './router.js';
import Wallet from './wallet.js';
import WsConnector from './ws.js';
import WrtcConnector from './wrtc.js';
import util from '../util/util.js';
import xerr from '../util/xerr.js';
import etask from '../util/etask.js';
const b2s = util.buf_to_str;

export default class Client extends EventEmitter {
  constructor(opt){
    super();
    if (!opt)
      opt = {};
    // XXX: change id string
    this.wallet = new Wallet({keys: opt.keys});
    this.id = this.wallet.keys.pub;
    // XXX: need cleanup for all internal structures
    this.pending = {};
    this.destroyed = false;
    this.peers = new KBucket({localNodeId: this.id});
    this.peers.on('removed', channel=>channel.destroy());
    // TODO expire canidates after period
    this.canidates = new KBucket({localNodeId: this.id});
    this.router = new Router({channels: this.peers, id: this.id,
      wallet: this.wallet});
    this.router.on('message', this.on_message);
    this.router.on('req', this.on_req);
    if (opt.port)
      xerr.notice('peer-relay: listen on %s id %s', opt.port, b2s(this.id));
    this.wsConnector = new Client.WsConnector(this.id, opt.port, opt.host);
    this.wsConnector.on('connection', channel=>this._onConnection(channel));
    this.wrtcConnector = new Client.WrtcConnector(this.id, this.router,
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
      _this.canidates.remove(channel.id);
      _this.peers.remove(channel.id);
    };
    assert(!_this.destroyed, 'node already destroyed');
    channel.on('close', onClose);
    // XXX: decide how to handle errors
    channel.on('error', err=>xerr('Error', err));
    delete _this.pending[channel.id];
    _this.canidates.add({id: channel.id});
    if (_this.peers.get(channel.id)){
      if (channel.id.compare(_this.id) >= 0)
        channel.destroy();
      return;
    }
    _this.peers.add(channel);
    _this.emit('connection', channel);
    if (util.test_on_connection)
      yield util.test_on_connection(channel);
    _this.find(b2s(channel.id));
    _this.emit('peer', channel.id);
    return channel;
  });
  connect_wrtc(id){ return this.wrtcConnector.connect(id); }
  connect = id=>etask({'this': this}, function*connect(){
    let _this = this.this;
    if (_this.destroyed) // XXX: print error (or assert)
      return;
    if (id in _this.pending)
      return;
    if (_this.peers.get(id))
      return;
    if (id.equals(_this.id))
      return;
    _this.pending[id] = true;
    yield _this.router.send(id, {type: 'conn_info'});
  });
  disconnect(id){
    if (this.destroyed)
      return;
    if (!this.peers.get(id))
      return;
    this.peers.get(id).destroy();
  }
  send = function(id, data){
    if (this.destroyed)
      return;
    return this.router.send(id, {type: 'user', data: data});
  }
  send_req(id, data){ return this.router.send_req(id, data); }
  send_res(opt, data){ return this.router.send_res(opt, data); }
  find(id){
    if (this.destroyed)
      return;
    this.router.send_req(id, {type: 'find', data: b2s(this.id)})
    .on('res', data=>{
    });
  }
  // XXX: need to validate all data to make sure we don't crash
  on_message = (msg, from)=>{
    if (this.destroyed)
      return;
    switch (msg.type){
    case 'user': this.emit('message', msg.data, from); break;
    case 'find': this._on_find(msg, from); break;
    case 'find_r': this._on_find_r(msg, from); break;
    case 'conn_info': this._on_conn_info(msg, from); break;
    case 'conn_info_r': this._on_conn_info_r(msg, from); break;
    default: xerr('unknown msg type %s', msg.type);
    }
  };
  on_req = (data, res)=>this.emit('req', data, res);
  _on_find = (msg, from)=>etask({'this': this}, function*_on_find(){
    let _this = this.this;
    var target = new Buffer(msg.data, 'hex');
    var closest = _this.canidates.closest(target, 20);
    yield _this.router.send(from,
      {type: 'find_r', data: closest.map(e=>b2s(e.id))});
  });
  _on_find_r(msg){
    for (var canidate of msg.data)
      this.canidates.add({id: new Buffer(canidate, 'hex')});
    return this._populate();
  }
  _on_conn_info = (msg, from)=>etask({'this': this}, function*_on_conn_info(){
    let _this = this.this;
    if (_this.peers.get(from))
      return;
    if (_this.pending[from] == null || from.compare(_this.id) < 0){
      _this.pending[from] = true;
      yield _this.router.send(from, {type: 'conn_info_r', data:
        {ws: _this.wsConnector.url, wrtc: _this.wrtcConnector.supported}});
    }
  });
  _on_conn_info_r = (msg, from)=>etask({'this': this}, function*(){
    let _this = this.this;
    if (_this.peers.get(from))
      return;
    if (msg.data == null)
      return;
    if (msg.data.wrtc && _this.wrtcConnector.supported)
      yield _this.connect_wrtc(from);
    else if (msg.data.ws)
      yield _this.wsConnector.connect(msg.data.ws);
  });
  _populate = ()=>etask({'this': this}, function*_populate(){
    let _this = this.this;
    var optimal = 15;
    var closest = _this.canidates.closest(_this.id, optimal);
    for (var i = 0; i < closest.length &&
      _this.peers.count() + Object.keys(_this.pending).length < optimal; i++){
      if (_this.peers.get(closest[i].id))
        continue;
      yield _this.connect(closest[i].id);
    }
  });
  destroy(cb){
    if (this.destroyed)
      return;
    this.destroyed = true;
    this.wsConnector.destroy(cb);
    this.wrtcConnector.destroy();
    var peers = this.peers.toArray();
    for (var i = 0; i < peers.length; i++)
      peers[i].destroy();
  }
  get_peers(){ return this.peers; }
}
Client.WsConnector = WsConnector;
Client.WrtcConnector = WrtcConnector;
