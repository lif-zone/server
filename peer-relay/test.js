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

let t_debugger_on_events = [];
let t_debugger_on_cmd = [];

function run_event_loop(){
  return util.sleep(0); // XXX: use etask.nextTick()
}

// XXX: rm t_queue
let t_nodes = {}, t_expect, t_queue = [], t_nonce;
let t_timeout = 2000, t_running, t_cmds, t_i;
let t_peers = {
  a: 'aab88a27669ed361313b2292067b37b4e301ca8b',
  b: 'bb3ce1af8bdc100ecf98ed8ace28be7417f0acd1',
  c: 'cc2e8094373a85cb0e28399f6909ed02080367dc',
  d: 'dd3a9094373a85cb0e28399f6909ed02080363a0',
  s: 'ffe32c1c6ffdc91bbfa7684c67e58f3f36174a59'
};

function test_emit(o){
  let {event, fake} = o;
  console.log('emit: %s%s', event, fake ? ' fake' : '');
  if (t_debugger_on_events.includes(event)) // eslint-disable-next-line
    debugger;
  assert(t_running, 'test not running');
  assert(event, 'invalid event');
  assert(normalize(event)==normalize(t_expect), 'mismatch got '+event+'\n'+
    str_status());
  t_expect = undefined;
}

function test_expect(e, c){
  if (typeof e!='string')
  {
    c = e;
    e = c.orig;
  }
  assert(t_running, 'test not running');
  assert(e, 'invalid event');
  assert(!t_expect, 'cannot set new event '+e+' while pending '+t_expect);
  if (c && c.fwd)
    e = c.fwd+'fwd('+normalize(e)+')';
  t_expect = e;
}

// XXX: add test
function rev(s){
  let i = s.search(/[<>]/);
  assert(i>=0 && i<3, 'invalid [<>] '+s);
  s = s.substr(0, i)+(s[i]=='<' ? '>' : '<');
  return s;
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

// XXX: review and rewrite
const test_ensure_no_events = ()=>etask(function*(){
  for (let t = date.monotonic(); date.monotonic()-t < t_timeout;)
  {
    yield test_resume();
    try_send_queue();
    yield run_event_loop();
    if (t_pause.length)
        continue;
    if (!t_expect)
      break;
  }
  assert(!t_expect, 'pending event\n'+str_status());
});

function build_cmd(cmd, arg){ return cmd+(arg ? '('+arg+')' : ''); }
function rev_cmd(sd, cmd, arg){ return build_cmd(rev(sd)+cmd, arg); }

function str_status(){
  return 'expected: '+t_expect+'\n'+
  'queue: '+stringify(t_queue);
}

class FakeNode extends EventEmitter {
  constructor(opts){
    super();
    this.id = opts.id ? util.buf_from_str(opts.id) : crypto.randomBytes(20);
    this.wsConnector = new FakeWsConnector(this.id, opts.port, opts.host);
    this.wrtcConnector = new FakeWrtcConnector(this.id);
    this.wsConnector.on('connection', c=>this.emit('connection', c));
    this.wrtcConnector.on('connection', c=>this.emit('connection', c));
  }
  destroy(){}
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
          a = [];
          if (data.ws)
            a.push('ws'); // XXX: asswert correct val of ws
          if (data.wrtc)
            a.push('wrtc');
          e = build_cmd(from.t.name+to.t.name+'>'+type, a.join(' '));
          break;
        case 'user': e = from.t.name+to.t.name+'>msg('+data+')'; break;
        default: assert(false, 'unexpected msg '+type);
      }
      t_nonce[normalize(e)] = msg.nonce;
      if (fwd)
        e = s.t.name+d.t.name+'>fwd('+e+')';
      test_emit({event: e, fake: s.t.fake});
    });
  }
  send(msg){
    let _this = this;
    return etask(function*(){
      let s = node_from_id(_this.localID), d = node_from_id(_this.id);
      let {type} = msg.data;
      yield test_pause_func('Router._send '+msg.data.type);
      switch (type)
      {
      case 'findPeers':
      case 'foundPeers':
      case 'handshake-offer':
      case 'handshake-answer':
      case 'user': send_msg(s.t.name, d.t.name, msg); break;
      default: assert(false, 'unexpected msg '+type);
      }
    });
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

const fake_send_msg = (c, data)=>etask(function*(){
  let s = t_nodes[c.s], d = t_nodes[c.d];
  let to = d.id.toString('hex'), from = s.id.toString('hex');
  let fs = c.fwd&&c.fwd[0], fd = c.fwd&&c.fwd[1];
  let nonce = t_nonce[normalize(c.orig)]||
    '' + Math.floor(1e15 * Math.random());
  if (c.fwd) // XXX: make it generic and fix all
  {
    s = t_nodes[fs];
    d = t_nodes[fd];
  }
  if (!s.t.fake)
  {
    if (!c.fwd)
      yield test_resume();
    return;
  }
  var msg = {to, from, path: [s.id.toString('hex')], nonce, data};
  if (c.fwd)
    send_msg(fs, fd, msg);
  else
    send_msg(c.s, c.d, msg);
});

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
  connect(url){
    let d = node_from_url(url), s = node_from_id(this.id);
    let channel = new FakeChannel({localID: s.id, id: d.id});
    s.once('connection', ()=>etask(function*(){
      yield test_pause_func('connected-wss '+url);
      let channel2 = new FakeChannel({localID: d.id, id: s.id});
      d.wsConnector.emit('connection', channel2);
    }));
    s.wsConnector.emit('connection', channel);
  }
  destroy(){}
}

