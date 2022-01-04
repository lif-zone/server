'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach*/
// XXX: need jslint mocha: true
import assert from 'assert';
import crypto from 'crypto';
import {EventEmitter} from 'events';
import Node from './client.js';
import util from '../util/util.js';
import array from '../util/array.js';
import xurl from '../util/url.js';
import date from '../util/date.js';
import ws_util from '../util/ws.js';
import xtest from '../util/test_lib.js';
import etask from '../util/etask.js';
const zetask = xtest.etask, stringify = JSON.stringify, assign = Object.assign;
// XXX: make it automatic for all node/browser
process.on('uncaughtException', e=>{
  console.log('uncaughtException %o', e);
  process.exit(-1);
});
process.on('unhandledRejection', e=>{
  console.error('unhandledRejection %o', e);
  process.exit(-1);
});

let t_nodes = {}, t_events = [], t_pending = [];
let t_queue = [];
let t_timeout = 2000, t_running;
let t_peers = {
  a: '82b88a27669ed361313b2292067b37b4e301ca8b',
  b: '5f3ce1af8bdc100ecf98ed8ace28be7417f0acd1',
  c: 'a92e8094373a85cb0e28399f6909ed02080367dc',
  s: '41e32c1c6ffdc91bbfa7684c67e58f3f36174a59'
};

function test_emit(e){
  console.log('emit: %s', e);
  assert.ok(t_running, 'test not running');
  assert.ok(e, 'invalid event');
  t_events.push(e);
}

function test_pending(e, c){
  if (typeof e!='string')
  {
    c = e;
    e = c.orig;
  }
  assert.ok(t_running, 'test not running');
  assert.ok(e, 'invalid event');
  if (c && c.fwd)
    e = c.fwd+'fwd('+e+')';
  t_pending.push(e);
}
// eslint-disable-next-line no-unused-vars
const test_ensure_no_pending_events = ()=>etask(function*(){
  for (let t = date.monotonic(); date.monotonic()-t < t_timeout;)
  {
    yield util.sleep(); // XXX HACK: fixme
    if (t_events[0]==t_pending[0])
    {
      t_events.shift();
      t_pending.shift();
    }
    if (!t_pending.length)
      return;
  }
  console.log('queue %o', t_queue);
  throw new Error('pending events '+stringify(t_pending)+ ' got'+
    stringify(t_events));
});

// XXX: add test
function normalize(e){
  if (!e)
    return e;
  let a=e[0], b=e[1], d=e[2];
  if (d!='<')
    return e;
  return b+a+'>'+e.substr(3);
}

const test_ensure_no_events = ()=>etask(function*(){
  for (let t = date.monotonic(); date.monotonic()-t < t_timeout;)
  {
    try_send_queue();
    if (!t_events.length && !t_pending.length)
      break;
    yield util.sleep(); // XXX HACK: fixme
    if (!t_events.length || !t_pending.length)
      continue;
    if (normalize(t_events[0])==normalize(t_pending[0]))
    {
      t_events.shift();
      t_pending.shift();
    }
    else if (t_events.length>1 && t_events[0].search('foundPeers')!=-1 &&
      normalize(t_events[1])==normalize(t_pending[0]) &&
      normalize(t_events[0])==normalize(t_pending[1]))
    {
      // XXX HACK: because foundPeers is returned directly from findPeers
      // handler, when one of the players is real and the other is fake,
      // the order will change
      t_events.shift();
      t_events.shift();
      t_pending.shift();
      t_pending.shift();
    }
    else
    {
      assert.deepEqual(t_events, t_pending, 'event mismatch.\n'+str_status());
    }
  }
  assert.deepEqual(t_events, t_pending, 'event mismatch.\n'+str_status());
});

function str_status(){
  return 'real: '+stringify(t_events, null, '\t')+'\n'+
  'expected: '+stringify(t_pending, null, '\t')+'\n'+
  'queue: '+stringify(t_queue);
}

