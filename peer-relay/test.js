// XXX: obsolete - rm
'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach*/
// XXX: need jslint mocha: true
import assert from 'assert';
import Node from './client.js';
import xtest from '../util/test_lib.js';
import etask from '../util/etask.js';
import xurl from '../util/url.js';
import util from '../util/util.js';
import zerr from '../util/zerr.js';
import {EventEmitter} from 'events';
const xetask = xtest.etask;
const assign = Object.assign;
const _buf = util.buf_from_str;
function _str(id){ return typeof id=='string' ? id : util.buf_to_str(id); }
// XXX: replace console with zerr or 'debug'

// XXX: make it automatic for all node/browser
process.on('uncaughtException', e=>{
  console.log('uncaughtException %o', e);
  process.exit(-1);
});
process.on('unhandledRejection', e=>{
  console.error('unhandledRejection %o', e);
  process.exit(-1);
});

zerr.set_exception_handler('test', (prefix, o, err)=>{
  console.error(prefix+' %o', err);
  process.exit(-1);
});

  // XXX HACK: rm 'uncaught'. we need because otherwise it doesn't fail assert
function on_uncaught(err){
  console.error('%o', err);
  process.exit(-1);
}

let t_nodes = {}, t_nonce = {}, t_cmds, t_i, t_role, t_port=4000;
let t_ids = {
  a: 'aab88a27669ed361313b2292067b37b4e301ca8b',
  b: 'bb3ce1af8bdc100ecf98ed8ace28be7417f0acd1',
  c: 'cc2e8094373a85cb0e28399f6909ed02080367dc',
  d: 'dd3a9094373a85cb0e28399f6909ed02080363a0',
  s: 'ffe32c1c6ffdc91bbfa7684c67e58f3f36174a59'
};

// XXX: add test
function normalize(e){
  if (!e)
    return e;
  let a=e[0], b=e[1], d=e[2];
  if (d!='<')
    return e;
  return b+a+'>'+e.substr(3);
}

// XXX: add test
function rev(s){
  let i = s.search(/[<>]/);
  assert(i>=0 && i<3, 'invalid [<>] '+s);
  s = s.substr(0, i)+(s[i]=='<' ? '>' : '<');
  return s;
}

function build_cmd(cmd, arg, fwd){
  let ret = cmd+(arg ? '('+arg+')' : '');
  return fwd ? fwd+'fwd('+ret+')' : ret;
}
function rev_cmd(sd, cmd, arg){ return build_cmd(rev(sd)+cmd, arg); }

function _push_cmd(a){ t_cmds.splice(t_i, 0, ...a); }

function push_cmd(cmd){ _push_cmd(xtest.test_parse(cmd)); }

function is_fake(p){ return t_role!=p; }

function url_from_node(node){ return node.t.wss.url; }

function node_from_url(url){
  for (let name in t_nodes)
  {
    let node = t_nodes[name];
    if (node.t.wss && url_from_node(node)==url)
      return node;
  }
}

function node_from_id(id){
  for (let name in t_nodes)
  {
    let node = t_nodes[name];
    // XXX: make it nicer
    if (node.t.id == _str(id))
      return node;
  }
}

function assert_exist(name){ assert(t_nodes[name], 'node not found '+name); }

function assert_not_exist(name){
  assert(!t_nodes[name], 'node already exist '+name); }

function assert_name_new(name){
  assert_not_exist(name);
  assert(/^[a-zA-Z]$/.test(name), 'invalid name '+name);
  return name;
}

function assert_port(port){
  assert.ok(/[0-9]+/.test(port), 'invalid port '+port);
  assert.ok(port>0 && port<65535, 'invalid port '+port);
  return +port;
}

function assert_host(host){
  assert.ok(xurl.is_valid_domain(host), 'invalid host '+host);
  return host;
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
  if (!port)
    port = t_port++;
  assert(host, 'must specify host');
  return {host, port, url: 'wss://'+host+':'+port};
}

function assert_wrtc(val){
  assert(!val, 'unexpected val for wrtc');
  return true;
}

