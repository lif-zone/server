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

function assert_wss_url(val){
  // XXX: TODO
  return val;
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
  // XXX HACK: rm 'uncaught'. we need because otherwise it doesn't fail assert
  this.on('uncaught', on_uncaught);
  let s = node_from_id(channel.localID), d = node_from_id(channel.id);
  let event = channel.t.initiaor ? s.t.name+d.t.name+'<connected' : '';
  yield cmd_run(event);
});

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
    if (!d.t.fake)
    {
      let channel = new FakeChannel({localID: d.id, id: s.id});
      d.wsConnector.emit('connection', channel);
    }
    if (!s.t.fake)
    {
      let channel = new FakeChannel({localID: s.id, id: d.id});
      channel.t.initiaor = true;
      s.wsConnector.emit('connection', channel);
    }
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
        yield cmd_run(build_cmd(from.t.name+to.t.name+'>handshake-answer',
          '', fwd));
        break;
      default: assert(false, 'unexpected msg '+type);
      }
    });
  };
  destroy(){} // XXX: rm from t.channel
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
    if (name[2]=='>') // XXX HACK:
      name = name[4];
    if (name[1]==')') // XXX HACK:
      name = name[0];
    ret.push(util.buf_to_str(t_nodes[name].id));
  });
  return ret;
}

function node_get_channel(_s, _d){
  let s = t_nodes[_s], d = t_nodes[_d];
  return d.peers.get(s.id);
}

function send_msg(s, d, msg){
  let channel = node_get_channel(s, d);
  assert(channel, 'no channel '+s+d+'>');
  // XXX: change to yield
  channel.emit('message', msg);
}

const fake_send_msg = (c, data)=>etask(function*(){
  let s = t_nodes[c.s], d = t_nodes[c.d], fs, fd;
  let to = d.id.toString('hex'), from = s.id.toString('hex');
  let nonce = t_nonce[normalize(c.orig)]||
    '' + Math.floor(1e15 * Math.random());
  var msg = {to, from, path: [s.id.toString('hex')], nonce, data};
  if (c.fwd) // XXX: make it generic and fix all
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
  /*
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
  */
}
const cmd_connect = opt=>etask(function(){
  let {c} = opt;
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
  assert(util.xor(wss, wrtc), 'must specify wss or wrtc');
  assert(!wrtc, 'XXX TODO: wrtc');
  assert(call, 'XXX TODO: !call');
  if (r)
    push_cmd(c.s+c.d+'<connected');
  if (wss) // XXX: need yield
      t_nodes[c.s].wsConnector.connect(wss);
});

const cmd_connected = opt=>etask(function*cmd_connected(){
  let {c, event} = opt, d = t_nodes[c.d];
  if (event)
  {
    assert(!d.t.fake, 'dst must be real');
    assert_event(event, c.orig);
  }
  else
  {
    assert(d.t.fake, 'dst must be fake');
    yield cmd_run();
  }
});

const cmd_find_peers = opt=>etask(function*cmd_find_peers(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
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
  if (s.t.fake && !d.t.fake)
    yield fake_send_msg(c, {type: 'findPeers', data: _str(s.id)});
});

const cmd_found_peers = opt=>etask(function*cmd_found_peers(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  if (event)
  {
    assert_event(event, c.orig);
    assert(!s.t.fake, 'src must be real for event '+event);
  }
  if (s.t.fake && !d.t.fake)
  {
    let a = array_name_to_id(c.arg.split(','));
    yield fake_send_msg(c, {type: 'foundPeers', data: a});
  }
});

const cmd_handshake_offer = opt=>etask(function*cmd_handshake_offer(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  assert(!c.arg, 'invalid cmd '+c.orig);
  if (event)
  {
    let expected = c.fwd ? build_cmd(c.fwd+'fwd', c.orig) : c.orig;
    assert_event(event, expected);
    assert(!s.t.fake, 'src must be real for event '+event);
  }
  if (s.t.fake && !d.t.fake)
    yield fake_send_msg(c, {type: 'handshake-offer'});
});

const cmd_handshake_answer = opt=>etask(function*cmd_handshake_answer(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  assert(!c.arg, 'invalid cmd '+c.orig);
  if (event) // XXX: copy this logic to all places of assert_event
  {
    let expected = c.fwd ? build_cmd(c.fwd+'fwd', normalize(c.orig)) : c.orig;
    assert_event(event, expected);
    assert(!s.t.fake, 'src must be real for event '+event);
  }
  if (s.t.fake && !d.t.fake)
    yield fake_send_msg(c, {type: 'handshake-answer'});
});

const cmd_fwd = opt=>etask(function*cmd_fwd(){
  let {c, event} = opt;
  let a = xtest.test_parse(c.arg);
  assert(a.length==1, 'invalid fwd '+c.orig);
  a[0].fwd = c.s+c.d+'>';
  yield cmd_run_single({c: a[0], event});
});

const cmd_run_single = opt=>etask(function*cmd_run_single(){
  switch (opt.c.cmd)
  {
  case 'node': yield cmd_node(opt); break;
  case '!connect': yield cmd_connect(opt); break;
  case 'connected': yield cmd_connected(opt); break;
  case 'findPeers': yield cmd_find_peers(opt); break;
  case 'foundPeers': yield cmd_found_peers(opt); break;
  case 'handshake-offer': yield cmd_handshake_offer(opt); break;
  case 'handshake-answer': yield cmd_handshake_answer(opt); break;
  case 'fwd': yield cmd_fwd(opt); break;
  default: throw new Error('unknown cmd '+opt.c.cmd);
  }
});

let depth = 0;
const cmd_run = event=>etask(function*cmd_run(){
  this.on('uncaught', on_uncaught);
  let c = t_cmds[t_i];
  assert(c, event ? 'unexpected event '+event : 'empty cmd at '+t_i);
  console.log('%scmd %s: %s%s', ' '.repeat(depth), t_i, c.orig,
    event ? ' event '+event : '');
  t_i++;
  depth++;
  yield cmd_run_single({c, event});
  depth--;
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
    t('2_nodes_long', `node(a) node(b wss(port:4000))
      ab>!connect(wss !r) ab<connected ab>findPeers(a) ab<foundPeers(a)
      ab<findPeers(b) ab>foundPeers(b,a)`);
    if (0) // XXX: check and fix
    t('2_nodes_long_order', `node(a) node(b wss(port:4000))
      ab>!connect(wss !r) ab<connected ab>findPeers(a) ab<findPeers(b)
      ab>foundPeers(b) ab<foundPeers(b)
      `);
    t('2_nodes_short', `node(a) node(b wss) ab>!connect(wss)
      ab>findPeers(a r(a)) ab<findPeers(b r(b,a))`);
    t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
      xit(name, 'c', test);
    };
    // XXX: add '-'
    // XXX: shorten cb,ba>fwd(...)
    t('3_nodes_linear', `node(a) node(b wss()) node(c wss)
      ab>!connect(wss) ab>findPeers(a r(a)) ab<findPeers(b r(b,a))
      bc>!connect(wss) bc>findPeers(b r(b)) bc<findPeers(c r(c,a,b))
      cb>fwd(ca>handshake-offer) ba>fwd(ca>handshake-offer)
      ba<fwd(ca<handshake-answer) cb<fwd(ca<handshake-answer)
      `);
  });
  // XXX TODO:
  // node(b wss(port:4000)) -> node(b wss)
});