class FakeNode extends EventEmitter {
  constructor(opts){
    super();
    this.id = opts.id ? util.buf_from_str(opts.id) : crypto.randomBytes(20);
    this.wsConnector = new FakeWsConnector(this.id, opts.port, opts.host);
    this.wsConnector.on('connection', c=>{
      this.emit('connection', c);
    });
    this.on('connection', channel=>{
      if (!this.t.is_connect_ws)
        return;
      let s = node_from_id(util.buf_from_str(channel.localID));
      let d = node_from_id(util.buf_from_str(channel.id));
      var msg = {to: d.id.toString('hex'), from: s.id.toString('hex'),
        path: [s.id.toString('hex')],
        nonce: '' + Math.floor(1e15 * Math.random()),
        data: {type: 'findPeers', data: util.buf_to_str(s.id)}};
      send_msg(s.t.name, d.t.name, msg);
    });
  }
  destroy(){}
  connect_ws(url){
    // XXX: ugly hack. need to find proper solution for is_connect_ws
    this.t.is_connect_ws = true;
    this.wsConnector.connect(url);
  }
}

class FakeChannel extends EventEmitter {
  constructor(opts){
    super();
    this.id = opts.id;
    this.localID = opts.localID;
    this.on('message', msg=>{
      let s = node_from_id(this.id);
      let d = node_from_id(this.localID);
      let from = node_from_id(util.buf_from_str(msg.from));
      let to = node_from_id(util.buf_from_str(msg.to));
      let a, p, {type, data} = msg.data, fwd = s!=from||d!=to, e;
      switch (type)
      {
        case 'findPeers':
          p = node_from_id(util.buf_from_str(data));
          e = from.t.name+to.t.name+'>'+type+'('+p.t.name+')';
          break;
        case 'foundPeers':
          a = array_id_to_name(data);
          e = from.t.name+to.t.name+'>'+type+'('+a.join(',')+')';
          break;
        case 'handshake-offer': e = from.t.name+to.t.name+'>'+type; break;
        case 'handshake-answer':
          assert(data && !data.ws && !data.wrtc); // XXX: TODO
          e = from.t.name+to.t.name+'>'+type;
          break;
        case 'user': e = from.t.name+to.t.name+'>msg('+data+')'; break;
        default: assert(false, 'unexpected msg '+type);
      }
      if (fwd)
        e = s.t.name+d.t.name+'>fwd('+e+')';
      test_emit(e);
    });
  }
  send(msg){
    let s = node_from_id(this.localID), d = node_from_id(this.id);
    let {type} = msg.data;
    switch (type)
    {
    case 'findPeers':
    case 'foundPeers':
    case 'handshake-offer':
    case 'handshake-answer':
    case 'user':
      send_msg(s.t.name, d.t.name, msg);
      break;
    default: assert(false, 'unexpected msg '+type);
    }
  }
  destroy(){}
}
function array_id_to_name(a){
  let ret = [];
  a.forEach(id=>ret.push(node_from_id(util.buf_from_str(id)).t.name));
  return ret;
}

function array_name_to_id(a){
  let ret = [];
  a.forEach(name=>{
    if (name[2]=='>') // XXX HACK:
      name = name[4];
    if (name[1]==')') // XXX HACK:
      name = name[0];
    ret.push(util.buf_to_str(t_nodes[name].id));
  });
  return ret;
}

function send_msg(s, d, msg){
  let channel = node_get_channel(d, s);
  let channel2 = node_get_channel(s, d);
  if (typeof msg.from!='string')
  {
    msg.from = util.buf_to_str(msg.from);
    msg.to = util.buf_to_str(msg.to);
  }
  if (!channel || !channel2 || t_queue.length)
    t_queue.push({s, d, msg: assign({}, msg)});
  else
    channel.emit('message', msg);
}