function assert_wss_url(d, val){
  let wss;
  if (!val)
    wss = t_nodes[d].wsConnector.url;
  else
  {
    assert(!d);
    wss = val;
  }
  assert(wss, 'dest '+d+' has no ws server');
  // XXX: TODO assert val and wss
  return wss;
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

function assert_peers(peers){
  let a = peers.split(',');
  assert(a.length>0, 'no peers specified');
  a.forEach(name=>assert(t_nodes[name], 'node not found '+name+'/'+peers));
}

function assert_event(event, exp){
  assert.equal(normalize(event), normalize(exp), 'event mismatch got '+event+
    ' expected '+exp);
}

const test_on_connection = channel=>etask(function*test_on_connection(){
  this.on('uncaught', on_uncaught);
  let s = node_from_id(channel.localID), d = node_from_id(channel.id);
  if (channel.t.initiaor)
  {
    assert(!s.t.fake, 'src must be real');
    // XXX: review. why we send event?
    yield cmd_run(build_cmd(s.t.name+d.t.name+'>connect', 'wss'));
    let event = s.t.name+d.t.name+'<connected';
    yield cmd_run(event);
  }
  else
    yield cmd_run(d.t.name+s.t.name+'<connected');
});

class FakeNode extends EventEmitter {
  constructor(opts){
    super();
    this.id = opts.id ? util.buf_from_str(opts.id) : crypto.randomBytes(20);
    this.wsConnector = new FakeWsConnector(this.id, opts.port, opts.host);
    this.wrtcConnector = new FakeWrtcConnector(this.id);
  }
  destroy(){}
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
  connect = url=>{
    let _this = this;
    return etask(function*connect(){
      let d = node_from_url(url), s = node_from_id(_this.id);
      let channel = new FakeChannel({localID: s.id, id: d.id});
      channel.wsConnector = _this;
      channel.t.initiaor = true;
      assert(!s.t.fake, 'src must be real');
      yield s._onConnection(channel);
    });
  }
  destroy(){}
}

class FakeChannel extends EventEmitter {
  constructor(opts){
    super();
    this.id = opts.id;
    this.localID = opts.localID;
    this.t = {};
  }
  send = msg=>{
    let p, a, fwd;
    let {type, data} = msg.data;
    let from = node_from_id(msg.from), to = node_from_id(msg.to);
    let s = node_from_id(this.localID), d = node_from_id(this.id);
    if (s!=from || d!=to)
      fwd = s.t.name+d.t.name+'>';
    console.log('****** send%s msg %s', fwd ? ' '+fwd : '',
      from.t.name+to.t.name+'>'+type);
    return etask(function*send(){
      this.on('uncaught', on_uncaught);
      switch (type)
      {
      case 'findPeers':
        p = node_from_id(data);
        yield cmd_run(build_cmd(from.t.name+to.t.name+'>findPeers', p.t.name,
          fwd));
        break;
      case 'foundPeers':
        a = array_id_to_name(data);
        yield cmd_run(build_cmd(from.t.name+to.t.name+'>foundPeers',
          a.join(','), fwd));
        break;
      case 'handshake-offer':
        yield cmd_run(build_cmd(from.t.name+to.t.name+'>handshake-offer',
          '', fwd));
        break;
      case 'handshake-answer':
          a = [];
          if (data.ws)
            a.push('ws'); // XXX: asswert correct val of ws
          if (data.wrtc)
            a.push('wrtc');
        yield cmd_run(build_cmd(from.t.name+to.t.name+'>handshake-answer',
          a.join(' '), fwd));
        break;
      default: assert(false, 'unexpected msg '+type);
      }
    });
  };
  destroy(){}
}

class FakeWrtcConnector extends EventEmitter {
  constructor(id, router, wrtc){
    super();
    this.id = id;
    this.supported = wrtc;
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
    assert_exist(name);
    ret.push(util.buf_to_str(t_nodes[name].id));
  });
  return ret;
}

