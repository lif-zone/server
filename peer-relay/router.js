'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';
import {inherits} from 'util';
import _debug from 'debug';
import assert from 'assert';
import util from '../util/util.js';
const debug = _debug('peer-relay:router');
const stringify = JSON.stringify;

export default Router;

inherits(Router, EventEmitter);
function Router(channels, id){
  var self = this;
  self.id = id;
  self.concurrency = 2;
  self.maxHops = 20;
  self._touched = {};
  self._channelListeners = {};
  self._paths = {};
  self._queue = [];
  self._channels = channels;
  self._channels.on('added', onChannelAdded);
  self._channels.on('removed', onChannelRemoved);
  for (var c of self._channels.toArray())
    self._onChannelAdded(c);

  function onChannelAdded(channel){ self._onChannelAdded(channel); }

  function onChannelRemoved(channel){ self._onChannelRemoved(channel); }
}

Router.prototype.send = function(id, data){
  var self = this;
  var msg = {to: id.toString('hex'), from: self.id.toString('hex'),
    path: [], nonce: '' + Math.floor(1e15 * Math.random()), data: data};
  self._touched[msg.nonce] = true;
  debugMsg('SEND', self.id, msg);
  self._send(msg);
};

Router.prototype._send = async function(msg){
  var self = this;
  self.emit('send', msg);
  if (msg.path.length >= self.maxHops)
    return; // throw new Error('Max hops exceeded nonce=' + msg.nonce)
  if (self._channels.count()===0)
    self._queue.push(msg);
  msg.path.push(self.id.toString('hex'));
  var target = new Buffer(msg.to, 'hex');
  var closests = self._channels.closest(target, 20)
    .filter(c=>msg.path.indexOf(c.id.toString('hex'))===-1)
    .filter((_, index) => index < self.concurrency);
  if (msg.to in self._paths)
  {
    var preferred = self._channels.closest(
      new Buffer(self._paths[msg.to], 'hex'), 1)[0];
    if (preferred != null && closests.indexOf(preferred) === -1)
      closests.unshift(preferred);
  }
  for (var channel of closests)
  {
    // TODO BUG Sometimes the WS on closest in not in the ready state
    channel.send(msg);
    if (util.test_real_paused) // XXX: review if needed here
      await util.test_real_paused;
    if (channel.id.toString('hex') ===
      (typeof msg.to==='string' ? msg.to : msg.to.toString('hex')))
    {
      break;
    }
  }
};

Router.prototype._onMessage = async function(msg){
  var self = this;
  if (msg.nonce in self._touched)
    return;
  self._touched[msg.nonce] = true;
  assert(typeof msg.from=='string',
    'invalid from self '+self.id.toString('hex')+' '+stringify(msg));
  self._paths[msg.from] = msg.path[msg.path.length - 1];
  let to = new Buffer(msg.to, 'hex');
  if (to.equals(self.id))
  {
    // XXX: it's pretty ugly that we change to/from fields and make code
    // diffiuclt to debug
    msg.to = to;
    msg.from = new Buffer(msg.from, 'hex');
    debugMsg('RECV', self.id, msg);
    self.emit('debug-message', msg.data, msg.from, msg);
    self.emit('message', msg.data, msg.from, msg);
  }
  else
  {
    debugMsg('RELAY', self.id, msg);
    self.emit('relay', msg);
    self._send(msg);
  }
};

Router.prototype._onChannelAdded = function(channel){
  var self = this;
  channel.on('message', listener);
  self._channelListeners[channel.id] = listener;

  function listener(msg){ self._onMessage(msg); }

  while (self._queue.length > 0)
    self._send(self._queue.shift());
};

Router.prototype._onChannelRemoved = function(channel){
  var self = this;
  var listener = self._channelListeners[channel.id];
  channel.removeListener('message', listener);
};

function debugMsg(verb, localID, msg){
  var to = Buffer.isBuffer(msg.to) ? msg.to.toString('hex') : msg.to;
  var from = Buffer.isBuffer(msg.from) ? msg.from.toString('hex') : msg.from;
  verb = (verb + '     ').substr(0, 5);
  debug('[%s] %s (%s->%s) %s', localID.toString('hex', 0, 2), verb,
        from.substr(0, 4), to.substr(0, 4), msg.nonce.substr(0, 4),
        JSON.stringify(msg.data));
}