function fake_send_msg(c, data){
  let s = t_nodes[c.s], d = t_nodes[c.d];
  let to = d.id.toString('hex'), from = s.id.toString('hex');
  let fs = c.fwd&&c.fwd[0], fd = c.fwd&&c.fwd[1];
  if (c.fwd) // XXX: make it generic and fix all
  {
    s = t_nodes[fs];
    d = t_nodes[fd];
  }
  if (data.type!='findPeers')
  {
    if (!s.t.fake)
      return;
  }
  else
  {
    if (!(s.t.fake && !s.t.is_connect_ws))
      return;
  }
  var msg = {to, from, path: [s.id.toString('hex')],
    nonce: '' + Math.floor(1e15 * Math.random()), data};
  if (c.fwd)
    send_msg(fs, fd, msg);
  else
    send_msg(c.s, c.d, msg);
}

let t_seq = 0;
function try_send_queue(){
  let q = t_queue.filter(o=>node_get_channel(o.d, o.s) &&
    node_get_channel(o.s, o.d));
  let seq = ++t_seq;
  q.forEach(o=>{
    if (o.t_seq===undefined)
      o.t_seq = seq;
  });
  q.forEach(o=>{
    if (o.t_seq!=seq)
      return;
    let channel = node_get_channel(o.d, o.s);
    channel.emit('message', o.msg);
  });
  q.forEach(o=>array.rm_elm(t_queue, o));
}

class FakeWsConnector extends EventEmitter {
  constructor(id, port, host){
    super();
    this.id = id;
    if (port || host) // XXX: what if no host?
    {
      assert(host, 'missing host');
      assert(port, 'missing port');
      this.url = 'wss://'+host+':'+port;
    }
  }
  connect(url){
    let node = node_from_url(url);
    let channel = new FakeChannel({localID: this.id, id: node.id});
    this.emit('connection', channel);
    let channel2 = new FakeChannel({localID: node.id, id: this.id});
    node.wsConnector.emit('connection', channel2);
  }
  destroy(){}
}

function is_fake(role, p){ return role!= '*' && role!=p; }

function node_from_url(url){
  for (let name in t_nodes)
  {
    let node = t_nodes[name];
    if (node.t.wss && node.t.wss.url==url)
      return node;
  }
}

function node_from_id(id){
  for (let name in t_nodes)
  {
    let node = t_nodes[name];
    // XXX: make it nicer
    if (node.t.id == (typeof id=='string' ? id : util.buf_to_str(id)))
      return node;
  }
}

function is_same_id(id1, id2){
  return util.buf_to_str(id1)==util.buf_to_str(id2); }

function node_get_channel(_s, _d){
  let s = t_nodes[_s], d = t_nodes[_d];
  for (let i=0; i<s.t.channels.length; i++)
  {
    let channel = s.t.channels[i];
    if (is_same_id(channel.id, d.id))
      return channel;
  }
}

function assert_exist(name){
  assert.ok(t_nodes[name], 'node not found '+name); }
function assert_not_exist(name){
  assert.ok(!t_nodes[name], 'node already exist '+name); }

function assert_port(port){
  assert.ok(/[0-9]+/.test(port), 'invalid port '+port);
  assert.ok(port>0 && port<65535, 'invalid port '+port);
  return +port;
}

function assert_host(host){
  assert.ok(xurl.is_valid_domain(host), 'invalid host '+host);
  return host;
}

function assert_name_new(val){
  assert_not_exist(val);
  assert(/^[a-zA-Z]$/.test(val), 'invalid name '+val);
  return val;
}

function assert_wss_url(val){
  // XXX: TODO
  return val;
}

function assert_wss(val){
  let host, port, arg = xtest.test_parse(val);
  util.forEach(arg, a=>{
    switch (a.cmd)
    {
    case 'host': host = assert_host(a.arg); break;
    case 'port': port = assert_port(a.arg); break;
    default: 'invalid cmd '+a.cmd;
    }
  });
  assert(host && port, 'must specify host & port');
  return {host, port, url: 'wss://'+host+':'+port};
}