function node_get_channel(_s, _d){
  let s = t_nodes[_s], d = t_nodes[_d];
  return d.peers.get(s.id);
}

const send_msg = (s, d, msg)=>etask(function send_msg(){
  let channel = node_get_channel(s, d);
  assert(channel, 'no channel '+s+d+'>');
  channel.emit('message', msg); // XXX: change to yield
});

const fake_send_msg = (c, data)=>etask(function*(){
  let s = t_nodes[c.s], d = t_nodes[c.d], fs, fd;
  if (!s.t.fake || d.t.fake)
    return;
  let to = d.id.toString('hex'), from = s.id.toString('hex');
  let nonce = t_nonce[normalize(c.orig)]||
    '' + Math.floor(1e15 * Math.random());
  var msg = {to, from, path: [s.id.toString('hex')], nonce, data};
  if (c.fwd)
  {
    assert.equal(c.fwd[2], '>');
    s = t_nodes[c.fwd[0]];
    d = t_nodes[c.fwd[1]];
    fs = c.fwd[0];
    fd = c.fwd[1];
  }
  if (s.t.fake && !d.t.fake)
    yield send_msg(fs||c.s, fd||c.d, msg);
});

const cmd_ensure_no_events = ()=>etask(function*cmd_ensure_no_events(){
  yield etask.sleep(0); // XXX TODO: change to tick();
});

function cmd_node(opt){
  let {c} = opt;
  let arg = xtest.test_parse(c.arg);
  let name, wss, wrtc, bootstrap;
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
  let id = t_ids[name], fake = is_fake(name);
  assert(t_ids[name], 'id not founnd '+name);
  assert(!wss || !node_from_url(wss.url), wss?.url+' already used');
  let node = new (fake ? FakeNode : Node)(assign(
    {id: _buf(id), bootstrap, wrtc}, wss));
  node.t = {id, name, fake, wss};
  t_nodes[name] = node;
}

