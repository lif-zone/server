'use strict'; /*jslint node:true, browser:true*/
import KBucket from 'k-bucket';
import crypto from 'crypto';
import {EventEmitter} from 'events';
import _debug from 'debug';
import Router from './router.js';
import WsConnector from './ws.js';
import WrtcConnector from './wrtc.js';
import util from '../util/util.js';
import assert from 'assert';
const debug = _debug('peer-relay:client');

function ids(id){ return util.buf_to_str(id); }

export default class Client extends EventEmitter {
  constructor(opts){
    super();
    if (!opts)
      opts = {};
    this.id = opts.id ? util.buf_from_str(opts.id) : crypto.randomBytes(20);
    this.pending = {};
    this.destroyed = false;
    this.peers = new KBucket({localNodeId: this.id,
      numberOfNodesPerKBucket: 20});
    this.peers.on('removed', channel=>channel.destroy());
    this.canidates = new KBucket({ // TODO expire canidates after period
      localNodeId: this.id, numberOfNodesPerKBucket: 20});
    this.router = new Router(this.peers, this.id);
    this.router.on('message', (msg, from)=>this._onMessage(msg, from));
    if (opts.port)
      console.log('peer-relay: listen on %s id %s', opts.port, ids(this.id));
    this.wsConnector = new (opts.WsConnector||WsConnector)(
      this.id, opts.port, opts.host);
    this.wsConnector.on('connection', channel=>this._onConnection(channel));
    this.wrtcConnector = new (opts.WrtcConnector||WrtcConnector)(
      this.id, this.router, opts.wrtc);
    this.wrtcConnector.on('connection', channel=>this._onConnection(channel));
    this._debug('Client(%s)', JSON.stringify(opts, ['port', 'bootstrap']));
    // XXX HACK: rm timeout
    setTimeout(()=>{
      for (var uri of opts.bootstrap||[])
        this.connect_ws(uri);
    });
  }
  _onConnection(channel){
    const onClose = ()=>{
      delete this.pending[channel.id];
      this.canidates.remove(channel.id);
      this.peers.remove(channel.id);
    };
    assert(!this.destroyed, 'node already destroyed');
    channel.on('close', onClose);
    channel.on('error', err=>this._debug('Error', err));
    delete this.pending[channel.id];
    this.canidates.add({id: channel.id});
    if (this.peers.get(channel.id))
    {
      if (channel.id.compare(this.id) >= 0)
        channel.destroy();
      return;
    }
    this.peers.add(channel);
    this.emit('connection', channel);
    this.router.send(channel.id, {type: 'findPeers', data: ids(this.id)});
    this.emit('peer', channel.id);
    return channel;
  }
  connect_ws(uri){ this.wsConnector.connect(uri); }
  connect_wrtc(uri){ this.wrtcConnector.connect(uri); }
  connect(id){
    var self = this;
    if (self.destroyed)
      return;
    if (id in self.pending)
      return;
    if (self.peers.get(id))
      return;
    if (id.equals(self.id))
      return;
    self.pending[id] = true;
    self._debug('Connecting to id=%s', id.toString('hex', 0, 2));
    self.router.send(id, {type: 'handshake-offer'});
  }
  disconnect(id){
    var self = this;
    if (self.destroyed)
      return;
    if (!self.peers.get(id))
      return;
    self.peers.get(id).destroy();
  }
  send = function(id, data){
    var self = this;
    if (self.destroyed)
      return;
    // self._debug('SEND', id.toString('hex', 0, 2), JSON.stringify(data))
    self.router.send(id, {type: 'user', data: data});
  }
  findPeers(id){
    var self = this;
    if (self.destroyed)
      return;
    self.router.send(id, {type: 'findPeers', data: ids(self.id)});
  }
  _onMessage(msg, from){
    var self = this;
    if (self.destroyed)
      return;
    // self._debug('RECV', from.toString('hex', 0, 2),
    // JSON.stringify(msg.data))
    if (msg.type === 'user')
      self.emit('message', msg.data, from);
    else if (msg.type === 'findPeers')
      self._onFindPeers(msg, from);
    else if (msg.type === 'foundPeers')
      self._onFoundPeers(msg, from);
    else if (msg.type === 'handshake-offer')
      self._onHandshakeOffer(msg, from);
    else if (msg.type === 'handshake-answer')
      self._onHandshakeAnswer(msg, from);
  }
  _onFindPeers(msg, from){
    var self = this;
    var target = new Buffer(msg.data, 'hex');
    var closest = self.canidates.closest(target, 20);
    self.router.send(from, {type: 'foundPeers',
      data: closest.map(e=>ids(e.id))});
  }
  _onFoundPeers(msg){
    var self = this;
    for (var canidate of msg.data)
      self.canidates.add({id: new Buffer(canidate, 'hex')});
    self._populate();
  }
  _onHandshakeOffer(msg, from){
    var self = this;
    if (self.peers.get(from))
      return;
    if (self.pending[from] == null || from.compare(self.id) < 0)
    {
      self.pending[from] = true;
      self.router.send(from, {type: 'handshake-answer',
        data: {ws: self.wsConnector.url, wrtc: self.wrtcConnector.supported}});
    }
  }
  // XXX: change to etask
  async _onHandshakeAnswer(msg, from){
    var self = this;
    if (self.peers.get(from))
      return;
    if (msg.data == null)
      return;
    if (msg.data.wrtc && self.wrtcConnector.supported)
    {
      // XXX HACK: move to connection event
      if (util.test_pause_func)
        await util.test_pause_func('Client._onHandshakeAnswer '+msg.data.type);
      self.connect_wrtc(from);
    }
    else if (msg.data.ws)
    {
      // XXX HACK: move to connection event
      if (util.test_pause_func)
        await util.test_pause_func('Client._onHandshakeAnswer '+msg.data.type);
      self.wsConnector.connect(msg.data.ws);
    }
  }
  _populate(){
    var self = this;
    var optimal = 15;
    var closest = self.canidates.closest(self.id, optimal);
    for (var i = 0; i < closest.length &&
      self.peers.count() + Object.keys(self.pending).length < optimal; i++)
    {
      if (self.peers.get(closest[i].id))
        continue;
      self.connect(closest[i].id);
    }
  }
  _debug(){
    var self = this;
    var prepend = '[' + self.id.toString('hex', 0, 2) + ']  ';
    arguments[0] = prepend + arguments[0];
    debug.apply(null, arguments);
  }
  destroy(cb){
    var self = this;
    if (self.destroyed)
      return;
    self.destroyed = true;
    self.wsConnector.destroy(cb);
    self.wrtcConnector.destroy();
    var peers = self.peers.toArray();
    for (var i = 0; i < peers.length; i++)
      peers[i].destroy();
  }
 get_peers(){ return this.peers; }
}
