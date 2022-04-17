// author: derry. coder: arik.
'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach,afterEach*/
// XXX: need jslint mocha: true
import assert from 'assert';
import Node from './node.js';
import Req from './req.js';
import ReqHandler from './req_handler.js';
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
const assign = Object.assign, s2b = util.buf_from_str, b2s = util.buf_to_str;
const stringify = JSON.stringify, is_number = util.is_number;
function _str(id){ return typeof id=='string' ? id : util.buf_to_str(id); }

// XXX: make it automatic for all node/browser in proc.js
xerr.set_exception_catch_all(true);
process.on('uncaughtException', err=>xerr.xexit(err));
process.on('unhandledRejection', err=>xerr.xexit(err));
xerr.set_exception_handler('test', (prefix, o, err)=>xerr.xexit(err));

let t_nodes = {}, t_msg, t_nonce, t_req, t_cmds, t_i, t_role, t_port=4000;
let t_pre_process, t_cmds_processed, t_mode, t_mode_prev, t_req_id, t_ack;
let t_reprocess;
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

function conn_opts(body){
  let a = [];
  if (body.ws)
    a.push('ws');
  if (body.wrtc)
    a.push('wrtc');
  return a.join(' ');
}

function conn_opts_from_node(node){
  let a = [];
  node = typeof node=='string' ? t_nodes[node] : node;
  if (support_wss(node))
    a.push('ws');
  if (support_wrtc(node))
    a.push('wrtc');
  return a.join(' ');
}

// non-number req_id is set explicit in test
function test_req_id(req_id){ return is_number(req_id) ? undefined : req_id; }

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
    if (args[i] || args[i]===0)
      arg += (arg ? ' ' : '')+args[i];
  }
  let ret = cmd+(arg ? '('+arg+')' : '');
  return fwd ? fwd+'fwd('+ret+')' : ret;
}

// build_cmd(cmd, ...)
function build_cmd(){
  let a = Array.from(arguments);
  a.splice(1, 0, ''); // fwd: ''
  return _build_cmd.apply(this, a);
}

function build_cmd_o(cmd, fwd, o){
  if (o===undefined)
  {
    o = fwd;
    fwd = '';
  }
  let a = [cmd, fwd];
  for (let arg in o){
    let val = o[arg];
    if (val===true)
      a.push(arg);
    else if (val || val===0)
      a.push(build_cmd(arg, val));
  }
  return _build_cmd.apply(this, a);
}

function rev_cmd(sd, cmd, arg){ return build_cmd(rev_trim(sd)+cmd, arg); }

function dir_str(s, d, dir){ return dir=='>' ? s+d+'>' : d+s+'<'; }
function dir_c(c){ return dir_str(c.s, c.d, c.dir); }
function rev_c(c){ return rev_trim(dir_str(c.s, c.d, c.dir)); }

function loop_str(loop){
  let s = loop[0].s;
  loop.forEach(o=>s+=o.d);
  return s;
}

function rev_loop_str(loop){
  let s = loop[loop.length-1].d;
  for (let i=loop.length-1; i>=0; i--)
    s += loop[i].s;
  return s;
}

function set_orig(c, orig){
  c.meta.orig = c.orig;
  c.orig = orig;
}

function _push_cmd(a){
  assert(t_pre_process, 'push_cmd only allowed in pre pre_process');
  t_cmds.splice(t_i, 0, ...a);
}

function push_cmd(cmd){ _push_cmd(xtest.test_parse(cmd)); }
function set_push_cmd(c, cmd){
  let a = xtest.test_parse(cmd);
  if (!a.length)
    return;
  t_cmds[t_i-1] = a[0];
  a.shift();
  _push_cmd(a);
  t_reprocess = true;
}

function is_fake(p){ return t_role!=p; }

function wss_from_node(node){ return util.get(node, 't.wss.url'); }

function node_from_url(url){
  for (let name in t_nodes){
    let node = t_nodes[name];
    if (node.t.wss && wss_from_node(node)==url)
      return node;
  }
}

function support_wss(node){ return !!wss_from_node(node); }
function support_wrtc(node){ return node.wrtcConnector.supported; }

function node_from_id(id){
  for (let name in t_nodes){
    let node = t_nodes[name];
    if (node.t.id == _str(id))
      return node;
  }
}

function assert_bool(val){
  assert(!val);
  return true;
}

function assert_int(val){
  assert(/^[0-9]+$/.test(val), 'invalid int '+val);
  return parseInt(val);
}

function assert_ack(val){
  if (!val)
    return [];
  let a = val.split(',');
  util.forEach(a, ack=>assert_int(ack));
  return a;
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

function assert_support_wrtc(name){
  assert(support_wrtc(t_nodes[name]), 'node '+name+' does not support wrtc');
  return true;
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

// XXX: rm
function assert_event_c(c, event, call){
  if (call)
    return assert(!event, 'unexpected event '+event+' for call '+c.orig);
  if (event){
    let expected = c.fwd ? build_cmd(c.fwd+'fwd', normalize(c.orig)) : c.orig;
    assert_event(event, expected);
  }
  else
    assert_missing_event(c);
}

function assert_event_c2(c, orig, fwd, event, call){
  if (call)
    return assert(!event, 'unexpected event '+event+' for call '+orig);
  if (event){
    let expected = fwd ? build_cmd(fwd+'fwd', normalize(orig)) : orig;
    assert_event(event, expected);
  }
  else
    assert_missing_event(c);
}

function assert_missing_event(c){
  let s = t_nodes[c.s], d = t_nodes[c.d];
  if (c.fwd)
    s = c.fwd[2]=='>' ? t_nodes[c.fwd[0]] : t_nodes[c.fwd[1]];
  if (c.cmd[0]=='*' && (t_mode.msg || !t_mode.req))
    assert(!s.t.fake || !d || d.t.fake, 'missing event for '+c.orig);
  else
    assert(s.t.fake, 'missing event for '+c.fwd+' '+c.orig);
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

// XXX: unite with track_msg
function track_seq_req(s, d, id, cmd, type, seq, call){
  if (!t_req[id])
    t_req[id] = {s, d, id, cmd, req: {seq: 0}};
  else if (/req_next|req_end/.test(type) && !t_req[id].req.call)
    t_req[id].req.seq++;
  assert(s==t_req[id].s, 'invalid s '+s+'!='+t_req[id].s+' req '+id);
  assert(d==t_req[id].d, 'invalid d '+d+'!='+t_req[id].d+' req '+id);
  t_req[id].req.call = call;
  return seq===undefined ? t_req[id].req.seq : seq;
}

// XXX: unite with track_msg
function track_seq_res(s, d, id, type, seq, call){
  if (!t_req[id])
    return;
  if (!t_req[id].res)
    t_req[id].res = {seq: 0};
  else if (/res_next|res_end/.test(type) && !t_req[id].res.call)
    t_req[id].res.seq++;
  assert(s==t_req[id].d, 'invalid s '+s+'!='+t_req[id].d+' req '+id);
  assert(d==t_req[id].s, 'invalid d '+d+'!='+t_req[id].s+' req '+id);
  t_req[id].res.call = call;
  return seq===undefined ? t_req[id].res.seq : seq;
}

function ack_hash(s, d, req_id){ return s+'_'+d+'_'+req_id; }

// XXX: unite with nonce and use t_req instead of t_ack/t_msg
function track_msg(msg){
  if (!msg.req_id)
    return;
  let s = node_from_id(msg.from).t.name, d = node_from_id(msg.to).t.name;
  let {type, req_id, cmd, seq} = msg;
  assert(is_number(msg.seq), 'req/res must have seq '+stringify(msg));
  cmd = cmd||'';
  xerr.notice('*** track_msg %s%s> id:%s type:%s cmd:%s', s, d, req_id, type,
    cmd);
  let h = s+'_'+d+'_'+cmd;
  t_msg[h] = req_id;
  xerr.notice('*** track_ack %s%s> id:%s seq:%s', s, d, req_id, seq);
  h = ack_hash(s, d, req_id);
  t_ack[h] = t_ack[h]||[];
  if (!t_ack[h].includes(seq))
    t_ack[h].push(seq);
}

function get_req_id(o){
  let {s, d, cmd} = o, h = s+'_'+d+'_'+cmd;
  return t_msg[h];
}

function get_ack(o){
  let {s, d, req_id, keep} = o;
  let h = ack_hash(s, d, req_id), ack = t_ack[h];
  if (!ack)
    return;
  xerr.notice('*** get_ack %s%s> id:%s ack:%s keep %s',
    s, d, req_id, ack.join(','), keep);
  if (!keep)
    delete t_ack[h];
  return ack;
}

class FakeNode extends EventEmitter {
  constructor(opt){
    super();
    this.wallet = new Wallet({keys: opt.keys});
    this.id = opt.keys.pub;
    this.wsConnector = new FakeWsConnector(this.id, opt.port, opt.host);
    this.wrtcConnector = new FakeWrtcConnector(this.id, null, opt.wrtc);
  }
  destroy(){}
}

class FakeWsConnector extends EventEmitter {
  constructor(id, port, host){
    super();
    this.id = id;
    if (port || host){
      assert(host, 'missing host');
      assert(port, 'missing port');
      this.url = 'wss://'+host+':'+port;
    }
  }
  connect = url=>etask({'this': this}, function*connect(){
    let _this = this.this;
    let d = node_from_url(url), s = node_from_id(_this.id);
    assert(d, 'node not found for url '+url);
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
    assert(!t_pre_process, 'invalid send during pre_process');
    // XXX: need to filter out only test commands, other should fail test
    if (!t_mode.msg)
      return;
    let fwd, e;
    let {req_id, type, cmd, ack, seq, body} = msg;
    cmd = cmd||'';
    let from = node_from_id(msg.from), to = node_from_id(msg.to);
    let s = node_from_id(this.localID), d = node_from_id(this.id);
    if (s!=from || d!=to)
      fwd = s.t.name+d.t.name+'>';
    xerr.notice('*** send%s msg %s %s', fwd ? ' '+fwd : '',
      from.t.name+to.t.name+'>'+cmd, stringify(msg));
    return etask(function*send(){
      assert(type, 'unexpected msg type '+type);
      if (type=='req')
      {
        switch (cmd){
        case 'find': body = node_from_id(body.id).t.name; break;
        case 'conn_info': body= ''; break;
        case '': break;
        default: assert(0, 'invalid cmd '+cmd);
        }
      }
      else if (type=='res'){
        switch (cmd){
        case 'find': body = array_id_to_name(body.ids).join(''); break;
        case 'conn_info': body = conn_opts(body); break;
        case '': break;
        default: assert(0, 'invalid cmd ', cmd);
        }
      }
      e = build_cmd_o(from.t.name+to.t.name+'>msg', {id: test_req_id(req_id),
        type, cmd, seq, ack: ack && ack.join(','), body});
      assert(msg.nonce, 'missing msg nonce %s', JSON.stringify(msg));
      t_nonce[normalize(e)] = msg.nonce;
      track_msg(msg);
      yield cmd_run_if_next_fake();
      yield cmd_run(_build_cmd(e, fwd, ''));
    });
  };
  destroy(){}
}

function req_hook(msg){
  // XXX: need to filter out only test commands, other should fail test
  if (!t_mode.req || !t_mode.msg)
    return;
  assert(!t_pre_process, 'invalid send during pre_process');
  let p, e;
  let {type, req_id, seq, ack, cmd, body} = msg;
  assert(['req', 'req_start', 'req_next', 'req_end'].includes(type),
    'invalid msg type '+type);
  cmd = cmd||'';
  let from = node_from_id(msg.from), to = node_from_id(msg.to);
  xerr.notice('*** req_send_hook %s %s',
    from.t.name+to.t.name+'>'+cmd, stringify(msg));
  switch (cmd){
  case 'find':
    p = node_from_id(body.id);
    e = build_cmd(from.t.name+to.t.name+'>*find', p.t.name);
    break;
  case 'conn_info':
    e = build_cmd(from.t.name+to.t.name+'>*conn_info', '');
    break;
  case '':
  case 'test':
    e = build_cmd_o(from.t.name+to.t.name+'>*'+type,
      {id: test_req_id(req_id), seq, ack: ack && ack.join(','), cmd, body});
    break;
  default: assert(0, 'invalid cmd '+cmd);
  }
  assert(msg.nonce, 'missing msg nonce %s', JSON.stringify(msg));
  t_nonce[normalize(e)] = msg.nonce; // XXX: rm, mv to track_msg
  track_msg(msg);
  cmd_run(_build_cmd(e, '', ''));
}

// XXX NOW: rm it
function req_send_hook(msg){
  // XXX: need to filter out only test commands, other should fail test
  if (!t_mode.req || t_mode.msg)
    return;
  assert(!t_pre_process, 'invalid send during pre_process');
  let p, e;
  let {type, req_id, seq, ack, cmd, body} = msg;
  assert(['req', 'req_start', 'req_next', 'req_end'].includes(type),
    'invalid msg type '+type);
  cmd = cmd||'';
  let from = node_from_id(msg.from), to = node_from_id(msg.to);
  xerr.notice('*** req_send_hook %s %s',
    from.t.name+to.t.name+'>'+cmd, stringify(msg));
  switch (cmd){
  case 'find':
    p = node_from_id(body.id);
    e = build_cmd(from.t.name+to.t.name+'>*find', p.t.name);
    break;
  case 'conn_info':
    e = build_cmd(from.t.name+to.t.name+'>*conn_info', '');
    break;
  case '':
  case 'test':
    e = build_cmd_o(from.t.name+to.t.name+'>*'+type,
      {id: test_req_id(req_id), seq, ack: ack && ack.join(','), cmd, body});
    break;
  default: assert(0, 'invalid cmd '+cmd);
  }
  assert(msg.nonce, 'missing msg nonce %s', JSON.stringify(msg));
  t_nonce[normalize(e)] = msg.nonce; // XXX: rm, mv to track_msg
  track_msg(msg);
  cmd_run_if_next_fake();
  cmd_run(_build_cmd(e, '', ''));
}

function res_hook(msg){
  if (!t_mode.req || !t_mode.msg)
    return;
  assert(!t_pre_process, 'invalid send during pre_process');
  let e, a;
  let {type, req_id, seq, ack, cmd, body} = msg;
  assert(['res', 'res_start', 'res_next', 'res_end'].includes(type),
    'invalid msg type '+type);
  cmd = cmd||'';
  let from = node_from_id(msg.from), to = node_from_id(msg.to);
  xerr.notice('*** res_send_hook %s %s',
    from.t.name+to.t.name+'>'+cmd, stringify(msg));
  switch (cmd){
  case 'find':
    a = array_id_to_name(body.ids);
    e = build_cmd(from.t.name+to.t.name+'>*find_r', a.join(''));
    break;
  case 'conn_info':
    e = build_cmd(from.t.name+to.t.name+'>*conn_info_r', conn_opts(body));
    break;
  case 'test':
  case '':
    e = build_cmd_o(from.t.name+to.t.name+'>*'+type, {id: test_req_id(req_id),
      seq, ack: ack && ack.join(','), cmd, body});
    break;
  default: assert(0, 'invalid cmd '+cmd);
  }
  assert(msg.nonce, 'missing msg nonce %s', JSON.stringify(msg));
  t_nonce[normalize(e)] = msg.nonce; // XXX: rm
  track_msg(msg);
  cmd_run(_build_cmd(e, '', ''));
}

// XXX NOW: rm it
function res_send_hook(router, msg){
  if (!t_mode.req || t_mode.msg)
    return;
  assert(!t_pre_process, 'invalid send during pre_process');
  let e, a;
  let {type, req_id, seq, ack, cmd, body} = msg;
  assert(['res', 'res_start', 'res_next', 'res_end'].includes(type),
    'invalid msg type '+type);
  cmd = cmd||'';
  let from = node_from_id(msg.from), to = node_from_id(msg.to);
  xerr.notice('*** res_send_hook %s %s',
    from.t.name+to.t.name+'>'+cmd, stringify(msg));
  switch (cmd){
  case 'find':
    a = array_id_to_name(body.ids);
    e = build_cmd(from.t.name+to.t.name+'>*find_r', a.join(''));
    break;
  case 'conn_info':
    e = build_cmd(from.t.name+to.t.name+'>*conn_info_r', conn_opts(body));
    break;
  case 'test':
  case '':
    e = build_cmd_o(from.t.name+to.t.name+'>*'+type, {id: test_req_id(req_id),
      seq, ack: ack && ack.join(','), cmd, body});
    break;
  default: assert(0, 'invalid cmd '+cmd);
  }
  assert(msg.nonce, 'missing msg nonce %s', JSON.stringify(msg));
  t_nonce[normalize(e)] = msg.nonce; // XXX: rm
  track_msg(msg);
  cmd_run_if_next_fake();
  cmd_run(_build_cmd(e, '', ''));
}

function new_res_hook(res){
  let s = res.node;
  res.on('fail', o=>cmd_run(build_cmd_o(s.t.name+'>*fail',
    {id: o.req_id, seq: o.seq, error: o.error})));
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
    return xerr('no channel '+s+d+'>');
  yield t_nodes[d].router._on_channel_msg(msg);
});

function fake_emit(c, msg){
  if (!t_mode.req)
    return;
  if (t_mode.msg) // XXX: TODO
    return;
  let s = t_nodes[c.s], d = t_nodes[c.d], f = s, t = d;
  let to = b2s(d.id), from = b2s(s.id);
  let nonce = t_nonce[normalize(c.orig)] = t_nonce[normalize(c.orig)]||
    ''+Math.floor(1e15 * Math.random());
  assign(msg, {to, from, nonce, path: [from]});
  if (!msg.seq && ['req', 'res'].includes(msg.type))
    msg.seq = 0;
  assert(!c.fwd, 'fwd not allowed in fake_emit');
  if (s.t.fake && !d.t.fake)
  {
    if (['req', 'req_start', 'req_next', 'req_end'].includes(msg.type))
      msg.req_id = msg.req_id || ++t_req_id+'';
    else if (['res', 'res_start', 'res_next', 'res_end'].includes(msg.type)){
      if (node_from_id(msg.from).t.fake && !node_from_id(msg.to).t.fake){
        msg.req_id = msg.req_id||get_req_id({s: t.t.name, d: f.t.name,
          cmd: msg.cmd});
      }
    }
    else
      assert(0, 'invalid type '+msg.type);
    assert(msg.req_id, 'missing req_id');
    msg.sign = node_from_id(from).wallet.sign(msg);
    track_msg(msg);
    if (['req', 'req_start', 'req_next', 'req_end'].includes(msg.type))
      ReqHandler.t.req_handler_cb(msg);
    else
      Req.t.res_handler(msg);
  }
}

const fake_send_msg = (c, msg)=>etask(function*(){
  let s = t_nodes[c.s], d = t_nodes[c.d], f = s, t = d;
  let to = b2s(d.id), from = b2s(s.id);
  let nonce = t_nonce[normalize(c.orig)] = t_nonce[normalize(c.orig)]||
    ''+Math.floor(1e15 * Math.random());
  assign(msg, {to, from, nonce, path: [from]});
  if (c.fwd){
    let fwd = normalize(c.fwd);
    s = t_nodes[fwd[0]];
    d = t_nodes[fwd[1]];
    msg.path = [b2s(s.id)];
  }
  if (s.t.fake && !d.t.fake)
  {
    if (msg.type=='req')
      msg.req_id = msg.req_id || ++t_req_id+'';
    else if (msg.type=='res')
    {
      if (node_from_id(msg.from).t.fake && !node_from_id(msg.to).t.fake){
        msg.req_id = msg.req_id||get_req_id({s: t.t.name, d: f.t.name,
          cmd: msg.cmd});
      }
    }
    msg.sign = node_from_id(from).wallet.sign(msg);
    track_msg(msg);
    yield send_msg(s.t.name, d.t.name, msg);
  }
});

const cmd_ensure_no_events = opt=>etask(function*cmd_ensure_no_events(){
  let event = util.get(opt, 'event');
  assert(!event, 'unexpected event '+event);
  if (t_pre_process)
    return;
  if (0) // XXX HACK: make test very slow
    yield xsinon.wait();
  else {
    for (let i=0; i<100; i++)
      yield xsinon.tick();
  }
});

function cmd_mode(opt){
  let {c, event} = opt, arg = xtest.test_parse(c.arg);
  let mode = {req: false, msg: false}, pop;
  assert(!event, 'got unexpected '+event);
  util.forEach(arg, m=>{
    switch (m.cmd){
    case 'req': mode.req = true; break;
    case 'msg': mode.msg = true; break;
    case 'pop': pop = true; break;
    default: assert(0, 'invalid mode '+m.cmd);
    }
  });
  assert(!pop || !mode.req && !mode.msg, 'invalid pop '+c.orig);
  if (pop){
    assert(t_mode_prev.length>0, 'invalid pop');
    t_mode = t_mode_prev.pop();
  }
  else {
    t_mode_prev.push(t_mode);
    t_mode = mode;
  }
  test_setup_mode();
}

function cmd_conf(opt){
  let {c, event} = opt, arg = xtest.test_parse(c.arg);
  assert(!event, 'got unexpected '+event);
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'find_sorted': set_find_sorted(true); break;
    case 'peers_optimal': Node.t_peers_optimal = assert_int(a.arg); break;
    default: assert(0, 'invalid conf '+a.cmd);
    }
  });
}