/* XXX derry: tricky
ab>!connect(wss)
ab>http_get(upgrade(websocket)) ab<http_resp(101)
ab<tcp_send(b.id) ab>tcp_send(a.id)
once a gets b.id, it emits 'connection'
once b gets a.id, it emits 'connection'
*/
const cmd_connect = opt=>etask(function*(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  let wss, wrtc, arg = xtest.test_parse(c.arg), call = c.cmd=='!connect';
  let r = true;
  util.forEach(arg, a=>{
    switch (a.cmd)
    {
    case 'wss':
      // XXX: write it in a nicer way
      assert(wss===undefined, 'multiple '+a.cmd);
      wss = assert_wss_url(c.d, a.arg);
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
  assert(!wrtc, 'XXX TODO: wrtc');
  assert(util.xor(wss, wrtc), 'must specify wss or wrtc');
  if (call)
  {
    if (r)
      push_cmd(build_cmd(c.s+c.d+'>connect', wss ? 'wss' : 'wrtc'));
    assert(!event);
    if (wss)
    {
      if (!s.t.fake)
        yield s.wsConnector.connect(wss);
    }
  }
  else
  {
    if (r)
      push_cmd(c.s+c.d+'<connected');
    if (s.t.fake && d.t.fake)
      return;
    if (s.t.fake)
    {
      let channel = new FakeChannel({localID: d.id, id: s.id});
      channel.wsConnector = d.wsConnector;
      yield d._onConnection(channel);
    }
    else // XXX: review
      assert_event(event, build_cmd(c.s+c.d+'>connect', wss ? 'wss' : 'wrtc'));
  }
});

const cmd_connected = opt=>etask(function*cmd_connected(){
  let {c, event} = opt, d = t_nodes[c.d];
  if (event)
    assert_event(event, c.orig);
  else
    assert(d.t.fake, 'dst must be fake');
  yield cmd_run_if_fake();
});

const cmd_find_peers = opt=>etask(function*cmd_find_peers(){
  let {c, event} = opt, s = t_nodes[c.s];
  let r, peers, arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    if (a.cmd=='r')
    {
      assert(!r, 'invalid '+c.orig);
      r = a.arg||true;
    }
    else
    {
      assert(!peers, 'invalid '+c.orig);
      peers = a.cmd;
      assert_peers(peers);
    }
  });
  if (r)
    push_cmd(rev_cmd(c.orig, 'foundPeers', r));
  if (event)
  {
    assert_event(event, build_cmd(c.meta.cmd, peers));
    assert(!s.t.fake, 'src must be real for event '+event);
  }
  yield fake_send_msg(c, {type: 'findPeers', data: _str(s.id)});
  yield cmd_run_if_fake();
});

const cmd_found_peers = opt=>etask(function*cmd_found_peers(){
  let {c, event} = opt, s = t_nodes[c.s];
  if (event)
  {
    assert_event(event, c.orig);
    assert(!s.t.fake, 'src must be real for event '+event);
  }
  yield fake_send_msg(c, {type: 'foundPeers', data:
    array_name_to_id(c.arg.split(','))});
  yield cmd_run_if_fake();
});

const cmd_handshake_offer = opt=>etask(function*cmd_handshake_offer(){
  let {c, event} = opt, s = t_nodes[c.s];
  assert(!c.arg, 'invalid cmd '+c.orig);
  if (event)
  {
    let expected = c.fwd ? build_cmd(c.fwd+'fwd', c.orig) : c.orig;
    assert_event(event, expected);
    assert(!s.t.fake, 'src must be real for event '+event);
  }
  yield fake_send_msg(c, {type: 'handshake-offer'});
  yield cmd_run_if_fake();
});

const cmd_handshake_answer = opt=>etask(function*cmd_handshake_answer(){
  let {c, event} = opt, s = t_nodes[c.s], ws, wrtc;
  let arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd)
    {
      case 'wrtc': wrtc = assert_wrtc(a.arg); break;
      // XXX: assert and verify ws is correct url
      case 'ws': ws = url_from_node(s); break;
      default: throw new Error('unknown arg '+a.cmd);
    }
  });
  if (event) // XXX: copy this logic to all places of assert_event
  {
    let expected = c.fwd ? build_cmd(c.fwd+'fwd', normalize(c.orig)) : c.orig;
    assert_event(event, expected);
    assert(!s.t.fake, 'src must be real for event '+event);
  }
  yield fake_send_msg(c, {type: 'handshake-answer', data: {ws, wrtc}});
  yield cmd_run_if_fake();
});

const cmd_fwd = opt=>etask(function*cmd_fwd(){
  let {c, event} = opt;
  let a = xtest.test_parse(c.arg);
  assert(a.length==1, 'invalid fwd '+c.orig);
  a[0].fwd = c.s+c.d+'>';
  yield cmd_run_single({c: a[0], event});
  yield cmd_run_if_fake();
});

const cmd_run_single = opt=>etask(function*cmd_run_single(){
  switch (opt.c.cmd)
  {
  case '-': cmd_ensure_no_events(); break;
  case 'node': yield cmd_node(opt); break;
  case '!connect': yield cmd_connect(opt); break;
  case 'connect': yield cmd_connect(opt); break;
  case 'connected': yield cmd_connected(opt); break;
  case 'findPeers': yield cmd_find_peers(opt); break;
  case 'foundPeers': yield cmd_found_peers(opt); break;
  case 'handshake-offer': yield cmd_handshake_offer(opt); break;
  case 'handshake-answer': yield cmd_handshake_answer(opt); break;
  case 'fwd': yield cmd_fwd(opt); break;
  default: throw new Error('unknown cmd '+opt.c.cmd);
  }
});

// XXX: need test
function extend_loop(c){
  assert(c.loop);
  let a = [];
  for (let i=0; i<c.loop.length; i++)
  {
    a.push(assign({}, c, c.loop[i]));
    delete a[i].loop;
  }
  a[a.length-1].orig_loop = c.loop;
  t_cmds.splice(t_i, 1, ...a);
  return t_cmds[t_i];
}

