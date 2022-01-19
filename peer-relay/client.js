'use strict'; /*jslint node:true, browser:true*/
import KBucket from 'k-bucket';
import crypto from 'crypto';
import {EventEmitter} from 'events';
import assert from 'assert';
import Router from './router.js';
import WsConnector from './ws.js';
import WrtcConnector from './wrtc.js';
import util from '../util/util.js';
import etask from '../util/etask.js';

function ids(id){ return util.buf_to_str(id); }

// XXX HACK: proper handle etask error
function on_uncaught(err){
  console.error('%o', err);
  process.exit(-1);
}

export default class Client extends EventEmitter {
  constructor(opts){
    super();
    if (!opts)
      opts = {};
    // XXX: change id to priv/pub keys
    this.id = opts.id ? util.buf_from_str(opts.id) : crypto.randomBytes(20);
    // XXX: need cleanup for all internal structures
    this.pending = {};
    this.destroyed = false;
    this.peers = new KBucket({localNodeId: this.id});
    this.peers.on('removed', channel=>channel.destroy());
    // TODO expire canidates after period
    this.canidates = new KBucket({localNodeId: this.id});
    this.router = new Router(this.peers, this.id);
    this.router.on('message', (msg, from)=>this._onMessage(msg, from));
    if (opts.port)
      console.log('peer-relay: listen on %s id %s', opts.port, ids(this.id));
    this.wsConnector = new Client.WsConnector(this.id, opts.port, opts.host);
    this.wsConnector.on('connection', channel=>this._onConnection(channel));
    this.wrtcConnector = new Client.WrtcConnector(this.id, this.router,
      opts.wrtc);
    this.wrtcConnector.on('connection', channel=>this._onConnection(channel));
    setTimeout(()=>{ // XXX HACK: rm timeout
      for (var uri of opts.bootstrap||[])
        this.wsConnector.connect(uri);
    });
  }
  _onConnection = channel=>{
    let _this = this;
    etask(function*_onConnection(){
      this.on('uncaught', on_uncaught);
      const onClose = ()=>{
        delete _this.pending[channel.id];
        _this.canidates.remove(channel.id);
        _this.peers.remove(channel.id);
      };
      assert(!_this.destroyed, 'node already destroyed');
      channel.on('close', onClose);
      // XXX: decide how to handle errors
      channel.on('error', err=>console.error('Error', err));
      delete _this.pending[channel.id];
      _this.canidates.add({id: channel.id});
      if (_this.peers.get(channel.id))
      {
        if (channel.id.compare(_this.id) >= 0)
          channel.destroy();
        return;
      }
      _this.peers.add(channel);
      _this.emit('connection', channel);
      if (util.test_on_connection)
        yield util.test_on_connection(channel);
      _this.router.send(channel.id, {type: 'find', data: ids(_this.id)});
      _this.emit('peer', channel.id);
      return channel;
    });
  };
  connect_wrtc(id){ this.wrtcConnector.connect(id); }
  connect(id){
    if (this.destroyed) // XXX: print error (or assert)
      return;
    if (id in this.pending)
      return;
    if (this.peers.get(id))
      return;
    if (id.equals(this.id))
      return;
    this.pending[id] = true;
    this.router.send(id, {type: 'handshake-offer'});
  }
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
    this.router.send(id, {type: 'user', data: data});
  }
  find(id){
    if (this.destroyed)
      return;
    this.router.send(id, {type: 'find', data: ids(this.id)});
  }
  // XXX: need to validate all data to make sure we don't crash
  _onMessage(msg, from){
    if (this.destroyed)
      return;
    switch (msg.type)
    {
    case 'user': this.emit('message', msg.data, from); break;
    case 'find': this._on_find(msg, from); break;
    case 'find_r': this._on_find_r(msg, from); break;
    case 'handshake-offer': this._onHandshakeOffer(msg, from); break;
    case 'handshake-answer': this._onHandshakeAnswer(msg, from); break;
    default: console.error('unknown msg type %s', msg.type);
    }
  }
  _on_find(msg, from){
    var target = new Buffer(msg.data, 'hex');
    var closest = this.canidates.closest(target, 20);
    this.router.send(from, {type: 'find_r', data: closest.map(e=>ids(e.id))});
  }
  _on_find_r(msg){
    for (var canidate of msg.data)
      this.canidates.add({id: new Buffer(canidate, 'hex')});
    this._populate();
  }
  _onHandshakeOffer(msg, from){
    if (this.peers.get(from))
      return;
    if (this.pending[from] == null || from.compare(this.id) < 0)
    {
      this.pending[from] = true;
      this.router.send(from, {type: 'handshake-answer',
        data: {ws: this.wsConnector.url, wrtc: this.wrtcConnector.supported}});
    }
  }
  _onHandshakeAnswer(msg, from){
    let _this = this;
    return etask(function*(){
      this.on('uncaught', on_uncaught);
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
  _populate(){
    var optimal = 15;
    var closest = this.canidates.closest(this.id, optimal);
    for (var i = 0; i < closest.length &&
      this.peers.count() + Object.keys(this.pending).length < optimal; i++)
    {
      if (this.peers.get(closest[i].id))
        continue;
      this.connect(closest[i].id);
    }
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