function cmd_setup(opt){
  let {c, event} = opt, arg = xtest.test_parse(c.arg);
  let M = s=>push_cmd(s+' - ');
  assert(!event);
  if (!t_pre_process)
    return;
  // XXX: proper assert setup params
  util.forEach(arg, m=>{
    switch (m.cmd){
    case '2_nodes':
      M(`mode:req a=node b=node(wss) - ab>!connect(find(a ba)) mode:pop`);
      break;
    case '2_nodes_wss':
      M(`mode(msg req) a=node(wss) b=node(wss) ab>!connect(find(a ba))
        mode:pop`);
      break;
    case '3_nodes_linear':
      M(`mode:req node:a b=node(wss) c=node(wss)
        ab>!connect(find(a ba)) - bc>!connect(find(b cab)) ac<*conn_info
        ac>*conn_info_r mode:pop`);
      break;
    case '3_nodes_wss':
      M(`mode(msg req) setup(2_nodes_wss) c=node(wss) bc>!connect(find(b cab))
        abc<conn_info ac<connect(find(cab abc)) mode:pop`);
       break;
    case '4_nodes_wss':
      M(`mode(msg req) setup(3_nodes_wss) d=node(wss)
      cd>!connect(find(c dcba)) bcd<conn_info db>connect(find(dcba badc))
      dba>conn_info da>connect(find(dcba abcd))`);
      break;
    default: assert(false, 'unknown macro '+m.cmd);
    }
  });
}

function cmd_node(opt){
  let {c} = opt;
  let arg = xtest.test_parse(c.arg);
  let name, wss, wrtc, bootstrap;
  if (c.dir=='=')
    name = c.s;
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
  if (t_pre_process){
    let o = {};
    o[name] = true;
    set_orig(c, build_cmd_o('node', assign(o, {wss: !!wss, wrtc: !!wrtc})));
  }
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
    case 'wss': wss = assert_wss_url(c.d, a.arg); break;
    case 'wrtc': wrtc = assert_support_wrtc(d.t.name); break;
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
  if (!wss && !wrtc && util.xor(support_wss(d), support_wrtc(d))){
    wss = wss_from_node(d);
    wrtc = support_wrtc(d);
  }
  assert_exist(c.s);
  assert(wss || wrtc, 'must specify wss or wrtc');
  assert(find ? r : true, 'find must be used together with r');
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
        if (t_mode.msg && t_mode.req){
          let s = c.s+c.d+'<connected ';
          if (find){
            s += build_cmd_o(c.s+c.d+'>msg', {type: 'req', cmd: 'find',
              body: c.s});
            s += build_cmd(c.s+c.d+'>*find', c.s);
            s += build_cmd_o(c.s+c.d+'<msg', {type: 'res', cmd: 'find',
              body: find[0]});
            s += build_cmd(c.s+c.d+'<*find_r', find[0]);
            s += build_cmd_o(c.s+c.d+'<msg', {type: 'req', cmd: 'find',
              body: c.d});
            s += build_cmd(c.s+c.d+'<*find', c.d);
            s += build_cmd_o(c.s+c.d+'>msg', {type: 'res', cmd: 'find',
              body: find[1]});
            s += build_cmd(c.s+c.d+'>*find_r', find[1]);
          }
          push_cmd(s);
        } else {
          push_cmd(c.s+c.d+'<connected'+(find ? ' '+
            build_cmd(c.s+c.d+'>*find', c.s+' '+build_cmd('r', find[0]))+' '+
            build_cmd(c.s+c.d+'<*find', c.d+' '+build_cmd('r', find[1])) :
            ''));
        }
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
  let {c, event} = opt;
  assert_event_c(c, event);
  if (t_pre_process)
    return;
  yield cmd_run_if_next_fake();
});

const cmd_find = opt=>etask(function cmd_find(){
  let {c, event} = opt, s = t_nodes[c.s];
  let basic = !/[*!]/.test(c.cmd[0]);
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
    if (basic){
      if (t_mode.req && t_mode.msg){
        set_orig(c, build_cmd_o(c.s+c.d+'>msg',
          {type: 'req', cmd: 'find', body: peers}));
        push_cmd(build_cmd(c.s+c.d+'>*find', peers));
      } else if (t_mode.msg){
        set_orig(c, build_cmd_o(c.s+c.d+'>msg',
          {type: 'req', cmd: 'find', body: peers}));
      } else
        set_orig(c, build_cmd(c.s+c.d+'>*find', peers));
    } else {
      if (r)
        push_cmd(rev_cmd(c.orig, '*find_r', r));
      set_orig(c, build_cmd(c.meta.cmd, peers));
    }
    return;
  }
  assert_event_c(c, event);
  fake_emit(c, {type: 'req', cmd: 'find', body: {id: _str(s.id)}});
});

const cmd_find_r = opt=>etask(function cmd_find_r(){
  let {c, event} = opt, basic = !/[*!]/.test(c.cmd[0]);
  if (t_pre_process)
  {
    if (basic){
      if (t_mode.msg && t_mode.req){
        set_orig(c, build_cmd_o(c.s+c.d+'>msg',
          {type: 'res', cmd: 'find', body: c.arg}));
        push_cmd(build_cmd(c.s+c.d+'>*find_r', c.arg));
      } else if (t_mode.msg){
        set_orig(c, build_cmd_o(c.s+c.d+'>msg',
          {type: 'res', cmd: 'find', body: c.arg}));
      }
      else
        set_orig(c, build_cmd(c.s+c.d+'>*find_r', c.arg));
    }
    else
      set_orig(c, build_cmd(c.meta.cmd, c.arg));
    return;
  }
  let ids = array_name_to_id(c.arg.split(''));
  assert_event_c(c, event);
  fake_emit(c, {type: 'res', cmd: 'find', body: {ids}});
});

const cmd_conn_info = opt=>etask(function cmd_conn_info(){
  let {c, event} = opt, r, nr, basic = !/[*!]/.test(c.cmd[0]);
  let arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd){
    case '!r': nr = true; break;
    case 'r':
      assert(!r, 'invalid '+c.orig);
      r = a.arg||'';
      break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  if (t_pre_process){
    if (basic){
      if (t_mode.req && t_mode.msg){
        // XXX: fix extending loops to be inside cmd_conn_info and cleanup mess
        set_orig(c, build_cmd_o(c.s+c.d+'>msg',
          {type: 'req', cmd: 'conn_info'}));
        if (!nr && r===undefined)
          r = conn_opts_from_node(c.d);
        if (c.orig_loop && r!==undefined){
          _push_cmd(extend_loop_rev(c.orig_loop,
            rev_cmd(c.orig, 'msg', build_cmd('type', 'res')+' '+
            build_cmd('cmd', 'conn_info')+(r ? ' '+build_cmd('body', r) : '')))
            .concat(xtest.test_parse(build_cmd(c.s+c.d+'<*conn_info_r', r)))
            );
        }
        if (c.orig_loop || !c.had_loop)
          push_cmd(build_cmd(c.s+c.d+'>*conn_info'));
      }
      return;
    }
    if (r!==undefined){
      if (c.orig_loop){
        _push_cmd(extend_loop_rev(c.orig_loop,
          rev_cmd(c.orig, '*conn_info_r', r)));
      }
      else if (!c.had_loop){
        push_cmd(build_cmd(rev_trim(c.fwd)+'fwd',
          rev_cmd(c.orig, '*conn_info_r', r)));
      }
    }
    set_orig(c, build_cmd(c.meta.cmd));
    return;
  }
  assert_event_c(c, event);
  fake_emit(c, {type: 'req', cmd: 'conn_info', body: {}});
});