const cmd_run_if_fake = event=>etask(function*cmd_run_if_fake(){
  let next_s = util.get(t_cmds[t_i], 's');
  if (next_s && t_nodes[next_s].t.fake)
    yield cmd_run();
});

let t_depth = 0;
const cmd_run = event=>etask(function*cmd_run(){
  this.on('uncaught', on_uncaught);
  let c = t_cmds[t_i];
  assert(c, event ? 'unexpected event '+event : 'empty cmd at '+t_i);
  if (c.loop)
    c = extend_loop(c);
  console.log('%scmd %s: %s%s', ' '.repeat(t_depth), t_i,
    c.s ? build_cmd(c.s+c.d+'>'+c.cmd, c.arg) : c.orig,
    event ? ' event '+event : '');
  t_i++;
  t_depth++;
  yield cmd_run_single({c, event});
  t_depth--;
});

const test_run = (role, test)=>etask(function*test_run(){
  this.on('uncaught', on_uncaught);
  assert(!t_cmds && !t_i && !t_role, 'test already running');
  t_port = 4000;
  t_cmds = xtest.test_parse(test);
  t_role = role;
  for (t_i=0; t_i<t_cmds.length;)
    yield cmd_run();
  yield test_end();
});

const test_end = ()=>etask(function*(){
  yield cmd_ensure_no_events();
  assert(t_cmds, 'test not running');
  assert.equal(t_i, t_cmds.length, 'not all cmds run');
  for (let n in t_nodes)
  {
    yield t_nodes[n].destroy();
    delete t_nodes[n];
  }
  t_cmds = t_role = t_i = undefined;
});

