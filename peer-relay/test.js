// author: derry. coder: arik.
'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach,afterEach*/
// XXX: need jslint mocha: true
import assert from 'assert';
import Node from './client.js';
import etask from '../util/etask.js';
import xurl from '../util/url.js';
import date from '../util/date.js';
import xescape from '../util/escape.js';
// XXX derry: review fromNodeTimers() and npm package
// /home/arik/lif-server/node_modules/@hola.org/lolex/src/lolex.js
import xsinon from '../util/sinon.js';
import util from '../util/util.js';
import string from '../util/string.js';
import xtest from '../util/test_lib.js';
import xerr from '../util/xerr.js';
import Wallet from './wallet.js';
import {EventEmitter} from 'events';
const assign = Object.assign;
const s2b = util.buf_from_str, b2s = util.buf_to_str;
function _str(id){ return typeof id=='string' ? id : util.buf_to_str(id); }

// XXX: make it automatic for all node/browser
xerr.set_exception_catch_all(true);
process.on('uncaughtException', err=>xerr.zexit(err));
process.on('unhandledRejection', err=>xerr.zexit(err));
xerr.set_exception_handler('test', (prefix, o, err)=>xerr.zexit(err));

let t_nodes, t_nonce, t_req, t_cmds, t_i, t_role, t_port=4000;
let t_pre_process, t_cmds_processed;
let t_keys = {
  a: {pub: 'aaec01a08b0640361bd3c0e327e3406255c301f5fe32305a2ca2a50803af76fb',
    priv: 'ba186102e13ec32e5273a30df6da2b6c9428258b4ea83ac88df7322e7645b864a'+
    'aec01a08b0640361bd3c0e327e3406255c301f5fe32305a2ca2a50803af76fb'},
  b: {pub: 'bb97c645664b3a769da624d007e88aab94c99ca95d1e3ec1439e4cceec9c556d',
    priv: 'd42435303d37a60bd567be5ddeabee520b718b2757d8a2239ad947cacd326721b'+
    'b97c645664b3a769da624d007e88aab94c99ca95d1e3ec1439e4cceec9c556d'},
  c: {pub: 'cc64ca3852f2eeb932151da8ec86d8b9634544a4a32c34a6007610691f4e712c',
    priv: '4f2e8f115cdd2252628ab6bf849ea7740ea7bd2c67d18c7c743a15fec0675283c'+
    'c64ca3852f2eeb932151da8ec86d8b9634544a4a32c34a6007610691f4e712c'},
  d: {pub: 'dd1edbb8c0c9cd82ed6e1dbbc246f5e22756663c300f0384b26cafc28f02600d',
    priv: 'd5ff0f8f6f81f2a8cabdd708fce205a24e0ec8dea3cb5ef3982b9c03d5f6fcafd'+
    'd1edbb8c0c9cd82ed6e1dbbc246f5e22756663c300f0384b26cafc28f02600d'},
  e: {pub: 'ee8f3975ae17ee6a248f425e35987140980c7ce05a1c60b7f30aa2de9ef9427e',
    priv: '01efd722ae652fb8a17a767b025e79059322706bc1380fe3d798d7ce65857186e'+
    'e8f3975ae17ee6a248f425e35987140980c7ce05a1c60b7f30aa2de9ef9427e'},
  f: {pub: 'ffb1d7cbee327956bb0205a948324c3623f2a8a65d3f5445c5ccc8c9d228cdca',
    priv: '72e90338a9c2e16da7baf9c87a22e2f286966878cf23214d3dea74435b19c2dbf'+
      'fb1d7cbee327956bb0205a948324c3623f2a8a65d3f5445c5ccc8c9d228cdca'},
  s: {pub: '00d8c0d79322841c2b137811d044402588da7dde617b0a65809e1cf624386014',
    priv: '9596a63459b52771446435d15eb5950651893ae169100451fdcddf1c58d98d180'+
      '0d8c0d79322841c2b137811d044402588da7dde617b0a65809e1cf624386014'},
};

function normalize(e){
  if (!e)
    return e;
  let a=e[0], b=e[1], d=e[2];
  if (d!='<')
    return e;
  return b+a+'>'+e.substr(3);
}

function rev_trim(s){
  let i = s.search(/[<>]/);
  assert(i>=0 && i<3, 'invalid [<>] '+s);
  s = s.substr(0, i)+(s[i]=='<' ? '>' : '<');
  return s;
}

// _build_cmd(cmd, fwd, ...)
function _build_cmd(){
  let args = Array.from(arguments), cmd = args[0], fwd = args[1]||'', arg = '';
  assert(cmd);
  for (let i=2; i<args.length; i++){
    if (args[i])
      arg += (arg ? ' ' : '')+args[i];
  }
  let ret = cmd+(arg ? '('+arg+')' : '');
  return fwd ? fwd+'fwd('+ret+')' : ret;
}

// build_cmd(cmd, ...)
function build_cmd(){
  let a = Array.from(arguments);
  a.splice(1, 0, '');
  return _build_cmd.apply(this, a);
}

function rev_cmd(sd, cmd, arg){ return build_cmd(rev_trim(sd)+cmd, arg); }

function dir_str(s, d, dir){ return dir=='>' ? s+d+'>' : d+s+'<'; }
function dir_c(c){ return dir_str(c.s, c.d, c.dir); }

function set_orig(c, orig){
  c.meta.orig = c.orig;
  c.orig = orig;
}

function _push_cmd(a){ t_cmds.splice(t_i, 0, ...a); }

function push_cmd(cmd){ _push_cmd(xtest.test_parse(cmd)); }

function is_fake(p){ return t_role!=p; }

function wss_from_node(node){ return util.get(node, 't.wss.url'); }

function node_from_url(url){
  for (let name in t_nodes){
    let node = t_nodes[name];
    if (node.t.wss && wss_from_node(node)==url)
      return node;
  }
}

function support_wrtc(name){ return false; } // XXX: TODO