class FakeWrtcConnector extends EventEmitter {
  constructor(id, router, wrtc){
    super();
    this.id = id;
    this.supported = wrtc;
  }
  connect(_d){
    let d = node_from_id(_d), s = node_from_id(this.id);
    // XXX: specify it is wrtc channel
    let channel = new FakeChannel({localID: s.id, id: d.id});
    s.once('connection', ()=>etask(function*(){
      yield test_pause_func('connected-wrtc '+d.id);
      let channel2 = new FakeChannel({localID: d.id, id: s.id});
      d.wsConnector.emit('connection', channel2);
    }));
    s.wrtcConnector.emit('connection', channel);
  }
  destroy(){}
}

function is_fake(role, p){ return role!= 'real' && role!=p; }

// eslint-disable-next-line no-unused-vars
function node_from_url(url){
  for (let name in t_nodes)
  {
    let node = t_nodes[name];
    if (node.t.wss && url_from_node(node)==url)
      return node;
  }
}

function url_from_node(node){ return node.t.wss.url; }

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

function assert_peers(peers){
  let a = peers.split(',');
  assert(a.length>0, 'no peers specified');
  a.forEach(name=>assert(t_nodes[name], 'node not found '+name+'/'+peers));
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

function assert_wrtc(val){
  assert(!val, 'unexpected val for wrtc');
  return true;
}

function assert_bootstrap(val){
  let bootstrap = [];
  let a = val.split(' ');
  a.forEach(name=>{
    let node = t_nodes[name];
    assert(node, 'node not found '+name);
    let url = url_from_node(node);
    assert(url, 'no url for '+name);
    bootstrap.push(url);
  });
  return bootstrap;
}

function cmd_node(role, c){
  // XXX: add xtest.test_parse_unique (to avoid multiple args)
  let arg = xtest.test_parse(c.arg);
  let id, name, wss, wrtc, bootstrap;
  util.forEach(arg, a=>{
    if (!name)
      return name = assert_name_new(a.cmd);
    switch (a.cmd)
    {
    case 'wss': wss = assert_wss(a.arg); break;
    case 'wrtc': wrtc = assert_wrtc(a.arg); break;
    case 'boot': bootstrap = assert_bootstrap(a.arg); break;
    default: throw new Error('unknown arg '+a.cmd);
    }
  });
  assert(name && name.length==1, 'missing or invalid name '+name);
  id = t_peers[name];
  assert(t_peers[name], 'peer id not founnd '+name);
  if (wss)
    assert(!node_from_url(wss.url), wss.url+' already used');
  let fake = is_fake(role, name);
  let node = new (fake ? FakeNode : Node)(assign({id: util.buf_from_str(id),
    bootstrap, wrtc}, wss));
  assert.equal(id, util.buf_to_str(node.id));
  node.t = {id, name, fake, wss, channels: []};
  t_nodes[name] = node;
  node.on('connection', channel=>{
    let s = node_from_id(channel.localID), d = node_from_id(channel.id);
    node.t.channels.push(channel);
    if (node_get_channel(d.t.name, s.t.name))
      test_emit({event: s.t.name+d.t.name+'>connected', fake: s.t.fake});
    else
      test_emit({event: s.t.name+d.t.name+'>connect', fake: s.t.fake});
  });
}

/* XXX: derry: connection
ab>!connect(wss)
ab>http_get(path(/chat) h(upgrade(websocket)) ab<http_resp(101) ab<b.id ab>a.id
*/
const cmd_connect = c=>etask(function*(){
  let wss, wrtc, arg = xtest.test_parse(c.arg), call = c.cmd=='!connect';
  let r = true;
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
    case 'wrtc':
      assert(!call, 'wrtc only in connect');
      wrtc = true;
      // XXX: assert destination has wrtc support
      break;
    case '!r': r = false; break;
    default: throw new Error('unknown arg '+a.cmd);
    }
  });
  assert_exist(c.s);
  assert.equal(c.dir, '>');
  assert(util.xor(wss, wrtc), 'must specify wss or wrtc');
  test_expect(c.s+c.d+'>connect');
  let s = t_nodes[c.s], d = t_nodes[c.d];
  if (call)
  {
    if (wss)
      t_nodes[c.s].wsConnector.connect(wss);
    else
      throw new Error('not implemented yet');
  }
  else
  {
    assert(wss||wrtc, 'not implemented yet');
    if (s.t.fake)
    {
      if (wss)
        t_nodes[c.s].wsConnector.connect(wss);
      else if (wrtc)
        t_nodes[c.s].wrtcConnector.connect(d.id);
    }
    else
      yield test_resume();
  }
  if (r)
    push_cmd(c.s+c.d+'<connected');
});

