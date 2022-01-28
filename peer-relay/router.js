'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import _debug from 'debug';
import assert from 'assert';
import etask from '../util/etask.js';
import xerr from '../util/xerr.js';
import util from '../util/util.js';
const debug = _debug('peer-relay:router');
const stringify = JSON.stringify;

function debugMsg(verb, localID, msg){
  var to = Buffer.isBuffer(msg.to) ? msg.to.toString('hex') : msg.to;
  var from = Buffer.isBuffer(msg.from) ? msg.from.toString('hex') : msg.from;
  verb = (verb + '     ').substr(0, 5);
  debug('[%s] %s (%s->%s) %s', localID.toString('hex', 0, 2), verb,
        from.substr(0, 4), to.substr(0, 4), msg.nonce.substr(0, 4),
        JSON.stringify(msg.data));
}

export default class Router extends EventEmitter {
  constructor(opt){
    super();
    let {channels, id, wallet} = opt;
    this.wallet = wallet;
    this.id = id;
    this.concurrency = 2;
    this.maxHops = 20;
    this._touched = {}; // XXX: memory leak - no cleanup
    this._channelListeners = {};
    this._paths = {};
    this._queue = [];
    this._channels = channels;
    this._channels.on('added', channel=>this._onChannelAdded(channel));
    this._channels.on('removed', channel=>this._onChannelRemoved(channel));
    for (var c of this._channels.toArray())
      this._onChannelAdded(c);
  }
  send_req(id, data){
    // remember packet. keep in send queue. update parent in 'on'
    this.send(id, data);
  }
  send_req('hi').on('res', ...).on('fail', ..);
  send(id, data){
    var msg = {to: id.toString('hex'), from: this.id.toString('hex'),
      nonce: '' + Math.floor(1e15 * Math.random()), data: data,
      __meta__: {path: []}};
    this._touched[msg.nonce] = true;
    util.set(msg, '__meta__.sign', this.wallet.sign(msg));
    debugMsg('SEND', this.id, msg);
    return this._send(msg);
  }
  _send(msg){
    var _this = this; // XXX: is this the best way to use etask as methods
    return etask(function*(){
      _this.emit('send', msg);
      if (msg.__meta__.path.length >= _this.maxHops)
        return; // throw new Error('Max hops exceeded nonce=' + msg.nonce)
      if (_this._channels.count()===0)
        _this._queue.push(msg);
      msg.__meta__.path.push(_this.id.toString('hex'));
      var target = new Buffer(msg.to, 'hex');
      var closests = _this._channels.closest(target, 20)
        .filter(c=>msg.__meta__.path.indexOf(c.id.toString('hex'))===-1)
        .filter((_, index) => index < _this.concurrency);
      if (msg.to in _this._paths)
      {
        var preferred = _this._channels.closest(
          new Buffer(_this._paths[msg.to], 'hex'), 1)[0];
        if (preferred != null && closests.indexOf(preferred) === -1)
          closests.unshift(preferred);
      }
      for (var channel of closests)
      {
        // TODO BUG Sometimes the WS on closest in not in the ready state
        yield channel.send(msg);
        if (channel.id.toString('hex') ===
          (typeof msg.to==='string' ? msg.to : msg.to.toString('hex')))
        {
          // XXX: why do we break?
          break;
        }
      }
    });
  }
  _onMessage = msg=>{
    let _this = this;
    return etask(function*_onMessage(){
      if (msg.nonce in _this._touched)
        return;
      let from = new Buffer(msg.from, 'hex'), to = new Buffer(msg.to, 'hex');
      if (!_this.wallet.verify(msg, msg.__meta__.sign, from))
        return xerr('invalid message signature');
      _this._touched[msg.nonce] = true;
      assert(typeof msg.from=='string',
        'invalid from _this '+_this.id.toString('hex')+' '+stringify(msg));
      _this._paths[msg.from] = msg.__meta__.path[msg.__meta__.path.length - 1];
      if (to.equals(_this.id))
      {
        // XXX: ugly: we change to/from fields and make code diffiuclt to debug
        msg.to = to;
        msg.from = from;
        debugMsg('RECV', _this.id, msg);
        yield _this.emit_message(msg.data, msg.from, msg);
      }
      else
      {
        debugMsg('RELAY', _this.id, msg);
        _this.emit('relay', msg);
        yield _this._send(msg);
      }
    });
  };
  set_on_message = function(cb){
    if (!cb)
      return this.on_message_cb = cb;
    assert(!this.on_message_cb);
    this.on_message_cb = cb;
  }
  emit_message = (data, from, msg)=>{
    let _this = this;
    return etask(function*emit_message(){
      if (_this.on_message_cb)
        yield _this.on_message_cb(data, from, msg);
      _this.emit('message', data, from, msg);
    });
  };
  _onChannelAdded(channel){
    const listener = msg=>this._onMessage(msg);
    channel.on('message', listener);
    this._channelListeners[channel.id] = listener;
    // XXX: check if this can happen during test and add yield
    while (this._queue.length > 0)
      this._send(this._queue.shift());
  }
  _onChannelRemoved = function(channel){
    var listener = this._channelListeners[channel.id];
    channel.removeListener('message', listener);
  }
}

