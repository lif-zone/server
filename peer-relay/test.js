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
const xetask = xtest.etask, stringify = JSON.stringify, assign = Object.assign;
// XXX: make it automatic for all node/browser
process.on('uncaughtException', e=>{
  console.log('uncaughtException %o', e);
  process.exit(-1);
});
process.on('unhandledRejection', e=>{
  console.error('unhandledRejection %o', e);
  process.exit(-1);
});

let t_nodes = {}, t_events = [], t_pending = [], t_queue = [], t_nonce;
let t_timeout = 2000, t_running;
let t_cmds, t_i, t_disable_pause;
let t_peers = {
  a: 'aab88a27669ed361313b2292067b37b4e301ca8b',
  b: 'bb3ce1af8bdc100ecf98ed8ace28be7417f0acd1',
  c: 'cc2e8094373a85cb0e28399f6909ed02080367dc',
  d: 'dd3a9094373a85cb0e28399f6909ed02080363a0',
  s: 'ffe32c1c6ffdc91bbfa7684c67e58f3f36174a59'
};

let t_debugger_on_events = [
'ab>fwd(bd>handshake-answer)',
'bc>fwd(bd>handshake-answer)'

];

function test_emit(o){
  let {event, fake} = o;
  console.log('emit: %s%s', event, fake ? ' fake' : '');
  assert.ok(t_running, 'test not running');
  assert.ok(event, 'invalid event');
  if (t_debugger_on_events.includes(event)) // eslint-disable-next-line
    debugger;
  t_events.push(event);
  test_eat_all_events();
  test_pause_real(true);
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
  test_eat_all_events();
}

// XXX: add test
function normalize(e){
  if (!e)
    return e;
  let a=e[0], b=e[1], d=e[2];
  if (d!='<')
    return e;
  return b+a+'>'+e.substr(3);
}

function test_eat_all_events(){
  try_send_queue();
  while (t_events.length && t_pending.length)
  {
    assert(normalize(t_events[0])==normalize(t_pending[0]),
     'event mismatch.\n'+str_status());
    t_events.shift();
    t_pending.shift();
  }
  // XXX: TODO (verify all events were eaten) - fix that we always
  // have one pending event
  if (0)
  assert(!t_events.length && !t_pending.length);
}

// XXX: review and rewrite
const test_ensure_no_events = ()=>etask(function*(){
  test_pause_real(false);
  for (let t = date.monotonic(); date.monotonic()-t < t_timeout;)
  {
    try_send_queue();
    yield util.sleep();
    if (!t_events.length && !t_pending.length)
      break;
    if (!t_events.length || !t_pending.length)
      continue;
    if (normalize(t_events[0])==normalize(t_pending[0]))
    {
      t_events.shift();
      t_pending.shift();
    }
    else
      assert.deepEqual(t_events, t_pending, 'event mismatch.\n'+str_status());
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
    this.wsConnector.on('connection', c=>this.emit('connection', c));
  }
  destroy(){}
  connect_ws(url){ this.wsConnector.connect(url); }
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
          assert(data && !data.wrtc, 'TODO '+stringify(data)); // XXX: TODO
          e = from.t.name+to.t.name+'>'+type;
          break;
        case 'user': e = from.t.name+to.t.name+'>msg('+data+')'; break;
        default: assert(false, 'unexpected msg '+type);
      }
      // XXX: normalize e
      t_nonce[e] = msg.nonce;
      if (fwd)
        e = s.t.name+d.t.name+'>fwd('+e+')';
      test_emit({event: e, fake: s.t.fake});
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
    case 'user': send_msg(s.t.name, d.t.name, msg); break;
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
  if (!channel || !channel2)
    t_queue.push({s, d, msg: assign({}, msg)});
  else
  {
    try_send_queue(channel, channel2);
    channel.emit('message', msg);
  }
}