const cmd_conn_info_r = opt=>etask(function cmd_conn_info_r(){
  let {c, event} = opt, s = t_nodes[c.s], basic = !/[*!]/.test(c.cmd[0]);
  let arg = xtest.test_parse(c.arg), ws, wrtc;
  util.forEach(arg, a=>{
    switch (a.cmd){
    // XXX: assert and verify ws is correct url
    case 'ws': ws = wss_from_node(s); break;
    case 'wrtc': wrtc = assert_wrtc(a.arg); break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  if (t_pre_process){
    if (basic){
      let o = {ws: !!ws, wrtc: !!wrtc};
      let s = '';
      if (c.loop){
        s += t_mode.msg ? build_cmd(loop_str(c.loop)+'>fwd',
          build_cmd_o(dir_c(c)+'msg', {type: 'res', cmd: 'conn_info',
          body: conn_opts(o)})) : '';
      } else {
       s += t_mode.msg ? build_cmd_o(dir_c(c)+'msg',
         {type: 'res', cmd: 'conn_info', body: conn_opts(o)}) : '';
     }
     s += t_mode.req ? (s ? ' ' : '')+build_cmd_o(c.s+c.d+'>*conn_info_r', o)
       : '';
     set_push_cmd(c, s);
    }
    else
      set_orig(c, build_cmd(c.meta.cmd, c.arg));
    return;
  }
  assert_event_c(c, event);
  fake_emit(c, {type: 'res', cmd: 'conn_info', body: {ws, wrtc}});
});

const cmd_msg = opt=>etask(function*cmd_msg(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  assert(s && d, 'invalid event '+c.orig);
  let arg = xtest.test_parse(c.arg), body;
  let id, type, cmd, seq, ack, a;
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'id': id = a.arg; break;
    case 'type': type = a.arg; break;
    case 'cmd': cmd = a.arg||''; break;
    case 'ack': ack = assert_ack(a.arg); break;
    case 'seq': seq = assert_int(a.arg); break;
    case 'body': body = a.arg; break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  cmd = cmd||'';
  if (t_pre_process){
    set_orig(c, build_cmd_o(c.meta.cmd, {id, type, cmd, seq, ack, body}));
    return;
  }
  if (ack===undefined && ['req_next', 'req_end', 'res', 'res_start',
    'res_next', 'res_end'].includes(type)){
    let nfwd = normalize(c.fwd);
    ack = get_ack({req_id: id||get_req_id({s: d.t.name, d: s.t.name, cmd}),
      s: d.t.name, d: s.t.name,
      keep: t_mode.req && t_mode.msg || !nfwd || nfwd[1]!=d.t.name});
  }
  if (['req', 'res'].includes(type)) // XXX: need auto-mode for seq
    seq = seq||0;
  assert_event_c2(c, build_cmd_o(c.meta.cmd, {id, type, cmd, seq, ack, body}),
    c.fwd, event, false);
  if (['req', 'res'].includes(type)) // XXX: need auto-mode for seq
    seq = seq||0;
  if (type=='req'){
    switch (cmd){
    case 'find': body = {id: _str(t_nodes[body].id)}; break;
    case 'conn_info': break;
    case '': break;
    default: assert(0, 'invalid cmd '+cmd);
    }
  }
  else if (type=='res'){
    switch (cmd){
    case 'find': body = {ids: array_name_to_id(body.split(''))}; break;
    case 'conn_info':
      a = body ? body.split(' ') : [];
      body = {};
      a.forEach(connector=>{
        if (connector=='wrtc')
          body.wrtc = true;
        else if (connector=='ws')
          body.ws = wss_from_node(s);
        else
          assert(0, 'invalid connector '+connector);
      });
      break;
    case '': break;
    default: assert(0, 'invalid cmd '+cmd);
    }
  }
  yield fake_send_msg(c, {req_id: id, type, seq, ack, cmd, body});
  yield cmd_run_if_next_fake();
});

const cmd_req = opt=>etask(function*req(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d], seq, ack;
  assert(t_pre_process||!c.loop);
  let emit_api=false, ooo=false, dup=false, close=false;
  let call = c.cmd[0]=='!', body, id, res, arg = xtest.test_parse(c.arg), cmd;
  let type = c.cmd.replace(/[!*]/, ''), e=call;
  assert(['req', 'req_start', 'req_next', 'req_end'].includes(type),
    'invalid type '+c.cmd);
  util.forEach(arg, a=>{ // XXX: proper assert of values
    switch (a.cmd){
    case 'id': id = a.arg; break;
    case 'body': body = a.arg; break;
    case '!e': e = !assert_bool(a.arg); break;
    case 'emit_api': emit_api = assert_bool(a.arg); break;
    case 'ooo': ooo = assert_bool(a.arg); break;
    case 'dup': dup = assert_bool(a.arg); break;
    case 'close': close = assert_bool(a.arg); break;
    case 'cmd': cmd = a.arg; break;
    case 'seq': seq = assert_int(a.arg); break;
    case 'ack': ack = assert_ack(a.arg); break;
    case 'res':
      assert(call, 'res only valid for !req');
      res = a.arg;
      break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  assert(call || !e, 'e only avail for call mode');
  assert(!emit_api || call && type=='req_start',
    'emit_api only avail for !req_start');
  cmd = cmd||'';
  if (t_pre_process){
    set_orig(c, build_cmd_o(dir_c(c)+c.cmd, {id, cmd, seq, ack, body, res,
      '!e': !call ? undefined : true, emit_api, ooo, dup, close}));
    if (e){
      let s = '';
      if (c.loop){
        s += t_mode.msg ? build_cmd(loop_str(c.loop)+'>fwd',
          build_cmd_o(dir_c(c)+'msg', {type, id, cmd, seq, ack, body})) : '';
      } else {
       s += t_mode.msg ? build_cmd_o(dir_c(c)+'msg',
         {type, id, cmd, seq, ack, body}) : '';
     }
     s += t_mode.req ? (s ? ' ' : '')+ build_cmd_o(dir_c(c)+'*'+type,
       {id, cmd, seq, ack, body, close}) : '';
     if (res){
        if (c.loop){
          s += t_mode.msg ? (s ? ' ' : '')+
            build_cmd(rev_loop_str(c.loop)+'>fwd', build_cmd_o(rev_c(c)+'msg',
            {type: 'res', id, cmd, body: res})) : '';
        } else {
          s += t_mode.msg ? (s ? ' ' : '')+build_cmd_o(rev_c(c)+'msg',
            {type: 'res', id, cmd, body: res}) : '';
        }
        s += t_mode.req ? (s ? ' ' : '')+build_cmd_o(rev_c(c)+'*res',
          {id, cmd, body: res}) : '';
      }
      push_cmd(s);
    }
    return;
  }
  if (!d){
    assert_event_c2(c, build_cmd_o(c.meta.cmd,
      {id, cmd, seq, ack, body, ooo, dup, close}), c.fwd, event, call);
    return;
  }
  if (!call && ack===undefined){
    ack = get_ack({req_id: id||get_req_id({s: d.t.name, d: s.t.name, cmd}),
      s: d.t.name, d: s.t.name});
  }
  if (call)
    id = id || ++t_req_id+'';
  seq = track_seq_req(s.t.name, d.t.name, id, cmd, type, seq, call);
  cmd = cmd || t_req[id].cmd;
  assert_event_c2(c, build_cmd_o(c.meta.cmd, {id, seq, ack, cmd, body}), c.fwd,
    event, call);
  if (!call){
    fake_emit(c, {type, req_id: id, seq, ack, cmd, body});
    return yield cmd_run_if_next_fake();
  }
  seq = t_req[id].seq;
  if (!s.t.fake){
    if (type=='req'){
      assert(!Req.t.reqs[id], 'req already exists '+id);
      let req = new Req({node: s, dst: b2s(d.id), req_id: id});
      req.on('fail', o=>cmd_run(build_cmd_o(c.s+'>*fail',
        {id: o.req_id, error: o.error})));
      assert.equal(req.req_id, id, 'req_id mismatch');
      req.send({seq, ack}, body);
    } else if (type=='req_start'){
      assert(!Req.t.reqs[id], 'req already exists '+id);
      let req = new Req({node: s, stream: true, dst: b2s(d.id), req_id: id,
        cmd});
      req.on('fail', o=>cmd_run(build_cmd_o(c.s+'>*fail',
        {id: o.req_id, seq: o.seq, error: o.error})));
      if (emit_api){
        let cb = (o, opt)=>cmd_run(build_cmd_o(c.s+'>*'+o.type, {id: o.req_id,
          cmd: o.cmd,
          seq: o.seq, ack: o.ack && o.ack.join(','),
          body: o.body, close: o.close, ooo: opt&&opt.ooo,
          dup: opt&&opt.dup}));
        req.on('res_start', cb);
        req.on('res_next', cb);
        req.on('res_end', cb);
      }
      assert.equal(req.req_id, id, 'req_id mismatch');
      req.send({seq, ack}, body);
    }
    else if (type=='req_next')
      Req.t.reqs[id].req.send({seq, ack}, body);
    else if (type=='req_end'){
      if (close)
          Req.t.reqs[id].req.send_close({seq, ack}, body);
      else
        Req.t.reqs[id].req.send_end({seq, ack}, body);
    }
    else
      assert(0, 'invalid type '+type);
  }
  if (!d.t.fake){
    let req_handler = d.t.req_handler; // XXX: need to hash it by cmd
    if (!req_handler){
      req_handler = new ReqHandler({node: d, cmd});
      d.t.req_handler = req_handler;
      if (emit_api){
        let cb = (o, res, opt)=>cmd_run(build_cmd_o(c.d+'>*'+o.type,
          {id: o.req_id,
          cmd: o.cmd,
          seq: o.seq, ack: o.ack && o.ack.join(','),
          body: o.body, close: o.close, ooo: opt&&opt.ooo,
          dup: opt&&opt.dup}));
        req_handler.on('req_start', (msg, res, opt)=>{
          cb(msg, res, opt);
          if (opt.dup)
            return;
          res.on('req_next', cb);
          res.on('req_end', cb);
        });
      }
    }
    if (res){
      req_handler.on('req', t_req[id].cb = (msg, _res)=>{
        // XXX: need req_handler.destroy();
        req_handler.off('req', t_req[id].cb);
        delete t_req[id].cb;
        _res.send(res);
      });
    }
  }
});

const cmd_res = opt=>etask(function*req(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  assert(t_pre_process||!c.loop);
  let call = c.cmd[0]=='!', body, id, _id, arg = xtest.test_parse(c.arg);
  let type = c.cmd.replace(/[!*]/, ''), cmd='', seq, ack, e=call;
  let ooo=false, dup=false, close=false;
  assert(s, 'invalid event '+c.orig);
  assert(['res', 'res_start', 'res_next', 'res_end'].includes(type),
    'invalid type '+c.cmd);
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'id': id = a.arg; break;
    case '!e': e = !assert_bool(a.arg); break;
    case 'ooo': ooo = assert_bool(a.arg); break;
    case 'dup': dup = assert_bool(a.arg); break;
    case 'close': close = assert_bool(a.arg); break;
    case 'body': body = a.arg; break;
    case 'cmd': cmd = a.arg; break;
    case 'seq': seq = assert_int(a.arg); break;
    case 'ack': ack = assert_ack(a.arg); break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  assert(call || !e, 'e only avail for call mode');
  if (t_pre_process){
    set_orig(c, build_cmd_o(dir_c(c)+c.cmd, {id, cmd, seq, ack,
      body, '!e': !call ? undefined : true, ooo, dup, close}));
    if (e){
      let s = '';
      if (c.loop){
        s = t_mode.msg ? build_cmd(loop_str(c.loop)+'>fwd',
          build_cmd_o(dir_c(c)+'msg', {type, id, cmd, seq, ack, body})) : '';
      } else {
        s = t_mode.msg ? build_cmd_o(dir_c(c)+'msg',
          {type, id, cmd, seq, ack, body}) : '';
      }
      s += t_mode.req ? (s ? ' ' : '')+
        build_cmd_o(dir_c(c)+'*'+type, {id, cmd, seq, ack, body, close}) : '';
      push_cmd(s);
    }
    return;
  }
  if (!d){
    assert_event_c2(c, build_cmd_o(c.meta.cmd,
      {id, cmd, seq, ack, body, ooo, dup, close}), c.fwd, event, call);
    return;
  }
  _id = id||get_req_id({s: d.t.name, d: s.t.name, cmd});
  if (!call && ack===undefined)
    ack = get_ack({req_id: _id, s: d.t.name, d: s.t.name});
  seq = track_seq_res(s.t.name, d.t.name, id, type, seq, call);
  cmd = cmd || t_req[id].cmd;
  assert(seq!==undefined, 'must have seq');
  assert_event_c2(c, build_cmd_o(c.meta.cmd, {id, seq, ack, cmd, body}), c.fwd,
    event, call);
  id = _id;
  if (!call){
    fake_emit(c, {type, req_id: id, seq, ack, cmd, body});
    return yield cmd_run_if_next_fake();
  }
  if (!s.t.fake){
    if (type=='res_end'){
      if (close){
        ReqHandler.t.nodes[b2s(s.id)].req_id[id].res.send_close({seq, ack},
          body);
      }
      else {
        ReqHandler.t.nodes[b2s(s.id)].req_id[id].res.send_end({seq, ack},
          body);
      }
    }
    else
      ReqHandler.t.nodes[b2s(s.id)].req_id[id].res.send({seq, ack}, body);
  }
});

const cmd_fail = opt=>etask(function*req(){
  let {c, event} = opt, s = t_nodes[c.s], d = t_nodes[c.d];
  assert(s && !d, 'invalid event '+c.orig);
  let error, id, seq, arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'id': id = a.arg; break;
    case 'seq': seq = assert_int(a.arg); break;
    case 'error': error = a.arg; break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  assert(id, 'fail missing id');
  assert(error, 'fail missing error');
  if (t_pre_process)
    return set_orig(c, build_cmd_o(c.meta.cmd, {id, seq, error}));
  assert_event_c(c, event);
  yield cmd_run_if_next_fake();
});

const cmd_fwd = opt=>etask(function*cmd_fwd(){
  // XXX NOW: simplify implementation
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
  let ms = assert_int(c.arg);
  yield xsinon.tick(ms);
  yield xsinon.wait();
});

const cmd_run_single = opt=>etask(function*cmd_run_single(){
  let c = opt.c;
  if (t_pre_process){
    let a;
    if ('<>'.includes(c.cmd[2])){ // XXX: ugly code
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
  case '-': yield cmd_ensure_no_events(opt); break;
  case 'setup': yield cmd_setup(opt); break;
  case 'mode': yield cmd_mode(opt); break;
  case 'conf': yield cmd_conf(opt); break;
  case 'node': yield cmd_node(opt); break;
  case '!connect': yield cmd_connect(opt); break;
  case 'connect': yield cmd_connect(opt); break;
  case 'connected': yield cmd_connected(opt); break;
  case 'find': yield cmd_find(opt); break;
  case '*find': yield cmd_find(opt); break;
  case 'find_r': yield cmd_find_r(opt); break;
  case '*find_r': yield cmd_find_r(opt); break;
  case 'conn_info': yield cmd_conn_info(opt); break;
  case '*conn_info': yield cmd_conn_info(opt); break;
  case 'conn_info_r': yield cmd_conn_info_r(opt); break;
  case '*conn_info_r': yield cmd_conn_info_r(opt); break;
  case 'msg': yield cmd_msg(opt); break;
  case 'fwd': yield cmd_fwd(opt); break;
  case '!req': yield cmd_req(opt); break;
  case '*req': yield cmd_req(opt); break;
  case '!req_start': yield cmd_req(opt); break;
  case '*req_start': yield cmd_req(opt); break;
  case '!req_next': yield cmd_req(opt); break;
  case '*req_next': yield cmd_req(opt); break;
  case '!req_end': yield cmd_req(opt); break;
  case '*req_end': yield cmd_req(opt); break;
  case '!res': yield cmd_res(opt); break;
  case '*res': yield cmd_res(opt); break;
  case '!res_start': yield cmd_res(opt); break;
  case '*res_start': yield cmd_res(opt); break;
  case '!res_next': yield cmd_res(opt); break;
  case '*res_next': yield cmd_res(opt); break;
  case '!res_end': yield cmd_res(opt); break;
  case '*res_end': yield cmd_res(opt); break;
  case '*fail': yield cmd_fail(opt); break;
  case 'ms': yield cmd_ms(opt); break;
  default: assert(false, 'unknown cmd '+c.cmd+ ' '+c.orig);
  }
});

// XXX NOW: need test
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
  if (next && next.s && next.cmd[0]=='*' && (t_mode.msg || !t_mode.req)){
    if (!t_nodes[next.d].t.fake)
      return;
    return yield cmd_run();
  }
  if (!next || !next.s || !t_nodes[next.s].t.fake)
    return;
  yield cmd_run();
});

let t_depth = 0;
const cmd_run = event=>etask(function*cmd_run(){
  assert(t_cmds && t_i<t_cmds.length, event ? 'unexpected event '+event :
    'invalid t_i '+t_i+' event');
  let c = t_cmds[t_i];
  assert(c, event ? 'unexpected event '+event : 'empty cmd at '+t_i);
  // XXX NOW: rm this temporary cod and move into each cmd
  if (t_pre_process && c.cmd[0]!='!' && c.cmd!='conn_info_r'){
    assert.equal(t_depth, 0);
    if (c.loop)
      c = extend_loop(c);
  }
  xerr.notice('%scmd %s: %s%s orig %s', ' '.repeat(t_depth), t_i,
    c.s ? build_cmd(c.s+c.d+'>'+c.cmd, c.arg) : c.orig,
    event ? ' event '+event : '', c.orig);
  t_i++;
  t_depth++;
  t_reprocess = false;
  yield cmd_run_single({c, event});
  if (t_pre_process){
    if (t_reprocess)
      t_i--;
    else
      t_cmds_processed.push(assign({}, c));
  }
  t_depth--;
});

function test_start(role){
  t_role = role;
  t_port = 4000;
  assert(!Object.keys(t_nodes).length, 'nodes exists on test start '+
    stringify(Object.keys(t_nodes)));
  t_mode = {msg: true, req: true};
  t_mode_prev = [];
  t_req_id = 0;
  t_ack = {};
  t_msg = {};
  t_cmds = undefined;
  t_cmds_processed = [];
  t_nonce = {};
  t_req = {};
  set_find_sorted(false);
  Node.t_peers_optimal = undefined;
}

function set_find_sorted(sorted){
  Node.t_find_sort = sorted ? function(a, b){
    return node_from_id(a.id).t.name.localeCompare(node_from_id(b.id).t.name);
  } : null;
}

function test_setup_mode(){
  if (t_mode.req){
    Req.t_send_hook = req_send_hook;
    ReqHandler.t_send_hook = res_send_hook;
    Req.t.res_hook = res_hook;
    ReqHandler.t.req_hook = req_hook;
  }
  else {
    delete ReqHandler.t_send_hook;
    delete Req.t_send_hook;
    delete Req.t.res_hook;
    delete ReqHandler.t.req_hook;
  }
  ReqHandler.t_new_res_hook = new_res_hook;
  Node.t_conn_info_r_hook = msg=>cmd_run_if_next_fake();
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
  test_setup_mode();
  yield _test_run(role, cmds);
  xsinon.uninit();
});

const test_end = ()=>etask(function*(){
  xerr.notice('*** test_end');
  yield cmd_ensure_no_events();
  assert(t_cmds, 'test not running');
  assert.equal(t_i, t_cmds.length, 'not all cmds run');
  if (!t_pre_process){
    yield xsinon.tick(date.ms.YEAR);
    yield xsinon.wait();
  }
  yield cmd_ensure_no_events();
  for (let n in t_nodes){
    yield t_nodes[n].destroy();
    delete t_nodes[n];
  }
  t_cmds = t_role = t_i = undefined;
  assert(!Object.keys(Req.t.reqs).length, 'req exists on test end '+
    stringify(Object.keys(Req.t.reqs)));
  assert(!Object.keys(ReqHandler.t.nodes).length,
    'req handler node exists on test end '+
    stringify(Object.keys(ReqHandler.t.nodes)));
  xerr.notice('*** test_done');
});

if (!util.is_inspect())
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

describe('wallet', ()=>{
  let key = t_keys.a;
  let keys = {priv: s2b(key.priv), pub: s2b(key.pub)};
  let wallet = new Wallet({keys});
  const t = (o, exp)=>assert.deepEqual(wallet.hash_passthrough(o), exp);
  it('hash_obj', ()=>{
    t({}, 'object:0:');
    t({from: 'a'}, 'object:1:string:4:from:string:1:a,');
    t({from: 'a', body: undefined},
      'object:2:string:4:body:Null,string:4:from:string:1:a,');
    t({path: []}, 'object:0:');
    t({path: ['a']}, 'object:0:');
    t({sign: 's'}, 'object:0:');
  });
  it('sign', ()=>{
    const t = msg=>{
      msg.sign = wallet.sign(msg);
       assert(wallet.verify(msg));
       assert(wallet.verify(msg, msg.sign));
       assert(wallet.verify(msg, msg.sign, keys.pub));
    };
    t({});
    t({path: []});
    t({from: 'a'});
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
        yield t('node(a) node(b) ab>fwd(ab>*conn_info(r))', ab.concat([
          {s: 'a', d: 'b', dir: '>', cmd: 'fwd', arg: 'ab>*conn_info(r)'},
          {s: 'b', d: 'a', dir: '<', cmd: 'fwd', arg: 'ab<*conn_info_r'},
        ]));
        yield t('node(a) node(b) ab,ba>fwd(ab>*conn_info(r))', ab.concat([
          {cmd: 'fwd', arg: 'ab>*conn_info(r)', s: 'a', d: 'b', dir: '>',
            had_loop: true, loop_first: true},
          {cmd: 'fwd', arg: 'ab>*conn_info(r)', s: 'b', d: 'a', dir: '>',
          had_loop: true, orig_loop:
          [{s: 'a', d: 'b', dir: '>'}, {s: 'b', d: 'a', dir: '>'}]},
          {s: 'a', d: 'b', dir: '<', cmd: 'fwd', arg: 'ab<*conn_info_r'},
          {s: 'b', d: 'a', dir: '<', cmd: 'fwd', arg: 'ab<*conn_info_r'},
        ]));
      }));
      describe('shortcut', ()=>{
        const _t = (mode, test, exp)=>it(mode+(mode ? ' ': '')+test,
          ()=>etask(function*(){
          test_start();
          mode = mode||'mode(req)';
          let setup = 'node(a wss) node(b wss) node(c wss) node(d wss) '+
            'node(e wss) node(f wss) '+(mode ? mode+' ' : '');
          let regex = new RegExp('^'+xescape.regex(setup));
          let res = yield test_pre_process(setup+test);
          assert.equal(test_to_str(res).replace(regex, ''),
            string.split_ws(exp).join(' '));
        }));
        const t = (test, exp)=>_t('', test, exp);
        t('1ms', `ms(1)`);
        t('12ms', `ms(12)`);
        t('1s', `ms(1000)`);
        t('12s', `ms(12000)`);
        t('s=node(wss)', `node(s wss)`);
        t('ab>connect(wss !r)', `ab>connect(wss !r)`);
        t('ab>connect(!r)', `ab>connect(wss !r)`);
        t('ab>connect', `ab>connect(wss !r) ab<connected`);
        t('ab>!connect(wss !r)', `ab>!connect(wss !r)`);
        t('ab>!connect(!r)', `ab>!connect(wss !r)`);
        t('ab>!connect', `ab>!connect(wss !r) ab>connect(wss !r)
          ab<connected`);
        t('ab>!connect(find(c d))', `ab>!connect(wss !r) ab>connect(wss !r)
          ab<connected ab>*find(a) ab<*find_r(c) ab<*find(b) ab>*find_r(d)`);
        t('ab>*find(a)', `ab>*find(a)`);
        t('ab>*find(a r(c))', `ab>*find(a) ab<*find_r(c)`);
        t('ab>fwd(ab>*find(a))', `ab>fwd(ab>*find(a))`);
        t('ab>*find:a', `ab>*find(a)`);
        t('ab<*find_r:a', `ab<*find_r(a)`);
        if (0){ // XXX NOW: rewrite (and/or make find shortcut for msg
        t('ab,bc>fwd(ac>*find(a))', `ab>fwd(ac>*find(a)) bc>fwd(ac>*find(a))`);
        t('ab,bc<fwd(ac<*find(a))', `bc<fwd(ac<*find(a)) ab<fwd(ac<*find(a))`);
        t('ab,bc>*find(a)', `ab>fwd(ac>*find(a)) bc>fwd(ac>*find(a))`);
        t('ab,bc<*find(a)', `bc<fwd(ac<*find(a)) ab<fwd(ac<*find(a))`);
        // XXX: rm this fwd. fwd only allowed to messages
        t('abc>fwd(ac>*find(a))', `ab>fwd(ac>*find(a)) bc>fwd(ac>*find(a))`);
        t('abcd>fwd(ad>*find(a))', `ab>fwd(ad>*find(a)) bc>fwd(ad>*find(a))
          cd>fwd(ad>*find(a))`);
        t('abc<fwd(ac>*find(a))', `bc<fwd(ac>*find(a)) ab<fwd(ac>*find(a))`);
        t('abcd<fwd(ad>*find(a))', `cd<fwd(ad>*find(a)) bc<fwd(ad>*find(a))
          ab<fwd(ad>*find(a))`);
        t('abc>*find(a)', `ab>fwd(ac>*find(a)) bc>fwd(ac>*find(a))`);
        t('abc<*find(a)', `bc<fwd(ac<*find(a)) ab<fwd(ac<*find(a))`);
        }
        t('abc>*conn_info(r(ws))', `ab>fwd(ac>*conn_info) bc>fwd(ac>*conn_info)
          bc<fwd(ac<*conn_info_r(ws)) ab<fwd(ac<*conn_info_r(ws))`);
        t('abc>*conn_info', `ab>fwd(ac>*conn_info) bc>fwd(ac>*conn_info)`);
        _t('mode(msg req)',
          'ab>conn_info', `ab>msg(type(req) cmd(conn_info)) ab>*conn_info`);
        _t('mode(msg req)', 'abc>conn_info(!r)', `
          ab>fwd(ac>msg(type(req) cmd(conn_info)))
          bc>fwd(ac>msg(type(req) cmd(conn_info))) ac>*conn_info`);
        _t('mode(msg req)', 'abc>conn_info(r:ws)', `
          ab>fwd(ac>msg(type(req) cmd(conn_info)))
          bc>fwd(ac>msg(type(req) cmd(conn_info))) ac>*conn_info
          bc<fwd(ac<msg(type(res) cmd(conn_info) body(ws)))
          ab<fwd(ac<msg(type(res) cmd(conn_info) body(ws)))
          ac<*conn_info_r(ws)`);
        _t('mode(msg req)', 'ab>conn_info_r(ws wrtc)', `ab>msg(type(res)
          cmd(conn_info) body(ws wrtc)) ab>*conn_info_r(ws wrtc)`);
        _t('mode(msg req)', 'abc>conn_info_r(ws)', `
          ab>fwd(ac>msg(type(res) cmd(conn_info) body(ws)))
          bc>fwd(ac>msg(type(res) cmd(conn_info) body(ws)))
          ac>*conn_info_r(ws)`);
        if (0) // XXX NOW: TODO
        t(`abc>conn_info`, `abc>fwd(ac>msg(type:req cmd(conn_info)))
          ac>*conn_info`);
        if (0){ // XXX NOW: create similar tests for !req or rm
        t('ab>!msg(body:hi !msg)', `ab>!msg(body(hi) !msg)`);
        t('ab>!msg(body:hi)', `ab>!msg(body(hi) !msg) ab>msg(body(hi))`);
        t('ab>!msg(body:hi msg)', `ab>!msg(body(hi) !msg) ab>msg(body(hi))`);
        t('abc>!msg(body:hi)', `ac>!msg(body(hi) !msg) ab>fwd(ac>msg(body(hi)))
          bc>fwd(ac>msg(body(hi)))`);
        t('abc<!msg(body:hi)', `ac<!msg(body(hi) !msg) bc<fwd(ac<msg(body(hi)))
          ab<fwd(ac<msg(body(hi)))`);
        t('ab,bc>!msg(body:hi)', `ac>!msg(body(hi) !msg)
          ab>fwd(ac>msg(body(hi))) bc>fwd(ac>msg(body(hi)))`);
        }
        t('ab>cd>msg(body:hi)', `ab>fwd(cd>msg(body(hi)))`);
        t('ab>cd<msg(body:hi)', `ab>fwd(cd<msg(body(hi)))`);
        t('ab<cd>msg(body:hi)', `ab<fwd(cd>msg(body(hi)))`);
        t('ab<cd<msg(body:hi)', `ab<fwd(cd<msg(body(hi)))`);
        t('ab>msg(id:r0 type:req_start cmd:test seq:0 body:b0)',
          `ab>msg(id(r0) type(req_start) cmd(test) seq(0) body(b0))`);
        if (0) // XXX: fixme
        t('ab,cd>ef>msg(hi)', `ab>fwd(ef>msg(hi)) cd>fwd(msg(hi))`);
        // XXX TODO: dcb>fwd(da>msg(hi)) - db>!msg(hi) - dc>!msg(hi)`);
        t('ab>*req(id:r1 body:ping)', `ab>*req(id(r1) body(ping))`);
        t('ab>!req(body:hi !e)', `ab>!req(body(hi) !e)`);
        t('ab>!req(id(r0) body:hi !e)', `ab>!req(id(r0) body(hi) !e)`);
        t('ab>!req(id:r0 body:ping)', `ab>!req(id(r0) body(ping) !e)
          ab>*req(id(r0) body(ping))`);
        _t('mode(msg)', 'ab>!req(id:r0 body:ping)',
          `ab>!req(id(r0) body(ping) !e) ab>msg(id(r0) type(req) body(ping))`);
        _t('mode(msg req)', 'ab>!req(id:r0 body:ping)',
          `ab>!req(id(r0) body(ping) !e) ab>msg(id(r0) type(req) body(ping))
           ab>*req(id(r0) body(ping))`);
        t('ab>!req(id:r1 body:ping res:ping_r)', `
          ab>!req(id(r1) body(ping) res(ping_r) !e)
          ab>*req(id(r1) body(ping)) ab<*res(id(r1) body(ping_r))`);
        _t('mode(msg req)',
          'ab>!req(id:r1 cmd:test seq:1 ack:2 body:ping res:ping_r)', `
          ab>!req(id(r1) cmd(test) seq(1) ack(2) body(ping) res(ping_r) !e)
          ab>msg(id(r1) type(req) cmd(test) seq(1) ack(2) body(ping))
          ab>*req(id(r1) cmd(test) seq(1) ack(2) body(ping))
          ab<msg(id(r1) type(res) cmd(test) body(ping_r))
          ab<*res(id(r1) cmd(test) body(ping_r))`);
        t('abc>!req(id:r0 !e)', `ac>!req(id(r0) !e)`);
        t('abc<!req(id:r0 !e)', `ac<!req(id(r0) !e)`);
        _t('mode(msg req)', 'abc>!req(id:r0)', `ac>!req(id(r0) !e)
          ab>fwd(ac>msg(id(r0) type(req))) bc>fwd(ac>msg(id(r0) type(req)))
          ac>*req(id(r0))`);
        _t('mode(msg req)', 'abc<!req(id:r0)', `ac<!req(id(r0) !e)
          cb>fwd(ac<msg(id(r0) type(req))) ba>fwd(ac<msg(id(r0) type(req)))
          ac<*req(id(r0))`);
        _t('mode(msg req)', 'abc>!req(id:r0 cmd:test seq:1 ack:2 body:ping)',
          `ac>!req(id(r0) cmd(test) seq(1) ack(2) body(ping) !e)
          ab>fwd(ac>msg(id(r0) type(req) cmd(test) seq(1) ack(2) body(ping)))
          bc>fwd(ac>msg(id(r0) type(req) cmd(test) seq(1) ack(2) body(ping)))
           ac>*req(id(r0) cmd(test) seq(1) ack(2) body(ping))`);
        _t('mode(msg req)',
          'abc>!req(id:r1 cmd:test seq:1 ack:2 body:ping res:ping_r)', `
          ac>!req(id(r1) cmd(test) seq(1) ack(2) body(ping) res(ping_r) !e)
          ab>fwd(ac>msg(id(r1) type(req) cmd(test) seq(1) ack(2) body(ping)))
          bc>fwd(ac>msg(id(r1) type(req) cmd(test) seq(1) ack(2) body(ping)))
          ac>*req(id(r1) cmd(test) seq(1) ack(2) body(ping))
          cb>fwd(ac<msg(id(r1) type(res) cmd(test) body(ping_r)))
          ba>fwd(ac<msg(id(r1) type(res) cmd(test) body(ping_r)))
          ac<*res(id(r1) cmd(test) body(ping_r))`);
        t('ab>*res(id:r1 body:ping)', `ab>*res(id(r1) body(ping))`);
        t('ab>!res(body:hi !e)', `ab>!res(body(hi) !e)`);
        t('ab>!res(id(r0) body:hi !e)', `ab>!res(id(r0) body(hi) !e)`);
        t('ab>!res(id:r0 body:ping)', `ab>!res(id(r0) body(ping) !e)
          ab>*res(id(r0) body(ping))`);
        _t('mode(msg)', 'ab>!res(id:r0 body:ping)',
          `ab>!res(id(r0) body(ping) !e) ab>msg(id(r0) type(res) body(ping))`);
        _t('mode(msg req)', 'ab>!res(id:r0 cmd:test seq:1 ack:2 body:ping)',
          `ab>!res(id(r0) cmd(test) seq(1) ack(2) body(ping) !e)
          ab>msg(id(r0) type(res) cmd(test) seq(1) ack(2) body(ping))
           ab>*res(id(r0) cmd(test) seq(1) ack(2) body(ping))`);
        t('abc>!res(id:r0 !e)', `ac>!res(id(r0) !e)`);
        t('abc<!res(id:r0 !e)', `ac<!res(id(r0) !e)`);
        _t('mode(msg req)', 'abc>!res(id:r0)', `ac>!res(id(r0) !e)
          ab>fwd(ac>msg(id(r0) type(res))) bc>fwd(ac>msg(id(r0) type(res)))
          ac>*res(id(r0))`);
        _t('mode(msg req)', 'abc<!res(id:r0)', `ac<!res(id(r0) !e)
          cb>fwd(ac<msg(id(r0) type(res))) ba>fwd(ac<msg(id(r0) type(res)))
          ac<*res(id(r0))`);
        _t('mode(msg req)', 'abc>!res(id:r0 cmd:test seq:1 ack:2 body:ping)',
          `ac>!res(id(r0) cmd(test) seq(1) ack(2) body(ping) !e)
          ab>fwd(ac>msg(id(r0) type(res) cmd(test) seq(1) ack(2) body(ping)))
          bc>fwd(ac>msg(id(r0) type(res) cmd(test) seq(1) ack(2) body(ping)))
           ac>*res(id(r0) cmd(test) seq(1) ack(2) body(ping))`);
        t('a>*fail(id:r1 error:timeout)', `a>*fail(id(r1) error(timeout))`);
        _t('mode:req', 'ab>find:a', `ab>*find(a)`);
        _t('mode:msg', 'ab>find:a', `ab>msg(type(req) cmd(find) body(a))`);
        _t('mode(msg req)', 'ab>find:a', `ab>msg(type(req) cmd(find) body(a))
          ab>*find(a)`);
        _t('mode:req', 'ab>find_r:a', `ab>*find_r(a)`);
        _t('mode:msg', 'ab>find_r:a', `ab>msg(type(res) cmd(find) body(a))`);
        _t('mode(msg req)', 'ab>find_r:a', `ab>msg(type(res) cmd(find) body(a))
          ab>*find_r(a)`);
        t('a>*req_start(id:r0 cmd:test seq:1 ack:2 body:b0)',
          `a>*req_start(id(r0) cmd(test) seq(1) ack(2) body(b0))`);
        t('ab>!req_start(id:r1 cmd:test !e)',
          `ab>!req_start(id(r1) cmd(test) !e)`);
        t('ab>!req_start(id:r1 cmd:test)', `ab>!req_start(id(r1) cmd(test) !e)
          ab>*req_start(id(r1) cmd(test))`);
        t('ab>!res_start(id:r1 cmd:test !e)',
          `ab>!res_start(id(r1) cmd(test) !e)`);
        t('ab>!res_start(id:r1 cmd:test)', `ab>!res_start(id(r1) cmd(test) !e)
          ab>*res_start(id(r1) cmd(test))`);
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
  describe('req_new', function(){
    // beforeEach(()=>xtest.xerr_level());
    // afterEach(()=>xtest.xerr_level(xerr.L.ERR));
    const t = (name, test)=>t_roles(name, 'abc', test);
    // XXX: need auto
    if (0){ // XXX: test with curcurecny 1 for failing to delivery message
    t('xxx', `mode:msg mode:req a=node(wrtc) b=node(wss) c=node(wss)
      d=node(wrtc)
      ad>!connect(find(a da))
      ab>!connect(find(a bad)) bd>*conn_info bd<*conn_info_r(wrtc)
      bc>!connect(find(b cdab)) cd>*conn_info cd<*conn_info_r(wrtc)
      ca>*conn_info ca<*conn_info_r(wrtc)
      mode:pop
      ac>!req(id:r0)
      ad>fwd(ac>msg(id(r0) type(req) seq(0)))
      20s a>*fail(id:r0 error:timeout)
    `);
    t('xxx2', `mode(msg req) mode:req a=node(wrtc) d=node(wss) c=node(wss)
      b=node(wrtc)
      ab>!connect(find(a ba))
      ad>!connect(find(a dba)) db>*conn_info db<*conn_info_r(wrtc)
      dc>!connect(find(d cdab))
      ca>*conn_info ca<*conn_info_r(wrtc)
      cb>*conn_info cb<*conn_info_r(wrtc)
      mode:pop
      ac>!req(id:r0)
      ad>fwd(ac>msg(id(r0) type(req) seq(0)))
      dc>fwd(ac>msg(id(r0) type(req) seq(0)))
      ac>*req(id:r0)
      20s a>*fail(id:r0 error:timeout)
    `);
    }
    describe('manual', ()=>{
      t('req', `mode:req setup:2_nodes
        ab>!req(id:r0 body:ping !e) ab>*req(id:r0 body:ping) -
        ab<!res(id:r0 ack:0 body:ping_r !e)
        ab<*res(id:r0 ack:0 body:ping_r) 20s -
        ab>!req(id:r1 body:ping !e) ab>*req(id:r1 body:ping) -
        ab<!res(id:r1 ack:0 body:ping_r !e) ab<*res(id:r1 ack:0 body:ping_r)
      `);
      t('msg', `mode:msg setup:2_nodes
        ab>!req(id:r0 body:ping !e) ab>msg(id:r0 type:req body:ping) -
        ab<!res(id:r0 ack:0 body:ping_r !e)
        ab<msg(id:r0 type:res ack:0 body:ping_r)
        20s - ab>!req(id:r1 body:ping !e) ab>msg(id:r1 type:req body:ping) -
        ab<!res(id:r1 ack:0 body:ping_r !e)
        ab<msg(id:r1 type:res ack:0 body:ping_r)`);
      t('msg,req', `mode(msg req) setup:2_nodes
        ab>!req(id:r0 body:ping !e) ab>msg(id:r0 type:req body:ping)
        ab>*req(id:r0 body:ping) -
        ab<!res(id:r0 ack:0 body:ping_r !e)
        ab<msg(id:r0 type:res ack:0 body:ping_r)
        ab<*res(id:r0 ack:0 body:ping_r) 20s -
        ab>!req(id:r1 body:ping !e) ab>msg(id:r1 type:req body:ping)
        ab>*req(id:r1 body:ping) -
        ab<!res(id:r1 ack:0 body:ping_r !e)
        ab<msg(id:r1 type:res ack:0 body:ping_r)
        ab<*res(id:r1 ack:0 body:ping_r)`);
    });
    describe('wrong_order', ()=>{
      t('req', `mode:req setup:2_nodes ab>!req(id:r0 body:ping) -
        ab>!req(id:r1 body:ping) - ab<!res(id:r1 body:ping_r) -
        ab<!res(id:r0 body:ping_r)`);
      t('msg', `mode(msg) setup:2_nodes ab>!req(id:r0 body:ping) -
        ab>!req(id:r1 body:ping) - ab<!res(id:r1 body:ping_r) -
        ab<!res(id:r0 body:ping_r)`);
       t('msg,req', `mode(msg req) setup:2_nodes ab>!req(id:r0 body:ping)
        ab>!req(id:r1 body:ping) - ab<!res(id:r1 body:ping_r) -
        ab<!res(id:r0 body:ping_r)`);
    });
    // XXX: simplify with moving find to !connect
    describe('2_nodes', ()=>{
      t('req', `mode:req node:a b=node(wss(port:4000)) ab>!connect(wss !r)
        ab>connect(wss !r) ab<connected ab>*find:a ab<*find_r:a ab<*find:b
        ab>*find_r:ba - ab>!req(id:r0 body:ping res:ping_r !e)
        ab>*req(id:r0 body:ping) ab<*res(id:r0 body:ping_r)`);
      t('msg', `mode:msg node:a b=node(wss(port:4000)) ab>!connect(wss !r)
        ab>connect(wss !r) ab<connected ab>find:a ab<find_r:a
        ab<find:b ab>find_r:ba - ab>!req(id:r0 body:ping res:ping_r !e)
        ab>msg(type:req id:r0 body:ping) ab<msg(type:res id:r0 body:ping_r)`);
      t('msg,req', `mode(msg req) node:a b=node(wss(port:4000))
        ab>!connect(wss !r) ab>connect(wss !r) ab<connected
        ab>find:a ab<find_r:a ab<find:b ab>find_r:ba -
        ab>!req(id:r0 body:ping res:ping_r !e) ab>msg(type:req id:r0 body:ping)
        ab>*req(id:r0 body:ping) ab<msg(type:res id:r0 body:ping_r)
        ab<*res(id:r0 body:ping_r)`);
    });
    describe('3_nodes', ()=>{
      // XXX: missing req test
      // t('fwd', `setup:3_nodes_linear ac>!req(id:r0 body:ping res:ping_r)
      //  abc>*req(id:r0 body:ping) abc<fwd(ac<*res(id:r0 body:ping_r))`);
      t('req', `
        mode:req node:a b=node(wss) ab>!connect(wss !r)
        ab>connect(wss !r) ab<connected ab>*find:a ab<*find_r:a ab<*find:b
        ab>*find_r:ba - c=node(wss) bc>!connect(wss !r)
        bc>connect(wss !r) bc<connected bc>*find:b bc<*find_r:b bc<*find:c
        bc>*find_r:cab ca>*conn_info ca<*conn_info_r -
        ac>!req(id:r0 body:ping res:ping_r)`);
      t('msg', `
        mode:msg node:a b=node(wss) ab>!connect(wss !r) ab>connect(wss !r)
        ab<connected ab>find:a ab<find_r:a ab<find:b
        ab>find_r:ba - c=node(wss) bc>!connect(wss !r)
        bc>connect(wss !r) bc<connected bc>find:b bc<find_r:b bc<find:c
        bc>find_r:cab abc<msg(type:req cmd(conn_info))
        abc>msg(type:res cmd(conn_info)) -
        abc>!req(id:r0 body:ping res:ping_r)`);
      t('msg,req', `
        mode(msg req) node:a b=node(wss) ab>!connect(wss !r)
        ab>connect(wss !r) ab<connected ab>find:a ab<find_r:a
        ab<find:b ab>find_r:ba - c=node(wss) bc>!connect(wss !r)
        bc>connect(wss !r) bc<connected bc>find:b bc<find_r:b bc<find:c
        bc>find_r:cab abc<msg(type:req cmd(conn_info))
        ca>*conn_info abc>msg(type:res cmd(conn_info)) ca<*conn_info_r
        abc>!req(id:r0 body:ping res:ping_r)`);
    });
    describe('failure', ()=>{
      describe('timeout', ()=>{
        t('req', `mode:req setup:2_nodes ab>!req(id:r0 body:ping) 19999ms -
        1ms a>*fail(id:r0 error:timeout)`);
        t('msg', `mode:msg setup:2_nodes ab>!req(id:r0 body:ping) 19999ms -
          1ms a>*fail(id:r0 error:timeout)`);
        t('msg,req', `mode(msg req) setup:2_nodes ab>!req(id:r0 body:ping)
          19999ms - 1ms a>*fail(id:r0 error:timeout)`);
      });
      if (0)// XXX TODO
      describe('timeout_wrong_id', ()=>{
        t('req', `mode:req setup:2_nodes ab>!req(id:r0 body:ping)
          ab>*req(id:r0 body:ping) ab<!res(id:r1 body:ping_r)
          ab<*res(id:r1 body:ping_r) - 19999ms -
          1ms a>*fail(id:r0 error:timeout)`);
        t('msg', `mode:msg setup:2_nodes ab>!req(id:r0 body:ping)
          ab>msg(id:r0 type:req body:ping) ab<!res(id:r1 body:ping_r)
          ab<msg(id:r1 type:res body:ping_r) - 19999ms -
          1ms a>*fail(id:r0 error:timeout)`);
        t('msg,req', `mode(msg req) setup:2_nodes ab>!req(id:r0 body:ping)
          ab>msg(id:r0 type:req body:ping) ab>*req(id:r0 body:ping)
          ab<!res(id:r1 body:ping_r) ab<msg(id:r1 type:res body:ping_r)
          ab<*res(id:r1 body:ping_r) - 19999ms -
          1ms a>*fail(id:r0 error:timeout)`);
      });
      describe('no_route', ()=>{
        // XXX: no_route should fail with error(no_route)
        if (0) // XXX: fixme
        t('req', `mode:req setup:2_nodes node:c cb>!req(id:r0 body:ping) -
        19999ms - 1ms c>*fail(id:r0 error:timeout)`);
        t('msg', `mode:msg setup:2_nodes node:c cb>!req(id:r0 body:ping !e) -
        19999ms - 1ms c>*fail(id:r0 error:timeout)`);
        if (0) // XXX: fixme
        t('msg,req', `mode(msg req) setup:2_nodes node:c
        cb>!req(id:r0 body:ping) - 19999ms -
        1ms c>*fail(id:r0 error:timeout)`);
      });
    });
  });
  describe('stream', function(){
    const t = (name, test)=>t_roles(name, 'abc', test);
    // XXX: add msg and msg,req versions
    describe('manual', ()=>{
      t('req', `mode:req setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test body:b0 !e)
        ab>*req_start(id:r0 seq:0 cmd:test body:b0)
        ab<!res_start(id:r0 seq:0 ack:0 body:c0 !e)
        ab<*res_start(id:r0 seq:0 ack:0 cmd:test body:c0)
        ab>!req_next(id:r0 seq:1 ack:0 body:b1 !e)
        ab>*req_next(id:r0 seq:1 ack:0 cmd:test body:b1) -
        ab<!res_next(id:r0 seq:1 ack:1 body:c1 !e)
        ab<*res_next(id:r0 seq:1 ack:1 cmd:test body:c1)
        ab>!req_end(id:r0 seq:2 ack:1 body:b2 !e)
        ab>*req_end(id:r0 seq:2 ack:1 cmd:test body:b2)
        ab<!res_end(id:r0 seq:2 ack:2 body:c2 !e)
        ab<*res_end(id:r0 seq:2 ack:2 cmd:test body:c2)`);
      t('msg', `mode:msg setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test body:b0 !e)
        ab>msg(id:r0 type:req_start cmd:test seq:0 body:b0)
        ab<!res_start(id:r0 seq:0 ack:0 body:c0 !e)
        ab<msg(id:r0 type:res_start cmd:test seq:0 ack:0 body:c0)
        ab>!req_next(id:r0 seq:1 ack:0 body:b1 !e)
        ab>msg(id:r0 type:req_next cmd:test seq:1 ack:0 body:b1)
        ab<!res_next(id:r0 seq:1 ack:1 body:c1 !e)
        ab<msg(id:r0 type:res_next cmd:test seq:1 ack:1 body:c1)
        ab>!req_end(id:r0 seq:2 ack:1 body:b2 !e)
        ab>msg(id:r0 type:req_end cmd:test ack:1 seq:2 body:b2)
        ab<!res_end(id:r0 seq:2 ack:2 body:c2 !e)
        ab<msg(id:r0 type:res_end cmd:test seq:2 ack:2 body:c2)`);
      t('msg,req', `mode(msg req) setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test body:b0 !e)
        ab>msg(id:r0 type:req_start cmd:test seq:0 body:b0)
        ab>*req_start(id:r0 seq:0 cmd:test body:b0)
        ab<!res_start(id:r0 seq:0 ack:0 body:c0 !e)
        ab<msg(id:r0 type:res_start cmd:test seq:0 ack:0 body:c0)
        ab<*res_start(id:r0 seq:0 ack:0 cmd:test body:c0)
        ab>!req_next(id:r0 seq:1 ack:0 body:b1 !e)
        ab>msg(id:r0 type:req_next cmd:test seq:1 ack:0 body:b1)
        ab>*req_next(id:r0 seq:1 ack:0 cmd:test body:b1) -
        ab<!res_next(id:r0 seq:1 ack:1 body:c1 !e)
        ab<msg(id:r0 type:res_next cmd:test seq:1 ack:1 body:c1)
        ab<*res_next(id:r0 seq:1 ack:1 cmd:test body:c1)
        ab>!req_end(id:r0 seq:2 ack:1 body:b2 !e)
        ab>msg(id:r0 type:req_end cmd:test ack:1 seq:2 body:b2)
        ab>*req_end(id:r0 seq:2 ack:1 cmd:test body:b2)
        ab<!res_end(id:r0 seq:2 ack:2 body:c2 !e)
        ab<msg(id:r0 type:res_end cmd:test seq:2 ack:2 body:c2)
        ab<*res_end(id:r0 seq:2 ack:2 cmd:test body:c2)`);
    });
    describe('auto', ()=>{
      t('req', `mode:req setup:2_nodes
        ab>!req_start(id:r0 cmd:test body:b0 !e)
        ab>*req_start(id:r0 cmd:test body:b0)
        ab<!res_start(id:r0 body:c0 !e)
        ab<*res_start(id:r0 cmd:test body:c0)
        ab>!req_next(id:r0 body:b1 !e)
        ab>*req_next(id:r0 cmd:test body:b1) -
        ab<!res_next(id:r0 body:c1 !e)
        ab<*res_next(id:r0 cmd:test body:c1)
        ab>!req_end(id:r0 body:b2 !e)
        ab>*req_end(id:r0 cmd:test body:b2)
        ab<!res_end(id:r0 body:c2 !e)
        ab<*res_end(id:r0 cmd:test body:c2)`);
      t('msg', `mode:msg setup:2_nodes
        ab>!req_start(id:r0 cmd:test body:b0 !e)
        ab>msg(id:r0 type:req_start cmd:test seq:0 body:b0)
        ab<!res_start(id:r0 ack:0 body:c0 !e)
        ab<msg(id:r0 type:res_start cmd:test seq:0 ack:0 body:c0)
        ab>!req_next(id:r0 ack:0 body:b1 !e)
        ab>msg(id:r0 type:req_next cmd:test seq:1 ack:0 body:b1)
        ab<!res_next(id:r0 ack:1 body:c1 !e)
        ab<msg(id:r0 type:res_next cmd:test seq:1 ack:1 body:c1)
        ab>!req_end(id:r0 ack:1 body:b2 !e)
        ab>msg(id:r0 type:req_end cmd:test ack:1 seq:2 body:b2)
        ab<!res_end(id:r0 ack:2 body:c2 !e)
        ab<msg(id:r0 type:res_end cmd:test seq:2 ack:2 body:c2)`);
      t('msg,req', `mode(msg req) setup:2_nodes
        ab>!req_start(id:r0 cmd:test body:b0 !e)
        ab>msg(id:r0 type:req_start cmd:test seq:0 body:b0)
        ab>*req_start(id:r0 cmd:test body:b0)
        ab<!res_start(id:r0 ack:0 body:c0 !e)
        ab<msg(id:r0 type:res_start cmd:test seq:0 ack:0 body:c0)
        ab<*res_start(id:r0 cmd:test body:c0)
        ab>!req_next(id:r0 ack:0 body:b1 !e)
        ab>msg(id:r0 type:req_next cmd:test seq:1 ack:0 body:b1)
        ab>*req_next(id:r0 cmd:test body:b1) -
        ab<!res_next(id:r0 ack:1 body:c1 !e)
        ab<msg(id:r0 type:res_next cmd:test seq:1 ack:1 body:c1)
        ab<*res_next(id:r0 cmd:test body:c1)
        ab>!req_end(id:r0 ack:1 body:b2 !e)
        ab>msg(id:r0 type:req_end cmd:test ack:1 seq:2 body:b2)
        ab>*req_end(id:r0 cmd:test body:b2)
        ab<!res_end(id:r0 ack:2 body:c2 !e)
        ab<msg(id:r0 type:res_end cmd:test seq:2 ack:2 body:c2)
        ab<*res_end(id:r0 cmd:test body:c2)`);
    });
    t('res', `mode:req setup:2_nodes ab>!req_start(id:r0 cmd:test body:b0)
      ab<!res_start(id:r0 body:c0) ab>!req_next(id:r0 body:b1)
      ab<!res_next(id:r0 body:c1) ab>!req_end(id:r0 body:b2)
      ab<!res_end(id:r0 body:c2)`);
    t('multi_res', `mode:req setup:2_nodes
      ab>!req_start(id:r0 seq:0 cmd:test body:b0)
      ab<!res_start(id:r0 seq:0 body:c0) ab<!res_next(id:r0 seq:1 body:c1)
      ab<!res_next(id:r0 seq:2 body:c2) ab>!req_end(id:r0 seq:1 body:b2)
      ab<!res_end(id:r0 seq:3 body:c3)`);
    describe('timeout', function(){
      t('req_start', `mode:req setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test) 19999ms -
        1ms a>*fail(id:r0 seq:0 error(timeout))`);
      t('res_start', `mode:req setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test) 19999ms -
        ab<!res_start(id:r0 seq:0) 19999ms -
        1ms b>*fail(id:r0 seq:0 error:timeout)`);
      t('req_next', `mode:req setup:2_nodes ab>!req_start(id:r0 seq:0 cmd:test)
        19999ms - ab<!res_start(id:r0 seq:0) ab>!req_next(id:r0 seq:1) 19999ms
        - 1ms a>*fail(id:r0 seq:1 error(timeout))`);
      t('res_next', `mode:req setup:2_nodes ab>!req_start(id:r0 seq:0 cmd:test)
        19999ms - ab<!res_start(id:r0 seq:0) ab>!req_next(id:r0 seq:1)
        19999ms - ab<!res_next(id:r0 seq:1) 19999ms -
        1ms b>*fail(id:r0 seq:1 error:timeout)`);
      t('req_end', `mode:req setup:2_nodes ab>!req_start(id:r0 seq:0 cmd:test)
        ab<!res_start(id:r0 seq:0) 19999ms - ab>!req_next(id:r0 seq:1)
        ab<!res_next(id:r0 seq:1) 19999ms - ab>!req_end(id:r0 seq:2) 19999ms -
        1ms a>*fail(id:r0 seq:2 error(timeout))`);
      let setup = `mode:req setup:2_nodes ab>!req_start(id:r0 seq:0 cmd:test)
        ab<!res_start(id:r0 seq:0) - ab>!req_next(id:r0 seq:1) 5s -
        ab>!req_next(id:r0 seq:2) 10s -`;
      t('multi_no_res', `${setup} 4999ms -
        1ms a>*fail(id(r0) seq:1 error(timeout)) - 20s`);
      t('multi_no_res_1st', `${setup} ab<!res_next(id:r0 seq:1 ack:2)
        4999ms - 1ms a>*fail(id:r0 seq:1 error:timeout) 14999ms - 1ms
        b>*fail(id(r0) seq:1 error:timeout)`);
      t('multi_no_res_2nd', `${setup} ab<!res_next(id:r0 seq:1 ack:1)
        9999ms - 1ms a>*fail(id:r0 seq:2 error:timeout) 9999ms - 1ms
        b>*fail(id(r0) seq:1 error:timeout)`);
      setup = `mode:req setup:2_nodes ab>!req_start(id:r0 seq:0 cmd:test)
        ab<!res_start(id:r0 seq:0) ab>!req_next(id:r0 seq:1 cmd:test)
        ab<!res_next(id:r0 seq:1) 5s - ab<!res_next(id:r0 seq:2) 10s -`;
      t('multi_no_req', `${setup} 4999ms -
        1ms b>*fail(id(r0) seq:1 error(timeout)) - 20s`);
      t('multi_no_req_1st', `${setup} 4999ms -
        ab>!req_next(id:r0 seq:2 ack:2 cmd:test) -
        1ms b>*fail(id(r0) seq:1 error(timeout)) -
        20s a>*fail(id:r0 seq:2 error:timeout) -`);
      t('multi_no_req_2nd', `${setup} 4999ms -
        ab>!req_next(id:r0 seq:2 ack:1 cmd:test) -
        5s - 1ms b>*fail(id(r0) seq:2 error(timeout)) -
        20s a>*fail(id:r0 seq:2 error:timeout) -`);
    });
    describe('close', function(){
      t('req_start', `mode:req setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test)
        ab>!req_end(id:r0 seq:1 close) - 20s`);
      t('req_next', `mode:req setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test)
        ab>!req_next(id:r0 seq:1 cmd:test)
        ab>!req_end(id:r0 seq:2 close) - 20s`);
      t('res_start', `mode:req setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test)
        ab<!res_start(id:r0 seq:0)
        ab<!res_end(id:r0 seq:1 close) - 20s`);
      t('res_next', `mode:req setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test)
        ab<!res_start(id:r0 seq:0)
        ab>!req_next(id:r0 seq:1 cmd:test)
        ab<!res_end(id:r0 seq:2 close) - 20s`);
      t('res_close', `mode:req setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test)
        ab<!res_start(id:r0 seq:0 cmd:test)
        ab>!req_next(id:r0 seq:1 cmd:test)
        ab<!res_end(id:r0 seq:1 cmd:test close) - 20s`);
      t('req_close', `mode:req setup:2_nodes
        ab>!req_start(id:r0 seq:0 cmd:test)
        ab<!res_start(id:r0 seq:0 cmd:test)
        ab>!req_next(id:r0 seq:1 cmd:test)
        ab>!req_end(id:r0 seq:2 cmd:test close) - 20s`);
    });
    describe('out_of_order', ()=>{
      describe('req', ()=>{
        const t = (name, test)=>t_roles(name, 'a', test);
        t('req_normal', `mode:req setup:2_nodes
          ab<!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          a>*req_start(id:r0 seq:0 cmd:test body:b0)
          ab<*req_next(id:r0 seq:1 body:b1)
          a>*req_next(id:r0 seq:1 cmd:test body:b1)
          ab<*req_next(id:r0 seq:2 body:b2)
          a>*req_next(id:r0 seq:2 cmd:test body:b2)
          ab<*req_end(id:r0 seq:3 body:b3)
          a>*req_end(id:r0 seq:3 cmd:test body:b3)`);
        // XXX: how to test req_start arriving last?
        t('req_rev', `mode:req setup:2_nodes
          ab<!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          a>*req_start(id:r0 seq:0 cmd:test body:b0)
          ab<*req_end(id:r0 seq:3 body:b3)
          a>*req_end(id:r0 seq:3 cmd:test body:b3 ooo)
          ab<*req_next(id:r0 seq:2 body:b2)
          a>*req_next(id:r0 seq:2 cmd:test body:b2 ooo)
          ab<*req_next(id:r0 seq:1 body:b1)
          a>*req_next(id:r0 seq:1 cmd:test body:b1)
          a>*req_next(id:r0 seq:2 cmd:test body:b2)
          a>*req_end(id:r0 seq:3 cmd:test body:b3)`);
        t('req_multi_next', `mode:req setup:2_nodes
          ab<!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          a>*req_start(id:r0 seq:0 cmd:test body:b0)
          ab<*req_next(id:r0 seq:5 body:b5)
          a>*req_next(id:r0 seq:5 cmd:test body:b5 ooo)
          ab<*req_next(id:r0 seq:3 body:b3)
          a>*req_next(id:r0 seq:3 cmd:test body:b3 ooo)
          ab<*req_next(id:r0 seq:1 body:b1)
          a>*req_next(id:r0 seq:1 cmd:test body:b1)
          ab<*req_next(id:r0 seq:4 body:b4)
          a>*req_next(id:r0 seq:4 cmd:test body:b4 ooo)
          ab<*req_next(id:r0 seq:2 body:b2)
          a>*req_next(id:r0 seq:2 cmd:test body:b2)
          a>*req_next(id:r0 seq:3 cmd:test body:b3)
          a>*req_next(id:r0 seq:4 cmd:test body:b4)
          a>*req_next(id:r0 seq:5 cmd:test body:b5)
          ab<*req_end(id:r0 seq:6 body:b6)
          a>*req_end(id:r0 seq:6 cmd:test body:b6)`);
        // XXX: the last req_end(dup) should not be emitted. need to close
        // connection
        if (0) // XXX NOW: fixme (add xerr to expext errors)
        t('req_dup', `mode:req setup:2_nodes
          ab<!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          a>*req_start(id:r0 seq:0 cmd:test body:b0)
          ab<*req_start(id:r0 seq:0 cmd:test body:b0)
          a>*req_start(id:r0 seq:0 cmd:test body:b0 dup)
          ab<*req_next(id:r0 seq:1 body:b1_1)
          a>*req_next(id:r0 seq:1 cmd:test body:b1_1)
          ab<*req_next(id:r0 seq:1 body:b1_2)
          a>*req_next(id:r0 seq:1 cmd:test body:b1_2 dup)
          ab<*req_end(id:r0 seq:2 body:b2)
          a>*req_end(id:r0 seq:2 cmd:test body:b2)
          ab<*req_end(id:r0 seq:2 body:b2)
          a>*req_end(id:r0 seq:2 cmd:test body:b2 dup)
          `);
        if (0) // XXX NOW: fixme (add xerr to expext errors)
        t('req_dup_ooo', `mode:req setup:2_nodes
          ab<!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          a>*req_start(id:r0 seq:0 cmd:test body:b0)
          ab<*req_next(id:r0 seq:2 body:b1)
          a>*req_next(id:r0 seq:2 cmd:test body:b1 ooo)
          ab<*req_next(id:r0 seq:2 body:b1)
          a>*req_next(id:r0 seq:2 cmd:test body:b1 ooo dup)
        `);
        t('req_many', `mode:req setup:3_nodes_wss
          ab<!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          a>*req_start(id:r0 seq:0 cmd:test body:b0)
          ac<!req_start(id:r1 seq:0 cmd:test body:c0 emit_api)
          a>*req_start(id:r1 seq:0 cmd:test body:c0)
          ab<*req_next(id:r0 seq:2 body:b2)
          a>*req_next(id:r0 seq:2 cmd:test body:b2 ooo)
          ac<*req_next(id:r1 seq:2 body:c2)
          a>*req_next(id:r1 seq:2 cmd:test body:c2 ooo)
          ab<*req_next(id:r0 seq:1 body:b1)
          a>*req_next(id:r0 seq:1 cmd:test body:b1)
          a>*req_next(id:r0 seq:2 cmd:test body:b2)
          ac<*req_next(id:r1 seq:1 body:c1)
          a>*req_next(id:r1 seq:1 cmd:test body:c1)
          a>*req_next(id:r1 seq:2 cmd:test body:c2)`);
      });
      describe('res', ()=>{
        const t = (name, test)=>t_roles(name, 'a', test);
        t('res_normal', `mode:req setup:2_nodes
          ab>!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          ab<*res_start(id:r0 seq:0 ack:0 body:c0)
          a>*res_start(id:r0 seq:0 ack:0 cmd:test body:c0)
          ab<*res_next(id:r0 seq:1 ack body:c1)
          a>*res_next(id:r0 seq:1 cmd:test body:c1)
          ab<*res_end(id:r0 seq:2 ack body:c3)
          a>*res_end(id:r0 seq:2 cmd:test body:c3)`);
        t('res_rev', `mode:req setup:2_nodes
          ab>!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          ab<*res_end(id:r0 seq:2 ack body:c3)
          a>*res_end(id:r0 seq:2 cmd:test body:c3 ooo)
          ab<*res_next(id:r0 seq:1 ack body:c1)
          a>*res_next(id:r0 seq:1 cmd:test body:c1 ooo)
          ab<*res_start(id:r0 seq:0 ack:0 body:c0)
          a>*res_start(id:r0 seq:0 ack:0 cmd:test body:c0)
          a>*res_next(id:r0 seq:1 cmd:test body:c1)
          a>*res_end(id:r0 seq:2 cmd:test body:c3)`);
        t('res_multi_next', `mode:req setup:2_nodes
          ab>!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          ab<*res_start(id:r0 seq:0 ack:0 body:c0)
          a>*res_start(id:r0 seq:0 ack:0 cmd:test body:c0)
          ab<*res_next(id:r0 seq:5 ack body:c5)
          a>*res_next(id:r0 seq:5 cmd:test body:c5 ooo)
          ab<*res_next(id:r0 seq:3 ack body:c3)
          a>*res_next(id:r0 seq:3 cmd:test body:c3 ooo)
          ab<*res_next(id:r0 seq:1 ack body:c1)
          a>*res_next(id:r0 seq:1 cmd:test body:c1)
          ab<*res_next(id:r0 seq:4 ack body:c4)
          a>*res_next(id:r0 seq:4 cmd:test body:c4 ooo)
          ab<*res_next(id:r0 seq:2 ack body:c2)
          a>*res_next(id:r0 seq:2 cmd:test body:c2)
          a>*res_next(id:r0 seq:3 cmd:test body:c3)
          a>*res_next(id:r0 seq:4 cmd:test body:c4)
          a>*res_next(id:r0 seq:5 cmd:test body:c5)
          ab<*res_end(id:r0 seq:6 ack body:c3)
          a>*res_end(id:r0 seq:6 cmd:test body:c3)`);
        if (0) // XXX NOW: fixme (add xerr to expext errors)
        t('res_dup', `mode:req setup:2_nodes
          ab>!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          ab<*res_start(id:r0 seq:0 ack:0 body:c0)
          a>*res_start(id:r0 seq:0 ack:0 cmd:test body:c0)
          ab<*res_start(id:r0 seq:0 ack:0 body:c0)
          a>*res_start(id:r0 seq:0 ack:0 cmd:test body:c0 dup)
          ab<*res_next(id:r0 seq:1 ack body:c1)
          a>*res_next(id:r0 seq:1 cmd:test body:c1)
          ab<*res_next(id:r0 seq:1 ack body:c1)
          a>*res_next(id:r0 seq:1 cmd:test body:c1 dup)
          ab<*res_end(id:r0 seq:2 ack body:c3)
          a>*res_end(id:r0 seq:2 cmd:test body:c3)
          ab<*res_end(id:r0 seq:2 ack body:c3)
          a>*res_end(id:r0 seq:2 cmd:test body:c3 dup)`);
        if (0) // XXX NOW: fixme (add xerr to expext errors)
        t('res_dup_ooo', `mode:req setup:2_nodes
          ab>!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          ab<*res_start(id:r0 seq:0 ack:0 body:c0)
          a>*res_start(id:r0 seq:0 ack:0 cmd:test body:c0)
          ab<*res_next(id:r0 seq:2 ack body:c1)
          a>*res_next(id:r0 seq:2 cmd:test body:c1 ooo)
          ab<*res_next(id:r0 seq:2 ack body:c1)
          a>*res_next(id:r0 seq:2 cmd:test body:c1 ooo dup)`);
        t('res_many', `mode:req setup:3_nodes_wss
          ab>!req_start(id:r0 seq:0 cmd:test body:b0 emit_api)
          ab<*res_start(id:r0 seq:0 ack:0 body:b0)
          a>*res_start(id:r0 seq:0 ack:0 cmd:test body:b0)
          ac>!req_start(id:r1 seq:0 cmd:test body:c0 emit_api)
          ac<*res_start(id:r1 seq:0 ack:0 body:c0)
          a>*res_start(id:r1 seq:0 ack:0 cmd:test body:c0)
          ab<*res_next(id:r0 seq:2 ack body:b2)
          a>*res_next(id:r0 seq:2 cmd:test body:b2 ooo)
          ac<*res_next(id:r1 seq:2 ack body:c2)
          a>*res_next(id:r1 seq:2 cmd:test body:c2 ooo)
          ab<*res_next(id:r0 seq:1 ack body:b1)
          a>*res_next(id:r0 seq:1 cmd:test body:b1)
          a>*res_next(id:r0 seq:2 cmd:test body:b2)
          ac<*res_next(id:r1 seq:1 ack body:c1)
          a>*res_next(id:r1 seq:1 cmd:test body:c1)
          a>*res_next(id:r1 seq:2 cmd:test body:c2)`);
      });
    });
  });
  // XXX: add boostrap support
  describe('2_nodes_ws', function(){
    const t = (name, test)=>t_roles(name, 'ab', test);
    t('long', `mode:req node:a b=node(wss(port:4000)) ab>!connect(wss !r)
      ab>connect(wss !r) ab<connected ab>*find:a ab<*find_r:a ab<*find:b
      ab>*find_r:ba`);
    t('short', `mode:req node:a b=node(wss) ab>!connect(find(a ba))`);
    t('req', `mode:req setup:2_nodes ab>!req(id:r0 body:ping res:ping_r)
      ab<!req(id:r1 body:ping res:ping_r)`);
    t('msg', `mode:msg setup:2_nodes ab>!req(id:r0 body:ping res:ping_r)
      ab<!req(id:r1 body:ping res:ping_r)`);
    t('msg,req', `mode(msg req) setup:2_nodes
      ab>!req(id:r0 body:ping res:ping_r) - ab<!req(id:r1 body:ping res:ping_r)
    `);
  });
  describe('2_nodes_wrtc', function(){
    const t = (name, test)=>t_roles(name, 'ab', test);
    // XXX: check why it doesn't fail without connect?!
    // t('wrtc', `a=node(wrtc) b=node(wrtc wss) - ab>!connect(find(a ba))`);
    t('req', `mode:req a=node(wrtc) b=node(wrtc wss) -
      ab>!req(id:r0 body:ping res:ping_r) -
      ab<!req(id:r1 body:ping res:ping_r) -`);
    t('msg', `mode:msg mode:req a=node(wrtc) b=node(wrtc wss) -
      ab>!connect(wrtc find(a ba)) - mode:pop
      ab>!req(id:r0 body:ping res:ping_r) ab<!req(id:r1 body:ping res:ping_r)
    `);
    t('msg,req', `mode(msg req) mode:req a=node(wrtc) b=node(wrtc wss) -
      ab>!connect(wrtc find(a ba)) - mode:pop
      ab>!req(id:r0 body:ping res:ping_r) - ab<!req(id:r1 body:ping res:ping_r)
    `);
  });
  describe('2_nodes_wss', function(){
    const t = (name, test)=>t_roles(name, 'ab', test);
    t('req', `mode:req setup:2_nodes_wss`);
    t('msg', `mode:msg setup:2_nodes_wss`);
    t('msg,req', `mode(msg req) setup:2_nodes_wss`);
  });
  describe('3_nodes', function(){
    const t = (name, test)=>t_roles(name, 'abcs', test);
    // XXX bug: missing ac>connect(wss) - need to fix peer-relay implemention
    // and send supported connections in conn_info so other side can
    // connect directly
    describe('linear_simple', ()=>{
      t('req', `mode:req setup:3_nodes_linear
        ab>!req(id:r0 body:ping res:ping_r) ac>!req(id:r1 body:ping res:ping_r)
        bc>!req(id:r2 body:ping res:ping_r)`);
      t('msg', `mode:msg setup:3_nodes_linear
        ab>!req(id:r0 body:ping res:ping_r)
        abc>!req(id:r1 body:ping res:ping_r)
        bc>!req(id:r2 body:ping res:ping_r)`);
      t('msg,req', `mode(msg req) setup:3_nodes_linear
        ab>!req(id:r0 body:ping res:ping_r)
        abc>!req(id:r1 body:ping res:ping_r)
        bc>!req(id:r2 body:ping res:ping_r)`);
    });
    describe('linear_wrtc', ()=>{
      t('req', `mode:req a=node(wrtc) b=node(wrtc wss) c=node(wrtc wss) -
        ab>!connect(wss find(a ba)) - bc>!connect(wrtc find(b cab))
        ac<*conn_info ac>*conn_info_r:wrtc ca>connect(wrtc find(cab abc))`);
      t('msg', `mode:msg a=node(wrtc) b=node(wrtc wss) c=node(wrtc wss) -
        ab>!connect:wss ab>find:a ab<find_r:a ab<find:b ab>find_r:ba -
        bc>!connect:wrtc bc>find:b bc<find_r:b bc<find:c
        bc>find_r:cab cba>msg(type:req cmd:conn_info)
        cba<msg(type:res cmd:conn_info body:wrtc) ca>connect(wrtc)
        ac>find:a ac<find_r:abc ac<find:c ac>find_r:cab`);
      t('msg,req', `mode(msg req) a=node(wrtc) b=node(wrtc wss)
        c=node(wrtc wss) - ab>!connect:wss ab>find:a ab<find_r:a
        ab<find:b ab>find_r:ba - bc>!connect:wrtc bc>find:b bc<find_r:b
        bc<find:c bc>find_r:cab cba>msg(type:req cmd:conn_info)
        ca>*conn_info cba<msg(type:res cmd:conn_info body:wrtc)
        ca<*conn_info_r:wrtc ca>connect(wrtc) ac>find:a ac<find_r:abc
        ac<find:c ac>find_r:cab`);
    });
    describe('linear_wss', ()=>{
      t('req', `mode:req setup:3_nodes_wss`);
      t('msg', `mode:msg setup:3_nodes_wss`);
      t('msg,req', `mode(msg req) setup:3_nodes_wss`);
      if (true) return; // XXX: TODO
      t('star', `s=node(wss) node:a b=node(wss) as>!connect(find(a sa)) -
        bs>!connect(find(bas sab)) bsa>*conn_info:r`);
      t('star_wss', `s=node(wss) a=node(wss) b=node(wss) -
        as>!connect(find(a sa)) - bs>!connect(find(bas sab))
        bsa>*conn_info(r:ws) ab<connect(find(bas abs))`);
    });
  });
  describe('4_nodes', function(){
    let t = (name, test)=>t_roles(name, 'abcd', test);
    if (0) // XXX NOW: fixme
    describe('linear', ()=>{
      // XXX: support da<*conn_info:r
      t('req', `mode:req setup:3_nodes_linear d=node(wss)
        cd>!connect(find(c dcba)) db>*conn_info db<*conn_info_r(ws)
        db>connect(find(dcba badc)) da>*conn_info da<*conn_info_r`);
      t('setup', `setup:3_nodes_wss`);
      t('msg', `mode:msg setup:3_nodes_linear d=node(wss)
        cd>!connect cd>find:c cd<find_r:c cd<find:d
        cd>find_r:dcba dcb>fwd(db>msg(type:req cmd:conn_info))
        dcb<fwd(bd>msg(type:res cmd:conn_info body:ws))
        ab<fwd(bd>msg(type:res cmd:conn_info ack:0 body:ws))
        db>connect db>find:d db<find_r:dcba db<find:b
        db>find_r:badc dba>fwd(da>msg(type:req cmd:conn_info))
        dcb>fwd(da>msg(type:req cmd(conn_info)))
        dba<fwd(da<msg(type:res cmd:conn_info))
        ab<fwd(da>msg(type:req cmd:conn_info))
        `);
      t('msg,req', `mode(msg req) setup:3_nodes_linear d=node(wss)
        cd>!connect cd>find:c cd<find_r:c cd<find:d cd>find_r:dcba
        dcb>fwd(db>msg(type:req cmd:conn_info)) db>*conn_info
        dcb<fwd(bd>msg(type:res cmd:conn_info body:ws))
        ab<fwd(bd>msg(type:res cmd:conn_info body:ws)) db<*conn_info_r:ws
        db>connect db>find:d db<find_r:dcba db<find:b db>find_r:badc
        dba>fwd(da>msg(type:req cmd:conn_info))
        dcb>fwd(da>msg(type:req cmd(conn_info))) da>*conn_info
        dba<fwd(da<msg(type:res cmd:conn_info)) da<*conn_info_r
        ab<fwd(da>msg(type:req cmd:conn_info))`);
      describe('req', ()=>{
        // XXX derry NOW: ab>!req(body:ping res:ping_r !e)
        t('req', `mode:req setup:3_nodes_wss
          ab>!req(id:r0 body:ping e res:ping_r) ab<*res(id:r0 body:ping_r) -
          ac>!req(id:r1 body:ping e res:ping_r) ac<*res(id:r1 body:ping_r) -
          ad>!req(id:r2 body:ping e res:ping_r) ad<*res(id:r2 body:ping_r) -
          bc>!req(id:r3 body:ping e res:ping_r) bc<*res(id:r3 body:ping_r) -
          bd>!req(id:r4 body:ping e res:ping_r) bd<*res(id:r4 body:ping_r) -
          cd>!req(id:r5 body:ping e res:ping_r) cd<*res(id:r5 body:ping_r) -
        `);
        // XXX: rm ack:0 (should be auto)
        t('msg', `mode:msg setup:3_nodes_wss
          ab>!req(body:ping res:ping_r) ab>msg(type:req body:ping)
          ab<msg(type:res body:ping_r) - ac>!req(body:ping res:ping_r)
          abc>msg(type:req body:ping) abc<msg(type:res body:ping_r)
          cdb>fwd(ac<msg(type:res ack:0 body:ping_r))
          ab<fwd(ac<msg(type:res ack:0 body:ping_r))
          - ad>!req(body:ping res:ping_r)
          abd>fwd(ad>msg(type:req body:ping))
          abd<fwd(ad<msg(type:res body:ping_r))
          dcb>fwd(ad<msg(type:res ack:0 body:ping_r))
          ab<fwd(ad<msg(type:res ack:0 body:ping_r))
          - bc>!req(body:ping res:ping_r)
          bc>msg(type:req body:ping) bc<msg(type:res body:ping_r) -
          bd>!req(body:ping res:ping_r) bd>msg(type:req body:ping)
          bd<msg(type:res body:ping_r) - cd>!req(body:ping res:ping_r)
          cd>msg(type:req body:ping) cd<msg(type:res body:ping_r)`);
        // XXX: rm ack:0 (should be auto)
        t('msg,req', `mode(msg req) setup:3_nodes_wss
          ab>!req(id:r0 body:ping res:ping_r) ab>msg(id:r0 type:req body:ping)
          ab>*req(id:r0 body:ping) ab<msg(id:r0 type:res body:ping_r)
          ab<*res(id:r0 body:ping_r) - ac>!req(id:r1 body:ping res:ping_r)
          abc>msg(id:r1 type:req body:ping) ac>*req(id:r1 body:ping)
          abc<msg(id:r1 type:res body:ping_r)
          cdb>fwd(ac<msg(id:r1 type:res ack:0 body:ping_r))
          ac<*res(id:r1 body:ping_r)
          ab<fwd(ac<msg(id:r1 type:res ack:0 body:ping_r)) -
          ad>!req(id:r2 body:ping res:ping_r)
          abd>fwd(ad>msg(id:r2 type:req body:ping))
          ad>*req(id:r2 body:ping) abd<fwd(ad<msg(id:r2 type:res body:ping_r))
          dcb>fwd(ad<msg(id:r2 type:res ack:0 body:ping_r))
          ad<*res(id:r2 body:ping_r)
          ab<fwd(ad<msg(id:r2 type:res ack:0 body:ping_r)) -
          bc>!req(id:r3 body:ping res:ping_r) bc>msg(id:r3 type:req body:ping)
          bc>*req(id:r3 body:ping) bc<msg(id:r3 type:res body:ping_r)
          bc<*res(id:r3 body:ping_r) -
          bd>!req(id:r4 body:ping res:ping_r) bd>msg(id:r4 type:req body:ping)
          bd>*req(id:r4 body:ping) bd<msg(id:r4 type:res body:ping_r)
          bd<*res(id:r4 body:ping_r) -
          cd>!req(id:r5 body:ping res:ping_r) cd>msg(id:r5 type:req body:ping)
          cd>*req(id:r5 body:ping) cd<msg(id:r5 type:res body:ping_r)
          cd<*res(id:r5 body:ping_r)`);
      });
    });
    if (0) // XXX NOW: fixme
    describe('linear_wss', ()=>{
      t('req', `mode:req setup:3_nodes_wss d=node(wss) -
        cd>!connect(find(c dcba)) db>*conn_info db<*conn_info_r:ws
        db>connect(find(dcba badc)) ad<*conn_info ad>*conn_info_r:ws
        da>connect(find(dcba abcd))`);
      // XXX: rm ack:0 (should be auto)
      t('msg', `mode:msg setup:3_nodes_wss d=node(wss) -
        cd>!connect cd>find:c cd<find_r:c cd<find:d
        cd>find_r:dcba dcb>fwd(db>msg(type:req cmd:conn_info))
        bcd>fwd(bd>msg(type:res cmd:conn_info body:ws))
        ab<fwd(bd>msg(type:res cmd:conn_info ack:0 body:ws))
        ac>fwd(bd>msg(type:res cmd:conn_info ack:0 body:ws))
        cd>fwd(bd>msg(type:res cmd:conn_info ack:0 body:ws)) db>connect
        db>find:d db<find_r:dcba db<find:b db>find_r:badc
        dba>fwd(da>msg(type:req cmd:conn_info))
        dca<fwd(da<msg(type:res cmd:conn_info ack:0 body:ws))
        ab>fwd(da<msg(type:res cmd:conn_info body:ws))
        bd>fwd(da<msg(type:res cmd:conn_info ack:0 body:ws)) da>connect(wss)
        da>find:d da<find_r:dcba da<find:a da>find_r:abcd
        dca>fwd(da>msg(type:req cmd:conn_info))`);
      t('msg,req', `mode(msg req) setup:3_nodes_wss d=node(wss) -
        cd>!connect cd>find:c cd<find_r:c cd<find:d cd>find_r:dcba
        dcb>fwd(db>msg(type:req cmd:conn_info)) db>*conn_info
        bcd>fwd(bd>msg(type:res cmd:conn_info body:ws))
        ab<fwd(bd>msg(type:res cmd:conn_info ack:0 body:ws))
        ac>fwd(bd>msg(type:res cmd:conn_info ack:0 body:ws))
        db<*conn_info_r:ws cd>fwd(bd>msg(type:res cmd:conn_info ack:0 body:ws))
        db>connect db>find:d db<find_r:dcba db<find:b
        db>find_r:badc dba>fwd(da>msg(type:req cmd:conn_info))
        cd<fwd(da>msg(type(req) cmd(conn_info))) da>*conn_info
        dca<fwd(da<msg(type:res cmd:conn_info ack:0 body:ws))
        ab>fwd(da<msg(type:res cmd:conn_info body:ws))
        bd>fwd(da<msg(type:res cmd:conn_info ack:0 body:ws)) da<*conn_info_r:ws
        da>connect(wss) da>find:d da<find_r:dcba da<find:a
        da>find_r:abcd ca>fwd(da>msg(type:req cmd:conn_info))`);
    });
    // XXX TODO derry:
    // XXX derry: during test, allow to use mode:sorted for find response
    // (default mode will be sorted. create just a few examples unsorted)
    t('4_nodes_wss', `setup(4_nodes_wss)`);
    t('xxx_derry', `setup(3_nodes_wss) d=node(wss) cd>!connect(find(c dcba))
      bcd<conn_info bd<connect(find(dcba badc))
      abd<conn_info ad<connect(find(dcba abcd))`);
    t('xxx_derry_sorted', `setup(3_nodes_wss) conf:find_sorted d=node(wss)
      cd>!connect(find(c abcd)) bcd<conn_info bd<connect(find(abcd abcd))
      abd<conn_info ad<connect(find(abcd abcd))`);
    if (0) // XXX: NOW FIXME
    t('4_nodes_req', `setup(4_nodes_wss)
      ab>!req(body:ping res:ping_r) -
      ac>!req(body:ping res:ping_r) -
      ad>!req(body:ping res:ping_r) -
    `);
    t = (name, test)=>t_roles(name, 'abcdef', test);
    /* XXX derry BUG: eabc>!req(id:r2 body:ping res:ping_r) -
    a -> b -> c -> d
    |
    e
    |
    f
    */
    t('xxx_bug', `conf(peers_optimal(2) find_sorted)
      a=node(wss) b=node(wss) c=node(wss)
      d=node(wss) e=node(wss) f=node(wss) ab>!connect(find(a ab)) -
      cd>!connect(find(c cd)) - bc>!connect(find(bcd abcd)) -
      ef>!connect(find(e ef)) - ea>!connect(find(abe abef)) -
      eab>!req(id:r1 body:ping res:ping_r) -
      ec>!req(id:r2 body:ping res:ping_r !e)
      ef>fwd(ec>msg(id:r2 type:req body:ping)) 20s e>*fail(id:r2 error:timeout)
    `);
  });
  /* XXX REVIEW derry TODO:
    ab>!req(body:ping) ab>msg(type:req body:ping) ab>*req(body:ping) -
    ab<!res(body:ping_r) ab<msg(type:res body:ping_r) ab<*res(body:ping_r)`);
    ==>
    ab>!req(body:ping)
    ab>!req(body:ping !e) ab>msg(type:req body:ping) ab>*req(body:ping) -
   */
  // XXX NOW: rm all fwd
  // XXX: add disconnect tests
  // BUG: if ac>connected and connection is broken, send will not try to send
  // messages through other peers if connections is broken
});