function cmd_node(role, c){
  // XXX: add xtest.test_parse_unique (to avoid multiple args)
  let arg = xtest.test_parse(c.arg);
  let id, name, wss;
  util.forEach(arg, a=>{
    switch (a.cmd)
    {
    case 'name':
      name = assert_name_new(a.arg);
      assert(t_peers[name], 'peer id not founnd '+name);
      id = t_peers[name];
      break;
    case 'wss': wss = assert_wss(a.arg); break;
    default: throw new Error('unknown arg '+a.cmd);
    }
  });
  let fake = is_fake(role, name);
  let node = new (fake ? FakeNode : Node)(
    assign({id: util.buf_from_str(id), WsConnector: FakeWsConnector}, wss));
  assert.equal(id, util.buf_to_str(node.id));
  node.t = {id, name, fake, wss, channels: []};
  t_nodes[name] = node;
  node.on('connection', channel=>{
    let s = node_from_id(channel.localID), d = node_from_id(channel.id);
    node.t.channels.push(channel);
    test_emit(s.t.name+d.t.name+'>connected');
  });
}

function cmd_connect(c){
  let wss, arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd)
    {
    case 'wss':
      // XXX: write it in a nicer way
      assert(wss===undefined, 'multiple '+a.cmd);
      if (!a.arg)
        wss = assert_wss_url(t_nodes[c.d].wsConnector.url);
      else
      {
        assert(!c.d);
        wss = assert_wss_url(a.arg);
      }
      assert(wss, 'dest '+c.d+' has no ws server');
      break;
    default: throw new Error('unknown arg '+a.cmd);
    }
  });
  assert_exist(c.s);
  assert.equal(c.dir, '>');
  if (wss)
    t_nodes[c.s].connect_ws(wss);
  else
    throw new Error('not implemented yet');
}

const cmd_connected = c=>etask(function(){
  // XXX: check what to assert for events
  test_pending(c);
});

const cmd_find_peers = c=>etask(function(){
  // XXX: check what to assert
  let s = t_nodes[c.s];
  fake_send_msg(c, {type: 'findPeers', data: util.buf_to_str(s.id)});
  test_pending(c);
});

const cmd_found_peers = c=>etask(function(){
  // XXX: check what to assert
  let a = array_name_to_id(c.arg.split(','));
  fake_send_msg(c, {type: 'foundPeers', data: a});
  test_pending(c);
});

const cmd_msg = c=>etask(function(){
  // XXX: check what to assert
  fake_send_msg(c, {type: 'user', data: c.arg});
  test_pending(c);
});

const cmd_send = c=>etask(function(){
  // XXX: check what to assert
  let a = xtest.test_parse(c.arg);
  assert(a.length==1, 'invalid fwd %'+c.arg);
  // XXX use: fake_send_msg (need to handle s.send)
  let s = t_nodes[a[0].s], d = t_nodes[a[0].d], data = a[0].cmd;
  test_emit(c.orig);
  test_pending(c);
  if (!s.t.fake)
    s.send(d.id, data);
});

const cmd_handshake_offer = c=>etask(function(){
  // XXX: check what to assert
  fake_send_msg(c, {type: 'handshake-offer', data: null});
  test_pending(c);
});

const cmd_handshake_answer = c=>etask(function(){
  // XXX: check what to assert
  fake_send_msg(c, {type: 'handshake-answer', data: {}});
  test_pending(c);
});

const cmd_fwd = (role, c)=>etask(function*(){
  // XXX: need assert on arg
  let a = xtest.test_parse(c.arg);
  assert(a.length==1, 'invalid fwd %'+c.arg);
  a[0].fwd = c.s+c.d+'>';
  yield run_cmd(role, a[0]);
});