function fake_send_msg(c, data){
  let s = t_nodes[c.s], d = t_nodes[c.d];
  let to = d.id.toString('hex'), from = s.id.toString('hex');
  let fs = c.fwd&&c.fwd[0], fd = c.fwd&&c.fwd[1];
  let nonce = '' + Math.floor(1e15 * Math.random());
  if (c.fwd) // XXX: make it generic and fix all
  {
    s = t_nodes[fs];
    d = t_nodes[fd];
    // XXX: normalize c.orig
    nonce = t_nonce[c.orig]||nonce;
  }
  if (!s.t.fake)
    return;
  var msg = {to, from, path: [s.id.toString('hex')], nonce, data};
  if (c.fwd)
    send_msg(fs, fd, msg);
  else
    send_msg(c.s, c.d, msg);
}

let t_seq = 0;
function try_send_queue(c, c2){
  let q = t_queue.filter(o=>{
    let cds = node_get_channel(o.d, o.s), csd = node_get_channel(o.s, o.d);
    if (!c)
    {
      assert(!c2);
      return cds && csd;
    }
    assert(c2);
    return cds==c&&cds==c2 || cds==c&&cds==c2;
  });
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
  connect(url){}
  destroy(){}
}

function is_fake(role, p){ return role!= 'all' && role!=p; }

// eslint-disable-next-line no-unused-vars
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
  let host = 'lif.zone', port, arg = xtest.test_parse(val);
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
    test_emit({event: s.t.name+d.t.name+'>connected', fake: s.t.fake});
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
  let s = t_nodes[c.s], d = t_nodes[c.d];
//  if (s.t.fake)
  {
    let channel = new FakeChannel({localID: s.id, id: d.id});
    s.wsConnector.emit('connection', channel);
  }
  test_pending(c);
});

const cmd_find_peers = (role, c)=>etask(function*(){
  let fake = is_fake(role, c.s);
  // XXX: check what to assert
  let s = t_nodes[c.s];
  fake_send_msg(c, {type: 'findPeers', data: util.buf_to_str(s.id)});
  test_pending(c);
  test_eat_all_events();
  // XXX HACK: need to check only that last c was "eaten"
  if (t_pending.length)
  {
    yield util.sleep(0);
    test_pause_real(fake);
    yield util.sleep(0);
  }
});

const cmd_found_peers = (role, c)=>etask(function*(){
  let fake = is_fake(role, c.s);
  // XXX: check what to assert
  let a = array_name_to_id(c.arg.split(','));
  fake_send_msg(c, {type: 'foundPeers', data: a});
  test_pending(c);
  test_eat_all_events();
  // XXX HACK: need to check only that last c was "eaten"
  if (t_pending.length)
  {
    yield util.sleep(0);
    test_pause_real(fake);
    yield util.sleep(0);
  }
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
  test_emit({event: c.orig, fake: s.t.fake});
  test_pending(c);
  if (!s.t.fake)
    s.send(d.id, data);
});

const cmd_handshake_offer = (role, c)=>etask(function*(){
  let fake = is_fake(role, c.s);
  // XXX: check what to assert
  fake_send_msg(c, {type: 'handshake-offer', data: null});
  test_pending(c);
  test_eat_all_events();
  // XXX HACK: need to check only that last c was "eaten"
  if (t_pending.length)
  {
    yield util.sleep(0);
    test_pause_real(fake);
    yield util.sleep(0);
  }
});

const cmd_handshake_answer = (role, c)=>etask(function*(){
  let fake = is_fake(role, c.s);
  // XXX: check what to assert
  fake_send_msg(c, {type: 'handshake-answer', data: {}});
  test_pending(c);
  test_eat_all_events();
  // XXX HACK: need to check only that last c was "eaten"
  if (t_pending.length)
  {
    yield util.sleep(0);
    test_pause_real(fake);
    yield util.sleep(0);
  }
});

const cmd_fwd = (role, c)=>etask(function*(){
  let fake = is_fake(role, c.s);
  // XXX: need assert on arg
  let a = xtest.test_parse(c.arg);
  assert(a.length==1, 'invalid fwd %'+c.arg);
  a[0].fwd = c.s+c.d+'>';
  yield run_cmd(role, a[0]);
  test_eat_all_events();
  // XXX HACK: need to check only that last c was "eaten"
  if (t_pending.length)
  {
    yield util.sleep(0);
    test_pause_real(fake);
    yield util.sleep(0);
  }
});

