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

function ids(id){ return util.buf_to_str(id); }

export default class Client extends EventEmitter {
  constructor(opt){
    super();
    if (!opt)
      opt = {};
    // XXX: change id to priv/pub keys
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
    this.router.set_on_message((msg, from)=>this.on_message(msg, from));
    if (opt.port)
      xerr.notice('peer-relay: listen on %s id %s', opt.port, ids(this.id));
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
  _onConnection = channel=>{
    let _this = this;
    etask(function*_onConnection(){
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
      // once sending a msg - remember it, and keep it 'open'
      yield _this.router.send(channel.id, {type: 'find', data: ids(_this.id)});
      _this.emit('peer', channel.id);
      return channel;
    });
  };
  connect_wrtc(id){ return this.wrtcConnector.connect(id); }
  connect = id=>etask(function*connect(){
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
  }, this);
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
  find(id){
    if (this.destroyed)
      return;
    return this.router.send(id, {type: 'find', data: ids(this.id)});
  }
  // XXX: need to validate all data to make sure we don't crash
  on_message = (msg, from)=>{
    let _this = this;
    return etask(function*on_message(){
      if (_this.destroyed)
        return;
      switch (msg.type){
      case 'user': _this.emit('message', msg.data, from); break;
      case 'find': yield _this._on_find(msg, from); break;
      case 'find_r': yield _this._on_find_r(msg, from); break;
      case 'conn_info': yield _this._on_conn_info(msg, from); break;
      case 'conn_info_r': yield _this._on_conn_info_r(msg, from); break;
      default: xerr('unknown msg type %s', msg.type);
      }
    });
  };
  _on_find = (msg, from)=>{
    let _this = this;
    return etask(function*_on_find(){
      var target = new Buffer(msg.data, 'hex');
      var closest = _this.canidates.closest(target, 20);
      yield _this.router.send(from,
        {type: 'find_r', data: closest.map(e=>ids(e.id))});
    });
  };
  _on_find_r(msg){
    for (var canidate of msg.data)
      this.canidates.add({id: new Buffer(canidate, 'hex')});
    return this._populate();
  }
  _on_conn_info = (msg, from)=>{
    let _this = this;
    return etask(function*_on_conn_info(){
      if (_this.peers.get(from))
        return;
      if (_this.pending[from] == null || from.compare(_this.id) < 0)
      {
        _this.pending[from] = true;
        yield _this.router.send(from, {type: 'conn_info_r', data:
          {ws: _this.wsConnector.url, wrtc: _this.wrtcConnector.supported}});
      }
    });
  };
  _on_conn_info_r(msg, from){
    let _this = this;
    return etask(function*(){
      if (_this.peers.get(from))
        return;
      if (msg.data == null)
        return;
      if (msg.data.wrtc && _this.wrtcConnector.supported)
        yield _this.connect_wrtc(from);
      else if (msg.data.ws)
        yield _this.wsConnector.connect(msg.data.ws);
    });
  }
  _populate = ()=>{
    let _this = this;
    return etask(function*_populate(){
      var optimal = 15;
      var closest = _this.canidates.closest(_this.id, optimal);
      for (var i = 0; i < closest.length &&
        _this.peers.count() + Object.keys(_this.pending).length < optimal; i++)
      {
        if (_this.peers.get(closest[i].id))
          continue;
        yield _this.connect(closest[i].id);
      }
    });
  }
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