const cmd_setup = c=>etask(function(){
  assert(false, 'cmd_setup TODO');
/* XXX: TODO
  assert(arg=='');
  M('node(name:s wss(host:lif.zone port:4000)) node(name:a)');
*/
});

const run_cmd = (role, c)=>etask(function*(){
    console.log('cmd:%s %s', c.fwd ? 'in fwd '+c.fwd : '', c.orig);
    switch (c.cmd)
    {
    case '-': yield test_ensure_no_events(); break;
    case 'setup': yield cmd_setup(c.arg); break;
    case 'node': yield cmd_node(role, c); break;
    case 'connect': yield cmd_connect(c); break;
    case 'connected': yield cmd_connected(c); break;
    case 'findPeers': yield cmd_find_peers(c); break;
    case 'foundPeers': yield cmd_found_peers(c); break;
    case 'send': yield cmd_send(c); break;
    case 'msg': yield cmd_msg(c); break;
    case 'handshake-offer': yield cmd_handshake_offer(c); break;
    case 'handshake-answer': yield cmd_handshake_answer(c); break;
    case 'fwd': yield cmd_fwd(role, c); break;
    default: throw new Error('unknown cmd '+c.cmd);
    }
});

const test_run = (role, test)=>etask(function*(){
  assert.ok(!t_running, 'test already running');
  t_running = true;
  let a = xtest.test_parse(test);
  for (let i=0, c; i<a.length, c=a[i]; i++)
  {
    yield run_cmd(role, c);
    try_send_queue();
  }
  yield test_end();
  t_running = false;
});

const test_end = ()=>etask(function*(){
  yield test_ensure_no_events();
  assert.ok(t_running, 'test not running');
  try_send_queue();
  assert(!t_queue.length, 'not all events were sent\n'+str_status());
  for (let n in t_nodes)
  {
    yield t_nodes[n].destroy();
    delete t_nodes[n];
  }
  yield test_ensure_no_events();
});

// XXX: rm
class FakeWS extends EventEmitter {
  constructor(url, opts){
    super();
    throw new Error('FakeWS');
  }
  close(){
  }
  send(s){
  }
}

// XXX: rm
class FakeWebSocketServer extends EventEmitter {
  constructor(opts){
    super();
    throw new Error('FakeWebSocketServer');
  }
  init = ()=>{
  }
  close(cb){
    if (cb)
      cb();
  }
}