const cmd_setup = c=>etask(function(){
  assert(false, 'cmd_setup TODO');
/* XXX: TODO
  assert(arg=='');
  M('node(name:s wss(host:lif.zone port:4000)) node(name:a)');
*/
});

function test_pause_real(pause){
  if (pause)
  {
    if (t_disable_pause)
      return;
    if (!util.test_real_paused)
    {
      console.log('****** %s', pause ? 'PAUSE' : 'RESUME');
      util.test_real_paused = util.wait();
    }
  }
  else
  {
    if (util.test_real_paused)
    {
      console.log('****** %s', pause ? 'PAUSE' : 'RESUME');
      util.test_real_paused.continue();
    }
    util.test_real_paused = undefined;
  }
}

const run_cmd = (role, c)=>etask(function*(){
    let fake = is_fake(role, c.s);
    console.log('cmd:%s %s', c.fwd ? 'in fwd '+c.fwd : '', c.orig,
      fake? ' fake' : '');
    console.log('t_pending %s', t_pending.join(','));
    console.log('t_events %s', t_events.join(','));
    // XXX: cleanup
    switch (c.cmd)
    {
    case '-':
      test_pause_real(false);
      yield test_ensure_no_events();
      break;
    case 'setup': yield cmd_setup(c.arg); break;
    case 'node': yield cmd_node(role, c); break;
    case 'connect':
      yield util.sleep(0);
      test_pause_real(fake);
      yield util.sleep(0);
      yield cmd_connect(c); break;
    case 'connected':
      yield util.sleep(0);
      test_pause_real(fake);
      yield util.sleep(0);
      yield cmd_connected(c);
      break;
    case 'findPeers':
      yield cmd_find_peers(role, c);
      break;
    case 'foundPeers':
      yield cmd_found_peers(role, c);
      break;
    case 'send': yield cmd_send(c); break;
    case 'msg': yield cmd_msg(c); break;
    case 'handshake-offer':
      yield cmd_handshake_offer(role, c);
      break;
    case 'handshake-answer':
      yield cmd_handshake_answer(role, c);
      break;
    case 'fwd':
      yield cmd_fwd(role, c);
      break;
    default: throw new Error('unknown cmd '+c.cmd);
    }
    yield try_send_queue();
});