const cmd_connected = c=>etask(function*(){
  // XXX: check what to assert for events
  test_expect(c);
  yield test_resume();
});

const cmd_find_peers = c=>etask(function*(){
  let r, peers, arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    if (a.cmd=='r')
    {
      assert(!r);
      r = a.arg||true;
    }
    else
    {
      assert(!peers);
      peers = a.cmd;
      assert_peers(peers);
    }
  });
  if (r)
    _push_cmd(rev_cmd(c.orig, 'foundPeers', r));
  let e = build_cmd(c.meta.cmd, peers);
  // XXX: check what to assert
  let s = t_nodes[c.s];
  test_expect(e, c);
  yield fake_send_msg(c, {type: 'findPeers', data: util.buf_to_str(s.id)});
});

const cmd_found_peers = (role, c)=>etask(function*(){
  // XXX: check what to assert
  let a = array_name_to_id(c.arg.split(','));
  test_expect(c);
  yield fake_send_msg(c, {type: 'foundPeers', data: a});
});

const cmd_handshake_offer = (role, c)=>etask(function*(){
  let r, arg = xtest.test_parse(c.arg);
  assert(!c.loop);
  util.forEach(arg, a=>{
    if (a.cmd=='r')
    {
      assert(!r);
      r = a.arg||true;
    }
    else
      throw new Error('unsupported yet');
  });
  assert(!r, 'handshake-offer r not implement yet');
  let e = build_cmd(c.meta.cmd);
  // XXX: check what to assert
  test_expect(e, c);
  yield fake_send_msg(c, {type: 'handshake-offer', data: null});
});

const cmd_handshake_answer = (role, c)=>etask(function*(){
  let s = t_nodes[c.s], wrtc, ws, arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd)
    {
      case 'wrtc': wrtc = assert_wrtc(a.arg); break;
      // XXX: assert and verify ws is correct url
      case 'ws': ws = url_from_node(s); break;
      default: throw new Error('unknown arg '+a.cmd);
    }
  });
  test_expect(c);
  yield fake_send_msg(c, {type: 'handshake-answer', data: {ws, wrtc}});
});

const cmd_fwd = (role, c)=>etask(function*(){
  let s = t_nodes[c.s];
  // XXX: need assert on arg
  let a = xtest.test_parse(c.arg);
  assert(a.length==1, 'invalid fwd %'+c.arg);
  a[0].fwd = c.s+c.d+'>';
  yield cmd_run(role, a[0]);
  if (!s.t.fake)
    yield test_resume();
});

const cmd_msg = c=>etask(function*(){
  // XXX: check what to assert
  test_expect(c);
  yield fake_send_msg(c, {type: 'user', data: c.arg});
});

const cmd_send = c=>etask(function(){
  // XXX: check what to assert
  // XXX use: yield fake_send_msg (need to handle s.send)
  let s = t_nodes[c.s], d = t_nodes[c.d], data = c.arg;
  test_expect(c);
  test_emit({event: c.orig, fake: s.t.fake});
  if (!s.t.fake && !c.fwd)
    s.send(d.id, data);
});

const cmd_setup = c=>etask(function(){
  assert(false, 'cmd_setup TODO');
/* XXX: TODO
  assert(arg=='');
  M('node(s wss(host:lif.zone port:4000)) node(a)');
*/
});