describe('peer-relay', function(){
  beforeEach(function(){
    xtest.set(ws_util, 'WS', FakeWS);
    xtest.set(ws_util, 'WebSocketServer', FakeWebSocketServer);
    // XXX TODO: same for WRTC
  });
  // XXX: support as> and sa< (normalize function) for event matching
  this.timeout(2*t_timeout);
  describe('basic', ()=>zetask(function(){
    const t = (name, test)=>{
      it(name+'_a', ()=>zetask(()=>test_run('a', test)));
      it(name+'_s', ()=>zetask(()=>test_run('s', test)));
      it(name+'_real', ()=>zetask(()=>test_run('*', test)));
      it(name+'_fake', ()=>zetask(()=>test_run('', test)));
    };
    // XXX derry: review '-'
    t('2_nodes', `
      node(name:s wss(host:lif.zone port:4000)) node(name:a)
      as>connect(wss) as>connected as<connected
      as>findPeers(a) sa>findPeers(s) sa>foundPeers(a) as>foundPeers(s) -
      send(as>hello) as>msg(hello) -
      send(as<reply) as<msg(reply) -`);
    /* XXX TODO:
      a>connect(node(b))
    */
    // XXX derry: review real/fake mode
    const t3 = (name, test)=>{
      it(name+'_a', ()=>zetask(()=>test_run('a', test)));
      it(name+'_b', ()=>zetask(()=>test_run('b', test)));
      it(name+'_s', ()=>zetask(()=>test_run('s', test)));
      it(name+'_real', ()=>zetask(()=>test_run('*', test)));
      it(name+'_fake', ()=>zetask(()=>test_run('', test)));
    };
    // XXX: if no host, assume lif.zone
    t3('3_nodes_linear', `
      node(name:a) node(name:b wss(host:lif.zone port:4000))
      node(name:c wss(host:lif.zone port:4001))
      ab>connect(wss) ab>connected ab<connected
      ab>findPeers(a) ba>findPeers(b) ab<foundPeers(a) ba<foundPeers(b) -
      bc>connect(wss) bc>connected bc<connected bc>findPeers(b)
      cb>findPeers(c) cb>foundPeers(b) bc>foundPeers(c,a,b)
      cb>fwd(ca>handshake-offer) ba>fwd(ca>handshake-offer)
      ab>fwd(ac>handshake-answer) bc>fwd(ac>handshake-answer)
    `);
    t3('3_nodes', `
      node(name:s wss(host:lif.zone port:4000)) node(name:a)
      as>connect(wss) as>connected as<connected
      as>findPeers(a) sa>findPeers(s) as<foundPeers(a) sa<foundPeers(s) -
      node(name:b) bs>connect(wss) bs>connected bs<connected
      bs>findPeers(b) sb>findPeers(s) bs<foundPeers(b,s,a) bs>foundPeers(s)
      bs>fwd(ba>handshake-offer) sa>fwd(ba>handshake-offer)
      sa<fwd(ab>handshake-answer) bs<fwd(ab>handshake-answer) -`);
      // XXX: TODO
      /* send(sa>hello) sa>msg(hello) bs>fwd(sa>msg(hello)) sa>msg(hello) -
        send(ab>hello) as>fwd(ab>msg(hello)) sb>fwd(ab>msg(hello)) -
        send(ba>hello) bs>fwd(ba>msg(hello)) sa>fwd(ba>msg(hello)) -
        send(as>hello) as>msg(hello) -
        send(ba>hello) bs>fwd(ba>msg(hello)) sb>fwd(ba>msg(hello)) -
        as>send(hello) -
        sa>send(reply) sb>fwd(sa>send(reply)) bs>fwd(sa>send(reply))
      */
    const t4 = (name, test)=>{
      it(name+'_a', ()=>zetask(()=>test_run('a', test)));
      it(name+'_b', ()=>zetask(()=>test_run('b', test)));
      it(name+'_c', ()=>zetask(()=>test_run('b', test)));
      it(name+'_s', ()=>zetask(()=>test_run('s', test)));
      it(name+'_real', ()=>zetask(()=>test_run('*', test)));
      it(name+'_fake', ()=>zetask(()=>test_run('', test)));
    };
    if (0) // XXX: WIP
    t4('4_nodes', `
      node(name:s wss(host:lif.zone port:4000)) node(name:a)
      as>connect(wss) as>connected as<connected
      as>findPeers(a) sa>findPeers(s) as<foundPeers(a) sa<foundPeers(s) -
      node(name:b) bs>connect(wss) bs>connected bs<connected
      bs>findPeers(b) sb>findPeers(s) bs<foundPeers(b,s,a) bs>foundPeers(s)
      bs>fwd(ba>handshake-offer) sa>fwd(ba>handshake-offer)
      sa<fwd(ab>handshake-answer) bs<fwd(ab>handshake-answer) -
      node(name:c) cs>connect(wss) cs>connected cs<connected cs>findPeers(c)
      sc>findPeers(s) cs<foundPeers(c,a,s,b) cs>foundPeers(s)
      cs>fwd(ca>handshake-offer) cs>fwd(cb>handshake-offer)
      sa>fwd(ca>handshake-offer) sb>fwd(cb>handshake-offer)
      as>fwd(ac>handshake-answer) bs>fwd(bc>handshake-answer)
      sc>fwd(ac>handshake-answer) sc>fwd(bc>handshake-answer)`);
  }));
});