const test_run = (role, test)=>etask(function*(){
  assert.ok(!t_running, 'test already running');
  assert(!t_cmds && !t_i);
  t_running = true;
  t_cmds = xtest.test_parse(test);
  t_nonce = {};
  t_disable_pause = role=='all';
  for (t_i=0; t_i<t_cmds.length; t_i++)
    yield run_cmd(role, t_cmds[t_i]);
  yield test_end();
  t_running = false;
  t_nonce = t_cmds = t_i = undefined;
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
  describe('basic', function(){
    const xit = (name, role, test)=> it(name+'_'+role,
      ()=>xetask(()=>test_run(role, test)));
    let t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'all', test);
      xit(name, 'fake', test);
    };
    // XXX: fix all roles ab> ab<
    t('2_nodes', `
      node(name:b wss(port:4000)) node(name:a)
      ab>connect(wss) ab>connected ba>connected
      ab>findPeers(a) ba>foundPeers(a) ba>findPeers(b) ab>foundPeers(b,a) -
      send(ab>hello) ab>msg(hello) - send(ab<reply) ab<msg(reply) -`);
/* XXX derry: review real/fake mode
  ab>connect(wss) === ab>connect(wss |) ab<connected
  test_connected(){
    conntedted...
  }
  test_connect(){
    connect....
    if ('|') noack = 1;
    if (!noack)
      test_connected(rev_roles)
  }
  test_foundPeers(){
     foundPeers...
  }
  test_findPeers(){
    findPeers....
    if ('|') noack = 1;
    if (!noack)
      test_foundPeers()
  }
*/
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'c', test);
      xit(name, 'real', test);
      xit(name, 'fake', test);
    };
    // XXX: send(ab>xxx) --> ab>send(xxx)
    // XXX BUG: why a and c don't try to connect directly once found each other
    t('3_nodes_linear', `
      node(name:a) node(name:b wss(port:4000))
      node(name:c wss(port:4001))
      ab>connect(wss) ab>connected ab<connected
      ab>findPeers(a) ab<foundPeers(a) ba>findPeers(b) ba<foundPeers(b,a) -
      bc>connect(wss) bc>connected bc<connected
      bc>findPeers(b) cb>foundPeers(b) cb>findPeers(c) bc>foundPeers(c,a,b)
      cb,ba>ca>handshake-offer
      cb>fwd(ca>handshake-offer) ba>fwd(ca>handshake-offer)
      ab>fwd(ac>handshake-answer) bc>fwd(ac>handshake-answer) -
      send(ab>hello) ab>msg(hello) -
      send(ba>hello) ba>msg(hello) -
      send(bc>hello) bc>msg(hello) -
      send(cb>hello) cb>msg(hello) -
      send(ac>hello) ab>fwd(ac>msg(hello)) bc>fwd(ac>msg(hello)) -
      send(ca>hello) cb>fwd(ca>msg(hello)) ba>fwd(ca>msg(hello)) -
    `);
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 's', test);
      xit(name, 'real', test);
      xit(name, 'fake', test);
    };
    t('3_nodes_star', `
      node(name:s wss(port:4000)) node(name:a) node(name:b)
      as>connect(wss) as>connected as<connected
      as>findPeers(a) as<foundPeers(a) sa>findPeers(s) sa<foundPeers(s,a) -
     bs>connect(wss) bs>connected bs<connected
      bs>findPeers(b) sb>foundPeers(b,a,s)
      bs>fwd(ba>handshake-offer) sa>fwd(ba>handshake-offer)
      sa<fwd(ab>handshake-answer) bs<fwd(ab>handshake-answer)
      sb>findPeers(s) bs>foundPeers(s,b,a) -
      send(as>hello) as>msg(hello) -
      send(sa>hello) sa>msg(hello) -
      send(sb>hello) sb>msg(hello) -
      send(bs>hello) bs>msg(hello) -
      send(ab>hello) as>fwd(ab>msg(hello)) sb>fwd(ab>msg(hello))-
      send(ba>hello) bs>fwd(ba>msg(hello)) sa>fwd(ba>msg(hello))-
      `);
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'c', test);
      xit(name, 'd', test);
      xit(name, 'real', test);
      xit(name, 'fake', test);
    };
    // XXX: verify we don't use same port for different nodes
    t('4_nodes_linear', `
      node(name:a) node(name:b wss(port:4000))
      node(name:c wss(port:4001))
      node(name:d wss(port:4002))
      ab>connect(wss) ab>connected ab<connected
      ab>findPeers(a) ab<foundPeers(a) ba>findPeers(b) ba<foundPeers(b,a) -
      bc>connect(wss) bc>connected bc<connected
      bc>findPeers(b) cb>foundPeers(b) cb>findPeers(c) bc>foundPeers(c,a,b)
      cb>fwd(ca>handshake-offer) ba>fwd(ca>handshake-offer)
      ab>fwd(ac>handshake-answer) bc>fwd(ac>handshake-answer) -
      cd>connect(wss) cd>connected cd<connected
      cd>findPeers(c) dc>foundPeers(c) dc>findPeers(d) cd>foundPeers(d,c,b,a)
      dc>fwd(db>handshake-offer) cb>fwd(db>handshake-offer)
      bc>fwd(bd>handshake-answer) cd>fwd(bd>handshake-answer)
	    ba>fwd(bd>handshake-answer) dc>fwd(da>handshake-offer)
	    cb>fwd(da>handshake-offer) ba>fwd(da>handshake-offer)
	    ab>fwd(ad>handshake-answer) bc>fwd(ad>handshake-answer)
	    cd>fwd(ad>handshake-answer) -
      send(ab>hello) ab>msg(hello) -
      send(ac>hello) ab>fwd(ac>msg(hello)) bc>fwd(ac>msg(hello)) -
      send(ad>hello) ab>fwd(ad>msg(hello)) bc>fwd(ad>msg(hello))
      cd>fwd(ad>msg(hello)) -
      send(ba>hello) ba>msg(hello) -
      send(bc>hello) bc>msg(hello) -
      send(bd>hello) bc>fwd(bd>msg(hello))
      cd>fwd(bd>msg(hello)) ba>fwd(bd>msg(hello)) ab>fwd(bd>msg(hello)) -
      send(ca>hello) cb>fwd(ca>msg(hello)) ba>fwd(ca>msg(hello))
      cd>fwd(ca>msg(hello)) dc>fwd(ca>msg(hello)) -
      send(cb>hello) cb>msg(hello) -
      send(cd>hello) cd>msg(hello) -
      send(da>hello) dc>fwd(da>msg(hello)) cb>fwd(da>msg(hello))
      ba>fwd(da>msg(hello)) -
      send(db>hello) dc>fwd(db>msg(hello)) cb>fwd(db>msg(hello)) -
      send(dc>hello) dc>msg(hello) -
    `);
    // XXX derry: ab>msg(hello) - ab<msg(hello-rep) -
    t('4_nodes_2_networks', `
      node(name:b wss(port:4000)) node(name:a)
      ab>connect(wss) ab>connected ba>connected
      ab>findPeers(a) ba>foundPeers(a) ba>findPeers(b) ab>foundPeers(b,a) -
      send(ab>hello) ab>msg(hello) - send(ab<reply) ab<msg(reply) -
      node(name:d wss(port:4000)) node(name:c)
      cd>connect(wss) cd>connected dc>connected
      cd>findPeers(c) dc>foundPeers(c) dc>findPeers(d) cd>foundPeers(d,c) -
      send(cd>hello) cd>msg(hello) - send(cd<reply) cd<msg(reply) -
      bd>connect(wss) bd>connected bd<connected
      bd>findPeers(b) db>foundPeers(b,d,c)
      bd>fwd(bc>handshake-offer) dc>fwd(bc>handshake-offer)
      cd>fwd(cb>handshake-answer) db>fwd(cb>handshake-answer)
      ba>fwd(bc>handshake-offer) db>findPeers(d) bd>foundPeers(d,c,b,a)
      db>fwd(da>handshake-offer) ba>fwd(da>handshake-offer)
      ab>fwd(ad>handshake-answer) bd>fwd(ad>handshake-answer)
      dc>fwd(da>handshake-offer) -
      send(ab>hello) ab>msg(hello) -
      send(ac>hello) ab>fwd(ac>msg(hello)) bd>fwd(ac>msg(hello))
      dc>fwd(ac>msg(hello)) -
      send(ad>hello) ab>fwd(ad>msg(hello)) bd>fwd(ad>msg(hello)) -
      `);
      // XXX: derry
      // XXX ab,bd>fwd(ad>msg(hello)) ===
      // ab>fwd(ad>msg(hello) bd>fwd(ad>msg(hello))
      // bd>findPeers(b) db>foundPeers(b,d,c) ===
      // bd>findPeers(b r(b,d,c)) == findPeers(b !r) foundPeers(b,d,c)
      // bd>findPeers(b r()) == findPeers(b !r) foundPeers()
      // bd>findPeers(b r) == findPeers(b !r) foundPeers()
      // bd>findPeers(b) == findPeers(b !r) foundPeers()
      // bd>findPeers(b !r) - no reply
      // bd>findPeers(b) - no reply
      /*
      test_findPeers(){
        let r = '';
        case '!r': r = null; break;
        ...
        if (r==null)
          return;
        test_foundPeers(r);
      }
      */
      // ab>msg(hello) === ab>:hello
      // ping(!r) pong == ping
      // handshake-offer handshake-anser == handshake |handshake
      // findPeers foundPeers === findPeers |findPeers
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'c', test);
      xit(name, 's', test);
      xit(name, 'real', test);
      xit(name, 'fake', test);
    };
    // XXX BUG: if we just put cs>connect(wss) with no other events,
    // test will not fail. need to fix test to fail on such case
    t('4_nodes_star', `
      node(name:s wss(port:4000)) node(name:a) node(name:b) node(name:c)
      as>connect(wss) as>connected as<connected
      as>findPeers(a) as<foundPeers(a) sa>findPeers(s) sa<foundPeers(s,a) -
      bs>connect(wss) bs>connected bs<connected
      bs>findPeers(b) sb>foundPeers(b,a,s)
      bs>fwd(ba>handshake-offer) sa>fwd(ba>handshake-offer)
      sa<fwd(ab>handshake-answer) bs<fwd(ab>handshake-answer)
      sb>findPeers(s) bs>foundPeers(s,b,a) -
      cs>connect(wss) cs>connected cs<connected
      cs>findPeers(c) sc>foundPeers(c,s,a,b)
      cs>fwd(ca>handshake-offer) sa>fwd(ca>handshake-offer)
      as>fwd(ac>handshake-answer) sc>fwd(ac>handshake-answer)
      cs>fwd(cb>handshake-offer) sb>fwd(cb>handshake-offer)
      bs>fwd(bc>handshake-answer) sc>fwd(bc>handshake-answer)
      sc>findPeers(s) cs>foundPeers(s,c,b,a) -
      send(as>hello) as>msg(hello) -
      send(sa>hello) sa>msg(hello) -
      send(bs>hello) bs>msg(hello) -
      send(sb>hello) sb>msg(hello) -
      send(cs>hello) cs>msg(hello) -
      send(sc>hello) sc>msg(hello) -
      send(ab>hello) as>fwd(ab>msg(hello)) sb>fwd(ab>msg(hello))-
      send(ac>hello) as>fwd(ac>msg(hello)) sc>fwd(ac>msg(hello))-
      send(ba>hello) bs>fwd(ba>msg(hello)) sa>fwd(ba>msg(hello))-
      send(bc>hello) bs>fwd(bc>msg(hello)) sc>fwd(bc>msg(hello))-
    `);
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'c', test);
      xit(name, 'd', test);
      xit(name, 's', test);
      xit(name, 'real', test);
      xit(name, 'fake', test);
    };
    // XXX BUG: why bs>connected bs<connected events are sent out of order
    // XXX: missing ds>connect(wss)
    t('5_nodes_2_networks', `
      node(name:b wss(port:4000)) node(name:a)
      ab>connect(wss) ab>connected ba>connected
      ab>findPeers(a) ba>foundPeers(a) ba>findPeers(b) ab>foundPeers(b,a) -
      send(ab>hello) ab>msg(hello) - send(ab<reply) ab<msg(reply) -
      node(name:d wss(port:4001)) node(name:c)
      cd>connect(wss) cd>connected dc>connected
      cd>findPeers(c) dc>foundPeers(c) dc>findPeers(d) cd>foundPeers(d,c) -
      send(cd>hello) cd>msg(hello) - send(cd<reply) cd<msg(reply) -
      bd>connect(wss) bd>connected bd<connected
      node(name:s wss(port(4002)))
      bs>connect(wss)
      bd>findPeers(b)
      db>foundPeers(b,d,c)
      bd>fwd(bc>handshake-offer)
      dc>fwd(bc>handshake-offer)
      cd>fwd(cb>handshake-answer)
      db>fwd(cb>handshake-answer)
      ba>fwd(bc>handshake-offer)
      db>findPeers(d)
      bd>foundPeers(d,c,b,a)
      db>fwd(da>handshake-offer)
      ba>fwd(da>handshake-offer)
      ab>fwd(ad>handshake-answer)
      bd>fwd(ad>handshake-answer)
      dc>fwd(da>handshake-offer)
      bs>connected
      bs<connected
      bs>findPeers(b)
      sb>foundPeers(b)
      sb>findPeers(s)
      bs>foundPeers(s,d,c,b,a)
      sb>fwd(sd>handshake-offer)
      bd>fwd(sd>handshake-offer)
      dc>fwd(ds>handshake-answer)
      db>fwd(ds>handshake-answer)
      bs>fwd(ds>handshake-answer)
      sb>fwd(sc>handshake-offer)
      bd>fwd(sc>handshake-offer)
      dc>fwd(sc>handshake-offer)
      cd>fwd(cs>handshake-answer)
      db>fwd(cs>handshake-answer)
      bs>fwd(cs>handshake-answer)
      ba>fwd(sc>handshake-offer)
      sb>fwd(sa>handshake-offer)
      ba>fwd(sa>handshake-offer)
      ab>fwd(as>handshake-answer)
      bs>fwd(as>handshake-answer) -
    `);
  });
});