let t_pause = [];
// XXX: ugly, find better solution
function test_pause_func(src){
  let wait = etask(function*(){
    console.log('*** pre-wait %s', src);
    yield etask.wait();
    console.log('*** post-wait %s', src);
  });
  wait.src = src;
  t_pause.push(wait);
  return wait;
}

function _test_resume(){
  if (!t_pause[0])
    return console.log('*** RESUME SKIP - NO WAIT QUEUE');
  t_pause.shift().continue();
}

const test_resume = (role, c)=>etask(function*(){
  console.log('*** resume');
  _test_resume();
  yield run_event_loop();
});

const cmd_run = (role, c)=>etask(function*(){
    let fake = is_fake(role, c.s);
    // XXX: remove or use zerr with levels
    console.log('cmd:%s %s%s>%s(%s) orig %s', c.fwd ? 'in fwd '+c.fwd : '',
      c.loop ? 'loop' : c.s, c.d||'',
      c.cmd, c.arg||'', c.orig, fake? ' fake' : '');
    assert(!t_expect, 'event not recieved '+t_expect+'\n'+str_status());
    if (t_debugger_on_cmd.includes(c.orig)) // eslint-disable-next-line
      debugger;
    if (c.loop) // XXX HACK: need to think how we parse it
    {
      let a = [];
      for (let i=0; i<c.loop.length; i++)
      {
        a.push(assign({}, c, c.loop[i]));
        delete a[i].loop;
      }
      a[a.length-1].orig_loop = c.loop;
      _push_cmd(a);
      return;
    }
    // XXX: cleanup
    switch (c.cmd)
    {
    case '-': yield test_ensure_no_events(); break;
    case 'setup': yield cmd_setup(c.arg); break;
    case 'node': yield cmd_node(role, c); break;
    case 'connect': yield cmd_connect(c); break;
    case '!connect': yield cmd_connect(c); break;
    case 'connected': yield cmd_connected(c); break;
    case 'findPeers': yield cmd_find_peers(c); break;
    case 'foundPeers': yield cmd_found_peers(role, c); break;
    case 'send': yield cmd_send(c); break;
    case 'msg': yield cmd_msg(c); break;
    case 'handshake-offer': yield cmd_handshake_offer(role, c); break;
    case 'handshake-answer': yield cmd_handshake_answer(role, c); break;
    case 'fwd': yield cmd_fwd(role, c); break;
    default: throw new Error('unknown cmd '+c.cmd);
    }
});

function _push_cmd(a){ t_cmds.splice(t_i+1, 0, ...a); }
function push_cmd(cmd){ _push_cmd(xtest.test_parse(cmd)); }

