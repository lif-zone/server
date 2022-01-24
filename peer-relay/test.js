// XXX: obsolete - rm
'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach,afterEach*/
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

zerr.no_console = true;
E.log.max_size = 1000;

// XXX: make it automatic for all node/browser
process.on('uncaughtException', e=>{
  zerr.flush();
  zerr.no_console = false;
  zerr('uncaughtException %o', e);
  process.exit(-1);
});
process.on('unhandledRejection', e=>{
  zerr.flush();
  zerr.no_console = false;
  console.error('unhandledRejection %o', e);
  process.exit(-1);
});
// XXX derry: review set_exception_capture_all
zerr.set_exception_capture_all(true);
zerr.set_exception_handler('test', (prefix, o, err)=>{
  zerr.flush();
  zerr.no_console = false;
  console.error(prefix+' %o', err);
  process.exit(-1);
});

let t_nodes = {}, t_nonce = {}, t_cmds, t_i, t_role, t_port=4000;
let t_pre_process, t_cmds_processed;
let t_ids = {
  a: 'aab88a27669ed361313b2292067b37b4e301ca8b',
  b: 'bb3ce1af8bdc100ecf98ed8ace28be7417f0acd1',
  c: 'cc2e8094373a85cb0e28399f6909ed02080367dc',
  d: 'dd3a9094373a85cb0e28399f6909ed02080363a0',
  s: 'ffe32c1c6ffdc91bbfa7684c67e58f3f36174a59',
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

function wss_from_node(node){ return node.t.wss.url; }

function node_from_url(url){
  for (let name in t_nodes)
  {
    let node = t_nodes[name];
    if (node.t.wss && wss_from_node(node)==url)
      return node;
  }
}

function support_wrtc(name){ return false; } // XXX: TODO

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
    let url = wss_from_node(node);
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
  let s = node_from_id(channel.localID), d = node_from_id(channel.id);
  if (channel.t.initiaor)
  {
    assert(!s.t.fake, 'src must be real');
    // XXX: review. why we send event?
    yield cmd_run(build_cmd(s.t.name+d.t.name+'>connect',
      channel.wsConnector ? 'wss' : 'wrtc'));
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

class FakeWrtcConnector extends EventEmitter {
  constructor(id, router, wrtc){
    super();
    this.id = id;
    this.supported = wrtc;
  }
  connect = _d=>{
    let _this = this;
    return etask(function*connect(){
      let d = node_from_id(_d), s = node_from_id(_this.id);
      let channel = new FakeChannel({localID: s.id, id: d.id});
      channel.wrtcConnector = _this;
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
    let p, a, fwd, cmd;
    let {type, data} = msg.data;
    let from = node_from_id(msg.from), to = node_from_id(msg.to);
    let s = node_from_id(this.localID), d = node_from_id(this.id);
    if (s!=from || d!=to)
      fwd = s.t.name+d.t.name+'>';
    zerr.debug('****** send%s msg %s', fwd ? ' '+fwd : '',
      from.t.name+to.t.name+'>'+type);
    return etask(function*send(){
      switch (type)
      {
      case 'find':
        p = node_from_id(data);
        cmd = build_cmd(from.t.name+to.t.name+'>find', p.t.name);
        break;
      case 'find_r':
        a = array_id_to_name(data);
        cmd = build_cmd(from.t.name+to.t.name+'>find_r', a.join(''));
        break;
      case 'conn_info':
        cmd = build_cmd(from.t.name+to.t.name+'>conn_info', '');
        break;
      case 'conn_info_r':
          a = [];
          if (data.ws)
            a.push('ws'); // XXX: assert correct val of ws
          if (data.wrtc)
            a.push('wrtc');
        cmd = build_cmd(from.t.name+to.t.name+'>conn_info_r', a.join(' '));
        break;
      case 'user': cmd = build_cmd(from.t.name+to.t.name+'>msg', data); break;
      default: assert(false, 'unexpected msg '+type);
      }
      t_nonce[normalize(cmd)] = msg.nonce;
      yield cmd_run_if_next_fake();
      yield cmd_run(build_cmd(cmd, '', fwd));
    });
  };
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

const send_msg = (s, d, msg)=>etask(function*send_msg(){
  let channel = node_get_channel(s, d);
  assert(channel, 'no channel '+s+d+'>');
  yield t_nodes[d].router._onMessage(msg);
});

const fake_send_msg = (c, data)=>etask(function*(){
  let s = t_nodes[c.s], d = t_nodes[c.d];
  let to = d.id.toString('hex'), from = s.id.toString('hex');
  let nonce = t_nonce[normalize(c.orig)]||
    '' + Math.floor(1e15 * Math.random());
  var msg = {to, from, path: [s.id.toString('hex')], nonce, data};
  if (c.fwd)
  {
    assert.equal(c.fwd[2], '>');
    s = t_nodes[c.fwd[0]];
    d = t_nodes[c.fwd[1]];
  }
  if (s.t.fake && !d.t.fake)
    yield send_msg(s.t.name, d.t.name, msg);
});

const cmd_ensure_no_events = opt=>etask(function*cmd_ensure_no_events(){
  let event = util.get(opt, 'event');
  assert(!event, 'unexpected event '+event);
  yield etask.sleep(0); // XXX TODO: change to tick();
});

function cmd_setup(opt){
  let {c, event} = opt, m = c.arg;
  let M = s=>push_cmd(s+' - ');
  assert(!event);
  if (!t_pre_process)
    return;
  // XXX: proper assert setup params
  switch (m)
  {
  case '2_nodes':
    M(`node(a) node(b wss) - ab>!connect(find(a ba))`);
    break;
  case '3_nodes_linear':
    M(`node(a) node(b wss) node(c wss) - ab>!connect(find(a ba)) -
      bc>!connect(find(b cab)) bc,ab<fwd(ca>conn_info(r))`);
    break;
  case '3_nodes_wss':
     M(`node(a wss) node(b wss) node(c wss) -
      ab>!connect(find(a ba)) - bc>!connect(find(b cab))
      cb,ba>fwd(ca>conn_info(r(ws))) ca>connect(find(cab abc))`);
     break;
  case '4_nodes_linear':
    M(`node(a) node(b wss) node(c wss) node(d wss) -
      ab>!connect(find(a ba)) - bc>!connect(find(b cab))
      cb,ba>fwd(ca>conn_info(r)) - cd>!connect(find(c dcba))
      dc,cb>fwd(bd<conn_info(r(ws))) db>connect(find(dcba badc))
      ba>fwd(bd>conn_info_r(ws)) db,ba>fwd(ad<conn_info(r))
      dc,cb>fwd(ad<conn_info)`);
    break;
  default: assert(false, 'unknown macro '+m);
  }
}

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

// ab>!connect(wss) ab>http_get(upgrade(ws)) ab<http_resp(101)
// ab<tcp_send(b.id) ab>tcp_send(a.id) -
// once a gets b.id, it emits 'connection' - we emit ab>connect
// once b gets a.id, it emits 'connection' - we emit ab<connected
const cmd_connect = opt=>etask(function*(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d], find;
  let wss, wrtc, arg = xtest.test_parse(c.arg), call = c.cmd=='!connect';
  let r = true;
  util.forEach(arg, a=>{
    switch (a.cmd)
    {
    case 'wss':
      assert(wss===undefined, 'multiple '+a.cmd);
      wss = assert_wss_url(c.d, a.arg);
      break;
    case 'wrtc':
      assert(!call, 'wrtc only in connect');
      wrtc = true; // XXX: assert destination has wrtc support
      break;
    case 'find':
      find = a.arg.split(' ');
      // XXX: need full validation
      assert(find.length==2, 'invalid find '+a.arg);
      break;
    case '!r': r = false; break;
    default: throw new Error('unknown arg '+a.cmd);
    }
  });
  if (!wss && !wrtc && util.xor(wss_from_node(d), support_wrtc(d.t.name)))
  {
    wss = wss_from_node(d);
    wrtc = support_wrtc(d.t.name);
  }
  assert_exist(c.s);
  assert(util.xor(wss, wrtc), 'must specify wss or wrtc');
  assert(find ? r : true, 'find must be used together with find');
  if (call)
  {
    if (r && t_pre_process)
    {
      push_cmd(build_cmd(c.s+c.d+'>connect', (wss ? 'wss' : 'wrtc')+
        (find ? ' '+build_cmd('find', find.join(' ')) : '')));
    }
    assert(!event);
    if (!s.t.fake)
    {
      if (wss)
        yield s.wsConnector.connect(wss);
      else if (wrtc)
        yield s.wrtcConnector.connect(d.id);
    }
  }
  else
  {
    if (r && t_pre_process)
    {
      // XXX: need api to build expressions
      push_cmd(c.s+c.d+'<connected'+(find ? ' '+
        build_cmd(c.s+c.d+'>find', c.s+' '+build_cmd('r', find[0]))+' '+
        build_cmd(c.s+c.d+'<find', c.d+' '+build_cmd('r', find[1])) : ''));
    }
    if (s.t.fake && d.t.fake)
      return;
    if (s.t.fake)
    {
      let channel = new FakeChannel({localID: d.id, id: s.id});
      if (wss)
        channel.wsConnector = d.wsConnector;
      else
        channel.wrtcConnector = d.wrtcConnector;
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
  yield cmd_run_if_next_fake();
});

const cmd_find = opt=>etask(function*cmd_find(){
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
  if (r && t_pre_process)
    push_cmd(rev_cmd(c.orig, 'find_r', r));
  if (event)
  {
    assert_event(event, build_cmd(c.meta.cmd, peers));
    assert(!s.t.fake, 'src must be real for event '+event);
  }
  yield fake_send_msg(c, {type: 'find', data: _str(s.id)});
  yield cmd_run_if_next_fake();
});

const cmd_find_r = opt=>etask(function*cmd_find_r(){
  let {c, event} = opt, s = t_nodes[c.s];
  // XXX: assert c.arg
  if (event)
  {
    assert_event(event, c.orig);
    assert(!s.t.fake, 'src must be real for event '+event);
  }
  yield fake_send_msg(c, {type: 'find_r', data:
    array_name_to_id(c.arg.split(''))});
  yield cmd_run_if_next_fake();
});

const cmd_conn_info = opt=>etask(function*cmd_conn_info(){
  let {c, event} = opt, r;
  let arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd)
    {
      case 'r':
        assert(!r, 'invalid '+c.orig);
        r = a.arg||'';
        break;
      default: throw new Error('unknown arg '+a.cmd);
    }
  });
  if (typeof r!=='undefined' && t_pre_process)
  {
    if (c.orig_loop)
    {
      _push_cmd(extend_loop_rev(c.orig_loop,
        rev_cmd(c.orig, 'conn_info_r', r)));
    }
    else if (!c.had_loop)
      push_cmd(build_cmd(rev(c.fwd)+'fwd', rev_cmd(c.orig, 'conn_info_r', r)));
  }
  if (event)
  {
    let cmd = normalize(c.meta.cmd);
    let expected = c.fwd ? build_cmd(c.fwd+'fwd', cmd) : cmd;
    assert_event(event, expected);
  }
  yield fake_send_msg(c, {type: 'conn_info'});
  yield cmd_run_if_next_fake();
});

const cmd_conn_info_r = opt=>etask(function*cmd_conn_info_r(){
  let {c, event} = opt, s = t_nodes[c.s], ws, wrtc;
  let arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    // XXX: fix all switch indent
    switch (a.cmd)
    {
    case 'wrtc': wrtc = assert_wrtc(a.arg); break;
    // XXX: assert and verify ws is correct url
    case 'ws': ws = wss_from_node(s); break;
    default: throw new Error('unknown arg '+a.cmd);
    }
  });
  if (event) // XXX: copy this logic to all places of assert_event
  {
    let expected = c.fwd ? build_cmd(c.fwd+'fwd', normalize(c.orig)) : c.orig;
    assert_event(event, expected);
  }
  yield fake_send_msg(c, {type: 'conn_info_r', data: {ws, wrtc}});
  yield cmd_run_if_next_fake();
});

const cmd_msg = opt=>etask(function*cmd_msg(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  assert(s && d, 'invalid event '+c.orig);
  let data = c.arg, call = c.cmd=='!msg';
  if (event) // XXX: copy this logic to all places of assert_event
  {
    let expected = c.fwd ? build_cmd(c.fwd+'fwd', normalize(c.orig)) : c.orig;
    assert_event(event, expected);
  }
  if (call)
  {
    if (!s.t.fake)
      yield s.send(d.id, data);
  }
  else
  {
    yield fake_send_msg(c, {type: 'user', data});
    yield cmd_run_if_next_fake();
  }
});

const cmd_fwd = opt=>etask(function*cmd_fwd(){
  let {c, event} = opt;
  let a = xtest.test_parse(c.arg);
  assert(a.length==1, 'invalid fwd '+c.orig);
  a[0].fwd = c.s+c.d+'>';
  a[0].orig_loop = c.orig_loop;
  a[0].had_loop = c.had_loop;
  yield cmd_run_single({c: a[0], event});
  yield cmd_run_if_next_fake();
});

const cmd_run_single = opt=>etask(function*cmd_run_single(){
  switch (opt.c.cmd)
  {
  case '-': cmd_ensure_no_events(opt); break;
  case 'setup': yield cmd_setup(opt); break;
  case 'node': yield cmd_node(opt); break;
  case '!connect': yield cmd_connect(opt); break;
  case 'connect': yield cmd_connect(opt); break;
  case 'connected': yield cmd_connected(opt); break;
  case 'find': yield cmd_find(opt); break;
  case 'find_r': yield cmd_find_r(opt); break;
  case 'conn_info': yield cmd_conn_info(opt); break;
  case 'conn_info_r': yield cmd_conn_info_r(opt); break;
  case '!msg': yield cmd_msg(opt); break;
  case 'msg': yield cmd_msg(opt); break;
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
    a[i].had_loop = true;
  }
  a[a.length-1].orig_loop = c.loop;
  t_cmds.splice(t_i, 1, ...a);
  return t_cmds[t_i];
}

function extend_loop_rev(loop, cmd){
  let a = [];
  loop = Array.from(loop).reverse();
  for (let i=0; i<loop.length; i++)
  {
    let o = loop[i];
    a.push(xtest.test_parse(build_cmd(o.s+o.d+'<fwd', cmd))[0]);
  }
  return a;
}

const cmd_run_if_next_fake = event=>etask(function*cmd_run_if_next_fake(){
  let next = t_cmds[t_i];
  if (!next)
    return;
  if (!next.s)
    return;
  if (t_nodes[next.s].t.fake)
    yield cmd_run();
});

let t_depth = 0;
const cmd_run = event=>etask(function*cmd_run(){
  let c = t_cmds[t_i];
  assert(c, event ? 'unexpected event '+event : 'empty cmd at '+t_i);
  if (c.loop)
    c = extend_loop(c);
  zerr.notice('%scmd %s: %s%s', ' '.repeat(t_depth), t_i,
    c.s ? build_cmd(c.s+c.d+'>'+c.cmd, c.arg) : c.orig,
    event ? ' event '+event : '');
  t_cmds_processed.push(assign({}, c));
  t_i++;
  t_depth++;
  yield cmd_run_single({c, event});
  t_depth--;
});

const _test_run = (role, cmds)=>etask(function*_test_run(){
  assert(!t_cmds && !t_i && !t_role, 'test already running');
  t_port = 4000;
  t_cmds = cmds;
  t_cmds_processed = [];
  t_role = role;
  t_nonce = {};
  for (t_i=0; t_i<t_cmds.length;)
    yield cmd_run();
  yield test_end();
});

const test_pre_process = test=>etask(function*test_preprocess(){
  t_pre_process = true;
  yield _test_run('fake', xtest.test_parse(test));
  t_pre_process = false;
  return t_cmds_processed;
});

const test_run = (role, test)=>etask(function*test_run(){
  zerr.notice('pre_process run');
  let cmds = yield test_pre_process(test);
  zerr.notice('real run');
  yield _test_run(role, cmds);
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
  afterEach(function(){
    zerr.clear();
  });
  describe('test_api', function(){
    it('pre_process', ()=>xetask(function*(){
      let t = function*(test, exp){
        let cmds = yield test_pre_process(test);
        cmds = xtest.test_parse_rm_meta_orig(cmds);
        assert.deepEqual(cmds, exp);
      };
      let ab = [{arg: 'a', cmd: 'node'}, {arg: 'b', cmd: 'node'}];
      yield t('node(a) node(b)', ab);
      yield t('node(a) node(b) ab>fwd(ab>conn_info(r))', ab.concat([
        {s: 'a', d: 'b', dir: '>', cmd: 'fwd', arg: 'ab>conn_info(r)'},
        {s: 'b', d: 'a', dir: '<', cmd: 'fwd', arg: 'ab<conn_info_r'},
      ]));
      yield t('node(a) node(b) ab,ba>fwd(ab>conn_info(r))', ab.concat([
        {cmd: 'fwd', arg: 'ab>conn_info(r)', s: 'a', d: 'b', dir: '>',
          had_loop: true},
        {cmd: 'fwd', arg: 'ab>conn_info(r)', s: 'b', d: 'a', dir: '>',
        had_loop: true, orig_loop:
        [{s: 'a', d: 'b', dir: '>'}, {s: 'b', d: 'a', dir: '>'}]},
        {s: 'a', d: 'b', dir: '<', cmd: 'fwd', arg: 'ab<conn_info_r'},
        {s: 'b', d: 'a', dir: '<', cmd: 'fwd', arg: 'ab<conn_info_r'},
      ]));
    }));
  });
  const xit = (name, role, test)=>it(name+'_'+role,
    ()=>xetask(()=>test_run(role, test)));
  // XXX TODO:
  // - check generic assert code that derry wrote
  // - check etask error handling of unchaught errors
  // - wrtc tests
  // - add test for failures (missing events, event mismatch etc)
  // - test.js code cleaup
  // - process init/unchaught handling
  // - log - use zerr?
  //   - xerr - lightweight version of zerr
  // - random id -> priv/pub key (copy hypercore)
  //   - do we want to add cksm and sign it on each message
  // - ack on each message
  // - add beep sound to ping script
  const t_roles = (name, roles, test)=>{
    xit(name, 'fake', test);
    for (let i=0; i<roles.length; i++)
      xit(name, roles[i], test);
  };
  describe('2_nodes', function(){
    const t = (name, test)=>t_roles(name, 'ab', test);
    t('long', `node(a) node(b wss(port:4000)) - ab>!connect(wss !r)
      ab>connect(wss !r) ab<connected ab>find(a) ab<find_r(a) ab<find(b)
      ab>find_r(ba)`);
    t('short', `node(a) node(b wss) - ab>!connect(find(a ba))`);
    t('msg', `setup(2_nodes) ab>!msg(hi) ab>msg(hi)`);
    if (0) // XXX TODO: find way to test this sequence of events
    t('events_order', `node(a) node(b wss(port:4000)) - ab>!connect
      ab>find(a) ab<find(b) ab>find_r(b) ab<find_r(b)`);
    t('wrtc', `node(a wrtc) node(b wrtc wss) - ab>!connect(find(a ba))`);
  });
  describe('3_nodes', function(){
    const t = (name, test)=>t_roles(name, 'abcs', test);
    // XXX bug: missing ac>connect(wss) - need to fix peer-relay implemention
    // and send supported connections in conn_info so other side can
    // connect directly
    t('linear', `node(a) node(b wss) node(c wss) - ab>!connect(find(a ba)) -
      bc>!connect(find(b cab)) bc,ab<fwd(ca>conn_info(r))`);
    t('linear_msg', `setup(3_nodes_linear)
      ab>!msg(hi) ab>msg(hi) - ab<!msg(hi) ab<msg(hi) -
      ac>!msg(hi) ab,bc>fwd(ac>msg(hi)) - ac<!msg(hi) bc,ab<fwd(ac<msg(hi)) -
      bc>!msg(hi) bc>msg(hi) - bc<!msg(hi) bc<msg(hi) -
    `);
    t('linear_wrtc', `node(a wrtc) node(b wrtc wss) node(c wrtc wss) -
      ab>!connect(find(a ba)) - bc>!connect(find(b cab))
      bc,ab<fwd(ca>conn_info(r(wrtc))) ca>connect(wrtc find(cab abc))`);
    t('linear_wss', `node(a wss) node(b wss) node(c wss) -
      ab>!connect(find(a ba)) - bc>!connect(find(b cab))
      cb,ba>fwd(ca>conn_info(r(ws))) ca>connect(find(cab abc))`);
    t('star', `
      node(s wss) node(a) node(b wss) - as>!connect(find(a sa)) -
      bs>!connect(find(bas sba)) bs,sa>fwd(ba>conn_info(r))`);
    t('star_wss', `
      node(s wss) node(a wss) node(b wss) - as>!connect(find(a sa)) -
      bs>!connect(find(bas sba)) bs,sa>fwd(ba>conn_info(r(ws)))
      ba>connect(find(bas abs))`);
  });
  describe('4_nodes', function(){
    const t = (name, test)=>t_roles(name, 'abcd', test);
    t('linear', `setup(3_nodes_linear) node(d wss) - cd>!connect(find(c dcba))
      dc,cb>fwd(bd<conn_info(r(ws))) db>connect(find(dcba badc))
      ba>fwd(bd>conn_info_r(ws)) db,ba>fwd(ad<conn_info(r))
      dc,cb>fwd(ad<conn_info)`);
    t('linear_msg', `setup(4_nodes_linear) ab>!msg(hi) ab>msg(hi) -
      ac>!msg(hi) ab,bc>fwd(ac>msg(hi)) -
      ad>!msg(hi) ab,bd,bc,cd>fwd(ad>msg(hi)) -
      ba>!msg(hi) ba>msg(hi) - ba>!msg(hi) ba>msg(hi) -
      bc>!msg(hi) bc>msg(hi) - bd>!msg(hi) bd>msg(hi) -
      ca>!msg(hi) cb>fwd(ca>msg(hi)) ba>fwd(ca>msg(hi)) cd>fwd(ca>msg(hi))
      db>fwd(ca>msg(hi)) -
      da>!msg(hi) db>fwd(da>msg(hi)) ba>fwd(da>msg(hi)) dc>fwd(da>msg(hi))
      cb>fwd(da>msg(hi)) - db>!msg(hi) db>msg(hi) - dc>!msg(hi) dc>msg(hi)`);
    t('linear_wss', `setup(3_nodes_wss) node(d wss) -
      cd>!connect(find(c dcba)) dc,cb>fwd(db>conn_info(r(ws)))
      db>connect(find(dcba badc)) db,ba>fwd(da>conn_info)
      dc,ca>fwd(da>conn_info(r(ws))) da>connect(find(dcba abcd))
      ab,bd>fwd(da<conn_info_r(ws)) ba,ad,ac>fwd(bd>conn_info_r(ws))`);
    // XXX: linear_wss_msg (add all possible send)
  });
  // BUG: if ac>connected and connection is broken, send will not try to send
  // messages through other peers if connections is broken
  // XXX TODO:
  // ab>!msg...
  // wrtc
});