function node_from_id(id){
  for (let name in t_nodes){
    let node = t_nodes[name];
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
    switch (a.cmd){
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
  else {
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
  assert.equal(normalize(event), normalize(exp)); }

function assert_event_c(c, event){
  let expected = c.fwd ? build_cmd(c.fwd+'fwd', normalize(c.orig)) : c.orig;
  assert_event(event, expected);
}
const test_on_connection = channel=>etask(function*test_on_connection(){
  let s = node_from_id(channel.localID), d = node_from_id(channel.id);
  if (channel.t.initiaor){
    assert(!s.t.fake, 'src must be real');
    yield cmd_run(build_cmd(s.t.name+d.t.name+'>connect',
      channel.wsConnector ? 'wss' : 'wrtc'));
    let event = s.t.name+d.t.name+'<connected';
    yield cmd_run(event);
  }
  else
    yield cmd_run(d.t.name+s.t.name+'<connected');
});

class FakeNode extends EventEmitter {
  constructor(opt){
    super();
    this.wallet = new Wallet({keys: opt.keys});
    this.id = opt.keys.pub;
    this.wsConnector = new FakeWsConnector(this.id, opt.port, opt.host);
    this.wrtcConnector = new FakeWrtcConnector(this.id);
  }
  destroy(){}
}

class FakeWsConnector extends EventEmitter {
  constructor(id, port, host){
    super();
    this.id = id;
    if (port || host){ // XXX: what if no host?
      assert(host, 'missing host');
      assert(port, 'missing port');
      this.url = 'wss://'+host+':'+port;
    }
  }
  connect = url=>etask({'this': this}, function*connect(){
    let _this = this.this;
    let d = node_from_url(url), s = node_from_id(_this.id);
    assert(d, 'node not found '+url);
    let channel = new FakeChannel({localID: s.id, id: d.id});
    channel.wsConnector = _this;
    channel.t.initiaor = true;
    assert(!s.t.fake, 'src must be real');
    yield s._onConnection(channel);
  });
  destroy(){}
}

class FakeWrtcConnector extends EventEmitter {
  constructor(id, router, wrtc){
    super();
    this.id = id;
    this.supported = wrtc;
  }
  connect = _d=>etask({'this': this}, function*connect(){
    let _this = this.this;
    let d = node_from_id(_d), s = node_from_id(_this.id);
    let channel = new FakeChannel({localID: s.id, id: d.id});
    channel.wrtcConnector = _this;
    channel.t.initiaor = true;
    assert(!s.t.fake, 'src must be real');
    yield s._onConnection(channel);
  });
  destroy(){}
}

class FakeChannel extends EventEmitter {
  constructor(opt){
    super();
    this.id = opt.id;
    this.localID = opt.localID;
    this.t = {};
  }
  send = msg=>{
    let p, a, fwd, e;
    let {cmd, body} = msg.body;
    let from = node_from_id(msg.from), to = node_from_id(msg.to);
    let s = node_from_id(this.localID), d = node_from_id(this.id);
    if (s!=from || d!=to)
      fwd = s.t.name+d.t.name+'>';
    xerr.debug('****** send%s msg %s', fwd ? ' '+fwd : '',
      from.t.name+to.t.name+'>'+cmd);
    return etask(function*send(){
      switch (cmd){
      case 'find':
        p = node_from_id(body);
        e = build_cmd(from.t.name+to.t.name+'>find', p.t.name);
        break;
      case 'find_r':
        a = array_id_to_name(body);
        e = build_cmd(from.t.name+to.t.name+'>find_r', a.join(''));
        break;
      case 'conn_info':
        e = build_cmd(from.t.name+to.t.name+'>conn_info', '');
        break;
      case 'conn_info_r':
          a = [];
          if (body.ws)
            a.push('ws'); // XXX: assert correct val of ws
          if (body.wrtc)
            a.push('wrtc');
        e = build_cmd(from.t.name+to.t.name+'>conn_info_r', a.join(' '));
        break;
      case 'user': e = build_cmd(from.t.name+to.t.name+'>msg', body); break;
      default:
        if (msg.type)
        {
          e = build_cmd(from.t.name+to.t.name+'>'+msg.type,
            build_cmd('id', msg.req_id), build_cmd('body', msg.body));
        }
        else
          assert(false, 'unexpected msg '+cmd);
      }
      t_nonce[normalize(e)] = msg.nonce;
      yield cmd_run_if_next_fake();
      yield cmd_run(_build_cmd(e, fwd, ''));
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
  if (!channel)
    return xerr.notice('no channel '+s+d+'>');
  yield t_nodes[d].router._on_channel_msg(msg);
});

const fake_send_msg = (c, body)=>_fake_send_msg(c, {body});
const _fake_send_msg = (c, msg)=>etask(function*(){
  let s = t_nodes[c.s], d = t_nodes[c.d];
  let to = d.id.toString('hex'), from = s.id.toString('hex');
  let nonce = t_nonce[normalize(c.orig)]||
    '' + Math.floor(1e15 * Math.random());
  msg.to = to;
  msg.from = from;
  msg.nonce = nonce;
  msg.path = [s.id.toString('hex')];
  msg.sign = s.wallet.sign(msg);
  if (c.fwd){
    let fwd = normalize(c.fwd);
    s = t_nodes[fwd[0]];
    d = t_nodes[fwd[1]];
  }
  if (s.t.fake && !d.t.fake)
    yield send_msg(s.t.name, d.t.name, msg);
});

const cmd_ensure_no_events = opt=>etask(function*cmd_ensure_no_events(){
  let event = util.get(opt, 'event');
  assert(!event, 'unexpected event '+event);
  if (t_pre_process)
    return;
  yield xsinon.tick();
});

function cmd_setup(opt){
  let {c, event} = opt, m = c.arg;
  let M = s=>push_cmd(s+' - ');
  assert(!event);
  // XXX: proper assert setup params
  switch (m){
  case '2_nodes':
    if (!t_pre_process)
      break;
    M(`node(a) node(b wss) - ab>!connect(find(a ba))`);
    break;
  case '3_nodes_linear':
    if (!t_pre_process)
      break;
    M(`node(a) node(b wss) node(c wss) - ab>!connect(find(a ba)) -
      bc>!connect(find(b cab)) abc<fwd(ca>conn_info(r))`);
    break;
  case '3_nodes_wss':
    if (!t_pre_process)
      break;
     M(`node(a wss) node(b wss) node(c wss) -
      ab>!connect(find(a ba)) - bc>!connect(find(b cab))
      cba>fwd(ca>conn_info(r(ws))) ca>connect(find(cab abc))`);
     break;
  case '4_nodes_linear':
    if (!t_pre_process)
      break;
    M(`node(a) node(b wss) node(c wss) node(d wss) -
      ab>!connect(find(a ba)) - bc>!connect(find(b cab))
      cba>fwd(ca>conn_info(r)) - cd>!connect(find(c dcba))
      dcb>fwd(bd<conn_info(r(ws))) db>connect(find(dcba badc))
      ba>fwd(bd>conn_info_r(ws)) dba>fwd(ad<conn_info(r))
      dcb>fwd(ad<conn_info)`);
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
    switch (a.cmd){
    case 'wss': wss = assert_wss(a.arg); break;
    case 'wrtc': wrtc = assert_wrtc(a.arg); break;
    case 'boot': bootstrap = assert_bootstrap(a.arg); break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  let key = t_keys[name], fake = is_fake(name);
  assert(t_keys[name], 'key not founnd '+name);
  assert(!wss || !node_from_url(wss.url), wss?.url+' already used');
  let node = new (fake ? FakeNode : Node)(assign(
    {keys: {priv: s2b(key.priv), pub: s2b(key.pub)}, bootstrap, wrtc},
    wss));
  node.t = {id: _str(node.id), name, fake, wss};
  t_nodes[name] = node;
}

// ab>!connect(wss) ab>http_get(upgrade(ws)) ab<http_resp(101)
// ab<tcp_send(b.id) ab>tcp_send(a.id) -
// once a gets b.id, it emits 'connection' - we emit ab>connect
// once b gets a.id, it emits 'connection' - we emit ab<connected
const cmd_connect = opt=>etask(function*(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d], find;
  let wss, wrtc, arg = xtest.test_parse(c.arg), call = c.cmd[0]=='!';
  let r = true;
  util.forEach(arg, a=>{
    switch (a.cmd){
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
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  assert(d, 'not node found '+c.d);
  if (!wss && !wrtc && util.xor(wss_from_node(d), support_wrtc(d.t.name))){
    wss = wss_from_node(d);
    wrtc = support_wrtc(d.t.name);
  }
  assert_exist(c.s);
  assert(util.xor(wss, wrtc), 'must specify wss or wrtc');
  assert(find ? r : true, 'find must be used together with find');
  if (t_pre_process){
    if (call)
    {
      if (r){
        push_cmd(build_cmd(c.s+c.d+'>connect', wss&&'wss', wrtc&&'wrtc',
          find&&build_cmd('find', find.join(' '))));
      }
      set_orig(c, build_cmd(c.meta.cmd, wss&&'wss', wrtc&&'wrtc', '!r'));
    }
    else {
      if (r){
        push_cmd(c.s+c.d+'<connected'+(find ? ' '+
          build_cmd(c.s+c.d+'>find', c.s+' '+build_cmd('r', find[0]))+' '+
          build_cmd(c.s+c.d+'<find', c.d+' '+build_cmd('r', find[1])) : ''));
      }
      set_orig(c, build_cmd(c.meta.cmd, wss&&'wss', wrtc&&'wrtc', '!r'));
    }
    return;
  }
  if (call){
    assert(!event);
    if (!s.t.fake){
      if (wss)
        yield s.wsConnector.connect(wss);
      else if (wrtc)
        yield s.wrtcConnector.connect(d.id);
    }
  }
  else {
    if (s.t.fake && d.t.fake)
      return;
    if (s.t.fake){
      let channel = new FakeChannel({localID: d.id, id: s.id});
      if (wss)
        channel.wsConnector = d.wsConnector;
      else
        channel.wrtcConnector = d.wrtcConnector;
      yield d._onConnection(channel);
    }
    else
      assert_event(event, build_cmd(c.s+c.d+'>connect', wss ? 'wss' : 'wrtc'));
  }
});

const cmd_connected = opt=>etask(function*cmd_connected(){
  let {c, event} = opt, d = t_nodes[c.d];
  if (event)
    assert_event_c(c, event);
  else
    assert(d.t.fake, 'dst must be fake');
  if (t_pre_process)
    return;
  yield cmd_run_if_next_fake();
});

const cmd_find = opt=>etask(function*cmd_find(){
  let {c, event} = opt, s = t_nodes[c.s];
  let r, peers, arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    if (a.cmd=='r'){
      assert(!r, 'invalid '+c.orig);
      r = a.arg||true;
    }
    else {
      assert(!peers, 'invalid '+c.orig);
      peers = a.cmd;
      assert_peers(peers);
    }
  });
  if (t_pre_process){
    if (r)
      push_cmd(rev_cmd(c.orig, 'find_r', r));
    set_orig(c, build_cmd(c.meta.cmd, peers));
    return;
  }
  if (event)
    assert_event(event, build_cmd(c.meta.cmd, peers));
  yield fake_send_msg(c, {cmd: 'find', body: _str(s.id)});
  yield cmd_run_if_next_fake();
});

const cmd_find_r = opt=>etask(function*cmd_find_r(){
  let {c, event} = opt, s = t_nodes[c.s];
  if (t_pre_process)
    return set_orig(c, build_cmd(c.meta.cmd, c.arg));
  // XXX: assert c.arg
  if (event)
    assert_event_c(c, event);
  else
    assert(s.t.fake, 'missing event '+c.orig);
  yield fake_send_msg(c, {cmd: 'find_r', body:
    array_name_to_id(c.arg.split(''))});
  yield cmd_run_if_next_fake();
});

const cmd_conn_info = opt=>etask(function*cmd_conn_info(){
  let {c, event} = opt, r, s = t_nodes[c.s];
  let arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'r':
      assert(!r, 'invalid '+c.orig);
      r = a.arg||'';
      break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  if (t_pre_process){
    if (typeof r!=='undefined'){
      if (c.orig_loop){
        _push_cmd(extend_loop_rev(c.orig_loop,
          rev_cmd(c.orig, 'conn_info_r', r)));
      }
      else if (!c.had_loop){
        push_cmd(build_cmd(rev_trim(c.fwd)+'fwd',
          rev_cmd(c.orig, 'conn_info_r', r)));
      }
    }
    set_orig(c, build_cmd(c.meta.cmd));
    return;
  }
  if (event)
    assert_event_c(c, event);
  else
    assert(s.t.fake || c.fwd, 'missing event '+c.orig);
  yield fake_send_msg(c, {cmd: 'conn_info'});
  yield cmd_run_if_next_fake();
});

const cmd_conn_info_r = opt=>etask(function*cmd_conn_info_r(){
  let {c, event} = opt, s = t_nodes[c.s], ws, wrtc;
  let arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'wrtc': wrtc = assert_wrtc(a.arg); break;
    // XXX: assert and verify ws is correct url
    case 'ws': ws = wss_from_node(s); break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  if (t_pre_process)
    return set_orig(c, build_cmd(c.meta.cmd, c.arg));
  if (event)
    assert_event_c(c, event);
  else
    assert(s.t.fake || c.fwd, 'missing event '+c.orig);
  yield fake_send_msg(c, {cmd: 'conn_info_r', body: {ws, wrtc}});
  yield cmd_run_if_next_fake();
});

const cmd_msg = opt=>etask(function*cmd_msg(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  assert(s && d, 'invalid event '+c.orig);
  let arg = xtest.test_parse(c.arg), body, call = c.cmd[0]=='!';
  let msg = call ? true : false;
  util.forEach(arg, a=>{
    switch (a.cmd){
    case '!msg': msg = false; break;
    case 'msg':
      assert(!a.arg);
      msg = true;
      break;
    default:
      assert(!body, 'invalid arg '+a.cmd);
      body = a.cmd;
    }
  });
  assert(call || !msg, 'msg only avail for call mode');
  if (t_pre_process){
    if (call){
      if (c.loop_first){
        if (msg)
          push_cmd(_build_cmd(dir_c(c)+'msg', c.fwd, body));
        c.fwd = '';
        set_orig(c, build_cmd(dir_c(c)+'!msg', body, '!msg'));
        return;
      }
      else if (c.had_loop)
        return set_orig(c, build_cmd(dir_c(c)+'msg', body));
      if (msg)
        push_cmd(build_cmd(dir_c(c)+'msg', body));
    }
    else
      assert(!msg);
    set_orig(c, build_cmd(c.meta.cmd, body, call ? '!msg' : ''));
    return;
  }
  if (event)
    assert_event_c(c, event);
  else if (!call)
    assert(s.t.fake || c.fwd, 'missing event '+c.orig);
  if (call){
    if (!s.t.fake)
      yield s.send(d.id, body);
  }
  else {
    yield fake_send_msg(c, {cmd: 'user', body});
    yield cmd_run_if_next_fake();
  }
});

const cmd_req = opt=>etask(function*req(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  assert(s && d, 'invalid event '+c.orig);
  let call = c.cmd[0]=='!', body, id, res, arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'id': id = a.arg; break;
    case 'body': body = a.arg; break;
    case 'res':
      assert(call, 'res only valid for !req');
      res = a.arg;
      break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  assert(id);
  if (t_pre_process){
    // XXX support {id: id} instead of build_cmd for params
    set_orig(c, build_cmd(c.meta.cmd, build_cmd('id', id),
      build_cmd('body', body), res&&build_cmd('res', res)));
    return;
  }
  if (event)
    assert_event_c(c, event);
  else if (!call)
    assert(s.t.fake || c.fwd, 'missing event '+c.orig);
  if (call){
    assert(!t_req[id], 'request already exists '+id);
    t_req[id] = {id, body, res, s: c.s, d: c.d};
    if (!s.t.fake){
      let req = s.send_req(b2s(d.id), {}, body)
      .on('fail', o=>cmd_run(build_cmd(c.s+'<fail',
        build_cmd('id', o.req_id), build_cmd('error', o.error))));
      assert.equal(req.__meta.req_id, id, 'req_id mismatch');
    }
    if (!d.t.fake && res){
       d.on('req', t_req[id].cb = (msg, res)=>{
        res.send(t_req[id].res);
        d.off('req', t_req[id].cb);
        delete t_req[id].cb;
      });
    }
  }
  else {
    yield _fake_send_msg(c, {req_id: id, type: 'req', body});
    yield cmd_run_if_next_fake();
  }
});

const cmd_res = opt=>etask(function*req(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  let call = c.cmd[0]=='!', body, id, arg = xtest.test_parse(c.arg);
  assert(s && d, 'invalid event '+c.orig);
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'id': id = a.arg; break;
    case 'body': body = a.arg; break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  assert(id);
  if (t_pre_process){
    set_orig(c, build_cmd(c.meta.cmd, build_cmd('id', id),
      build_cmd('body', body)));
    return;
  }
  if (event)
    assert_event_c(c, event);
  else if (!call)
    assert(s.t.fake || c.fwd, 'missing event '+c.orig);
  if (call){
    if (!s.t.fake)
      yield s.send_res({req_id: id, to: b2s(d.id), body});
  }
  else {
    yield _fake_send_msg(c, {req_id: id, type: 'res', body});
    yield cmd_run_if_next_fake();
  }
});

const cmd_fail = opt=>etask(function*req(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  assert(!s && d, 'invalid event '+c.orig);
  let error, id, arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'id': id = a.arg; break;
    case 'error': error = a.arg; break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  assert(id, 'fail missing id');
  assert(error, 'fail missing error');
  if (t_pre_process){
    set_orig(c, build_cmd(c.meta.cmd, build_cmd('id', id),
      build_cmd('error', error)));
    return;
  }
  if (event)
    assert_event_c(c, event);
  else
    assert(d.t.fake, 'missing fail event '+c.orig);
  yield cmd_run_if_next_fake();
});

const cmd_fwd = opt=>etask(function*cmd_fwd(){
  let {c, event} = opt;
  let a = xtest.test_parse(c.arg);
  assert(a.length==1, 'invalid fwd '+c.orig);
  a[0].fwd = dir_c(c);
  if (t_pre_process){
    a[0].orig_loop = c.orig_loop;
    a[0].had_loop = c.had_loop;
    a[0].loop_first = c.loop_first;
  }
  yield cmd_run_single({c: a[0], event});
  if (t_pre_process)
    return set_orig(c, _build_cmd(a[0].orig, a[0].fwd));
  yield cmd_run_if_next_fake();
});

const cmd_ms = opt=>etask(function*cmd_ms(){
  let {c, event} = opt;
  if (t_pre_process)
    return;
  assert(!event, 'unexpected event for ms cmd '+event);
  // XXX: add assert for ms command and support ms/s
  xsinon.tick(+c.arg);
  yield cmd_run_if_next_fake(); // XXX: probably can be removed from ms cmd
});

const cmd_run_single = opt=>etask(function*cmd_run_single(){
  let c = opt.c;
  if (t_pre_process){
    let a;
    if ('<>'.indexOf(c.cmd[2])!=-1){ // XXX: ugly code
      // XXX fixme:
      // build_cmd(c.s+c.d+c.dir+'fwd', build_cmd(c.cmd, c.arg)))[0]);
      assign(c, xtest.test_parse(
        build_cmd(c.orig.substr(0, 3)+'fwd', c.orig.substr(3)))[0]);
    }
    if (a = c.cmd.match(/(^\d+)ms$/))
      assign(c, xtest.test_parse(build_cmd('ms', a[1]))[0]);
    if (a = c.cmd.match(/(^\d+)s$/))
      assign(c, xtest.test_parse(build_cmd('ms', +a[1]*date.ms.SEC))[0]);
  }
  switch (c.cmd){
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
  case '!req': yield cmd_req(opt); break;
  case 'req': yield cmd_req(opt); break;
  case 'res': yield cmd_res(opt); break;
  case '!res': yield cmd_res(opt); break;
  case 'fail': yield cmd_fail(opt); break;
  case 'fwd': yield cmd_fwd(opt); break;
  case 'ms': yield cmd_ms(opt); break;
  default: assert(false, 'unknown cmd '+opt.c.cmd);
  }
});

// XXX: need test
function extend_loop(c){
  assert(c.loop);
  assert(t_pre_process);
  let a = [];
  for (let i=0; i<c.loop.length; i++){
    let o = assign({}, c, c.loop[i]);
    a.push(o);
    delete o.loop;
    if (o.cmd!='fwd'){
      o.arg = build_cmd(
        dir_str(c.loop[0].s, c.loop[c.loop.length-1].d, o.dir)+o.cmd, o.arg);
      o.cmd = 'fwd';
    }
    assert.equal(o.cmd, 'fwd');
    set_orig(o, _build_cmd(o.arg, dir_c(o)));
    o.had_loop = true;
  }
  a[0].loop_first = true;
  a[a.length-1].orig_loop = c.loop;
  t_cmds.splice(t_i, 1, ...a);
  return t_cmds[t_i];
}

function extend_loop_rev(loop, cmd){
  let a = [];
  loop = Array.from(loop).reverse();
  for (let i=0; i<loop.length; i++){
    let o = loop[i];
    a.push(xtest.test_parse(build_cmd(o.s+o.d+'<fwd', cmd))[0]);
  }
  return a;
}

const cmd_run_if_next_fake = event=>etask(function*cmd_run_if_next_fake(){
  assert(!t_pre_process);
  if (t_role=='fake')
    return;
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
  if (t_pre_process){
    assert.equal(t_depth, 0);
    if (c.loop)
      c = extend_loop(c);
  }
  xerr.notice('%scmd %s: %s%s', ' '.repeat(t_depth), t_i,
    c.s ? build_cmd(c.s+c.d+'>'+c.cmd, c.arg) : c.orig,
    event ? ' event '+event : '');
  t_i++;
  t_depth++;
  yield cmd_run_single({c, event});
  t_cmds_processed.push(assign({}, c));
  t_depth--;
});

function test_start(role){
  t_role = role;
  t_port = 4000;
  t_nodes = {};
  t_cmds = undefined;
  t_cmds_processed = [];
  t_nonce = {};
  t_req = {};
}

const _test_run = (role, cmds)=>etask(function*_test_run(){
  assert(!t_cmds && !t_i && !t_role, 'test already running');
  test_start(role);
  t_cmds = cmds;
  for (t_i=0; t_i<t_cmds.length;)
    yield cmd_run();
  yield test_end();
});

const test_to_str = cmds=>{
  let a = [];
  cmds.forEach(cmd=>a.push(cmd.orig));
  return a.join(' ');
};

const test_pre_process = test=>etask(function*test_preprocess(){
  t_pre_process = true;
  yield _test_run('fake', xtest.test_parse(test));
  t_pre_process = false;
  return t_cmds_processed;
});

const test_run = (role, test)=>etask(function*test_run(){
  xsinon.clock_set({now: 1});
  xerr.notice('pre_process run');
  let cmds = yield test_pre_process(test);
  cmds = xtest.test_parse(test_to_str(cmds));
  xerr.notice('real run');
  yield _test_run(role, cmds);
  xsinon.uninit();
});

const test_end = ()=>etask(function*(){
  yield cmd_ensure_no_events();
  assert(t_cmds, 'test not running');
  assert.equal(t_i, t_cmds.length, 'not all cmds run');
  if (!t_pre_process)
    xsinon.tick(date.ms.YEAR);
  yield cmd_ensure_no_events();
  for (let n in t_nodes){
    yield t_nodes[n].destroy();
    delete t_nodes[n];
  }
  t_cmds = t_role = t_i = undefined;
});

beforeEach(function(){ xerr.set_buffered(true, 1000); });

afterEach(function(){
  xerr.clear();
  xerr.set_buffered(false);
});

describe('api', function(){
  it('normalize', ()=>{
    let t = (cmd, exp)=>assert.equal(normalize(cmd), exp);
    t('ab>', 'ab>');
    t('ab<', 'ba>');
    t('a>', 'a>');
    t('a<', 'a<');
    t('a', 'a');
    t('ab>c', 'ab>c');
    t('ab<c', 'ba>c');
    t('ab<c(d)', 'ba>c(d)');
  });
  it('rev_trim', ()=>{
    let t = (cmd, exp)=>assert.equal(rev_trim(cmd), exp);
    t('a>', 'a<');
    t('a<', 'a>');
    t('ab>', 'ab<');
    t('ab<', 'ab>');
    t('a>c(d)', 'a<');
    t('ab>c(d)', 'ab<');
  });
  it('dir_str', ()=>{
    let t = (s, d, dir, exp)=>assert.equal(dir_str(s, d, dir), exp);
    t('a', 'b', '>', 'ab>');
    t('a', 'b', '<', 'ba<');
  });
  it('build_cmd', ()=>{
    let t = (arg, exp)=>assert.equal(_build_cmd.apply(this, arg), exp);
    t(['a'], 'a');
    t(['ab>'], 'ab>');
    t(['ab>msg'], 'ab>msg');
    t(['ab>msg', 'cd>'], 'cd>fwd(ab>msg)');
    t(['ab>msg', '', 'x'], 'ab>msg(x)');
    t(['ab>msg', '', 'x', 'y'], 'ab>msg(x y)');
    t(['ab>msg', 'cd>', 'x', 'y'], 'cd>fwd(ab>msg(x y))');
  });
});

describe('peer-relay', function(){
  beforeEach(function(){
    xtest.set(Node, 'WsConnector', FakeWsConnector);
    xtest.set(Node, 'WrtcConnector', FakeWrtcConnector);
    xtest.set(util, 'test_on_connection', test_on_connection);
  });
  describe('test_api', function(){
    describe('pre_process', function(){
      it('low_level', ()=>etask(function*(){
        let t = function*(test, exp){
          test_start();
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
            had_loop: true, loop_first: true},
          {cmd: 'fwd', arg: 'ab>conn_info(r)', s: 'b', d: 'a', dir: '>',
          had_loop: true, orig_loop:
          [{s: 'a', d: 'b', dir: '>'}, {s: 'b', d: 'a', dir: '>'}]},
          {s: 'a', d: 'b', dir: '<', cmd: 'fwd', arg: 'ab<conn_info_r'},
          {s: 'b', d: 'a', dir: '<', cmd: 'fwd', arg: 'ab<conn_info_r'},
        ]));
      }));
      describe('shortcut', ()=>{
        const t = (test, exp)=>it(test, ()=>etask(function*(){
          test_start();
          let setup = 'node(a wss) node(b wss) node(c wss) node(d wss) '+
            'node(e wss) node(f wss) ';
          let regex = new RegExp('^'+xescape.regex(setup));
          let res = yield test_pre_process(setup+test);
          assert.equal(test_to_str(res).replace(regex, ''),
            string.split_ws(exp).join(' '));
        }));
        t('1ms', `ms(1)`);
        t('12ms', `ms(12)`);
        t('1s', `ms(1000)`);
        t('12s', `ms(12000)`);
        t('ab>connect(wss !r)', `ab>connect(wss !r)`);
        t('ab>connect(!r)', `ab>connect(wss !r)`);
        t('ab>connect', `ab>connect(wss !r) ab<connected`);
        t('ab>!connect(wss !r)', `ab>!connect(wss !r)`);
        t('ab>!connect(!r)', `ab>!connect(wss !r)`);
        t('ab>!connect', `ab>!connect(wss !r) ab>connect(wss !r)
          ab<connected`);
        t('ab>!connect(find(c d))', `ab>!connect(wss !r) ab>connect(wss !r)
          ab<connected ab>find(a) ab<find_r(c) ab<find(b) ab>find_r(d)`);
        t('ab>find(a)', `ab>find(a)`);
        t('ab>find(a r(c))', `ab>find(a) ab<find_r(c)`);
        t('ab>fwd(ab>find(a))', `ab>fwd(ab>find(a))`);
        t('ab>find:a', `ab>find(a)`);
        t('ab<find_r:a', `ab<find_r(a)`);
        t('ab,bc>fwd(ac>find(a))', `ab>fwd(ac>find(a)) bc>fwd(ac>find(a))`);
        t('ab,bc<fwd(ac<find(a))', `bc<fwd(ac<find(a)) ab<fwd(ac<find(a))`);
        t('ab,bc>find(a)', `ab>fwd(ac>find(a)) bc>fwd(ac>find(a))`);
        t('ab,bc<find(a)', `bc<fwd(ac<find(a)) ab<fwd(ac<find(a))`);
        t('abc>fwd(ac>find(a))', `ab>fwd(ac>find(a)) bc>fwd(ac>find(a))`);
        t('abcd>fwd(ad>find(a))', `ab>fwd(ad>find(a)) bc>fwd(ad>find(a))
          cd>fwd(ad>find(a))`);
        t('abc<fwd(ac>find(a))', `bc<fwd(ac>find(a)) ab<fwd(ac>find(a))`);
        t('abcd<fwd(ad>find(a))', `cd<fwd(ad>find(a)) bc<fwd(ad>find(a))
          ab<fwd(ad>find(a))`);
        t('abc>find(a)', `ab>fwd(ac>find(a)) bc>fwd(ac>find(a))`);
        t('abc<find(a)', `bc<fwd(ac<find(a)) ab<fwd(ac<find(a))`);
        t('ab>fwd(ac>conn_info(r(ws)))', `ab>fwd(ac>conn_info)
          ab<fwd(ac<conn_info_r(ws))`);
        t('ab,bc>fwd(ac>conn_info(r(ws)))', `ab>fwd(ac>conn_info)
          bc>fwd(ac>conn_info) bc<fwd(ac<conn_info_r(ws))
          ab<fwd(ac<conn_info_r(ws))`);
        t('abc>fwd(ac>conn_info(r(ws)))', `ab>fwd(ac>conn_info)
          bc>fwd(ac>conn_info) bc<fwd(ac<conn_info_r(ws))
          ab<fwd(ac<conn_info_r(ws))`);
        t('abc>fwd(ac>conn_info(r(ws)))', `ab>fwd(ac>conn_info)
          bc>fwd(ac>conn_info) bc<fwd(ac<conn_info_r(ws))
          ab<fwd(ac<conn_info_r(ws))`);
        t('abc>conn_info(r(ws))', `ab>fwd(ac>conn_info) bc>fwd(ac>conn_info)
          bc<fwd(ac<conn_info_r(ws)) ab<fwd(ac<conn_info_r(ws))`);
        t('ba>bd>conn_info_r:ws', `ba>fwd(bd>conn_info_r(ws))`);
        t('ab>!msg(hi !msg)', `ab>!msg(hi !msg)`);
        t('ab>!msg(hi)', `ab>!msg(hi !msg) ab>msg(hi)`);
        t('ab>!msg(hi msg)', `ab>!msg(hi !msg) ab>msg(hi)`);
        t('abc>!msg(hi)', `ac>!msg(hi !msg) ab>fwd(ac>msg(hi))
          bc>fwd(ac>msg(hi))`);
        t('abc<!msg(hi)', `ac<!msg(hi !msg) bc<fwd(ac<msg(hi))
          ab<fwd(ac<msg(hi))`);
        t('ab,bc>!msg(hi)', `ac>!msg(hi !msg) ab>fwd(ac>msg(hi))
          bc>fwd(ac>msg(hi))`);
        t('ab>cd>msg(hi)', `ab>fwd(cd>msg(hi))`);
        t('ab>cd<msg(hi)', `ab>fwd(cd<msg(hi))`);
        t('ab<cd>msg(hi)', `ab<fwd(cd>msg(hi))`);
        t('ab<cd<msg(hi)', `ab<fwd(cd<msg(hi))`);
        if (0) // XXX: fixme
        t('ab,cd>ef>msg(hi)', `ab>fwd(ef>msg(hi)) cd>fwd(msg(hi))`);
        // XXX TODO: dcb>fwd(da>msg(hi)) - db>!msg(hi) - dc>!msg(hi)`);
        t('ab>req(id:1 body:ping)', `ab>req(id(1) body(ping))`);
        t('ab>!req(id:1 body:ping res:pong)', `ab>!req(id(1) body(ping)
          res(pong))`);
        t('ab>res(id:1 body:pong)', `ab>res(id(1) body(pong))`);
        t('a<fail(id:1 error:timeout)', `a<fail(id(1) error(timeout))`);
      });
    });
  });
  const xit = (name, role, test)=>it(name+'_'+role, ()=>test_run(role, test));
  // XXX TODO:
  // - check etask error handling of unchaught errors
  // - add test for failures (missing events, event mismatch etc)
  // - test.js code cleaup
  // - process init/unchaught handling
  // - random id -> priv/pub key (copy hypercore)
  //   - do we want to add cksm and sign it on each message
  //   - need to verify idendity of each other when direct connection created
  // - ack on each message
  // - add beep sound to ping script
  const t_roles = (name, roles, test)=>{
    assert(test);
    assert(roles);
    xit(name, 'fake', test);
    for (let i=0; i<roles.length; i++)
      xit(name, roles[i], test);
  };
  // XXX derry: msg format:
  // CURRENT:
  // {to, from, nonce, data: {type, data}, path, sign}
  // eg. {to, from, nonce, data: {type: 'find', data: 'a'}, path, sign}
  // type: 'find|find_r|conn_info|conn_info_r|user'
  // PLAN:
  // {to, from, nonce, nonce, type, id, cmd, data}
  // eg. {to, from, nonce, nonce, type: 'req', id, cmd: 'find', data: 'a',
  //  path, sign}
  // type: 'req|res|req_start|req_next|req_end|res_start|res_next|res_end'
  // cmd: 'find|conn_info|msg'
  describe('req', function(){
    const t = (name, test)=>t_roles(name, 'abc', test);
    t('manual', `setup:2_nodes ab>!req(id:1 body:ping) ab>req(id:1 body:ping) -
      ab<!res(id:1 body:pong) ab<res(id:1 body:pong) 20s -
      ab>!req(id:2 body:ping) ab>req(id:2 body:ping) -
      ab<!res(id:2 body:pong) ab<res(id:2 body:pong)
    `);
    // XXX coding: ab>!req(id2: body:ping !req) and by default send ab>req...
    t('auto', `setup:2_nodes ab>!req(id:1 body:ping res:pong)
      ab>req(id:1 body:ping) ab<res(id:1 body:pong)
      ab>!req(id:2 body:ping res:pong) ab>req(id:2 body:ping)
      ab<res(id:2 body:pong)`);
    t('fwd', `setup:3_nodes_linear ac>!req(id:1 body:ping res:pong)
      abc>req(id:1 body:ping) abc<fwd(ac<res(id:1 body:pong))`);
    // XXX: codding: setup:2_nodes(cd)
    t('timeout', `setup:2_nodes node:c node(d wss)
      ab>!req(id:1 body:ping)ab>req(id:1 body:ping) - 19999ms -
      1ms a<fail(id:1 error:timeout)`);
    t('timeout_3_nodes', `setup:2_nodes node:c node(d wss)
      cd>!connect(find(c dc)) - cb>!req(id:1 body:ping)
      cd>cb>req(id:1 body:ping) - 19999ms - 1ms c<fail(id:1 error:timeout)`);
    t('timeout_wrong_id', `setup:2_nodes
      ab>!req(id:1 body:ping) ab>req(id:1 body:ping)
      ab<!res(id:2 body:pong) ab<res(id:2 body:pong) - 19999ms -
      1ms a<fail(id:1 error:timeout)`);
    // XXX: no_route should fail with error(no_route)
    t('no_route', `setup:2_nodes node:c
      cb>!req(id:1 body:ping) - 19999ms - 1ms c<fail(id:1 error:timeout)`);
    if (false) // XXX: TODO
    t(`ab!>req(id:2 body:ping) ab>req(id:2 body:ping) ab>!disconnect
      ab>disconnect ab<disconnect - 9.9s - 0.1s a<fail(id:2 err:timeout)`);
    // XXX: test continous response and final response (multi-part)
  });
  // XXX: add boostrap support
  describe('2_nodes', function(){
    const t = (name, test)=>t_roles(name, 'ab', test);
    t('long', `node:a node(b wss(port:4000)) ab>!connect(wss !r)
      ab>connect(wss !r) ab<connected ab>find:a ab<find_r:a ab<find:b
      ab>find_r:ba`);
    t('short', `node:a node(b wss) ab>!connect(find(a ba))`);
    t('msg_long', `setup:2_nodes ab>!msg(hi !msg) ab>msg:hi ab<!msg(hi !msg)
      ab<msg:hi`);
    t('msg', `setup:2_nodes ab>!msg:hi ab<!msg:hi`);
    t('wrtc', `node(a wrtc) node(b wrtc wss) - ab>!connect(find(a ba))`);
  });
  // XXX: add boostrap support
  describe('2_nodes', function(){
    const t = (name, test)=>t_roles(name, 'ab', test);
    t('long', `node:a node(b wss(port:4000)) ab>!connect(wss !r)
      ab>connect(wss !r) ab<connected ab>find:a ab<find_r:a ab<find:b
      ab>find_r:ba`);
    t('short', `node:a node(b wss) ab>!connect(find(a ba))`);
    t('msg_long', `setup:2_nodes ab>!msg(hi !msg) ab>msg:hi ab<!msg(hi !msg)
      ab<msg:hi`);
    t('msg', `setup:2_nodes ab>!msg:hi ab<!msg:hi`);
    t('wrtc', `node(a wrtc) node(b wrtc wss) - ab>!connect(find(a ba))`);
  });
  describe('3_nodes', function(){
    const t = (name, test)=>t_roles(name, 'abcs', test);
    // XXX bug: missing ac>connect(wss) - need to fix peer-relay implemention
    // and send supported connections in conn_info so other side can
    // connect directly
    t('linear', `node:a node(b wss) node(c wss) ab>!connect(find(a ba)) -
      bc>!connect(find(b cab)) abc<conn_info:r`);
    t('linear_msg', `setup:3_nodes_linear ab>!msg:hi - ab<!msg:hi -
      abc>!msg:hi - abc<!msg:hi - bc>!msg:hi - bc<!msg:hi`);
    t('linear_wrtc', `node(a wrtc) node(b wrtc wss) node(c wrtc wss) -
      ab>!connect(find(a ba)) - bc>!connect(find(b cab)) abc<conn_info(r:wrtc)
      ca>connect(wrtc find(cab abc))`);
    t('linear_wss', `node(a wss) node(b wss) node(c wss) -
      ab>!connect(find(a ba)) - bc>!connect(find(b cab)) cba>conn_info(r:ws)
      ca>connect(find(cab abc))`);
    t('star', `node(s wss) node:a node(b wss) as>!connect(find(a sa)) -
      bs>!connect(find(bas sab)) bsa>conn_info:r`);
    t('star_wss', `node(s wss) node(a wss) node(b wss) -
      as>!connect(find(a sa)) - bs>!connect(find(bas sab)) bsa>conn_info(r:ws)
      ba>connect(find(bas abs))`);
  });
  describe('4_nodes', function(){
    const t = (name, test)=>t_roles(name, 'abcd', test);
    t('linear', `setup:3_nodes_linear node(d wss) cd>!connect(find(c dcba))
      dcb>conn_info(r:ws) db>connect(find(dcba badc))
      ba>bd>conn_info_r:ws dba>conn_info:r dcb>fwd(ad<conn_info)`);
    t('linear_msg', `setup:4_nodes_linear ab>!msg:hi - abc>!msg:hi -
      abd>!msg:hi - ba>!msg:hi - ba<!msg:hi - bc>!msg:hi - bd>!msg:hi -
      cba>!msg:hi cd>ca>msg:hi db>ca>msg:hi - dba>!msg:hi
      dcb>fwd(da>msg:hi) - db>!msg:hi - dc>!msg:hi`);
    t('linear_wss', `setup:3_nodes_wss node(d wss) - cd>!connect(find(c dcba))
      dcb>conn_info(r:ws) db>connect(find(dcba badc))
      dba>conn_info dca>conn_info(r:ws) da>connect(find(dcba abcd))
      abd>conn_info_r:ws bad>conn_info_r:ws`);
  });
  // XXX: add disconnect tests
  // BUG: if ac>connected and connection is broken, send will not try to send
  // messages through other peers if connections is broken
});