const test_run = (role, test)=>etask(function*(){
  assert.ok(!t_running, 'test already running');
  assert(!t_cmds && !t_i);
  t_running = true;
  t_cmds = xtest.test_parse(test);
  t_nonce = {};
  for (t_i=0; t_i<t_cmds.length; t_i++)
    yield cmd_run(role, t_cmds[t_i]);
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

describe('peer-relay', function(){
  beforeEach(function(){
    xtest.set(Node, 'WsConnector', FakeWsConnector);
    xtest.set(Node, 'WrtcConnector', FakeWrtcConnector);
    xtest.set(Node.prototype, 'connect_ws', function(uri){
      let _this = this;
      return etask(function*(){
        yield test_pause_func('connect_ws '+uri);
        yield _this.wsConnector.connect(uri);
      });
    });
    xtest.set(Node.prototype, 'connect_wrtc', function(id){
      let _this = this;
      return etask(function*(){
        yield test_pause_func('connect_wrtc '+id);
        yield _this.wrtcConnector.connect(id);
      });
    });
  });
  this.timeout(2*t_timeout);
  describe('basic', function(){
    const xit = (name, role, test)=> it(name+'_'+role,
      ()=>xetask(()=>test_run(role, test)));
    let t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'real', test);
      xit(name, 'fake', test);
    };
    // XXX: fix all roles ab> ab<
    t('2_nodes_!r', `
      node(a) node(b wss(port:4000)) - ab>!connect(wss !r) ab<connected
      ab>findPeers(a) ab<findPeers(b) ab<foundPeers(a) ab>foundPeers(b) -
      ab>send(hello) ab>msg(hello) - ab<send(reply) ab<msg(reply)`);
    t('2_nodes', `
      node(a) node(b wss(port:4000)) - ab>!connect(wss)
      ab>findPeers(a) ab<findPeers(b) ab<foundPeers(a) ab>foundPeers(b) -
      ab>send(hello) ab>msg(hello) - ab<send(reply) ab<msg(reply)`);
   t('2_nodes_bootstrap', `
      node(b wss(port:4000)) node(a boot(b)) ab>connect(wss)
      ab>findPeers(a) ab<findPeers(b) ab<foundPeers(a) ab>foundPeers(b) -
      ab>send(hello) ab>msg(hello) - ab<send(reply) ab<msg(reply)`);
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'c', test);
      xit(name, 'real', test);
      xit(name, 'fake', test);
    };
    // XXX: send(ab>xxx) --> ab>send(xxx)
    // XXX BUG: missing ca>connect
    // XXX: derry: node(a)
    t('3_nodes_linear', `
      node(a) node(b wss(port:4000)) node(c wss(port:4001))
      ab>!connect(wss) ab>findPeers(a) ab<findPeers(b)
      ab<foundPeers(a) ab>foundPeers(b) -
      bc>!connect(wss) bc>findPeers(b) bc<findPeers(c)
      bc<foundPeers(b) bc>foundPeers(c,a,b) bc,ab<fwd(ca>handshake-offer)
      ab,bc>fwd(ca<handshake-answer) -
      ab>send(hello) ab>msg(hello) - ab<send(reply) ab<msg(reply) -
      bc>send(hello) bc>msg(hello) - bc<send(reply) bc<msg(reply) -
      ac>send(hello) ab,bc>fwd(ac>msg(hello)) -
      ac<send(reply) cb,ba>fwd(ac<msg(reply))`);
    // XXX review with derry:
    // send(ab>hello) ab>msg(hello) -
    // ab>send(hello) ab>msg(hello) -
    // send(ac>hello) ab,bc>fwd(ac>msg(hello)) -
    // ac>send(hello) ab,bc>fwd(ac>msg(hello)) -
    // ab>http_get ab>tcp_open ab<ack ab>write(GET...)
    // ab>!http_get ab>tcp_open ab<ack ab>write(GET...)
    // XXX: review with derry ca>connect
    // XXX: wss -> ws
    t('3_nodes_linear_wss', `
      node(a wss(port:4000)) node(b wss(port:4001))
      node(c wss(port:4002)) ab>!connect(wss)
      ab>findPeers(a) ab<findPeers(b) ab<foundPeers(a) ab>foundPeers(b) -
      bc>!connect(wss) bc>findPeers(b) bc<findPeers(c)
      bc<foundPeers(b) bc>foundPeers(c,a,b) cb,ba>fwd(ca>handshake-offer)
      ab,bc>fwd(ca<handshake-answer(ws)) ca>connect(wss) ca>findPeers(c)
      ca<findPeers(a) ca<foundPeers(c,a,b) ca>foundPeers(a,b,c) -
      ab>send(hello) ab>msg(hello) - ab<send(reply) ab<msg(reply) -
      bc>send(hello) bc>msg(hello) - bc<send(reply) bc<msg(reply) -
      ca>send(hello) ca>msg(hello) - ca<send(reply) ca<msg(reply)`);
    // XXX: why not also connect via ws if both wrtc+ws are avail
    t('3_nodes_linear_wrtc', `
      node(a wrtc wss(port:4000)) node(b wss(port:4001))
      node(c wrtc wss(port:4002)) ab>!connect(wss)
      ab>findPeers(a) ab<findPeers(b) ab<foundPeers(a) ab>foundPeers(b) -
      bc>!connect(wss) bc>findPeers(b) bc<findPeers(c)
      bc<foundPeers(b) bc>foundPeers(c,a,b) cb,ba>fwd(ca>handshake-offer)
      ab,bc>fwd(ca<handshake-answer(ws wrtc)) ca>connect(wss)
      ca>findPeers(c) ca<findPeers(a) ca<foundPeers(c,a,b)
      ca>foundPeers(a,b,c) -
      ab>send(hello) ab>msg(hello) - ab<send(reply) ab<msg(reply) -
      bc>send(hello) bc>msg(hello) - bc<send(reply) bc<msg(reply) -
      ca>send(hello) ca>msg(hello) - ca<send(reply) ca<msg(reply)`);
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 's', test);
      xit(name, 'real', test);
      xit(name, 'fake', test);
    };
    t('3_nodes_star', `
      node(s wss(port:4000)) node(a) node(b wss(port:4001)) -
      as>!connect(wss) as>findPeers(a) sa>findPeers(s)
      as<foundPeers(a) sa<foundPeers(s) -
      bs>!connect(wss) bs>findPeers(b) sb>findPeers(s)
      bs<foundPeers(b,a,s) sb<foundPeers(s)
      bs,sa>fwd(ba>handshake-offer) sa,bs<fwd(ba<handshake-answer)
      as>send(hello) as>msg(hello) - sa>send(hello) sa>msg(hello) -
      sb>send(hello) sb>msg(hello) - bs>send(hello) bs>msg(hello) -
      ab>send(hello) as,sb>fwd(ab>msg(hello)) -
      ba>send(hello) bs,sa>fwd(ba>msg(hello))`);
    // XXX derry: make port automatic
    t('3_nodes_star_wss', `
      node(s wss(port:4000)) node(a wss(port:4001)) node(b) -
      as>!connect(wss) as>findPeers(a) sa>findPeers(s)
      as<foundPeers(a) sa<foundPeers(s) -
      bs>!connect(wss) bs>findPeers(b) sb>findPeers(s)
      bs<foundPeers(b,a,s) sb<foundPeers(s)
      bs,sa>fwd(ba>handshake-offer) sa,bs<fwd(ba<handshake-answer(ws))
      ba>connect(wss) ba>findPeers(b) ba<findPeers(a)
      ba<foundPeers(b,a,s) ba>foundPeers(a,b,s) -
      as>send(hello) as>msg(hello) - sa>send(hello) sa>msg(hello) -
      sb>send(hello) sb>msg(hello) - bs>send(hello) bs>msg(hello) -
      ba<send(hello) ba<msg(hello) - ba>send(hello) ba>msg(hello)`);
    t('3_nodes_star_wrtc', `
      node(s wss(port:4000)) node(a wrtc) node(b wrtc) -
      as>!connect(wss) as>findPeers(a) sa>findPeers(s)
      as<foundPeers(a) sa<foundPeers(s) -
      bs>!connect(wss) bs>findPeers(b) sb>findPeers(s)
      bs<foundPeers(b,a,s) sb<foundPeers(s)
      bs,sa>fwd(ba>handshake-offer) sa,bs<fwd(ba<handshake-answer(wrtc))
      ba>connect(wrtc) ba>findPeers(b) ba<findPeers(a)
      ba<foundPeers(b,a,s) ba>foundPeers(a,b,s) -
      as>send(hello) as>msg(hello) - sa>send(hello) sa>msg(hello) -
      sb>send(hello) sb>msg(hello) - bs>send(hello) bs>msg(hello) -
      ba<send(hello) ba<msg(hello) - ba>send(hello) ba>msg(hello)`);
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'c', test);
      xit(name, 'd', test);
      xit(name, 'real', test);
      xit(name, 'fake', test);
    };
    // XXX: verify we don't use same port for different nodes
    // XXX derry: db<connected is sent after other events
    t('4_nodes_linear', `
      node(a) node(b wss(port:4000)) node(c wss(port:4001))
      node(d wss(port:4002)) ab>!connect(wss)
      ab>findPeers(a) ba>findPeers(b) ab<foundPeers(a) ba<foundPeers(b) -
      bc>!connect(wss) bc>findPeers(b) cb>findPeers(c)
      bc<foundPeers(b) cb<foundPeers(c,a,b) cb,ba>fwd(ca>handshake-offer)
      ab,bc>fwd(ca<handshake-answer) cd>!connect(wss)
      cd>findPeers(c) dc>findPeers(d) cd<foundPeers(c) dc<foundPeers(d,c,b,a)
      dc>fwd(db>handshake-offer) dc>fwd(da>handshake-offer)
      cb>fwd(db>handshake-offer) cb>fwd(da>handshake-offer)
      cb<fwd(db<handshake-answer(ws)) ba>fwd(da>handshake-offer)
      dc<fwd(db<handshake-answer(ws)) ba>fwd(db<handshake-answer(ws))
      ab>fwd(da<handshake-answer) db>connect(wss !r)
      ba<fwd(db<handshake-answer(ws)) cb<fwd(da<handshake-answer)
      db<connected db>findPeers(d) cd>fwd(da<handshake-answer) bd>findPeers(b)
      db<foundPeers(d,c,b,a) bd<foundPeers(b,a,d,c) -
      ab>send(hello) ab>msg(hello) - ac>send(hello) ab,bc>fwd(ac>msg(hello))
      ad>send(hello) ab,bd>fwd(ad>msg(hello)) -
      ba>send(hello) ba>msg(hello) - bc>send(hello) bc>msg(hello) -
      bd>send(hello) bd>msg(hello) -
      ca>send(hello) cb>fwd(ca>msg(hello)) ba>fwd(ca>msg(hello))
      cd,db>fwd(ca>msg(hello)) - cb>send(hello) cb>msg(hello) -
      cd>send(hello) cd>msg(hello) -
      da>send(hello) db>fwd(da>msg(hello)) ba>fwd(da>msg(hello))
      dc>fwd(da>msg(hello)) cb>fwd(da>msg(hello)) -
      db>send(hello) db>msg(hello) - dc>send(hello) dc>msg(hello) -
    `);
    // XXX derry: ab>msg(hello) - ab<msg(hello-rep) -
    t('4_nodes_2_networks', `
      node(b wss(port:4000)) node(a) - ab>!connect(wss)
      ab>findPeers(a) ba>findPeers(b) ab<foundPeers(a) ba<foundPeers(b) -
      ab>send(hello) ab>msg(hello) - ab<send(reply) ab<msg(reply) -
      node(d wss(port:4001)) node(c) -
      cd>!connect(wss) cd>findPeers(c) dc>findPeers(d)
      cd<foundPeers(c) dc<foundPeers(d) -
      cd>send(hello) cd>msg(hello) - cd<send(reply) cd<msg(reply) -
      bd>!connect(wss)
      bd>findPeers(b) db>findPeers(d) bd<foundPeers(b,d,c) db<foundPeers(d,b,a)
      bd>fwd(bc>handshake-offer) db>fwd(da>handshake-offer)
      dc>fwd(bc>handshake-offer) ba>fwd(bc>handshake-offer)
      ba>fwd(da>handshake-offer) dc>fwd(da>handshake-offer)
      cd>fwd(cb>handshake-answer) ab>fwd(ad>handshake-answer)
      db>fwd(cb>handshake-answer) bd>fwd(ad>handshake-answer) -
      ab>send(hello) ab>msg(hello) -
      ac>send(hello) ab>fwd(ac>msg(hello)) bd,dc>fwd(ac>msg(hello)) -
      ad>send(hello) ab,bd>fwd(ad>msg(hello))`);
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'c', test);
      xit(name, 's', test);
      xit(name, 'real', test);
      xit(name, 'fake', test);
    };
    t('4_nodes_star', `
      node(s wss(port:4000)) node(a) node(b) node(c) -
      as>!connect(wss)
      as>findPeers(a) sa>findPeers(s) as<foundPeers(a) sa<foundPeers(s) -
      bs>!connect(wss) bs>findPeers(b) sb>findPeers(s)
      bs<foundPeers(b,a,s) sb<foundPeers(s)
      bs,sa>fwd(ba>handshake-offer) sa,bs<fwd(ba<handshake-answer) -
      cs>!connect(wss) cs>findPeers(c) sc>findPeers(s)
      cs<foundPeers(c,s,a,b) sc<foundPeers(s)
      cs>fwd(ca>handshake-offer) cs>fwd(cb>handshake-offer)
      sa>fwd(ca>handshake-offer) sb>fwd(cb>handshake-offer)
      as>fwd(ac>handshake-answer) bs>fwd(bc>handshake-answer)
      sc>fwd(ac>handshake-answer) sc>fwd(bc>handshake-answer)
      as>send(hello) as>msg(hello) -
      sa>send(hello) sa>msg(hello) -
      bs>send(hello) bs>msg(hello) -
      sb>send(hello) sb>msg(hello) -
      cs>send(hello) cs>msg(hello) -
      sc>send(hello) sc>msg(hello) -
      ab>send(hello) as,sb>fwd(ab>msg(hello)) -
      ac>send(hello) as,sc>fwd(ac>msg(hello)) -
      ba>send(hello) bs,sa>fwd(ba>msg(hello)) -
      bc>send(hello) bs,sc>fwd(bc>msg(hello))
    `);
    // XXX: if missing <connected event, the error is not clear.
    // XXX derry: review events
    // fix >send --> >!msg
    // !connect = do connect+connect+connected
    // XXX: missing signal events for wrtc
    // XXX derry: ca<connected out of order
    t('4_nodes_star_wrtc', `
      node(s wss(port:4000)) node(a wrtc) node(b wrtc) node(c wrtc) -
      as>!connect(wss)
      as>findPeers(a) sa>findPeers(s) as<foundPeers(a) sa<foundPeers(s) -
      bs>!connect(wss) bs>findPeers(b) sb>findPeers(s)
      bs<foundPeers(b,a,s) sb<foundPeers(s)
      bs,sa>fwd(ba>handshake-offer) sa,bs<fwd(ba<handshake-answer(wrtc))
      ba>connect(wrtc) ba>findPeers(b) ba<findPeers(a)
      ba<foundPeers(b,a,s) ba>foundPeers(a,b,s) -
      cs>!connect(wss) cs>findPeers(c) sc>findPeers(s)
      cs<foundPeers(c,s,a,b) sc<foundPeers(s)
      cs>fwd(ca>handshake-offer) cs>fwd(cb>handshake-offer)
      sa>fwd(ca>handshake-offer) sb>fwd(cb>handshake-offer)
      as>fwd(ac>handshake-answer(wrtc)) bs>fwd(bc>handshake-answer(wrtc))
      sc>fwd(ac>handshake-answer(wrtc)) ab>fwd(ac>handshake-answer(wrtc))
      sc>fwd(bc>handshake-answer(wrtc)) ba>fwd(bc>handshake-answer(wrtc))
      ca>connect(wrtc !r) bs>fwd(ac>handshake-answer(wrtc))
      cb>connect(wrtc !r) as>fwd(bc>handshake-answer(wrtc))
      ca<connected ca>findPeers(c) cb<connected cs>fwd(cb>findPeers(c))
      ca<findPeers(a) ac>foundPeers(c,s,a,b) bc>findPeers(b)
      sb>fwd(cb>findPeers(c)) cb>findPeers(c) ca>foundPeers(a,b,s,c)
      cb>foundPeers(b,a,s,c) bc>foundPeers(c,s,a,b) -
      as>send(hello) as>msg(hello) - sa>send(hello) sa>msg(hello) -
      bs>send(hello) bs>msg(hello) - sb>send(hello) sb>msg(hello) -
      cs>send(hello) cs>msg(hello) - sc>send(hello) sc>msg(hello) -
      ab>send(hello) ab>msg(hello) - ac>send(hello) ac>msg(hello) -
      ba>send(hello) ba>msg(hello) - bc>send(hello) bc>msg(hello)
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
    // XXX: fix order of ab/ba/... all over
    // XXX: fix using ab,bc>fwd to simplify all over
    // review all events and make sure it makes sense
    t('5_nodes_2_networks', `
      node(b wss(port:4000)) node(a) - ab>!connect(wss)
      ab>findPeers(a) ab<findPeers(b) ab<foundPeers(a) ab>foundPeers(b) -
      ab>send(hello) ab>msg(hello) - ab<send(reply) ab<msg(reply) -
      node(d wss(port:4001)) node(c) - cd>!connect(wss)
      cd>findPeers(c) cd<findPeers(d) cd<foundPeers(c) cd>foundPeers(d) -
      cd>send(hello) cd>msg(hello) - cd<send(reply) cd<msg(reply) -
      bd>!connect(wss) bd>findPeers(b) bd<findPeers(d)
      bd<foundPeers(b,d,c) bd>foundPeers(d,b,a) bd>fwd(bc>handshake-offer)
      db>fwd(da>handshake-offer) dc>fwd(bc>handshake-offer)
      ba>fwd(bc>handshake-offer) ba>fwd(da>handshake-offer)
      dc>fwd(da>handshake-offer) cd>fwd(cb>handshake-answer)
      ab>fwd(ad>handshake-answer) db>fwd(cb>handshake-answer)
      bd>fwd(ad>handshake-answer) - node(s wss(port(4002))) -
      bs>!connect(wss) bs>findPeers(b) bs<findPeers(s)
      bs<foundPeers(b) bs>foundPeers(s,d,c,b,a) sb>fwd(sd>handshake-offer)
      sb>fwd(sc>handshake-offer) sb>fwd(sa>handshake-offer)
      bd>fwd(sd>handshake-offer) bd>fwd(sc>handshake-offer)
      ba>fwd(sa>handshake-offer) dc>fwd(ds>handshake-answer(ws))
      dc>fwd(sc>handshake-offer) ba>fwd(sc>handshake-offer)
      ab>fwd(as>handshake-answer) db>fwd(ds>handshake-answer(ws))
      cd>fwd(cs>handshake-answer) bs>fwd(as>handshake-answer)
      bs>fwd(ds>handshake-answer(ws)) db>fwd(cs>handshake-answer)
      sd>connect(wss !r) bs>fwd(cs>handshake-answer) sd<connected
      sd>findPeers(s) db>fwd(ds>findPeers(d)) ds>foundPeers(s,d,c,b,a)
      bs>fwd(ds>findPeers(d)) ds>findPeers(d) sd>foundPeers(d,c,s,b,a)
    `); // XXX: missing send/msg test
    // XXX add tests 1) for ws/wrtc failures 2) that we connect to
    // close ws if using hopes
    // XXX: disconnect test
    // check close of nodes
  });
});