describe('peer-relay', function(){
  beforeEach(function(){
    xtest.set(Node, 'WsConnector', FakeWsConnector);
    xtest.set(Node, 'WrtcConnector', FakeWrtcConnector);
    xtest.set(util, 'test_on_connection', test_on_connection);
  });
  describe('basic', function(){
    const xit = (name, role, test)=>it(name+'_'+role,
      ()=>xetask(()=>test_run(role, test)));
    let t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
    };
    // XXX, b,a->ba
    t('2_nodes_long', `node(a) node(b wss(port:4000)) -
      ab>!connect(wss !r) ab>connect(wss !r) ab<connected ab>findPeers(a)
      ab<foundPeers(a) ab<findPeers(b) ab>foundPeers(b,a)`);
    t('2_nodes_short', `node(a) node(b wss) - ab>!connect(wss)
      ab>findPeers(a r(a)) ab<findPeers(b r(b,a))`);
    if (0) // XXX: find way to test this sequence of events
    t('2_nodes_order', `node(a) node(b wss(port:4000)) - ab>!connect(wss)
      ab>findPeers(a) ab<findPeers(b) ab>foundPeers(b) ab<foundPeers(b)`);
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'c', test);
    };
    // XXX: add '-'
    // XXX: cb,ba>fwd(ca>handshake-offer) ba,cb<fwd(ca<handshake-answer(ws))
    // to: ca,ba>fwd(ca>handshake-offer(r(ws)))
    // XXX bug: missing ac>connect(wss) - need to fix and send supported
    // connections in handshake-offer so other side can connect directly
    t('3_nodes_linear', `node(a) node(b wss) node(c wss) -
      ab>!connect(wss) ab>findPeers(a r(a)) ab<findPeers(b r(b,a)) -
      bc>!connect(wss) bc>findPeers(b r(b)) bc<findPeers(c r(c,a,b))
      cb,ba>fwd(ca>handshake-offer) ba,cb<fwd(ca<handshake-answer)`);
    t('3_nodes_linear_wss', `node(a wss) node(b wss) node(c wss) -
      ab>!connect(wss) ab>findPeers(a r(a)) ab<findPeers(b r(b,a)) -
      bc>!connect(wss) bc>findPeers(b r(b)) bc<findPeers(c r(c,a,b))
      cb,ba>fwd(ca>handshake-offer) ba,cb<fwd(ca<handshake-answer(ws))
      ca>connect(wss !r) ca<connected ca>findPeers(c r(c,a,b))
      ca<findPeers(a r(a,b,c))`);
    t('3_nodes_star', `
      node(s wss) node(a) node(b wss) -
      as>!connect(wss) as>findPeers(a r(s)) as<findPeers(a r(s)) -
      bs>!connect(wss) bs>findPeers(b r(s)) bs<findPeers(s r(s))
      bs,sa>fwd(ba>handshake-offer) sa,bs<fwd(ba<handshake-answer)`);
    t('3_nodes_star_wss', `
      node(s wss) node(a wss) node(b wss) -
      as>!connect(wss) as>findPeers(a r(s)) as<findPeers(a r(s)) -
      bs>!connect(wss) bs>findPeers(b r(s)) bs<findPeers(s r(s))
      bs,sa>fwd(ba>handshake-offer) sa,bs<fwd(ba<handshake-answer(ws))
      ba>connect(wss) ba>findPeers(b r(b,s)) ba<findPeers(a r(a,b,s))`);
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'c', test);
      xit(name, 'd', test);
    };
    // XXX derry: ab vs ba
    t('4_nodes_linear', `node(a) node(b wss) node(c wss) node(d wss) -
      ab>!connect(wss) ab>findPeers(a r(a)) ab<findPeers(b r(b,a)) -
      bc>!connect(wss) bc>findPeers(b r(b)) bc<findPeers(c r(c,a,b))
      cb,ba>fwd(ca>handshake-offer) ba,cb<fwd(ca<handshake-answer)
      cd>!connect(wss) cd>findPeers(c r(c)) cd<findPeers(d r(d,c,b,a))
      cd<fwd(db>handshake-offer) cb>fwd(db>handshake-offer)
      cb<fwd(db<handshake-answer(ws)) ba>fwd(db<handshake-answer(ws))
      cd>fwd(db<handshake-answer(ws)) db>connect(wss)
      db<findPeers(b r(b,a,d,c)) db>findPeers(d r(d,c,b,a))
      db>fwd(da>handshake-offer) cb>fwd(da>handshake-offer)
      ba>fwd(da>handshake-offer) ba<fwd(da<handshake-answer)
      cb<fwd(da<handshake-answer) cd>fwd(da<handshake-answer)
      cd<fwd(da>handshake-offer)`);
    // XXX: check why ba>fwd(db<handshake-answer(ws)) is sent out of order
    t('4_nodes_linear_wss', `node(a wss) node(b wss) node(c wss) node(d wss) -
      ab>!connect(wss) ab>findPeers(a r(a)) ab<findPeers(b r(b,a)) -
      bc>!connect(wss) bc>findPeers(b r(b)) bc<findPeers(c r(c,a,b))
      cb,ba>fwd(ca>handshake-offer) ba,cb<fwd(ca<handshake-answer(ws))
      ca>connect(wss) ca>findPeers(c r(c,a,b)) ac>findPeers(a r(a,b,c))
      cd>!connect(wss) cd>findPeers(c r(c)) cd<findPeers(d r(d,c,b,a))
      cd<fwd(db>handshake-offer) cb>fwd(db>handshake-offer)
      cb<fwd(db<handshake-answer(ws)) cd>fwd(db<handshake-answer(ws))
      db>connect(wss) db<findPeers(b r(b,a,d,c)) db>findPeers(d r(d,c,b,a))
      db>fwd(da>handshake-offer) cb>fwd(da>handshake-offer)
      ba>fwd(db<handshake-answer(ws))
      ba>fwd(da>handshake-offer) ca<fwd(da<handshake-answer(ws))
      cb<fwd(da<handshake-answer(ws)) cd>fwd(da<handshake-answer(ws))
      da>connect(wss) da>findPeers(d r(d,c,b,a)) da<findPeers(a r(a,b,c,d))
      cd<fwd(da>handshake-offer) ab>fwd(ad>handshake-answer(ws))`);
  });
  // XXX TODO:
  // ab>!msg...
  // wrtc
});

