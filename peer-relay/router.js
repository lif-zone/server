'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import _debug from 'debug';
import assert from 'assert';
import util from '../util/util.js';
import etask from '../util/etask.js';
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
  constructor(channels, id){
    super();
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
  send(id, data){
    var msg = {to: id.toString('hex'), from: this.id.toString('hex'),
      path: [], nonce: '' + Math.floor(1e15 * Math.random()), data: data};
    this._touched[msg.nonce] = true;
    debugMsg('SEND', this.id, msg);
    this._send(msg);
  }
  _send(msg){
    var _this = this; // XXX: is this the best way to use etask as methods
    return etask(function*(){
      _this.emit('send', msg);
      if (msg.path.length >= _this.maxHops)
        return; // throw new Error('Max hops exceeded nonce=' + msg.nonce)
      if (_this._channels.count()===0)
        _this._queue.push(msg);
      msg.path.push(_this.id.toString('hex'));
      var target = new Buffer(msg.to, 'hex');
      var closests = _this._channels.closest(target, 20)
        .filter(c=>msg.path.indexOf(c.id.toString('hex'))===-1)
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
        if (util.test_pause_func)
          yield util.test_pause_func('Router._send '+msg.data.type);
        // TODO BUG Sometimes the WS on closest in not in the ready state
        channel.send(msg);
        if (channel.id.toString('hex') ===
          (typeof msg.to==='string' ? msg.to : msg.to.toString('hex')))
        {
          break;
        }
      }
    });
  }
  _onMessage(msg){
    if (msg.nonce in this._touched)
      return;
    this._touched[msg.nonce] = true;
    assert(typeof msg.from=='string',
      'invalid from this '+this.id.toString('hex')+' '+stringify(msg));
    this._paths[msg.from] = msg.path[msg.path.length - 1];
    let to = new Buffer(msg.to, 'hex');
    if (to.equals(this.id))
    {
      // XXX: it's pretty ugly that we change to/from fields and make code
      // diffiuclt to debug
      msg.to = to;
      msg.from = new Buffer(msg.from, 'hex');
      debugMsg('RECV', this.id, msg);
      this.emit('debug-message', msg.data, msg.from, msg);
      this.emit('message', msg.data, msg.from, msg);
    }
    else
    {
      debugMsg('RELAY', this.id, msg);
      this.emit('relay', msg);
      this._send(msg);
    }
  }
  _onChannelAdded(channel){
    const listener = msg=>this._onMessage(msg);
    channel.on('message', listener);
    this._channelListeners[channel.id] = listener;
    while (this._queue.length > 0)
      this._send(this._queue.shift());
  }
  _onChannelRemoved = function(channel){
    var listener = this._channelListeners[channel.id];
    channel.removeListener('message', listener);
  }
}
