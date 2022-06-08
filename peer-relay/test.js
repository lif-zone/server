// author: derry. coder: arik.
'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach,afterEach*/
// XXX: need jslint mocha: true
import assert from 'assert';
import Node from './node.js';
import Router from './router.js';
import NodeId from './node_id.js';
import NodeMap from './node_map.js';
import Req from './req.js';
import buf_util from './buf_util.js';
import ReqHandler from './req_handler.js';
import etask from '../util/etask.js';
import xurl from '../util/url.js';
import date from '../util/date.js';
import LBuffer from './lbuffer.js';
import xescape from '../util/escape.js';
import xutil from '../util/util.js';
import xsinon from '../util/sinon.js';
import util from '../util/util.js';
import string from '../util/string.js';
import xtest from '../util/test_lib.js';
import xerr from '../util/xerr.js';
import Wallet from './wallet.js';
import {EventEmitter} from 'events';
import bigInt from 'big-integer';
const assign = Object.assign;
const s2b = buf_util.buf_from_str, b2s = buf_util.buf_to_str;
const stringify = JSON.stringify, is_number = util.is_number;
const DEF_RTT = 100;

function get_fuzzy(name){
  if (name && name[0]=='~')
    return name[0];
  return '';
}

function N(name, opt){
  opt = opt||{};
  if (opt.fuzzy)
    assert(get_fuzzy(name), 'must be fuzzy '+name);
  if (!name)
    return;
  name = name[0]=='~' ? name[1] : name;
  assert(/^[a-zA-Z]$/.test(name), 'invalid name '+name);
  let node = t_nodes[name];
  assert(node, 'missing node '+name);
  return node;
}

// XXX: make it automatic for all node/browser in proc.js
xerr.set_exception_catch_all(true);
process.on('uncaughtException', err=>xerr.xexit(err));
process.on('unhandledRejection', err=>xerr.xexit(err));
xerr.set_exception_handler('test', (prefix, o, err)=>xerr.xexit(err));

let t_nodes = {}, t_msg, t_nonce, t_req, t_cmds, t_i, t_role, t_port=4000;
let t_pre_process, t_cmds_processed, t_mode, t_mode_prev, t_req_id;
let t_reprocess, t_conf, t_req_id_last;
Router.t.t_nodes = t_nodes;
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
  x: {pub: '0088c645664b3a769da624d007e88aab94c99ca95d1e3ec1439e4cceec9c556d',
    priv: '00'},
  y: {pub: '0099c645664b3a769da624d007e88aab94c99ca95d1e3ec1439e4cceec9c556d',
    priv: '00'},
};

// XXX: need test
function fwd_from_lbuffer(lbuffer){
  let fwd = [], m;
  for (let i=0; i<lbuffer.size() && (m=lbuffer.get_json(i)).type=='fwd'; i++)
    fwd.push(node_from_id(m.from).t.name+node_from_id(m.to).t.name+'>');
  return fwd;
}

function fwd_s(fwd, i){
  assert(i<=fwd.length, 'invalid fwd index '+stringify(fwd)+':'+i);
  return fwd[i][2]=='>' ? fwd[i][0] : fwd[i][1];
}

function fwd_d(fwd, i){
  assert(i<=fwd.length, 'invalid fwd index '+stringify(fwd)+':'+i);
  return fwd[i][2]=='>' ? fwd[i][1] : fwd[i][0];
}

function fwd_s_id(fwd, i){
  i = i||0;
  if (typeof fwd=='string')
    fwd = [fwd];
  return N(fwd_s(fwd, i)).id.s;
}

function fwd_d_id(fwd, i){
  i = i||0;
  if (typeof fwd=='string')
    fwd = [fwd];
  return N(fwd_d(fwd, i)).id.s;
}

function nonce_hash(msg){
  assert(msg.req_id, 'missing req_id '+stringify(msg));
  return id_to_name(msg.from)+'_'+id_to_name(msg.to)+'_'+(msg.req_id||'none')+
    '_'+(msg.type||'none')+'_'+(msg.cmd||'none');
}

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
  node = typeof node=='string' ? N(node) : node;
  if (support_wss(node))
    a.push('ws');
  if (support_wrtc(node))
    a.push('wrtc');
  return a.join(' ');
}

function hash_from_int(val, bits, total_bits){
  assert(!(total_bits % 4), 'invalid total_bits '+total_bits); // hex is 4bits
  assert(bits<=total_bits, 'bits bigger than total_bits');
  let len = total_bits/4;
  let s = bigInt(val).shiftLeft(total_bits-bits).toString(16);
  return '0'.repeat(len-s.length)+s;
}

function int_from_hash(hash, bits, total_bits){
  assert(!(total_bits % 4), 'invalid total_bits '+total_bits); // hex is 4bits
  assert(bits<=total_bits, 'bits bigger than total_bits');
  return bigInt(hash, 16).shiftRight(total_bits-bits).toString(10);
}

// abcdefghijklmXYZnopqrstuvwxyz
// b-a = 2^128/26 X=m+(n-m)/2 Y=X+1 Z=X+2
function test_gen_ids(bits, total_bits){
  assert(!(total_bits % 4), 'invalid total_bits '+total_bits); // hex is 4bits
  assert(bits<=total_bits, 'bits bigger than total_bits');
  let max = bigInt(2).pow(bits);
  let d = max.divide(26); // a-z is 26 characters
  let ret = {};
  for (let i=0, v=bigInt(d); i<26; i++, v=v.plus(d)){
    let ch = String.fromCharCode('a'.charCodeAt(0)+i);
    ret[ch] = NodeId.from(hash_from_int(v.toString(10), bits, total_bits));
    if (i==12){
      let X = v.plus(d.divide(2));
      ret.X = NodeId.from(hash_from_int(X.toString(10), bits, total_bits));
      ret.Y = NodeId.from(hash_from_int(X.plus(1).toString(10), bits,
        total_bits));
      ret.Z = NodeId.from(hash_from_int(X.plus(2).toString(10), bits,
        total_bits));
    }
  }
  return ret;
}

function rt_to_str(rt, dir){
  if (!rt)
    return '';
  assert(util.xor(rt.range, rt.path));
  return path_to_str(rt.path, dir);
}

function normalize(e){
  if (!e)
    return e;
  let a=e[0], b=e[1], d=e[2];
  if (d!='<')
    return e;
  return b+a+'>'+e.slice(3);
}

function rev_trim(s){
  let i = s.search(/[<>]/);
  assert(i>=0 && i<3, 'invalid [<>] '+s);
  s = s.slice(0, i)+(s[i]=='<' ? '>' : '<');
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
  if (!fwd)
    return ret;
  assert(Array.isArray(fwd), 'invalid fwd '+stringify(fwd));
  Array.from(fwd).reverse().forEach(f=>ret=f+'fwd('+ret+')');
  return ret;
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
  assert(!fwd || Array.isArray(fwd), 'invalid fwd '+stringify(fwd));
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

function dir_str(s, d, dir){ return dir=='>' ? s+d+'>' :
  dir=='<' ? d+s+'<' : s+d+dir; }
function dir_c(c){ return dir_str(c.s, c.d, c.dir); }
function rev_c(c){ return rev_trim(dir_str(c.s, c.d, c.dir)); }

function loop_str(loop){
  let s = loop[0].s;
  loop.forEach(o=>s+=/[~]/.test(o.d) ? '' : (o.dot ? '.' : '')+o.d);
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
function _set_push_cmd(c, a){
  if (!a.length)
    return c;
  t_cmds[t_i-1] = a[0];
  a.shift();
  _push_cmd(a);
  t_reprocess = true;
  return t_cmds[t_i-1];
}
function set_push_cmd(c, cmd){ _set_push_cmd(c, xtest.test_parse(cmd)); }

function is_fake(p){ return t_role!=p; }

function wss_from_node(node){ return util.get(node, 't.wss.url'); }

function node_from_url(url){
  for (let name in t_nodes){
    let node = N(name);
    if (node.t.wss && wss_from_node(node)==url)
      return node;
  }
}

function support_wss(node){ return !!wss_from_node(node); }
function support_wrtc(node){ return node.wrtcConnector.supported; }

function node_from_id(id){
  for (let name in t_nodes){
    let node = N(name);
    if (node.id.s == b2s(id))
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

function assert_node_ids(val){
  if (val=='a-mXYZn-z')
    return test_gen_ids(t_conf.id_bits, NodeId.bits);
  let ids = val.split(' '), ret = {};
  ids.forEach(s=>{
    let a = s.match(/^([a-zA-Z]+):([0-9.]+)$/);
    assert(a && a.length==3, 'invaid node_ids '+val+' part '+s);
    assert(!ret[a[1]], 'invalid node_ids '+val);
    if (/[.]/.test(a[2]))
      ret[a[1]] = NodeId.from(parseFloat(a[2]));
    else {
      ret[a[1]] = NodeId.from(hash_from_int(+a[2],
        t_conf.id_bits, NodeId.bits));
    }
  });
  return ret;
}

function assert_rtt(val){
  let a = val.split(' ');
  a.forEach(s=>{
    if (is_number(s))
      t_conf.rtt.def = +s;
    else {
      let a = s.match(/^([a-zA-Z][a-zA-Z]):([0-9]+)$/);
      assert(a.length==3, 'invalid rtt '+s+' '+val);
      let conn = string.sort_char(a[1]);
      t_conf.rtt.conn[conn] = +a[2];
    }
  });
}

function assert_ack(val){
  if (!val)
    return [];
  let a = val.split(',');
  util.forEach(a, ack=>assert_int(ack));
  return a;
}

function assert_exist(name){ assert(N(name), 'node not found '+name); }

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

function assert_path(s, dir){ return parse_path(s, dir); }

function assert_rt(s, dir){
  let path = parse_path(s, dir);
  assert(path, 'invalid rt '+s);
  return {path};
}

function assert_support_wrtc(name){
  assert(support_wrtc(N(name)), 'node '+name+' does not support wrtc');
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
    wss = N(d).wsConnector.url;
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
    let node = N(name);
    assert(node, 'node not found '+name);
    let url = wss_from_node(node);
    assert(url, 'no url for '+name);
    bootstrap.push(url);
  });
  return bootstrap;
}

/* XXX: decide if to remove
function assert_peers(peers){
  let a = peers.split(',');
  assert(a.length>0, 'no peers specified');
  a.forEach(name=>assert(N(name), 'node not found '+name+'/'+peers));
}
*/

function assert_event(event, exp){
  assert.equal(normalize(event), normalize(exp)); }

// XXX: rm
function assert_event_c(c, event, call){
  if (call)
    return assert(!event, 'unexpected event '+event+' for call '+c.orig);
  if (event){
    assert(!c.fwd, 'XXX TODO fwd support');
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
    let expected = orig;
    if (fwd){
      assert(Array.isArray(fwd), 'invalid fwd '+stringify(fwd));
      expected = normalize(orig);
      let _rt = Array.from(c.rt2||[]);
      let _path = Array.from(c.path2||[]);
      Array.from(fwd).reverse().forEach(f=>{
        let rt = _rt.pop();
        let path = _path.pop();
        expected = build_cmd(normalize(f)+'fwd', expected+
          (path ? ' '+build_cmd('path', path_to_str(path)) : '')+
          (rt ? ' '+build_cmd('rt', rt_to_str(rt)) : ''));
      });
    }
    assert_event(event, expected);
  }
  else
    assert_missing_event(c);
}

function assert_missing_event(c){
  let s = N(c.s), d = N(c.d);
  if (c.fwd)
    s = N(fwd_s(c.fwd, 0));
  assert(s, 'fwd node not found '+stringify(c.fwd)+' '+c.orig);
  if (c.cmd[0]=='*' && (t_mode.msg || !t_mode.req))
    assert(!s.t.fake || !d || d.t.fake, 'missing event for '+c.orig);
  else
    assert(s.t.fake, 'missing event '+(c.fwd||[]).join(':')+' '+c.orig);
}

const test_on_connection = channel=>etask(function*test_on_connection(){
  let s = node_from_id(channel.local_id.b), d = node_from_id(channel.id.b);
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
  if (0) // XXX NOW: enable
  assert(s==t_req[id].s, 'invalid s '+s+'!='+t_req[id].s+' req '+id);
  if (0) // XXX NOW: enable
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
  if (0) // XXX NOW: enable
  assert(s==t_req[id].d, 'invalid s '+s+'!='+t_req[id].d+' req '+id);
  if (0) // XXX NOW: enable
  assert(d==t_req[id].s, 'invalid d '+d+'!='+t_req[id].s+' req '+id);
  t_req[id].res.call = call;
  return seq===undefined ? t_req[id].res.seq : seq;
}

// XXX: unite with nonce and use t_req instead of t_ack/t_msg
function track_msg(msg){
  assert(msg.req_id, 'missing req_id %s', stringify(msg));
  let s = node_from_id(msg.from).t.name, d = node_from_id(msg.to).t.name;
  let {type, req_id, cmd, seq} = msg;
  assert(is_number(msg.seq), 'req/res must have seq '+stringify(msg));
  req_id = ''+req_id;
  cmd = cmd||'';
  t_msg[req_id] = t_msg[req_id]||{s, d, cmd, seq: {req: [], res: []}};
  if (!['req', 'req_start'].includes(type))
    t_msg[req_id].active = true;
  t_req_id_last = req_id; // XXX HACK: rm it
  let t;
  if (['req', 'req_start', 'req_next', 'req_end'].includes(type))
    t = 'req';
  else if (['res', 'res_start', 'res_next', 'res_end'].includes(type))
    t = 'res';
  if (!t_msg[req_id].seq[t].includes(seq))
    t_msg[req_id].seq[t].push(seq);
}

function get_req_id(o){
  for (let req_id in t_msg){
    let o2 = t_msg[req_id];
    if (o.cmd==o2.cmd && (o.s==o2.s&&o.d==o2.d || o.s==o2.d&&o.d==o2.s))
      return req_id;
  }
  return '';
}

function get_ack(o){
  let {type, req_id, keep} = o;
  if (!t_msg[req_id])
    return;
  let ack = t_msg[req_id].seq[type];
  if (!ack || !ack.length)
    return;
  if (!keep)
    t_msg[req_id].seq[type] = [];
  return ack;
}

class FakeNode extends EventEmitter {
  constructor(opt){
    super();
    this.wallet = new Wallet({keys: opt.keys});
    this.id = NodeId.from(opt.keys.pub);
    this.wsConnector = new FakeWsConnector(this.id.b, opt.port, opt.host);
    this.wrtcConnector = new FakeWrtcConnector(this.id.b, null, opt.wrtc);
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
  connect = url=>etask({_: this}, function*connect(){
    let _this = this._;
    let d = node_from_url(url), s = node_from_id(_this.id);
    assert(d, 'node not found for url '+url);
    let channel = new FakeChannel({local_id: s.id, id: d.id});
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
  connect = _d=>etask({_: this}, function*connect(){
    let _this = this._;
    let d = node_from_id(_d), s = node_from_id(_this.id);
    let channel = new FakeChannel({local_id: s.id, id: d.id});
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
    this.local_id = opt.local_id;
    this.t = {};
    if (!t_conf) // XXX HACK: rm it, needed for channels test
      return;
    let conn = string.sort_char(node_from_id(this.id.s).t.name+
      node_from_id(this.local_id.s).t.name);
    this.rtt = t_conf.rtt.conn[conn]||t_conf.rtt.def;
  }
  send = data=>{
    let lbuffer = LBuffer.from(data); // XXX WIP
    let msg = lbuffer.msg();
    assert(!t_pre_process, 'invalid send during pre_process');
    // XXX: need to filter out only test commands, other should fail test
    if (!t_mode.msg)
      return;
    let e, fwd = fwd_from_lbuffer(lbuffer);
    let {fuzzy, req_id, type, cmd, ack, seq, body} = msg;
    cmd = cmd||'';
    fuzzy = fuzzy||'';
    let from = node_from_id(msg.from), to = node_from_id(msg.to);
    assert(lbuffer.nonce(), 'missing msg nonce '+data);
    xerr.notice('*** send%s msg %s %s', fwd ? ' fwd '+fwd : '',
      from.t.name+to.t.name+'>'+cmd, stringify(msg));
    return etask(function*send(){
      switch (type){
      case 'req':
        switch (cmd){
        case 'conn_info': body= ''; break;
        case 'get_peer': body= ''; break;
        case '': break;
        default: assert(0, 'invalid cmd '+cmd);
        }
        break;
      case 'res':
        switch (cmd){
        case 'conn_info': body = conn_opts(body); break;
        case 'get_peer': body= ''; break;
        case '': break;
        default: assert(0, 'invalid cmd ', cmd);
        }
        break;
      default: assert(['req', 'res', 'req_start', 'res_start', 'req_next',
        'res_next', 'req_end', 'res_end'].includes(type),
        'unexpected msg type '+type);
      }
      e = build_cmd_o(from.t.name+fuzzy+to.t.name+'>msg',
        {id: req_id, type, cmd, seq, ack: ack && ack.join(','), body});
      if (fwd){
        let path = [msg.from];
        let i = lbuffer.size()-2;
        Array.from(fwd).reverse().forEach(f=>{
          let m = lbuffer.get_json(i);
          i--;
          let srt = t_conf.rt&&fwd&&m.rt ?
            build_cmd('rt', rt_to_str(m.rt)) : '';
          if (!t_conf.rt && xutil.get(m, ['rt', 'path']))
            srt = build_cmd('rt', rt_to_str(m.rt));
          e = build_cmd(f+'fwd', e+
            (t_conf.path&&fwd ? ' '+build_cmd('path', path_to_str(path||[]))
            : '')+(srt ? ' '+srt : ''));
          path.push(fwd_d_id(f));
        });
      }
      t_nonce[nonce_hash(msg)] = lbuffer.nonce();
      track_msg(msg);
      yield cmd_run_if_next_fake();
      yield cmd_run(e);
    });
  };
  destroy(){}
}

function req_hook(lbuffer){
  let msg = lbuffer.msg(), msg0 = lbuffer.get_json(0);
  // XXX: need to filter out only test commands, other should fail test
  if (!t_mode.req || !t_mode.msg)
    return;
  assert(!t_pre_process, 'invalid send during pre_process');
  let {fuzzy, type, req_id, seq, ack, cmd, body} = msg, e;
  assert(['req', 'req_start', 'req_next', 'req_end'].includes(type),
    'invalid msg type '+type);
  cmd = cmd||'';
  let from = node_from_id(msg.from), to = node_from_id(msg.to);
  let to0 = node_from_id(msg0.to);
  xerr.notice('*** req_send_hook %s %s',
    from.t.name+to.t.name+'>'+cmd, stringify(msg));
  switch (cmd){
  case 'conn_info':
    e = build_cmd(from.t.name+to.t.name+'>*conn_info', '');
    break;
  case 'get_peer':
    assert(fuzzy, 'get_peer must be fuzzy');
    e = build_cmd(from.t.name+to0.t.name+'>*get_peer', '');
    break;
  case '':
  case 'test':
    e = build_cmd_o(from.t.name+to.t.name+'>*'+type,
      {id: req_id, seq, ack: ack && ack.join(','), cmd, body});
    break;
  default: assert(0, 'invalid cmd '+cmd);
  }
  assert(msg.nonce, 'missing msg nonce '+stringify(msg));
  track_msg(msg);
  cmd_run(_build_cmd(e, '', ''));
}

// XXX NOW: rm it
function req_send_hook(msg){
  // XXX: need to filter out only test commands, other should fail test
  if (!t_mode.req || t_mode.msg)
    return;
  assert(!t_pre_process, 'invalid send during pre_process');
  let {type, req_id, seq, ack, cmd, body} = msg, e;
  assert(['req', 'req_start', 'req_next', 'req_end'].includes(type),
    'invalid msg type '+type);
  cmd = cmd||'';
  let from = node_from_id(msg.from), to = node_from_id(msg.to);
  xerr.notice('*** req_send_hook %s %s',
    from.t.name+to.t.name+'>'+cmd, stringify(msg));
  switch (cmd){
  case 'conn_info':
    e = build_cmd(from.t.name+to.t.name+'>*conn_info', '');
    break;
  case '':
  case 'test':
    e = build_cmd_o(from.t.name+to.t.name+'>*'+type,
      {id: req_id, seq, ack: ack && ack.join(','), cmd, body});
    break;
  default: assert(0, 'invalid cmd '+cmd);
  }
  assert(msg.nonce, 'missing msg nonce '+stringify(msg));
  track_msg(msg);
  cmd_run_if_next_fake();
  cmd_run(_build_cmd(e, '', ''));
}

function fail_hook(o){
  let id = typeof o.req_id=='string' && 'r'==o.req_id[0] ? o.req_id :
    undefined;
  let seq = o.req.stream ? o.seq : undefined;
  cmd_run(build_cmd_o(o.req.node.t.name+'>*fail', {id, seq, error: o.error}));
}

function res_hook(msg){
  if (!t_mode.req || !t_mode.msg)
    return;
  assert(!t_pre_process, 'invalid send during pre_process');
  let {type, req_id, seq, ack, cmd, body} = msg, e;
  assert(['res', 'res_start', 'res_next', 'res_end'].includes(type),
    'invalid msg type '+type);
  cmd = cmd||'';
  let from = node_from_id(msg.from), to = node_from_id(msg.to);
  xerr.notice('*** res_send_hook %s %s',
    from.t.name+to.t.name+'>'+cmd, stringify(msg));
  switch (cmd){
  case 'conn_info':
    e = build_cmd(from.t.name+to.t.name+'>*conn_info_r', conn_opts(body));
    break;
  case 'get_peer':
    e = build_cmd(from.t.name+to.t.name+'>*get_peer_r', body);
    break;
  case 'test':
  case '':
    e = build_cmd_o(from.t.name+to.t.name+'>*'+type, {id: req_id,
      seq, ack: ack && ack.join(','), cmd, body});
    break;
  default: assert(0, 'invalid cmd '+cmd);
  }
  assert(msg.nonce, 'missing msg nonce %s', stringify(msg));
  track_msg(msg);
  cmd_run(_build_cmd(e, '', ''));
}

// XXX NOW: rm it
function res_send_hook(router, msg){
  if (!t_mode.req || t_mode.msg)
    return;
  assert(!t_pre_process, 'invalid send during pre_process');
  let {type, req_id, seq, ack, cmd, body} = msg, e;
  assert(['res', 'res_start', 'res_next', 'res_end'].includes(type),
    'invalid msg type '+type);
  cmd = cmd||'';
  let from = node_from_id(msg.from), to = node_from_id(msg.to);
  xerr.notice('*** res_send_hook %s %s',
    from.t.name+to.t.name+'>'+cmd, stringify(msg));
  switch (cmd){
  case 'conn_info':
    e = build_cmd(from.t.name+to.t.name+'>*conn_info_r', conn_opts(body));
    break;
  case 'test':
  case '':
    e = build_cmd_o(from.t.name+to.t.name+'>*'+type, {id: req_id,
      seq, ack: ack && ack.join(','), cmd, body});
    break;
  default: assert(0, 'invalid cmd '+cmd);
  }
  assert(msg.nonce, 'missing msg nonce '+stringify(msg));
  track_msg(msg);
  cmd_run_if_next_fake();
  cmd_run(_build_cmd(e, '', ''));
}

function new_res_hook(res){
  let s = res.node;
  res.on('fail', o=>cmd_run(build_cmd_o(s.t.name+'>*fail',
    {id: o.req_id, seq: o.seq, error: o.error})));
}

function parse_path(s, dir){
  let a = (s||'').split(''), ret = [];
  a.forEach(name=>{
    if (dir=='<')
      ret.unshift(name_to_id(name));
    else
      ret.push(name_to_id(name));
  });
  return ret;
}

function path_to_str(path, dir){
  let a = [];
  path.forEach(id=>{
    if (dir=='<')
      a.unshift(id_to_name(id));
    else
      a.push(id_to_name(id));
  });
  return a.join('');
}

// XXX: cleanup all code
function id_to_name(id){ return node_from_id(id).t.name; }

// XXX: cleanup all code
function name_to_id(name){ return N(name).id.s; }

/* XXX: decide if to remove
function array_id_to_name(a){
  let ret = [];
  a.forEach(id=>ret.push(node_from_id(util.buf_from_str(id)).t.name));
  return ret;
}

function array_name_to_id(a){
  let ret = [];
  a.forEach(name=>{
    assert_exist(name);
    ret.push(util.buf_to_str(N(name).id));
  });
  return ret;
}
*/

function node_get_channel(_s, _d){
  let s = N(_s), d = N(_d);
  return d.peers.get(s.id.b);
}

const send_msg = (s, d, lbuffer)=>etask(function*send_msg(){
  let channel = node_get_channel(s, d);
  if (!channel)
    return xerr('no channel '+s+d+'>');
  yield N(d).router._on_channel_msg(lbuffer.to_str(), channel);
});

function fake_emit(c, msg){
  if (!t_mode.req)
    return;
  if (t_mode.msg) // XXX: TODO
    return;
  let s = N(c.s), d = N(c.d), to = d.id.s, from = s.id.s;
  msg.to = to;
  msg.from = from;
  let nonce = t_nonce[nonce_hash(msg)];
  assign(msg, {to, from, nonce, path: [from]});
  if (!msg.seq && ['req', 'res'].includes(msg.type))
    msg.seq = 0;
  assert(!c.fwd, 'fwd not allowed in fake_emit');
  assert(msg.req_id, 'missing req_id');
  track_msg(msg);
  if (!d.t.fake)
  {
    let lbuffer = new LBuffer(msg); // XXX WIP
    if (['req', 'req_start', 'req_next', 'req_end'].includes(msg.type))
      ReqHandler.t.req_handler_cb.call(d.router, lbuffer);
    else
      Req.t.res_handler(lbuffer);
  }
}

const fake_send_msg = (c, msg)=>etask(function*(){
  let s = N(c.s), d = N(c.d), f = s, t = d, fuzzy = get_fuzzy(c.d);
  let to = d.id.s, from = s.id.s;
  msg.to = to;
  msg.from = from;
  if (fuzzy)
    msg.fuzzy = fuzzy;
  assign(msg, {to, from, path: [from]});
  if (c.fwd){
    s = N(fwd_s(c.fwd, 0));
    d = N(fwd_d(c.fwd, 0));
  }
  if (['req', 'req_start', 'req_next', 'req_end'].includes(msg.type)){
    let id = msg.req_id||get_req_id({s: f.t.name, d: t.t.name,
      cmd: msg.cmd});
    if (!id || ['req', 'req_start'].includes(msg.type) && t_msg[id] &&
      t_msg[id].active){
      if (id)
        delete t_msg[id];
      id = ++t_req_id+'';
    }
    msg.req_id = id;
  }
  else if (['res', 'res_start', 'res_next', 'res_end'].includes(msg.type)){
    msg.req_id = msg.req_id||get_req_id({s: t.t.name, d: f.t.name,
      cmd: msg.cmd});
    assert(msg.req_id, 'missing req_id');
  }
  msg.nonce = t_nonce[nonce_hash(msg)] = t_nonce[nonce_hash(msg)]||
    ''+Math.floor(1e15 * Math.random());
  track_msg(msg);
  if (!d.t.fake){
    msg.sign = node_from_id(from).wallet.sign(msg);
    let lbuffer = new LBuffer(msg); // XXX: WIP
    if (c.fwd){
      for (let i=c.fwd.length-1; i>=0; i--){
        let rtt = t_conf.rtt.conn[
          string.sort_char(fwd_s(c.fwd, i)+fwd_d(c.fwd, i))]||t_conf.rtt.def;
        let msg2 = {from: fwd_s_id(c.fwd, i), to: fwd_d_id(c.fwd, i),
          type: 'fwd', rtt, rt: c.rt2[i]};
        if (!xutil.get(msg2, ['rt', 'path']))
          msg2.rt = {range: {min: fwd_d_id(c.fwd, i), max: msg.to}};
        lbuffer.add_json(msg2);
      }
    }
    yield send_msg(s.t.name, d.t.name, lbuffer);
  }
});

const cmd_ensure_no_events = opt=>etask(function*cmd_ensure_no_events(){
  let event = util.get(opt, 'event');
  assert(!event, 'unexpected event '+event);
  if (t_pre_process)
    return;
  yield xsinon.wait();
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
  let ids, no_node=false;
  assert(!event, 'got unexpected '+event);
  // XXX conf(id:a-mXYZn-z)
  // XXX conf(id:a-mXYZn-z !node) - in order NOT to create the nodes
  // XXX conf(id:a-mXYZn-z node:wrtc) - create wrtc nodes
  // XXX a,b,c=node === a,b,c=node:wss
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'id_bits': set_id_bits(assert_int(a.arg)); break;
    case 'id': ids = assert_node_ids(a.arg); break;
    case 'path': t_conf.path = assert_bool(a.arg); break;
    case 'rt': t_conf.rt = assert_bool(a.arg); break;
    case 'rtt': assert_rtt(a.arg); break;
    case '!node': no_node = assert_bool(a.arg); break;
    default: assert(0, 'invalid conf '+a.cmd);
    }
  });
  if (ids)
    set_node_ids(ids);
  if (!t_pre_process)
    return;
  if (ids && !no_node){
    let s = '';
    for (let name in ids)
      s += (s ? ' ' : '')+name+'=node:wss';
    push_cmd(s);
  }
}

function cmd_test_node_conn(opt){
  let {c, event} = opt, arg = xtest.test_parse(c.arg), s, exp = {};
  assert(!event, 'got unexpected '+event);
  util.forEach(arg, a=>{
    if (!s)
      s = N(a.cmd);
    exp[a.cmd] = a.arg||'';
  });
  if (t_pre_process || s.t.fake)
    return;
  s.router.node_map.map.forEach(node=>{
    let n = node_from_id(node.id.s), n2 = exp[n.t.name];
    // XXX: fix node_map.get to work also with strings
    // XXX: check also node_map.avl
    assert(n2!==undefined, 'node '+n.t.name+' not found');
    let s = '', a = Array.from(node.conn.keys());
    a.sort((a, b)=>NodeId.from(a).cmp(NodeId.from(b)));
    a.forEach(id=>{
      let conn = node.get_conn(NodeId.from(id));
      assert(conn.ids[0].eq(n.id) ? conn.ids[1].s==id :
        conn.ids[1].eq(n.id) && conn.ids[0].s==id);
      let d = node_from_id(id);
      s += (s ? ' ' : '')+d.t.name+':'+(conn.rtt||'na');
    });
    assert.equal(s, n2, 'conn mismatch for '+n.t.name);
    delete exp[n.t.name];
  });
  assert(!Object.keys(exp).length, 'missing nodes '+Object.keys(exp));
}

function cmd_test_node_find(opt){
  let {c, event} = opt, arg = xtest.test_parse(c.arg), s, target, next, prev;
  let bidi;
  assert(!event, 'got unexpected '+event);
  util.forEach(arg, a=>{
    if (!s){
      s = N(a.cmd);
      target = parseFloat(a.arg);
      return;
    }
    switch (a.cmd){
    case 'next': next = a.arg; break;
    case 'prev': prev = a.arg; break;
    case 'bidi': bidi = a.arg; break;
    default: assert.fail('unknown arg '+a.cmd);
    }
  });
  if (t_pre_process || s.t.fake)
    return;
  if (next!==undefined){
    let found = s.router.node_map.find_next(NodeId.from(target));
    assert.equal(node_from_id(found.id.s).t.name, next, 'next mismatch '+
      c.orig);
  }
  if (prev!==undefined){
    let found = s.router.node_map.find_prev(NodeId.from(target));
    assert.equal(found && node_from_id(found.id.s).t.name, prev,
      'prev mismatch '+c.orig);
  }
  if (bidi!==undefined){
    let found = s.router.node_map.find_bidi(NodeId.from(target));
    assert.equal(found && node_from_id(found.id.s).t.name, bidi,
      'bidi mismatch '+c.orig);
  }
}

function cmd_test_node_graph(opt){
  let {c, event} = opt, arg = xtest.test_parse(c.arg), s, exp = {};
  assert(!event, 'got unexpected '+event);
  util.forEach(arg, a=>{
    if (!s){
      s = N(a.cmd);
      assert(!a.arg);
      exp[a.cmd] = '0';
      return;
    }
    exp[a.cmd] = a.arg;
  });
  if (t_pre_process || s.t.fake)
    return;
  let ret = {};
  for (let [, node] of s.router.node_map.map){
    let p = path_to_str(node.graph.path, '<')+s.t.name;
    ret[p] = ''+(node.graph.rtt||0);
  }
  assert.deepEqual(ret, exp);
}

function cmd_rt_add(opt){
  let {c, event} = opt, arg = xtest.test_parse(c.arg);
  let routes = {};
  assert(!event, 'got unexpected '+event);
  util.forEach(arg, a=>{
    let node = N(a.cmd);
    assert(node, 'invalid rt_add '+a.cmd);
    let path = assert_path(a.arg);
    assert(path[0]!=node.id.s, 'route cannot contain node '+node.t.name);
    if (is_fake(node.t.name))
      return;
    routes[node.t.name] = routes[node.t.name]||[];
    routes[node.t.name].push(path);
  });
  if (t_pre_process)
    return;
  util.forEach(routes, (o, n)=>{
    o.forEach(path=>N(n).router.add_route(path));
  });
}

function cmd_comment(opt){
  let {c, event} = opt;
  if (t_pre_process)
    return set_orig(c, c.cmd+c.arg+'\r');
  if (t_i<t_cmds.length)
    return cmd_run(event);
}

function cmd_dbg(opt){
  let {event} = opt;
  debugger; // eslint-disable-line no-debugger
  if (t_i<t_cmds.length)
    return cmd_run(event);
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
      M(`a=node(id:10) b=node(id:20 wss) - ab>!connect`);
      break;
    case '2_nodes_wss':
      M(`a,b=node:wss ab>!connect()`);
      break;
    case '3_nodes_linear':
      M(`setup:2_nodes c=node(wss) bc>!connect`);
      break;
    case '3_nodes_wss':
      M(`setup:2_nodes_wss c=node(wss) bc,ac>!connect`);
      break;
    case '4_nodes_wss':
      M(`setup(3_nodes_wss) d=node(wss) cd,db,da>!connect`);
      break;
    default: assert(false, 'unknown macro '+m.cmd);
    }
  });
}

function cmd_node(opt){
  let {c} = opt, name, wss, wrtc, bootstrap, id, key;
  let arg = xtest.test_parse(c.arg);
  if (c.dir=='=')
    name = c.s;
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'wss': wss = assert_wss(a.arg); break;
    case 'wrtc': wrtc = assert_wrtc(a.arg); break;
    case 'boot': bootstrap = assert_bootstrap(a.arg); break;
    case 'id': id = assert_int(a.arg); break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  assert_name_new(name);
  if (id)
    id = NodeId.from(hash_from_int(id, t_conf.id_bits, NodeId.bits));
  else
    id = t_conf.node_ids[name];
  let fake = is_fake(name);
  if (id)
    key = {pub: id.b, priv: '00'};
  else {
    key = t_keys[name];
    assert(key, 'key not found '+name);
  }
  assert(!wss || !node_from_url(wss.url), wss?.url+' already used');
  let node = new (fake ? FakeNode : Node)(assign(
    {keys: {priv: s2b(key.priv), pub: s2b(key.pub)}, bootstrap, wrtc},
    wss));
  node.t = {id: node.id.s, name, fake, wss};
  xerr.notice('id %s:%s', name, node.id.s);
  t_nodes[name] = node;
}

// ab>!connect(wss) ab>http_get(upgrade(ws)) ab<http_resp(101)
// ab<tcp_send(b.id) ab>tcp_send(a.id) -
// once a gets b.id, it emits 'connection' - we emit ab>connect
// once b gets a.id, it emits 'connection' - we emit ab<connected
const cmd_connect = opt=>etask(function*(){
  let {c, event} = opt, s = N(c.s), d = N(c.d);
  let wss, wrtc, arg = xtest.test_parse(c.arg), call = c.cmd[0]=='!';
  let r = true;
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'wss': wss = assert_wss_url(c.d, a.arg); break;
    case 'wrtc': wrtc = assert_support_wrtc(d.t.name); break;
    case '!r': r = false; break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  assert(d, 'unknown node '+c.d);
  if (!wss && !wrtc && util.xor(support_wss(d), support_wrtc(d))){
    wss = wss_from_node(d);
    wrtc = support_wrtc(d);
  }
  assert_exist(c.s);
  assert(wss || wrtc, 'must specify wss or wrtc');
  if (t_pre_process){
    if (call)
    {
      if (r)
        push_cmd(build_cmd(c.s+c.d+'>connect', wss&&'wss', wrtc&&'wrtc'));
      set_orig(c, build_cmd(dir_c(c)+c.cmd, wss&&'wss', wrtc&&'wrtc', '!r'));
    }
    else {
      if (r)
          push_cmd(c.s+c.d+'<connected');
      set_orig(c, build_cmd(dir_c(c)+c.cmd, wss&&'wss', wrtc&&'wrtc', '!r'));
    }
    return;
  }
  if (call){
    assert(!event);
    if (!s.t.fake){
      if (wss)
        yield s.wsConnector.connect(wss);
      else if (wrtc)
        yield s.wrtcConnector.connect(d.id.b);
    }
  }
  else {
    if (s.t.fake && d.t.fake)
      return;
    if (s.t.fake){
      let channel = new FakeChannel({local_id: d.id, id: s.id});
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
      let s = '';
      if (c.loop){
        s += t_mode.msg ? build_cmd(loop_str(c.loop)+'>fwd',
          build_cmd_o(dir_c(c)+'msg', {type: 'req', cmd: 'conn_info'})) : '';
      } else {
        s += t_mode.msg ? build_cmd_o(dir_c(c)+'msg',
          {type: 'req', cmd: 'conn_info'}) : '';
      }
      s += t_mode.req ? (s ? ' ' : '')+build_cmd_o(c.s+c.d+'>*conn_info') : '';
      if (!nr && r===undefined)
        r = conn_opts_from_node(c.d);
      if (c.loop && r!==undefined){
        s += (s ? ' ': '')+
          build_cmd(rev_loop_str(c.loop)+'>conn_info_r', r);
      }
      set_push_cmd(c, s);
    }
    else
      set_orig(c, build_cmd(dir_c(c)+c.cmd));
    return;
  }
  assert_event_c(c, event);
  fake_emit(c, {type: 'req', cmd: 'conn_info', body: {}});
});

const cmd_conn_info_r = opt=>etask(function cmd_conn_info_r(){
  let {c, event} = opt, s = N(c.s), basic = !/[*!]/.test(c.cmd[0]);
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
      set_orig(c, build_cmd(dir_c(c)+c.cmd, c.arg));
    return;
  }
  assert_event_c(c, event);
  fake_emit(c, {type: 'res', cmd: 'conn_info', body: {ws, wrtc}});
});

const cmd_get_peer = opt=>etask(function cmd_get_peer(){
  let {c, event} = opt, basic = !/[*!]/.test(c.cmd[0]);
  let call = c.cmd[0]=='!', s = N(c.s), d = N(c.d, {fuzzy: call});
  let fuzzy = get_fuzzy(c.d);
  assert(!c.arg, 'invalid arg '+c.orig);
  assert(!call || !event, 'unexpected event for get_peer '+event);
  if (t_pre_process){
    if (call && c.loop){
      let s = build_cmd_o(c.s+c.d+'>!get_peer');
      s += t_mode.msg ? ' '+build_cmd(loop_str(c.loop)+'>fwd',
        build_cmd_o(dir_c(c)+'msg', {type: 'req', cmd: 'get_peer'})) : '';
      let loop = Array.from(c.loop).splice(0, c.loop.length-1);
      let sd = c.s+c.loop[loop.length-1].d+'>';
      s += t_mode.req ? ' '+build_cmd_o(sd+'*get_peer') : '';
      s += t_mode.msg ? ' '+build_cmd(rev_loop_str(loop)+'>get_peer_r') : '';
      s += t_mode.req ? ' '+build_cmd_o(rev_trim(sd)+'*get_peer_r') : '';
      set_push_cmd(c, s);
    } else if (basic && c.loop){
      let s = build_cmd(loop_str(c.loop)+'>fwd',
        build_cmd_o(dir_c(c)+'msg', {type: 'req', cmd: 'get_peer'}));
      set_push_cmd(c, s);
    }
    return;
  }
  if (call){
    let id = get_req_id({s: s.t.name, d: d.t.name, cmd: 'get_peer'});
    if (id && t_msg[id] && t_msg[id].active)
      delete t_msg[id];
    if (!s.t.fake)
      s.get_peer(d.id.s, {fuzzy});
    return;
  }
  assert_event_c(c, event);
  fake_emit(c, {type: 'req', cmd: 'get_peer', body: {}});
});

const cmd_get_peer_r = opt=>etask(function cmd_get_peer_r(){
  let {c, event} = opt, basic = !/[*!]/.test(c.cmd[0]);
  let arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd){
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  if (t_pre_process){
    if (basic){
      let s;
      if (c.loop){
        s = build_cmd(loop_str(c.loop)+'>fwd',
          build_cmd_o(dir_c(c)+'msg', {type: 'res', cmd: 'get_peer'}));
      } else
        s = build_cmd_o(dir_c(c)+'msg', {type: 'res', cmd: 'get_peer'});
      set_push_cmd(c, s);
    }
    return;
  }
  assert_event_c(c, event);
  fake_emit(c, {type: 'res', cmd: 'get_peer_r', body: ''});
});


const cmd_msg = opt=>etask(function*cmd_msg(){
  let {c, event} = opt, s = N(c.s), d = N(c.d);
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
    if (c.loop)
      c = expand_loop_fwd(c);
    else {
      set_orig(c, build_cmd_o(dir_c(c)+c.cmd,
        {id, type, cmd, seq, ack, body}));
    }
    return;
  }
  if (['req', 'req_start', 'req_next', 'req_end'].includes(type)){
    id = id||get_req_id({s: s.t.name, d: d.t.name, cmd});
  } else if (['res', 'res_start', 'res_next', 'res_end'].includes(type)){
    // XXX HACK: we use t_req_id_last to handle fuzzy. in fuzzy a-a>req
    // but the response is sent from uknown node.
    id = id||get_req_id({s: d.t.name, d: s.t.name, cmd})||t_req_id_last;
  }
  if (ack===undefined && ['req_next', 'req_end', 'res', 'res_start',
    'res_next', 'res_end'].includes(type)){
    ack = get_ack({req_id: id,
      type: ['req_next', 'req_end'].includes(type) ? 'res' : 'req',
      keep: t_mode.req && t_mode.msg || !c.fwd || fwd_d(c.fwd, 0)!=d.t.name});
  }
  if (['req', 'res'].includes(type)) // XXX: need auto-mode for seq
    seq = seq||0;
  assert_event_c2(c, build_cmd_o(dir_c(c)+c.cmd,
    {id, type, cmd, seq, ack, body}), c.fwd, event, false);
  if (['req', 'res'].includes(type)) // XXX: need auto-mode for seq
    seq = seq||0;
  if (type=='req'){
    switch (cmd){
    case 'conn_info': break;
    case 'get_peer': break;
    case '': break;
    default: assert(0, 'invalid cmd '+cmd);
    }
  }
  else if (type=='res'){
    switch (cmd){
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
    case 'get_peer': body= ''; break;
    case '': break;
    default: assert(0, 'invalid cmd '+cmd);
    }
  }
  let rt; // XXX: rm this logic. just pass c.rt
  if (xutil.get(c, ['rt', 'path']))
    rt = {path: parse_path(rt_to_str(c.rt), c.dir)};
  yield fake_send_msg(c, {rt, req_id: id, type, seq, ack, cmd, body});
  yield cmd_run_if_next_fake();
});

const cmd_req = opt=>etask(function*req(){
  let {c, event} = opt, s = N(c.s), d = N(c.d), seq, ack;
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
    assert_event_c2(c, build_cmd_o(dir_c(c)+c.cmd,
      {id, cmd, seq, ack, body, ooo, dup, close}), c.fwd, event, call);
    return;
  }
  id = id||get_req_id({s: s.t.name, d: d.t.name, cmd});
  if (call){
    if (!id || ['req', 'req_start'].includes(type) && t_msg[id] &&
      t_msg[id].active){
      if (id)
        delete t_msg[id];
      id = ++t_req_id+'';
    }
  }
  if (!call && ack===undefined){
    ack = get_ack({req_id: id||get_req_id({s: d.t.name, d: s.t.name, cmd}),
      type: 'res'});
  }
  seq = track_seq_req(s.t.name, d.t.name, id, cmd, type, seq, call);
  cmd = cmd || t_req[id].cmd;
  assert_event_c2(c, build_cmd_o(dir_c(c)+c.cmd,
    {id, seq, ack, cmd, body}), c.fwd, event, call);
  if (!call){
    fake_emit(c, {type, req_id: id, seq, ack, cmd, body});
    return yield cmd_run_if_next_fake();
  }
  seq = t_req[id].seq;
  if (!s.t.fake){
    if (type=='req'){
      assert(!Req.t.reqs[id], 'req already exists '+id);
      let req = new Req({node: s, dst: d.id.s, req_id: id});
      assert.equal(req.req_id, id, 'req_id mismatch');
      req.send({seq, ack}, body);
    } else if (type=='req_start'){
      assert(!Req.t.reqs[id], 'req already exists '+id);
      let req = new Req({node: s, stream: true, dst: d.id.s, req_id: id,
        cmd});
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
  let {c, event} = opt, s = N(c.s), d = N(c.d);
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
  id = id||get_req_id({s: d.t.name, d: s.t.name, cmd});
  if (!d){
    assert_event_c2(c, build_cmd_o(dir_c(c)+c.cmd,
      {id, cmd, seq, ack, body, ooo, dup, close}), c.fwd, event, call);
    return;
  }
  _id = id||get_req_id({s: d.t.name, d: s.t.name, cmd});
  if (!call && ack===undefined)
    ack = get_ack({req_id: _id, type: 'req'});
  seq = track_seq_res(s.t.name, d.t.name, id, type, seq, call);
  cmd = cmd || t_req[id].cmd;
  assert(seq!==undefined, 'must have seq');
  assert_event_c2(c, build_cmd_o(dir_c(c)+c.cmd,
    {id, seq, ack, cmd, body}), c.fwd, event, call);
  id = _id;
  if (!call){
    fake_emit(c, {type, req_id: id, seq, ack, cmd, body});
    return yield cmd_run_if_next_fake();
  }
  if (!s.t.fake){
    if (type=='res_end'){
      if (close){
        ReqHandler.t.nodes[s.id.s].req_id[id].res.send_close({seq, ack},
          body);
      }
      else {
        ReqHandler.t.nodes[s.id.s].req_id[id].res.send_end({seq, ack},
          body);
      }
    }
    else
      ReqHandler.t.nodes[s.id.s].req_id[id].res.send({seq, ack}, body);
  }
});

const cmd_fail = opt=>etask(function*req(){
  let {c, event} = opt, s = N(c.s), d = N(c.d);
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
  assert(error, 'fail missing error');
  if (t_pre_process)
    return set_orig(c, build_cmd_o(dir_c(c)+c.cmd, {id, seq, error}));
  assert_event_c(c, event);
  yield cmd_run_if_next_fake();
});

const cmd_fwd = opt=>etask(function*cmd_fwd(){
  let {c, event} = opt;
  let arg = xtest.test_parse(c.arg), f = arg.shift(), rt, path;
  util.forEach(arg, a=>{
    switch (a.cmd){
    case 'rt': rt = assert_rt(a.arg, c.dir); break;
    case 'path': path = assert_path(a.arg, c.dir); break;
    default: assert(0, 'unknown arg '+a.cmd);
    }
  });
  f.fwd = Array.from(c.fwd||[]);
  f.fwd.push(dir_c(c));
  f.path2 = Array.from(c.path2||[]); // XXX: rm from here!
  f.path2.push(path);
  f.rt2 = Array.from(c.rt2||[]); // XXX: rm from here!
  f.rt2.push(rt);
  if (t_pre_process){
    if (c.loop)
      return expand_loop_fwd(c);
  }
  yield cmd_run_single({c: f, event});
  if (t_pre_process){
    return set_orig(c, _build_cmd(f.orig+
      (path ? ' '+build_cmd('path', path_to_str(path, c.dir)) : '')+
      (rt ? ' '+build_cmd('rt', rt_to_str(rt, c.dir)) : ''), [dir_c(c)]));
  }
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
    // XXX: remove from  here
    if ('<>'.includes(c.cmd[2])){
      // XXX fixme:
      // build_cmd(c.s+c.d+c.dir+'fwd', build_cmd(c.cmd, c.arg)))[0]);
      assign(c, xtest.test_parse(
        build_cmd(c.orig.slice(0, 3)+'fwd', c.orig.slice(3)))[0]);
    }
    // XXX: remove from  here
    if (a = c.cmd.match(/(^\d+)ms$/))
      assign(c, xtest.test_parse(build_cmd('ms', a[1]))[0]);
    // XXX: remove from  here
    if (a = c.cmd.match(/(^\d+)s$/))
      assign(c, xtest.test_parse(build_cmd('ms', +a[1]*date.ms.SEC))[0]);
    if (c.loop && c.comma){
      expand_loop_repeat(c);
      return;
    }
  }
  switch (c.cmd){
  case '-': yield cmd_ensure_no_events(opt); break;
  case '//': yield cmd_comment(opt); break;
  case 'dbg': yield cmd_dbg(opt); break;
  case 'setup': yield cmd_setup(opt); break;
  case 'mode': yield cmd_mode(opt); break;
  case 'conf': yield cmd_conf(opt); break;
  case 'rt_add': yield cmd_rt_add(opt); break;
  case 'node': yield cmd_node(opt); break;
  case '!connect': yield cmd_connect(opt); break;
  case 'connect': yield cmd_connect(opt); break;
  case 'connected': yield cmd_connected(opt); break;
  case 'conn_info': yield cmd_conn_info(opt); break;
  case '*conn_info': yield cmd_conn_info(opt); break;
  case 'conn_info_r': yield cmd_conn_info_r(opt); break;
  case '*conn_info_r': yield cmd_conn_info_r(opt); break;
  case 'get_peer': yield cmd_get_peer(opt); break;
  case '!get_peer': yield cmd_get_peer(opt); break;
  case '*get_peer': yield cmd_get_peer(opt); break;
  case 'get_peer_r': yield cmd_get_peer_r(opt); break;
  case '*get_peer_r': yield cmd_get_peer_r(opt); break;
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
  case 'test_node_conn': yield cmd_test_node_conn(opt); break;
  case 'test_node_find': yield cmd_test_node_find(opt); break;
  case 'test_node_graph': yield cmd_test_node_graph(opt); break;
  default: assert(false, 'unknown cmd '+c.cmd+ ' '+c.orig);
  }
});

// XXX NOW: need test
function expand_loop_fwd(c){
  assert(c.loop);
  assert(t_pre_process);
  let a = [], dir = c.loop[0].dir, prev = c.arg;
  assert(['fwd', 'msg'].includes(c.cmd), 'invalid loop '+c.cmd);
  if (c.cmd=='msg'){
    prev = build_cmd(dir_str(c.loop[0].s,
      c.loop[c.loop.length-1].d, c.loop[0].dir)+c.cmd, c.arg);
  }
  for (let i=0; i<c.loop.length; i++){
    let o = assign({}, c, c.loop[i]), rt='';
    if (get_fuzzy(o.s) || get_fuzzy(o.d))
      break;
    delete o.loop;
    o.cmd = 'fwd';
    let end = i+1;
    for (; end<c.loop.length; end++){
      if (c.loop[end].dot)
        break;
    }
    for (let j=i+1; !c.loop[i].dot && j<end; j++){
      if (c.loop[j].dot)
        break;
      else
        rt += c.loop[j].d;
    }
    o.arg = prev+(rt ? ' rt('+
      (dir=='>' ? rt : rt.split('').reverse().join(''))+')' : '');
    prev = _build_cmd(o.arg, [dir_c(o)]);
    set_orig(o, prev);
    a.push(o);
  }
  return _set_push_cmd(c, a);
}

// XXX NOW: need test
function expand_loop_repeat(c){
  assert(c.loop);
  assert(c.comma);
  assert(t_pre_process);
  let a = [];
  for (let i=0; i<c.loop.length; i++){
    let o = assign({}, c, c.loop[i]);
    delete o.loop;
    set_orig(o, build_cmd(dir_c(o)+o.cmd, o.arg));
    a.push(o);
  }
  return _set_push_cmd(c, a);
}

// XXX: check if we still really need it
const cmd_run_if_next_fake = event=>etask(function*cmd_run_if_next_fake(){
  assert(!t_pre_process);
  if (t_role=='fake')
    return;
  let next = t_cmds[t_i];
  for (let i=t_i+1; next && ['//', 'dbg'].includes(next.cmd) &&
    i<t_cmds.length; i++){
    next = t_cmds[i];
  }
  if (next && next.s && next.cmd[0]=='*' && (t_mode.msg || !t_mode.req)){
    if (!next.d || !N(next.d).t.fake)
      return;
    return yield cmd_run();
  }
  if (!next || !next.s || !N(next.s).t.fake)
    return;
  yield cmd_run();
});

let t_depth = 0;
const cmd_run = event=>etask(function*cmd_run(){
  assert(t_cmds && t_i<t_cmds.length, event ? 'unexpected event '+event :
    'invalid t_i '+t_i+' event');
  let c = t_cmds[t_i];
  assert(c, event ? 'unexpected event '+event : 'empty cmd at '+t_i);
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

function set_id_bits(bits){ t_conf.id_bits = bits; }
function set_node_ids(ids){ t_conf.node_ids = ids||{}; }

function test_start(role){
  t_role = role;
  t_port = 4000;
  assert(!Object.keys(t_nodes).length, 'nodes exists on test start '+
    stringify(Object.keys(t_nodes)));
  t_mode = {msg: true, req: true};
  t_mode_prev = [];
  t_req_id = 0;
  t_msg = {};
  t_cmds = undefined;
  t_cmds_processed = [];
  t_nonce = {};
  t_req = {};
  t_conf = {rtt: {def: DEF_RTT, conn: {}}};
  set_id_bits(10);
  set_node_ids();
}

function test_setup_mode(){
  if (t_mode.req){
    Req.t_send_hook = req_send_hook;
    ReqHandler.t_send_hook = res_send_hook;
    Req.t.res_hook = res_hook;
    Req.t.fail_hook = fail_hook;
    ReqHandler.t.req_hook = req_hook;
  }
  else {
    delete ReqHandler.t_send_hook;
    delete Req.t_send_hook;
    delete Req.t.res_hook;
    delete Req.t.fail_hook;
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

// XXX: copy of xtest.plugin_cmd_dir
function plugin_cmd_dir(o){
  o = xtest.test_parse_cmd_single(test_transform(o.orig));
  let t = xtest.parse_cmd_dir(o.cmd);
  let o2 = assign({}, o);
  assign(o, t, {arg: o2.arg, orig: o2.orig});
  o.meta = assign(o.meta||{}, o2.meta);
  return o;
}

function test_parse(s){
  return xtest.test_run_plugin(xtest.test_parse_cmd_multi(s), plugin_cmd_dir);
}
const test_pre_process = test=>etask(function*test_preprocess(){
  assert(!t_pre_process, 'already in pre_process');
  t_pre_process = true;
  yield _test_run('fake', test_parse(test));
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

function test_transform(s){
  let _d = s.search(/[<>]/);
  if (_d==-1)
    return s;
  let dir = s[_d], pre = s.substr(0, _d), post = s.substr(_d+1, Infinity);
  let a = [], p='', rt='';
  for (let i=0, open=false; i<pre.length; i++){
    let ch = s[i];
    if (ch=='[')
      open = true;
    else if (ch==']')
      open = false;
    else if (open)
      rt += ch;
    else if (ch==':'){
      assert(!open, 'missing ] for '+s);
      rt = rt ? ' rt('+rt+')' : '';
      a.push({pre: p+dir, rt});
      p = rt = '';
    }
    else
      p += ch;
  }
  rt = rt ? ' rt('+rt+')' : '';
  let ret = '';
  if (dir=='>'){
    a.push({pre: p+dir+post, rt});
    a = a.reverse();
  } else {
    a.push({pre: p+dir, rt});
    a[0].pre += post;
  }
  a.forEach((c, i)=>ret = !i ? c.pre : c.pre+'fwd('+ret+c.rt+')');
  return ret;
}

describe('buf_util', ()=>{
  it('hash_from_int', function(){
    const _t = (val, bits, max_bits, exp)=>{
      assert.equal(hash_from_int(val, bits, max_bits), exp);
      assert.equal(int_from_hash(exp, bits, max_bits), val);
    };
    const t = (val, bits, exp)=>_t(val, bits, 40, exp);
    t(1, 8, '0100000000');
    t(2, 8, '0200000000');
    t(255, 8, 'ff00000000');
    t(1, 9, '0080000000');
    t(2, 9, '0100000000');
    t(3, 9, '0180000000');
    t(1, 8, '0100000000');
    t(1, 16, '0001000000');
    t(1, 24, '0000010000');
    t(2, 8, '0200000000');
    t(15, 8, '0f00000000');
    t(255, 8, 'ff00000000');
    t(1023, 16, '03ff000000');
    t(1, 10, '0040000000');
    t(1023, 10, 'ffc0000000');
    t(1, 40, '0000000001');
    _t(1, 256, 256,
      '0000000000000000000000000000000000000000000000000000000000000001');
    _t(bigInt(2).pow(256).minus(1).toString(10), 256, 256,
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  });
  it('gen_ids', function(){
    // abcdefghijklmXYZnopqrstuvwxyz
    // b-a = 2^128/26 X=m+(n-m)/2 Y=X+1 Z=X+2
    let ids = test_gen_ids(8, 16);
    assert.equal(ids.a.s, '0900');
    assert.equal(ids.b.s, '1200');
    assert.equal(ids.m.s, '7500');
    assert.equal(ids.X.s, '7900');
    assert.equal(ids.Y.s, '7a00');
    assert.equal(ids.Z.s, '7b00');
    assert.equal(ids.n.s, '7e00');
    assert.equal(ids.y.s, 'e100');
    assert.equal(ids.z.s, 'ea00');
  });
});

describe('node_id', function(){
  it('basic', function(){
    const i2b = val=>s2b(hash_from_int(val, 80, 80));
    const t = (val, exp)=>{
      let id = NodeId.from(i2b(val));
      assert.equal(id.s, exp);
      assert.equal(id.b.toString('hex'), exp);
      id = new NodeId(Buffer.from(exp, 'hex'));
      assert.equal(id.s, exp);
      assert.equal(id.b.toString('hex'), exp);
    };
    t(1, '00000000000000000001');
    t(2, '00000000000000000002');
    t(8, '00000000000000000008');
    t(15, '0000000000000000000f');
    t(16, '00000000000000000010');
    t(bigInt(2).pow(48).minus(1).toString(10), '00000000ffffffffffff');
    t('281474976710655', '00000000ffffffffffff');
    t(bigInt(2).pow(52).minus(1).toString(10), '0000000fffffffffffff');
    t(bigInt(2).pow(56).minus(1).toString(10), '000000ffffffffffffff');
    t(bigInt(2).pow(80).minus(1).toString(10), 'ffffffffffffffffffff');
    t(bigInt(2).pow(80).minus(2).toString(10), 'fffffffffffffffffffe');
    t(bigInt(2).pow(80).minus(15).toString(10), 'fffffffffffffffffff1');
    t(bigInt(2).pow(80).minus(16).toString(10), 'fffffffffffffffffff0');
  });
  it('buffer', function(){
    const t = (s, exp)=>{
      let id = NodeId.from(s);
      assert.equal(b2s(id.b), exp);
    };
    t('00000000000000000000', '00000000000000000000');
    // XXX: fixme: it should be 00000000000000000000
    t('00000000000000', '00000000000000');
  });
  it('number', function(){
    const t = (s, exp, exp_f)=>{
      let id = NodeId.from(s);
      assert.equal(''+id.i, exp);
      assert.equal(!id.d ? '0' : ''+id.d, exp_f);
    };
    t('00000000000000000000', '0', '0');
    t('00000000000000000001', '0', '0');
    t('00000000000000f00000', '0', '0');
    t('00000000000001000000', '1', '1.3877787807814457e-17');
    t('00000000000002000000', '2', '2.7755575615628914e-17');
    t('fffffffffff000000000', '9007199254736896', '0.9999999999999432');
    t('ffffffffffff00000000', '9007199254740736', '0.9999999999999964');
    t('fffffffffffff0000000', '9007199254740976', '0.9999999999999998');
    t('fffffffffffff8000000', '9007199254740984', '0.9999999999999999');
    t('fffffffffffff9000000', '9007199254740985', '0.9999999999999999');
    t('fffffffffffffe000000', '9007199254740990', '1');
    t('ffffffffffffff000000', '9007199254740991', '1');
    t('ffffffffffffff100000', '9007199254740991', '1');
    t('ffffffffffffffffffff', '9007199254740991', '1');
    t('1ffffffffffff0000000', 9007199254740976, '0.12499999999999978');
    t('20000000000000000000', 0, '0.125');
  });
  it('from_double', function(){
    const t = (d, exp_s, exp_d)=>{
      let id = NodeId.from(d);
      assert.equal(''+id.s, exp_s);
      assert.equal(''+id.d, exp_d);
    };
    t(0, '0000000000000000000000000000000000000000', '0');
    t(0.125, '1ffffffffffff000000000000000000000000000',
      '0.12499999999999978');
    t(0.25, '3ffffffffffff000000000000000000000000000', '0.24999999999999978');
    t(0.5, '7ffffffffffff000000000000000000000000000', '0.4999999999999998');
    t(0.75, 'bffffffffffff000000000000000000000000000', '0.7499999999999998');
    t(1, 'fffffffffffff000000000000000000000000000', '0.9999999999999998');
    t('0', '0000000000000000000000000000000000000000', '0');
    t('1', 'fffffffffffff000000000000000000000000000', '0.9999999999999998');
    t('.0', '0000000000000000000000000000000000000000', '0');
    t('0.5', '7ffffffffffff000000000000000000000000000', '0.4999999999999998');
    t('.5', '7ffffffffffff000000000000000000000000000', '0.4999999999999998');
    t('.145e-10', '000000000ff16000000000000000000000000000',
      '1.4499956790814394e-11');
  });
  it('cmp', function(){
    const t = (a, b, exp)=>{
      assert.equal(NodeId.from(a).cmp(NodeId.from(b)), exp);
      assert.equal(NodeId.from(a).eq(NodeId.from(b)), !exp);
    };
    t('00000000000000000000', '00000000000000000000', 0);
    t('00000000000000000000', '00000000000000000001', -1);
    t('00000000000000000001', '00000000000000000000', 1);
    t('00000000000001000000', '00000000000001000000', 0);
    t('00000000000001000000', '00000000000002000000', -1);
    t('00000000000002000000', '00000000000001000000', 1);
    t('fffffffffffff0000000', 'fffffffffffff0000000', -0);
    t('fffffffffffff0000000', 'fffffffffffff8000000', -1);
    t('fffffffffffff8000000', 'fffffffffffff0000000', 1);
    t('fffffffffffff9000000', 'fffffffffffff9000000', 0);
    t('fffffffffffff9000000', 'fffffffffffffe000000', -1);
    t('fffffffffffffe000000', 'fffffffffffff9000000', 1);
    t('fffffffffffffffffffe', 'fffffffffffffffffffe', 0);
    t('fffffffffffffffffffe', 'ffffffffffffffffffff', -1);
    t('ffffffffffffffffffff', 'fffffffffffffffffffe', 1);
    t('ffffffffffffffffffff', 'ffffffffffffffffffff', 0);
  });
  it('in_range', ()=>{
    const t = (range, id, exp)=>{
      range = {min: NodeId.from(range.min), max: NodeId.from(range.max)};
      id = NodeId.from(id);
      assert.equal(id.in_range(range), exp);
    };
    t({min: 0.10, max: 0.20}, 0.9, false);
    t({min: 0.10, max: 0.20}, 0.10, false);
    t({min: 0.10, max: 0.20}, 0.11, true);
    t({min: 0.10, max: 0.20}, 0.19, true);
    t({min: 0.10, max: 0.20}, 0.20, false);
    t({min: 0.10, max: 0.20}, 0.21, false);
    t({min: 0.20, max: 0.10}, 0.19, false);
    t({min: 0.20, max: 0.10}, 0.20, false);
    t({min: 0.20, max: 0.10}, 0.21, true);
    t({min: 0.20, max: 0.10}, 0.9, true);
    t({min: 0.20, max: 0.10}, 0.10, false);
    t({min: 0.20, max: 0.10}, 0.11, false);
    t({min: 0.10, max: 0.10}, 0.9, true);
    t({min: 0.10, max: 0.10}, 0.10, false);
    t({min: 0.10, max: 0.10}, 0.11, true);
    t({min: 0.25, max: 0.30}, 0.50, false);
    t({min: 0.30, max: 0.40}, 0.50, false);
    t({min: 0.40, max: 0.10}, 0.50, true);
  });
  it('dist', function(){
    const t = (a, b, exp)=>{
      assert.equal(NodeId.from(a).dist(NodeId.from(b)), exp);
      assert.equal(NodeId.from(b).dist(NodeId.from(a)), exp);
    };
    t('00000000000000000000', '00000000000000000000', 0);
    t('00000000000000000000', 'ffffffffffffffffffff', 0);
    t('00000000000000000000', '3fffffffffffffffffff', 0.25);
    t('00000000000000000000', '7fffffffffffffffffff', 0.5);
    t('00000000000000000000', 'bfffffffffffffffffff', 0.25);
    t('3fffffffffffffffffff', '3fffffffffffffffffff', 0);
    t('3fffffffffffffffffff', '7fffffffffffffffffff', 0.25);
    t('3fffffffffffffffffff', 'bfffffffffffffffffff', 0.5);
    t('3fffffffffffffffffff', '00000000000000000000', 0.25);
    t('3fffffffffffffffffff', 'ffffffffffffffffffff', 0.25);
  });
  it('dist_bits', function(){
    const t = (a, b, exp)=>{
      assert.equal(NodeId.from(a).dist_bits(NodeId.from(b)), exp);
      assert.equal(NodeId.from(b).dist_bits(NodeId.from(a)), exp);
    };
    t('00000000000000000000', '00000000000000000000', 0);
    t('00000000000000000000', '00000000000001000000', 0);
    t('00000000000000000000', '00000000000010000000', 1);
    t('00000000000000000000', '00000000000100000000', 5);
    t('00000000000000000000', '00000000001000000000', 9);
    t('00000000000000000000', '00000000010000000000', 13);
    t('00000000000000000000', '00000000100000000000', 17);
    t('00000000000000000000', '01000000000000000000', 45);
    t('00000000000000000000', '10000000000000000000', 49);
    t('00000000000000000000', '5fffffffffffffffffff', '51.584962500721154');
    t('00000000000000000000', '7fffffffffffffffffff', 52);
    t('00000000000000000000', '6fffffffffffffffffff', '51.807354922057606');
    t('00000000000000000000', 'ffffffffffffffffffff', 0);
    t('0', '.125', 50);
    t('0', '.25', 51);
    t('0', '.37', '51.56559717585422');
    t('0', '.375', '51.584962500721154');
    t('0', '.38', '51.60407132366886');
    t('0', '.4999', '51.99971143213407');
    t('0', '.5', 52);
    t('0', '.75', 51);
  });
  it('rtt_pb_via', function(){
    const t = (o, exp)=>{
      let s = NodeId.from(o.s), d = NodeId.from(o.d), v = NodeId.from(o.v);
      let ret = NodeId.rtt_pb_via(s, d, v, o.rtt);
      if (exp.good===false)
        return assert.deepEqual(ret, exp);
      assert(ret.good);
      assert.equal(ret.bits_done.toFixed(3), exp.done);
      assert.equal(ret.rtt_pb.toFixed(3), exp.rtt_pb);
    };
    t({s: '0', d: '.5', v: '.001', rtt: 100}, {done: 0.003,
      rtt_pb: 34622.690, dist_bits_sd: 52, dist_bits_vd: 51.997});
    t({s: '0', d: '.5', v: '.125', rtt: 100}, {done: 0.415,
      rtt_pb: 240.942, dist_bits_sd: 52, dist_bits_vd: 51.585});
    t({s: '0', d: '.5', v: '.25', rtt: 100}, {done: 1,
      rtt_pb: 100, dist_bits_sd: 52, dist_bits_vd: 51});
    t({s: '0', d: '.5', v: '.375', rtt: 100}, {done: 2,
      rtt_pb: 50, dist_bits_sd: 52, dist_bits_vd: 50});
    t({s: '0', d: '.5', v: '.4375', rtt: 100}, {done: 3,
      rtt_pb: 33.333, dist_bits_sd: 52, dist_bits_vd: 49});
    t({s: '0', d: '.5', v: '.46875', rtt: 100}, {done: 4,
      rtt_pb: 25, dist_bits_sd: 52, dist_bits_vd: 48});
    t({s: '0', d: '.5', v: '.499', rtt: 100}, {done: 8.966,
      rtt_pb: 11.154, dist_bits_sd: 52, dist_bits_vd: 43.034});
    t({s: '0', d: '.5', v: '.5', rtt: 100}, {done: 52,
      rtt_pb: 1.923, dist_bits_sd: 52, dist_bits_vd: 0});
    t({s: '0', d: '.5', v: '.75', rtt: 100}, {done: 1,
      rtt_pb: 100, dist_bits_sd: 52, dist_bits_vd: 51});
    t({s: '.25', d: '.5', v: '.375', rtt: 100}, {done: 1,
      rtt_pb: 100, dist_bits_sd: 51, dist_bits_vd: 50});
    t({s: '.25', d: '.75', v: '.5', rtt: 100}, {done: 1,
      rtt_pb: 100, dist_bits_sd: 52, dist_bits_vd: 51});
    t({s: '.25', d: '.75', v: '0', rtt: 100}, {done: 1,
      rtt_pb: 100, dist_bits_sd: 52, dist_bits_vd: 51});
    t({s: '.0025', d: '.0075', v: '.005', rtt: 100}, {done: 1,
      rtt_pb: 100, dist_bits_sd: 45.356, dist_bits_vd: 44.356});
    t({s: '0', d: '0', v: '.25', rtt: 100}, {good: false});
    t({s: '0', d: '.5', v: '0', rtt: 100}, {good: false});
    t({s: '0', d: '.5', v: '1', rtt: 100}, {good: false});
    t({s: '.25', d: '.5', v: '.24', rtt: 100}, {good: false});
    t({s: '.25', d: '.5', v: '.76', rtt: 100}, {good: false});
    t({s: '0', d: '8000000000000000000', v: '4000000000000000000', rtt: 100},
      {done: 1, rtt_pb: 100, dist_bits_sd: 52, dist_bits_vd: 51});
    t({s: '0', d: '8000000000000000000', v: '6000000000000000000', rtt: 100},
      {done: 2, rtt_pb: 50, dist_bits_sd: 52, dist_bits_vd: 50});
    // XXX derry: review this - is this correct?
    t({s: '0', d: '0.5', v: '0000000000000000001', rtt: 100}, {good: false});
  });
});

describe('api', function(){
  it('transform', ()=>{
    let t = (s, exp)=>assert.equal(test_transform(s), exp);
   t('ab:ad>msg', `ab>fwd(ad>msg)`);
   t('bc:ab:ad>msg', `bc>fwd(ab>fwd(ad>msg))`);
   t('cd:bc:ab:ad>msg', `cd>fwd(bc>fwd(ab>fwd(ad>msg)))`);
   t('ab[c]:ad>msg', `ab>fwd(ad>msg rt(c))`);
   t('ab[cd]:ad>msg', `ab>fwd(ad>msg rt(cd))`);
   t('cd[x]:bc[y]:ab[z]:ad>msg',
     `cd>fwd(bc>fwd(ab>fwd(ad>msg rt(z)) rt(y)) rt(x))`);
   t('ab:ad<msg', `ad<fwd(ab<msg)`);
   t('bc:ab:ad<msg', `ad<fwd(ab<fwd(bc<msg))`);
   t('cd:bc:ab:ad<msg', `ad<fwd(ab<fwd(bc<fwd(cd<msg)))`);
   t('da:ba[c]<msg', `ba<fwd(da<msg rt(c))`);
   t('da:ba[cd]<msg', `ba<fwd(da<msg rt(cd))`);
   t('da:ba[x]:cb[y]:dc[z]<msg',
     `dc<fwd(cb<fwd(ba<fwd(da<msg rt(x)) rt(y)) rt(z))`);
   // XXX: add test for invalid
  });
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
    t(['ab>msg', ['cd>']], 'cd>fwd(ab>msg)');
    t(['ab>msg', ['cd>', 'ef>']], 'cd>fwd(ef>fwd(ab>msg))');
    t(['ab>msg', '', 'x'], 'ab>msg(x)');
    t(['ab>msg', '', 'x', 'y'], 'ab>msg(x y)');
    t(['ab>msg', ['cd>'], 'x', 'y'], 'cd>fwd(ab>msg(x y))');
    t(['ab>msg', ['cd>', 'ef>'], 'x', 'y'], 'cd>fwd(ef>fwd(ab>msg(x y)))');
  });
  describe('lbuffer', ()=>{
    it('to_str', ()=>{
      const t = exp=>assert.equal(lbuffer.to_str(), exp);
      let lbuffer = new LBuffer();
      t('\0');
      lbuffer.add('a');
      t('\0a');
      lbuffer.add('bb');
      t('[2,1]\0bba');
      lbuffer.add('ccc');
      t('[3,2,1]\0cccbba');
      lbuffer.add('');
      t('[0,3,2,1]\0cccbba');
      lbuffer.add('abcdefghijk');
      t('[11,0,3,2,1]\0abcdefghijkcccbba');
    });
    it('from_str', ()=>{
      const t = (s, exp)=>{
        let lbuffer = LBuffer.from(s);
        exp.forEach((data, i)=>exp[i] = {data});
        assert.deepEqual(lbuffer.array, exp);
      };
      t('\0', ['']);
      t('\0a', ['a']);
      t('[]\0a', ['a']);
      t('[2]\0aa', ['aa']);
      t('[2,3]\0aabbb', ['aa', 'bbb']);
      t('[11,0,3,2,1]\0abcdefghijkcccbba',
        ['abcdefghijk', '', 'ccc', 'bb', 'a']);
    });
    it('invalid', ()=>{
      let t = (s, exp)=>assert.throws(()=>LBuffer.from(s), {message: exp});
      t(undefined, 'invalid buffer');
      t(null, 'invalid buffer');
      t([], 'invalid buffer');
      t({}, 'invalid buffer');
      t('', 'invalid buffer');
      t('[1]', 'invalid buffer');
      t('["2"]\0aa', 'invalid buffer');
      t('[a]\0abcdefghijk', 'invalid buffer');
      t('[1]\0', 'invalid buffer');
      t('[1]\0ab', 'invalid buffer');
      t('[1,2]\0ab', 'invalid buffer');
      t('[1,2]\0abcd', 'invalid buffer');
    });
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
  it('sign_fake', ()=>{
    let keys = {priv: '00', pub: 'ff000000'};
    let wallet = new Wallet({keys});
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
      describe('shortcut', ()=>{
        const _t = (mode, test, exp, both)=>it(mode+(mode ? ' ': '')+test,
          ()=>etask(function*(){
          test_start();
          mode = mode||'mode(req)';
          let setup = 'a=node(wss) b=node(wss) c=node(wss) d=node(wss) '+
            'e=node(wss) f=node(wss) '+(mode ? mode+' ' : '');
          let regex = new RegExp('^'+xescape.regex(setup));
          let res = yield test_pre_process(setup+test);
          if (both){
            let res_exp = yield test_pre_process(setup+exp);
            assert.equal(test_to_str(res).replace(regex, ''),
            test_to_str(res_exp).replace(regex, ''));
          }
          else {
            assert.equal(test_to_str(res).replace(regex, ''),
              string.split_ws(exp).join(' '));
          }
        }));
        const t = (test, exp)=>_t('', test, exp);
        const _T = (mode, test, exp)=>_t(mode, test, exp, true);
        const T = (test, exp)=>_T('', test, exp);
        t('conf(id(X:10 Y:20))', 'conf(id(X:10 Y:20)) X=node:wss Y=node:wss');
        t('conf(id(X:10 Y:20) !node)', 'conf(id(X:10 Y:20) !node)');
        t('1ms', `ms(1)`);
        t('12ms', `ms(12)`);
        t('1s', `ms(1000)`);
        t('12s', `ms(12000)`);
        t('s=node(wss)', `s=node(wss)`);
        T('s=node(wss) // XXX', `s=node(wss) // XXX`);
        T(`s=node(wss) // XXX XXX(2)(
          ab>connect(!r)`, `s=node(wss) // XXX XXX(2)(\r ab>connect(wss !r)`);
        t('ab>connect(wss !r)', `ab>connect(wss !r)`);
        t('ab>connect(!r)', `ab>connect(wss !r)`);
        t('ab>connect', `ab>connect(wss !r) ab<connected`);
        t('ab>!connect(wss !r)', `ab>!connect(wss !r)`);
        t('ab>!connect(!r)', `ab>!connect(wss !r)`);
        t('ab>!connect', `ab>!connect(wss !r) ab>connect(wss !r)
          ab<connected`);
        t('bc>fwd(ab>msg(body:x))', `bc>fwd(ab>msg(body(x)))`);
        t('bc:ab>msg(body:x)', `bc>fwd(ab>msg(body(x)))`);
        t('bc>fwd(ab>msg(body:x) rt:d)', `bc>fwd(ab>msg(body(x)) rt(d))`);
        t('bc[d]:ab>msg(body:x)', `bc>fwd(ab>msg(body(x)) rt(d))`);
        t('bc>fwd(de>fwd(ab>msg(body:x)))', `bc>fwd(de>fwd(ab>msg(body(x))))`);
        t('bc>fwd(de>fwd(ab>msg(body:x) rt:c) rt:e)',
          `bc>fwd(de>fwd(ab>msg(body(x)) rt(c)) rt(e))`);
        t('ab.c>msg(body:x)', `ab>fwd(ac>msg(body(x)))
          bc>fwd(ab>fwd(ac>msg(body(x))))`);
        t('a.bcd>msg(body:x)', `ab>fwd(ad>msg(body(x)))
          bc>fwd(ab>fwd(ad>msg(body(x))) rt(d))
          cd>fwd(bc>fwd(ab>fwd(ad>msg(body(x))) rt(d)))`);
        t('ab.cd>msg(body:x)', `ab>fwd(ad>msg(body(x)))
          bc>fwd(ab>fwd(ad>msg(body(x))))
          cd>fwd(bc>fwd(ab>fwd(ad>msg(body(x)))))`);
        t('abc.d>msg(body:x)', `ab>fwd(ad>msg(body(x)) rt(c))
          bc>fwd(ab>fwd(ad>msg(body(x)) rt(c)))
          cd>fwd(bc>fwd(ab>fwd(ad>msg(body(x)) rt(c))))`);
        t('abc>msg(body:x)', `ab>fwd(ac>msg(body(x)) rt(c))
          bc>fwd(ab>fwd(ac>msg(body(x)) rt(c)))`);
        t('abc<msg(body:x)', `bc<fwd(ac<msg(body(x)) rt(a))
          ab<fwd(bc<fwd(ac<msg(body(x)) rt(a)))`);
        t('abc>fwd(ac>msg(body:x))', `ab>fwd(ac>msg(body(x)) rt(c))
          bc>fwd(ab>fwd(ac>msg(body(x)) rt(c)))`);
        t('abc<fwd(ac<msg(body:x))', `bc<fwd(ac<msg(body(x)) rt(a))
          ab<fwd(bc<fwd(ac<msg(body(x)) rt(a)))`);
        t('abc<fwd(ac>msg(body:x))', `bc<fwd(ac>msg(body(x)) rt(a))
          ab<fwd(bc<fwd(ac>msg(body(x)) rt(a)))`);
        t('abcd<fwd(ac>msg(body:x))', `cd<fwd(ac>msg(body(x)) rt(ab))
          bc<fwd(cd<fwd(ac>msg(body(x)) rt(ab)) rt(a))
          ab<fwd(bc<fwd(cd<fwd(ac>msg(body(x)) rt(ab)) rt(a)))`);
        t('a~b>!get_peer', `a~b>!get_peer`);
        t('~ab<!get_peer', `~ab<!get_peer`);
        _T('mode(msg req)', 'ab.c~d>!get_peer', `a~d>!get_peer
          ab.c>fwd(a~d>msg(type:req cmd:get_peer)) ac>*get_peer
          cba>fwd(ca>msg(type:res cmd:get_peer)) ac<*get_peer_r`);
        T('ab.c~d>msg(type:req cmd:get_peer)',
          `ab.c>fwd(a~d>msg(type:req cmd:get_peer))`);
        T('~dc.ba<msg(type:req cmd:get_peer)',
          `c.ba<fwd(~da<msg(type:req cmd:get_peer))`);
        T('ab>get_peer_r', `ab>msg(type:res cmd:get_peer)`);
        T('ab.c~d>get_peer', `ab.c~d>msg(type:req cmd:get_peer)`);
        T('ab.c>get_peer_r', `ab.c>msg(type:res cmd:get_peer)`);
        _T('mode(msg req)', 'ab~c>!get_peer', `a~c>!get_peer
          ab:a~c>msg(type:req cmd:get_peer) ab>*get_peer
          ba>get_peer_r ab<*get_peer_r`);
        if (0) // XXX: TODO
        T('ab.c>fwd(ac>get_peer_r)', `ab.c>get_peer_r`);
        _t('mode(msg req)',
          'ab>conn_info', `ab>msg(type(req) cmd(conn_info)) ab>*conn_info`);
        _t('mode(msg req)', 'abc>conn_info(!r)', `
          ab>fwd(ac>msg(type(req) cmd(conn_info)) rt(c))
          bc>fwd(ab>fwd(ac>msg(type(req) cmd(conn_info)) rt(c)))
          ac>*conn_info`);
        _t('mode(msg req)', 'abc>conn_info(r:ws)', `
          ab>fwd(ac>msg(type(req) cmd(conn_info)) rt(c))
          bc>fwd(ab>fwd(ac>msg(type(req) cmd(conn_info)) rt(c))) ac>*conn_info
          cb>fwd(ca>msg(type(res) cmd(conn_info) body(ws)) rt(a))
          ba>fwd(cb>fwd(ca>msg(type(res) cmd(conn_info) body(ws)) rt(a)))
          ca>*conn_info_r(ws)`);
        _t('mode(msg req)', 'ab>conn_info_r(ws wrtc)', `ab>msg(type(res)
          cmd(conn_info) body(ws wrtc)) ab>*conn_info_r(ws wrtc)`);
        _t('mode(msg req)', 'abc>conn_info_r(ws)', `
          ab>fwd(ac>msg(type(res) cmd(conn_info) body(ws)) rt(c))
          bc>fwd(ab>fwd(ac>msg(type(res) cmd(conn_info) body(ws)) rt(c)))
          ac>*conn_info_r(ws)`);
        t('cd>fwd(ab>msg)', `cd>fwd(ab>msg)`);
        t('cd>fwd(ab>msg path:abc)', `cd>fwd(ab>msg path(abc))`);
        t('cd<fwd(ab<msg path:abc)', `cd<fwd(ab<msg path(abc))`);
        t('cd>fwd(ab>msg path(abc))', `cd>fwd(ab>msg path(abc))`);
        t('cd>fwd(ab>msg rt:abc)', `cd>fwd(ab>msg rt(abc))`);
        t('cd>fwd(ab>msg rt(abc))', `cd>fwd(ab>msg rt(abc))`);
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
          ab>fwd(ac>msg(id(r0) type(req)) rt(c))
          bc>fwd(ab>fwd(ac>msg(id(r0) type(req)) rt(c)))
          ac>*req(id(r0))`);
        _t('mode(msg req)', 'abc<!req(id:r0)', `ac<!req(id(r0) !e)
          cb>fwd(ac<msg(id(r0) type(req)) rt(a))
          ba>fwd(cb>fwd(ac<msg(id(r0) type(req)) rt(a)))
          ac<*req(id(r0))`);
        _t('mode(msg req)', 'abc>!req(id:r0 cmd:test seq:1 ack:2 body:ping)',
          `ac>!req(id(r0) cmd(test) seq(1) ack(2) body(ping) !e)
          ab>fwd(ac>msg(id(r0) type(req) cmd(test) seq(1) ack(2) body(ping)) `+
          `rt(c))
          bc>fwd(ab>fwd(ac>msg(id(r0) type(req) cmd(test) seq(1) `+
          `ack(2) body(ping)) rt(c)))
           ac>*req(id(r0) cmd(test) seq(1) ack(2) body(ping))`);
        _t('mode(msg req)',
          'abc>!req(id:r1 cmd:test seq:1 ack:2 body:ping res:ping_r)', `
          ac>!req(id(r1) cmd(test) seq(1) ack(2) body(ping) res(ping_r) !e)
          ab>fwd(ac>msg(id(r1) type(req) cmd(test) seq(1) ack(2) body(ping)) `+
          `rt(c)) bc>fwd(ab>fwd(ac>msg(id(r1) type(req) cmd(test) seq(1) `+
          `ack(2) body(ping)) rt(c)))
          ac>*req(id(r1) cmd(test) seq(1) ack(2) body(ping))
          cb>fwd(ac<msg(id(r1) type(res) cmd(test) body(ping_r)) rt(a))
          ba>fwd(cb>fwd(ac<msg(id(r1) type(res) cmd(test) body(ping_r)) rt(a)))
          ac<*res(id(r1) cmd(test) body(ping_r))`);
         // XXX WIP: check why change cb> bc< and ba to ab< breaks test
         _t('mode(msg req)', 'ab.c>!req(body:ping res:ping_r)', `
           ac>!req(body(ping) res(ping_r) !e)
           ab>fwd(ac>msg(type(req) body(ping)))
           bc>fwd(ab>fwd(ac>msg(type(req) body(ping))))
           ac>*req(body(ping))
           cb>fwd(ac<msg(type(res) body(ping_r)) rt(a))
           ba>fwd(cb>fwd(ac<msg(type(res) body(ping_r)) rt(a)))
           ac<*res(body(ping_r))
         `);
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
          ab>fwd(ac>msg(id(r0) type(res)) rt(c))
          bc>fwd(ab>fwd(ac>msg(id(r0) type(res)) rt(c))) ac>*res(id(r0))`);
        _t('mode(msg req)', 'abc<!res(id:r0)', `ac<!res(id(r0) !e)
          cb>fwd(ac<msg(id(r0) type(res)) rt(a))
          ba>fwd(cb>fwd(ac<msg(id(r0) type(res)) rt(a))) ac<*res(id(r0))`);
        _t('mode(msg req)', 'abc>!res(id:r0 cmd:test seq:1 ack:2 body:ping)',
          `ac>!res(id(r0) cmd(test) seq(1) ack(2) body(ping) !e)
          ab>fwd(ac>msg(id(r0) type(res) cmd(test) seq(1) ack(2) body(ping)) `+
          `rt(c)) bc>fwd(ab>fwd(ac>msg(id(r0) type(res) cmd(test) seq(1) `+
          `ack(2) body(ping)) rt(c)))
           ac>*res(id(r0) cmd(test) seq(1) ack(2) body(ping))`);
        if (0) // XXX WIP
        _t('mode(msg req)', 'abcd<*res(id:r1 body:ping_r)', `
          cd<fwd(ad<msg(id:r1 type:res body:ping_r) path:d rt:ab)
          bc<fwd(cd<fwd(ad<msg(id:r1 type:res body:ping_r) path:d rt:ab)
            path:cd rt:a)
          ab<fwd(bc<fwd(cd<fwd(ad<msg(id:r1 type:res body:ping_r) path:d rt:ab)
            path:cd rt:a) path:bcd)
          ad<*res(id:r1 body:ping_r)`);
        t('a>*fail(id:r1 error:timeout)', `a>*fail(id(r1) error(timeout))`);
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
        t('x,y=node:wss', `x=node(wss) y=node(wss)`);
        T('ab,bc>!connect', `ab>!connect bc>!connect`);
      });
    });
  });
  const xit = (name, role, test)=>it(name+'_'+role, ()=>test_run(role, test))
  .timeout(4000); // XXX HACK: check why tests are slow
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
  describe('node_conn', ()=>{
    let t = (name, test)=>t_roles(name, 'X', test);
    t('direct', `mode(msg req) conf(id:a-mXYZn-z rtt(50 aX:10))
      test_node_conn(X)
      Xa>!connect test_node_conn(X(a:10) a(X:10))
      Xb<!connect test_node_conn(X(a:10 b:50) a(X:10) b(X:50))
      Xy>!connect test_node_conn(X(a:10 b:50 y:50) a(X:10) b(X:50) y(X:50))
      Xz<!connect test_node_conn(X(a:10 b:50 y:50 z:50) a(X:10) b(X:50) y(X:50)
        z(X:50))`);
    t('from_fwd', `mode(msg req)
      conf(id:a-mXYZn-z rtt(ab:10 bc:20 db:30 zY:40)) test_node_conn(X)
      aX>!connect test_node_conn(X(a:100) a(X:100))
      aX:ba:cb:cY>msg(type:req) test_node_conn(X(a:100) a(b:10 X:100)
        b(a:10 c:20) c(b:20))
      aX:ba:db:dY>msg(type:req) test_node_conn(X(a:100) a(b:10 X:100)
        b(a:10 c:20 d:30) c(b:20) d(b:30))
      zX>!connect test_node_conn(X(a:100 z:100) a(b:10 X:100) b(a:10 c:20 d:30)
        c(b:20) d(b:30) z(X:100))
      // XXX TODO: zX:Yz:Yc,Xa:zX:Yz:Yc>msg(type:req)
      zX:Yz:Yc>msg(type:req) Xa:zX:Yz:Yc>msg(type:req)
      test_node_conn(X(a:100 z:100) a(b:10 X:100) b(a:10 c:20 d:30) c(b:20)
        d(b:30) Y(z:40) z(X:100 Y:40)) `);
  });
  describe('node_map', ()=>{
    let t = (name, test)=>t_roles(name, 'X', test);
    t('find', `mode(msg req)
      conf(id(a:0.1 b:0.2 X:0.25 c:0.3 d:0.4)) Xa,Xb,Xc,Xd>!connect
      test_node_find(X:0 next:a prev:d)
      test_node_find(X:0.09 next:a prev:d)
      test_node_find(X:0.1 next:a prev:a)
      test_node_find(X:0.19 next:b prev:a)
      test_node_find(X:0.2 next:b prev:b)
      test_node_find(X:0.21 next:c prev:b)
      test_node_find(X:0.25 next:c prev:b)
      test_node_find(X:0.29 next:c prev:b)
      test_node_find(X:0.3 next:c prev:c)
      test_node_find(X:0.39 next:d prev:c)
      test_node_find(X:0.4 next:d prev:d)
      test_node_find(X:0.49 next:a prev:d)
      test_node_find(X:0.24 next:c prev:b bidi:b)
      test_node_find(X:0.25 next:c prev:b bidi:b)
      test_node_find(X:0.26 next:c prev:b bidi:c)
      test_node_find(X:0.41 next:a prev:d bidi:d)
      test_node_find(X:0.91 next:a prev:d bidi:a)`);
    it('next_prev', ()=>{
      const t = (val, exp)=>assert.equal(val, exp);
      let node_map = new NodeMap(NodeId.from(0.44));
      let n1 = node_map.get({id: NodeId.from(0.43), create: true});
      let n2 = node_map.get({id: NodeId.from(0.42), create: true});
      let n3 = node_map.get({id: NodeId.from(0.41), create: true});
      t(n1.next(), n3);
      t(n2.next(), n1);
      t(n3.next(), n2);
      t(n1.prev(), n2);
      t(n2.prev(), n3);
      t(n3.prev(), n1);
    });
    it('node_itr', ()=>{
      const _t = (s, d, peers, exclude, range, exp)=>{
        let map = new NodeMap(NodeId.from(s));
        peers.split(' ')
        .forEach(p=>map.get({id: NodeId.from(p), create: true}));
        let itr = map.node_itr(NodeId.from(d),
          {exclude: exclude && NodeId.from(exclude),
          range: range && {min: NodeId.from(range[0]),
          max: NodeId.from(range[1])}});
        exp.split(' ').forEach(e=>{
          let n = itr.next();
          assert.equal(n && n.id.d, e ? NodeId.from(e).d : null);
        });
        let n = itr.next();
        assert.equal(n && n.id.d, null);
      };
      const t = (opt, exp)=>{
        _t('.1', opt.d, opt.peers, opt.exclude, opt.range, exp);
        _t('.5', opt.d, opt.peers, opt.exclude, opt.range, exp);
        _t('.9', opt.d, opt.peers, opt.exclude, opt.range, exp);
      };
      t({d: '.09', peers: '.1 .2 .3 .4 .5 .6 .7 .8 .9'},
        '.1 .2 .9 .3 .8 .4 .7 .5 .6');
      t({d: '.1', peers: '.1 .2 .3 .4 .5 .6 .7 .8 .9'},
        '.1 .2 .3 .9 .8 .4 .5 .7 .6');
      t({d: '.11', peers: '.1 .2 .3 .4 .5 .6 .7 .8 .9'},
        '.1 .2 .3 .9 .4 .8 .5 .7 .6');
      t({d: '.51', peers: '.1 .2 .3 .4 .5 .6 .7 .8 .9'},
        '.5 .6 .4 .7 .3 .8 .2 .9 .1');
      t({d: '.49', peers: '.1 .2 .3 .4 .5 .6 .7 .8 .9'},
        '.5 .4 .6 .3 .7 .2 .8 .1 .9');
      t({d: '.89', peers: '.1 .2 .3 .4 .5 .6 .7 .8 .9'},
        '.9 .8 .7 .1 .6 .2 .5 .3 .4');
      t({d: '.9', peers: '.1 .2 .3 .4 .5 .6 .7 .8 .9'},
        '.9 .8 .7 .1 .6 .2 .5 .3 .4');
      t({d: '.91', peers: '.1 .2 .3 .4 .5 .6 .7 .8 .9'},
        '.9 .8 .1 .7 .2 .6 .3 .5 .4');
      t({d: '.429', peers: '.1 .4 .41 .42 .43 .5 .9 .99'},
        '.43 .42 .41 .4 .5 .1 .99 .9');
    /* XXX: derry TODO
    abXnop
    a:0.05 b:0.1 x:0.5 n:0.55 o:0.6 p:0.65
    at p: [any] !p [any]
    at X: [X+1, X-1] !p (X,X)
    at n: [n+1, X-1] !p (n,X)
    at o: [o+1, X-1] !p (o,X)
    at a: [o+1, a-1] !p (o,a): p is not in range - so END
    */
      // at p:0.65
      t({d: '.65', peers: '.5 .65'}, '.65 .5');
      t({d: '.65', peers: '.5 .65', exclude: '.65'}, '.5');
      t({d: '.65', peers: '.5 .65', exclude: '.5'}, '.65');
      // at X:0.5
      t({d: '.65', peers: '0.1 0.55 .65'}, '.65 .55 .1');
      t({d: '.65', peers: '0.1 0.55 .65', exclude: '.65'}, '.55 .1');
      t({d: '.65', peers: '0.1 0.55 .65', exclude: '.65', range: ['.5', '.5']},
        '.55 .1');
      // at n:0.55
      t({d: '.65', peers: '0.5 0.55 .6'}, '.6 .55 .5');
      t({d: '.65', peers: '0.5 0.55 .6', exclude: '.55'}, '.6 .5');
      if (0)
      t({d: '.65', peers: '0.5 0.55 .6', exclude: '.55', range: ['.55', '.5']},
         '.6');
    });
    describe('graph', ()=>{
      t('basic', `mode(msg req) conf(id:a-mXYZn-z rtt(100 zX:500)) aX>!connect
        999ms test_node_graph(X aX:100) 1ms test_node_graph(X aX:100)
        aX:ba:bX>msg(type:req) test_node_graph(X aX:100 baX:200)
        1s test_node_graph(X aX:100 baX:200)
        aX:ba:cb:cX>msg(type:req) test_node_graph(X aX:100 baX:200 cbaX:300)
        1s test_node_graph(X aX:100 baX:200 cbaX:300)
        aX:ca:cX>msg(type:req) test_node_graph(X aX:100 baX:200 caX:200)
        1s test_node_graph(X aX:100 baX:200 caX:200)
        zX>!connect test_node_graph(X aX:100 baX:200 caX:200 zX:500)
        1s test_node_graph(X aX:100 baX:200 caX:200 zX:500)
        aX:za:zX>msg(type:req)
        test_node_graph(X aX:100 baX:200 caX:200 zaX:200)
        1s test_node_graph(X aX:100 baX:200 caX:200 zaX:200)
      `);
      t('ring', `mode(msg req) conf(id(a:0.1 b:0.2 X:0.3 c:0.4 d:0.5 e:0.6))
        ab,bX,Xc,cd,da,eX>!connect test_node_graph(X bX:100 cX:100 eX:100)
        1s test_node_graph(X bX:100 cX:100 eX:100)
        eX.c.d>!req(body:ping res:ping_r)
        test_node_graph(X bX:100 cX:100 eX:100 dcX:200)
        1s test_node_graph(X bX:100 cX:100 eX:100 dcX:200)
        cX[e]:dc[Xe]:ad[cXe]:ae>msg(type:res body:ping_r)
        Xe:cX[e]:dc[Xe]:ad[cXe]:ae>msg(type:res body:ping_r)
        test_node_graph(X bX:100 cX:100 eX:100 dcX:200 adcX:300)
        1s test_node_graph(X bX:100 cX:100 eX:100 dcX:200 adcX:300)
        cX:dc:ad:ca:ac:aX>msg(type:req)
        999ms test_node_graph(X bX:100 cX:100 eX:100 dcX:200 adcX:300)
        1ms test_node_graph(X bX:100 cX:100 eX:100 dcX:200 acX:200)`);
      });
  });
  describe('router', ()=>{
    let t = (name, test)=>t_roles(name, 'abc', test);
    t('2_nodes', `conf(id_bits:8) setup:2_nodes
      ab>!req(body:ping res:ping_r)`);
    t('2_nodes_wss', `conf(id_bits:8) a,b=node:wss
      ab>!connect ab>!req(body:ping res:ping_r)`);
    t('3_nodes', `conf(id_bits:8) a,b,c=node:wss ab,ac>!connect
      ab>!req(body:ping res:ping_r) ac>!req(body:ping res:ping_r)`);
    t('3_nodes_route_b', `conf(id_bits:8 id(a:10 b:20 c:30 d:21 e:31))
      ab,ac>!connect ad>!req(id:r1 body:ping !e)
      ab>fwd(ad>msg(id:r1 type:req body:ping)) -
      20s a>*fail(id:r1 error:timeout)`);
    t('3_nodes_route_c', `conf(id_bits:8 id(a:10 b:20 c:30 d:21 e:31))
      ab,ac>!connect ae>!req(id:r1 body:ping !e)
      ac:ae>msg(id:r1 type:req body:ping) - 20s a>*fail(id:r1 error:timeout)`);
    t('3_nodes_ring', `conf(id_bits:8 id(a:10 b:20 c:30))
      ab,bc,ca>!connect ab>!req(body:ping res:ping_r)
      ac>!req(body:ping res:ping_r) -`);
    t = (name, test)=>t_roles(name, 'abcd', test);
    t('4_nodes_ring', `conf(id_bits:8 id(a:10 b:20 c:30 d:40))
      ab,bc,cd,da>!connect - ab>!req(body:ping res:ping_r) 60s
      ab.c>!req(body:ping res:ping_r) 60s ad>!req(body:ping res:ping_r) 60s
      ba>!req(body:ping res:ping_r) 60s bc>!req(body:ping res:ping_r) 60s
      bc.d>!req(body:ping res:ping_r) 60s cba>!req(body:ping res:ping_r) 60s
      cb>!req(body:ping res:ping_r) 60s cd>!req(body:ping res:ping_r) 60s
      da>!req(body:ping res:ping_r) 60s dcb>!req(body:ping res:ping_r) 60s
      dc>!req(body:ping res:ping_r) 60s
      bcd>!req(body:ping res:ping_r)
      dc.b>!req(body:ping2 res:ping_r) // XXX BUG in state handling
      60s dcb>!req(body:ping2 res:ping_r)`);
    t('4_nodes_ring_rt', `conf(id_bits:8 id(a:10 b:20 c:30 d:40))
      rt_add(a:dc b:ad c:da d:cb)
      ab,bc,cd,da>!connect - ab>!req(body:ping res:ping_r) 60s
      adc>!req(body:ping res:ping_r) 60s ad>!req(body:ping res:ping_r) 60s
      ba>!req(body:ping res:ping_r) 60s bc>!req(body:ping res:ping_r) 60s
      bad>!req(body:ping res:ping_r) 60s cda>!req(body:ping res:ping_r) 60s
      cb>!req(body:ping res:ping_r) 60s cd>!req(body:ping res:ping_r) 60s
      da>!req(body:ping res:ping_r) 60s dcb>!req(body:ping res:ping_r) 60s
      dc>!req(body:ping res:ping_r)`);
    // XXX: need to rm explicit req_id. need to fix test req tracking.
    // without explicit req_id, the test fails
    if (0) // XXX WIP - fix test
    t('4_nodes_ring_state_timeout', `conf(id_bits:8 id(a:10 b:20 c:30 d:40))
      ab,bc,cd,da>!connect - ab>!req(body:ping res:ping_r) -
      rt_add(a:bc b:cd c:da d:ab)
      adc>!req(id:r1 body:ping res:ping_r) 59s -
      // a.bc<!req(id:r2 body:ping res:ping_r) 60s -
      // a.bc<!req(id:r3 body:ping res:ping_r) -`);
    t = (name, test)=>t_roles(name, 'abcde', test);
    t('5_nodes_ring', `conf(id_bits:8 id(a:10 b:20 c:30 d:40 e:50))
      ab,bc,cd,de,ea>!connect ae.d>!req(id:r1 body:ping res:ping_r) 59s -
      a.ed<!req(id:r2 body:ping res:ping_r) 60s -
      aed<!req(id:r3 body:ping res:ping_r) 60s -
      `);
    t('5_nodes_ring_rt', `conf(id_bits:8 id(a:10 b:20 c:30 d:40 e:50))
      ab,bc,cd,de,ea>!connect rt_add(a:bcd d:ea)
      abcd>!req(id:r1 body:ping res:ping_r) 59s -
      aed<!req(id:r2 body:ping res:ping_r) 60s -
      aed<!req(id:r3 body:ping res:ping_r) 60s -`);
  });
  describe('xxx', ()=>{
    if (true)
      return; // XXX FIXME
    let t = (name, test)=>t_roles(name, 'abcefgh', test);
     t('xxx', `mode(msg req) conf(id:a-mXYZn-z rtt(100))
       ab,bc,cd,de,ef,fg,gh,ha>!connect
       ah.g>!req(body:ping res:ping_r)
       ab.c>!req(body:ping res:ping_r)
       ab.c.d.e>!req(body:ping res:ping_r)
     `);
    // abXY
    t = (name, test)=>t_roles(name, 'abXY', test);
     t('xxx2', `mode(msg req) conf(id:a-mXYZn-z rtt(100))
       XY,aX>!connect
       aX.Y-a>!get_peer
       bY>!connect
       bY.X-b>!get_peer
       aX.Y.b>!req(body:ping res:ping_r)
     `);
    t = (name, test)=>t_roles(name, 'abcXYZ', test);
     t('xxx3', `mode(msg req) conf(id:a-mXYZn-z rtt(100))
       XY,XZ,YZ>!connect
       YX.Z-Y>!get_peer
       aX>!connect
       aX.Z.Y-a>!get_peer
       bY>!connect
       bY.Z-b>!get_peer
       // aX.Z.Y.b>!req(body:ping res:ping_r)
     `);
    t = (name, test)=>t_roles(name, 'abXYno', test);
     t('xxx10', `mode(msg req) conf(id:a-mXYZn-z rtt(100))
       aX,bY,nX,oY,XY>!connect
       aX.n>!req(body:ping res:ping_r)
       aX.Y.b>!req(body:ping res:ping_r)
     `);
  });
  if (0) // XXX: WIP
  describe('get_peer', ()=>{
    let t = (name, test)=>t_roles(name, 'abXcde', test);
    t('abXcde_req', `mode(msg req) conf(id(a:10 b:20 X:25 c:30 d:40 e:50))
      ab,bX,Xc,cd,da,eX>!connect eX.c.d>!req(body:ping res:ping_r)
      eX.c.d.a>!req(body:ping res:ping_r)`);
    t('long:abXcde~e', `mode(msg req) conf(id(a:10 b:20 X:25 c:30 d:40 e:50))
      ab,bX,Xc,cd,da,eX>!connect e~e>!get_peer eX.c.d.a~e>get_peer ea>*get_peer
      eXcda<get_peer_r ea<*get_peer_r`);
    t('short:abXcde~e', `mode(msg req) conf(id(a:10 b:20 X:25 c:30 d:40 e:50))
      ab,bX,Xc,cd,da,eX>!connect eX.c.d.a~e>!get_peer`);
    t('multiple:abXcde', `mode(msg req) conf(id(a:10 b:20 X:25 c:30 d:40 e:50))
      ab,bX,Xc,cd,da,eX>!connect eX.c.d>!req(body:ping res:ping_r)
      eX.c.d.a>!req(body:ping res:ping_r)
      eX.c.d.a~e>!get_peer
      eX.c.d.a~e>!get_peer`);
  });
  if (0) // XXX TODO
  describe('get_peer2', ()=>{
    let t = (name, test)=>t_roles(name, 'abXYnopz', test);
    t('long:abXnop~p', `mode(msg req) conf(id:a-mXYZn-z)
      ab,bX,Xn,no,oa,pX>!connect
      p~p>!get_peer
      pX:p~p>msg(type:req cmd:get_peer)
      Xn:pX:p~p>msg(type:req cmd:get_peer)
      no:Xn:pX:p~p>msg(type:req cmd:get_peer)
      // XXX missing one fwd oa>
      po>*get_peer
      on[Xp]:op>msg(type:res cmd:get_peer)
      nX[p]:on[Xp]:op>msg(type:res cmd:get_peer)
      Xp:nX[p]:on[Xp]:op>msg(type:res cmd:get_peer)
      op>*get_peer_r`);
    t('ring:abXnop~p', `mode(msg req) conf(id:a-mXYZn-z)
      ab,bX,Xn,no,oa,pX>!connect pX.n.o~p>!get_peer`);
    /* XXX: derry TODO
    abXnop
    at p: [any] !p [any]
    at X: [X+1, X-1] !p (X,X)
    at n: [n+1, X-1] !p (n,X)
    at o: [o+1, X-1] !p (o,X)
    at a: [o+1, a-1] !p (o,a): p is not in range - so END
    */
    t('star:abXnop~p', `mode(msg req) conf(id:a-mXYZn-z)
      ab,bX,Xn,no,oa,aX,oX,pX>!connect
      pX.o~p>!get_peer`);
    t('ring:abXnoz~z', `mode(msg req) conf(id:a-mXYZn-z)
      ab,bX,Xn,no,oa,zX>!connect zX.b.a~z>!get_peer`);
    // XXX: complete and fix test
    t('multi_path', `mode(msg req) conf(id:a-mXYZn-z)
      XY,aX>!connect aX~a>!get_peer
      bY>!connect
      aX.Y>!req(body:ping res:ping_r) // XXX: rm
      b.YXa~b>!get_peer
    `);
  });
  // XXX: unite with get_peer tests
  if (0) // XXX: fixme
  describe('discovery', ()=>{
    let t = (name, test)=>t_roles(name, 'abcdeX', test);
    t('abcdeX', `mode(msg req) conf(id:a-mXYZn-z)
      aX>!connect aX+a>!get_peer // XXX aX>!ping
      // abX b+:X
      bX>!connect bX.a+b>!get_peer
      // bX.Xa.X.Xa+b>!get_peer
      // XXX: bXa>!ping
      `);
    if (true) return; // XXX: WIP
    // - go right
    // + go left
    // XXX: binary search tree: https://www.npmjs.com/package/avl
    t('xxx', `mode(msg req) conf(id:a-mXYZn-z) a,b,c,d,e,X=node:wss
      aX>!connect aX+a>get_peer aX>ping
      // abX b-:a b+:X
      bX>!connect bX.Xa.X-b,bX.Xa.X.Xa+b>announce bX,bXa>ping
      // abcX c-:b c+:X
      cX>!connect cX.Xa.Xb.X-c,cX.Xb.Xa.X.Xb+c>announce cX,cXb>ping
      // abcdX d-:c d+:X
      dX>!connect dX.X.Xa.Xb.Xc.X+d,dX.Xc.Xb.Xa.X.Xc-d>announce dX,dXc>ping
    `);
   /* XXX: compact path:
     bX.Xa.X -> bXaX -> bX
     bX.Xa.X.Xa -> bXaXa -> bXa
     cX.Xa.Xb.X -> cXaXbX -> cX
     cX.Xb.Xa.X.Xb -> cXbXaXb -> cXb
     dX.X.Xa.Xb.Xc.X -> dXaXbXcX -> dX
     dX.Xc.Xb.Xa.X.Xc -> dXcXbXaXc -> dXc
   */
  });

  /* XXX derry: examples
  // XXX TODO:
  t('a,b=node:wss', `a=node(wss) b=node(wss)`);
  t('ab,bc>!connect', `ab>!connect bc>!connect`);
  t('ab-c>msg', `ab>fwd(a-c>msg)`);
  t('abc.d>msg', `ab>fwd(ad>msg rt:abc) bc>fwd(ab>fwd(ad>msg rt:abc) rt:abc)
    cd>fwd(bc>fwd(ab>fwd(ad>msg rt:abc) rt:abc) rt:cd)`);
  t('abc.d>msg', `ab(rt:abc):ad>msg bc(rt:abc):ab(rt:abc):ad>msg
    cd(rt:cd):bc(rt:abc):ab(rt:abc):ad>msg`);
  // XXX derry
  t('abc.d>msg', `ab>fwd(ad>msg rt:c) bc>fwd(ab>fwd(ad>msg rt:c))
    cd>fwd(bc>fwd(ab>fwd(ad>msg rt:c)))`);
  t('abc.d>msg', `$i=ab>fwd(ad>msg rt:c) bc>fwd($i++) cd>fwd($i++)`);
  t('abc.d>msg', `ab[c]:ad>msg bc:ab[c]:ad>msg cd:bc:ab[c]:ad>msg`);
  abcdefghijklmnXYZopqrstuvwxyz
  b-a = 2^128/26 X=n+(o-n)/2 Y=X+1 Z=X+2
  a startup, X min conn: aX.o.p.q.~.x.y.z.b-a>get_peer
  a startup, X good conn: aX.t.w.y.z.b-a>get_peer
  a startup, X good conn 2nd time: aX.t.w.y.z.b-a>get_peer
  a startup, X good conn isp hops force: aX.Yt.YZw.ZYy.YZz.ZYb-a>get_peer
  the isp connections: X:a Y:tyb Z:w (XYZ connected)
  a startup, X good conn isp hops no-force: aX.Y[t].Zz.ZYb-a>get_peer
    into a kbucket: aXYZz aXYb
  ab+> empty a X tbl:
  full a tbl:
  a X --> ??? --> Y --> f.
  t('axyb.yc.def>msg', ``);
  // end derry
  t('abc.d>msg', `ab[abc]:ad>msg bc[abc]:ab[abc]:ad>msg
    cd[cd]:bc[abc]:ab[abc]:ad>msg`);
  t('abc.d>msg', `ab[abc]:ad>msg bc:ab:ad>msg cd:bc:ab:ad>msg`); // auto rt
  */
  // XXX: support: a,b,c,d,e=node(wss) ab,bc,cd,de,ea>!connect
  // abcDefg dx>connect dxd+e>announce(r:bcfg) dxd-c>announce(r:abef)
  // dxe,dxc>online
  // min online: abcdefg dx>connect dx+d.e,dx-d.c>announce dxe,dxc>online
  // more min: abcdefg dx>connect dx+d.e>announce(r:c) dxe,dxc>online
  // better: abcdefg dx>connect dx+d.e>announce(r:bcfg) dxe,dxc>online
  // min min: abcdefg dx>connect dx+d.e>announce acd.ed>ping
  // example route abcde.h ab> bc> cd> dh>
  // example for finding out (b c d h): ab*e.c.d.he
  describe('ring_connect', ()=>{
    if (true) return; // XXX WIP
    let t = (name, test)=>t_roles(name, 'abcd', test);
    let s = 'conf(a:10 b:20 c:30 d:40 e:50';
    t('a', s+=`a=node:wss`);
    // XXX: b=node(boot:a) instead of hard-code connect/join and make join
    // option of connect
    t('ab', s+=` b=node:wss ab<!connect ab<!join`);
    /* XXX: WIP
    let t = ()=>{}, s;
    // a:48 b:53 c:294 d:385 e:403 f:746 g:940
    t('b', s=`b=node(id:53)`);
    t('ab', s+=`a=node(id:48 boot:b) ab>connect ab>get_peer(a 53-48)
      ba<get_peer_r(b) ab>online -`);
    t('abc', s+=`c=node(id:294 boot:b) cb>connect cb>get_peer(c 53-294)
      cb<get_peer_r(ab) ca>connect ca>online cb>online -`);
    // XXX: db>fwd(53-385,dd*>get_peer:d) bc>fwd(294-385,dd*>get_peer:d)
    t('abcd', s+=`d=node(id:385 boot:b) db>connect
      dbcd~>get_peer(d 53-385)
      bc>get_peer(d 294-385) dbc<get_peer_r(ac) da>connect dc>connect
      dc>online dc>online`);
    t('abcdg', s+=`g=node(id:940 boot:b) gb>connect gb>get_peer(g 53-940)
      bd>(g 385-940) dbg<(da) gd>connect ga>connect gd>online ga>online`);
    t('xxx', `setup(ring:abcef) g=node(id:940 boot:b) gb>get_peer(g 53-940)
      bc>get_peer(g 294-940) cd>get_peer(g 385-940) de>get_peer(g 403-940)
      ef>get_peer(g 746-940) gbcdef<get_peer_r(af) ga>connect gf>connect
      ga>online gf>online`);
    */
  });
  describe('req_new', function(){
    // beforeEach(()=>xtest.xerr_level());
    // afterEach(()=>xtest.xerr_level(xerr.L.ERR));
    const t = (name, test)=>t_roles(name, 'abc', test);
    // XXX: need auto
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
      t('req', `mode:req a=node b=node(wss(port:4000)) ab>!connect(wss !r)
        ab>connect(wss !r) ab<connected -
        ab>!req(id:r0 body:ping res:ping_r !e)
        ab>*req(id:r0 body:ping) ab<*res(id:r0 body:ping_r)`);
      t('msg', `mode:msg a=node b=node(wss(port:4000)) ab>!connect(wss !r)
        ab>connect(wss !r) ab<connected -
        ab>!req(id:r0 body:ping res:ping_r !e)
        ab>msg(type:req id:r0 body:ping) ab<msg(type:res id:r0 body:ping_r)`);
      t('msg,req', `mode(msg req) a=node b=node(wss(port:4000))
        ab>!connect(wss !r) ab>connect(wss !r) ab<connected -
        ab>!req(id:r0 body:ping res:ping_r !e) ab>msg(type:req id:r0 body:ping)
        ab>*req(id:r0 body:ping) ab<msg(type:res id:r0 body:ping_r)
        ab<*res(id:r0 body:ping_r)`);
    });
    describe('3_nodes', ()=>{
      // XXX: missing req test
      // t('fwd', `setup:3_nodes_linear ac>!req(id:r0 body:ping res:ping_r)
      //  abc>*req(id:r0 body:ping) abc<fwd(ac<*res(id:r0 body:ping_r))`);
      t('req', `
        mode:req a=node b=node(wss) ab>!connect(wss !r) ab>connect(wss !r)
        ab<connected - c=node(wss) bc>!connect(wss !r) bc>connect(wss !r)
        bc<connected - ac>!req(id:r0 body:ping res:ping_r)`);
      t('msg', `
        mode:msg a=node b=node(wss) ab>!connect(wss !r) ab>connect(wss !r)
        ab<connected - c=node(wss) bc>!connect(wss !r) bc>connect(wss !r)
        bc<connected - rt_add(a:bc) abc>!req(id:r0 body:ping res:ping_r)`);
      t('msg,req', `
        mode(msg req) a=node b=node(wss) ab>!connect(wss !r)
        ab>connect(wss !r) ab<connected - c=node(wss) bc>!connect(wss !r)
        bc>connect(wss !r) bc<connected - rt_add(a:bc)
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
        t('req', `mode:req setup:2_nodes c=node cb>!req(id:r0 body:ping) -
        19999ms - 1ms c>*fail(id:r0 error:timeout)`);
        t('msg', `mode:msg setup:2_nodes c=node cb>!req(id:r0 body:ping !e) -
        19999ms - 1ms c>*fail(id:r0 error:timeout)`);
        if (0) // XXX: fixme
        t('msg,req', `mode(msg req) setup:2_nodes c=node
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
        if (true) return; // XXX NOW: review all test below and copy relevant
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
        if (true) return; // XXX NOW: review all test below and copy relevant
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
    t('long', `mode:req a=node b=node(wss(port:4000)) ab>!connect(wss !r)
      ab>connect(wss !r) ab<connected`);
    t('short', `mode:req a=node b=node(wss) ab>!connect`);
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
      ab>!connect(wrtc) - mode:pop ab>!req(id:r0 body:ping res:ping_r)
      ab<!req(id:r1 body:ping res:ping_r)`);
    t('msg,req', `mode(msg req) mode:req a=node(wrtc) b=node(wrtc wss) -
      ab>!connect(wrtc) - mode:pop ab>!req(id:r0 body:ping res:ping_r) -
      ab<!req(id:r1 body:ping res:ping_r)
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
      t('msg', `mode:msg setup:3_nodes_linear rt_add(a:bc)
        ab>!req(id:r0 body:ping res:ping_r)
        abc>!req(id:r1 body:ping res:ping_r)
        bc>!req(id:r2 body:ping res:ping_r)`);
      t('msg,req', `mode(msg req) setup:3_nodes_linear rt_add(a:bc)
        ab>!req(id:r0 body:ping res:ping_r)
        abc>!req(id:r1 body:ping res:ping_r)
        bc>!req(id:r2 body:ping res:ping_r)`);
    });
    describe('linear_wrtc', ()=>{
      t('req', `mode:req a=node(wrtc) b,c=node(wrtc wss)
        ab>!connect(wss) - bc>!connect(wrtc)`);
      t('msg', `mode:msg a=node(wrtc) b,c=node(wrtc wss)
        ab>!connect:wss - bc>!connect:wrtc`);
      t('msg,req', `mode(msg req) a=node(wrtc) b,c=node(wrtc wss)
        ab>!connect:wss - bc>!connect:wrtc`);
    });
    describe('linear_wss', ()=>{
      t('req', `mode:req setup:3_nodes_wss`);
      t('msg', `mode:msg setup:3_nodes_wss`);
      t('msg,req', `mode(msg req) setup:3_nodes_wss`);
      if (true) return; // XXX: TODO
      t('star', `s,b=node:wss a=node as>!connect(find(a sa)) -
        bs>!connect(find(bas sab)) bsa>*conn_info:r`);
      t('star_wss', `s,a,b=node:wss
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
          cd>!req(id:r5 body:ping e res:ping_r) cd<*res(id:r5 body:ping_r) -`);
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
    t('4_nodes_wss_req', `setup(4_nodes_wss) ab>!req(body:ping res:ping_r) -
      ac>!req(body:ping res:ping_r) - ad>!req(body:ping res:ping_r) -
      ba>!req(body:ping res:ping_r) - bc>!req(body:ping res:ping_r) -
      bd>!req(body:ping res:ping_r) - ca>!req(body:ping res:ping_r) -
      cb>!req(body:ping res:ping_r) - cd>!req(body:ping res:ping_r) -
      da>!req(body:ping res:ping_r) - db>!req(body:ping res:ping_r) -
      dc>!req(body:ping res:ping_r)`);
  });
  describe('ring_connect', ()=>{
    let t = ()=>{}, s;
    // a:48 b:53 c:294 d:385 e:403 f:746 g:940
    t('b', s=`b=node(id:53)`);
    t('ab', s+=`a=node(id:48 boot:b) ab>connect ab>get_peer(a 53-48)
      ba<get_peer_r(b) ab>online -`);
    t('abc', s+=`c=node(id:294 boot:b) cb>connect cb>get_peer(c 53-294)
      cb<get_peer_r(ab) ca>connect ca>online cb>online -`);
    // XXX: db>fwd(53-385,dd*>get_peer:d) bc>fwd(294-385,dd*>get_peer:d)
    t('abcd', s+=`d=node(id:385 boot:b) db>connect
      dbcd~>get_peer(d 53-385)
      bc>get_peer(d 294-385) dbc<get_peer_r(ac) da>connect dc>connect
      dc>online dc>online`);
    t('abcdg', s+=`g=node(id:940 boot:b) gb>connect gb>get_peer(g 53-940)
      bd>(g 385-940) dbg<(da) gd>connect ga>connect gd>online ga>online`);
    t('xxx', `setup(ring:abcef) g=node(id:940 boot:b) gb>get_peer(g 53-940)
      bc>get_peer(g 294-940) cd>get_peer(g 385-940) de>get_peer(g 403-940)
      ef>get_peer(g 746-940) gbcdef<get_peer_r(af) ga>connect gf>connect
      ga>online gf>online`);
  });
  // XXX: add disconnect tests
  // BUG: if ac>connected and connection is broken, send will not try to send
  // messages through other peers if connections is broken
  /* XXX derry: TODO
  XX(`
    0-1023 (2^10)
    853
    bootstrap 53 (+48 +294 385 403 +473 746 940)
    853>53 connect
    853>53 get_peer 853 (54-852)
    53>473 get_peer 853 (473-852)
    473>746 get_peer 853 (747-852)
    473<746 found before:746 after:940
    853>746 connect
    853>940 connect
    853>746 online
    853>940 online
    853>53 online
    max out conn 10
    [xxx      x                            x                                 x]
    23 38 59 104 204 583 593
    4.5 5.4 6 7 8 9 9.4
    2^0 -- 2^10
    ln(0) -- ln(10)
    router: basic module you wrote
    ring_connect: connect to left and right, and then update to "online"
      and send to all connected an "online" msg
    fast_route: connect up to 10 connections for "jumping" "DHT"
    isp_route: connect to super nodes...

  `);

  */
});

/* XXX: derry: 17-May-2022
// node ID 2^128 2^160
// self: node ID of myself
// hold in memory: list
// TODO: NodeId: convert ID to double. 2^53, exp 10bit. 0-1
// self=c aXbcde>ping on receive: aXbc: add aXb nodes,
// pkt return: aXbcde<ping on receuve: add de nodes
class NodeId {
  s: 'ab472bc732',
  n: 0.48274923823232,
  b: Buffer('ab472bc732')
};
nodes = {
  map = new Map;
  tree: new Avl;
};
nodes.map['ab472bc732'] = {id: NodeId, ...}
class Node {
  id: NodeId,
  conns: Map,
  routes: ['bXa'],
  self: null or NodeSelf,
};
nodes.a.conn.X == nodes.X.conn.a
class NodeConn {rtt, bw, last pkt..., self: null || NodeConnSelf};
will appear: a->X X->a,b b->X,c c->b
nodes = new Map;
nodes[a] == AVL lookup of 'a'

nodes = {
  a: {conn: [X]}
  X: {conn: [a, b]},
  b: {conn: [X, c]}.
};
*/

// IDEAS
/* XXX derry: 2022-05-10 - statical routing by freq/rtt
// abcXYZdef
// ae aX
// f a-d 0.1% e-h 0.5% g-o 1% o-z 2%
// ae X Y
{from: 0x4827abc7, to: 0x68492bd, freq: 0.00085, rtt: avg rtt}
[xxxxx                      x                                    x]
[y        y        y        y       y      y       y      y      y]
[00000123456789aba9876543210
[a-c:100 2%, d-h:100 0.2%, h-z:100 0.02%]
Z->X->a, W->Y-> a
a: X Y(+X rtt) Z W(+Z rtt)
ae> X(rtt X+rtt to range area, resulting bits resolved)
via X 14.3 bit resolved, rtt 749ms, 749ms/14.3b = 52mspb
via Y 12 bit resolved, rtt 520ms, 520ms/12b = 43.3mspb
via W 10 bit resolved, rtt 300ms, 300ms/10b = 30mspb WINNER
via Z 9 bit resolved, rtt 290ms, 290ms/9b = 32.2mspb
bit per ms
[xxxxxx x  x  x  x x  x  x    x         x         x       x       x]
[a-z:0.08%
freq=8/100
12 0 1 2 3 4 5 6 5 4 3 2 1 0
// a-d 100 e-f 500 g-o 1000 o-z 2000
*/

/* derry 2022-05-23: how to select the lowest rtt per bit?
    me = 0.1;
    dst = 0.2;
    me is 0.1 from dst;
    node 0.9 is 0.3 from dst;
    node 0.3 is 0.1 from dst;
    node 0.5 is 0.3 from dst;
    calc_dist_via(src (myself), dst (we want to get to), via){
      src_dst_diff = calc_dist(src, dst);
      via_dst_diff = calc_dist(via, dst);
      if (src_dst_diff<=via_dst_diff)
        return {good: false};
      let ret = {good: true};
      // src 0.1 dst 0.3 via 0.32 dist_done = 0.18;
      ret.dist_dst = via_dst_diff;
      ret.dist_done = src_dst_diff-via_dst_diff;
      ret.rtt_pb = via.rtt/dist_to_bits(ret.dist_done);
      return ret;
    }
    rtt/bit  200ms/6bit = 33ms/bit  100ms/5bit = 20ms/bit; // vs self & dest
    for (best = at = itr(dest)..next() && i<16){
       if (at.rtt_pb<best.rtt_pb)
         best = at;
    }
    a-a>!get_peer
    a+a>!get_peer
    a~a>!get_peer (after reaching closets possible, then do one extra)
    // next prev in avl circle, that after 1 continues in 0
    // iterator class: you initiate it (like initiating for loop), and
    // it gives you next
    // 0.1 0.4 0.41 0.42 0.43 0.5 0.9 0.99
    // itr = avl.dist_iterator(0.429)
    // itr.next() == 0.43
    // itr.next() == 0.42
    // itr.next() == 0.41
    // itr.next() == 0.4
    // itr.next() == 0.5
    // itr.next() == 0.1
    // itr.next() == 0.99
    // itr.next() == 0.9
    // itr.next() == null
    // dist_iterator(Number 0-1, String node id, NodeId Object)
    // AVL.find (exact), AVL.find_bidi (closest from both dirs),
    // AVL.find_next (eq or more), AVL.find_prev (eq or less)
    new NodeItr(id){
      if (typeof id=='number'){
        this.start = new NodeId(d, {no_buf: true});
        this.n = AVL.find_next(this.start);
      } else if (typeof id=='string'){
        this.start = new NodeId(id, {no_buf: true});
        this.n = AVL.find_next(this.start);
      } else if (id instanceof NodeId){
        this.start = id;
        this.n = AVL.find_next(this.start);
      } else if (id instanceof Node){
        this.start = id.id;
        this.n = id;
      } else
        assert();
      this.p = this.n && this.n.prev();
    }
    NodeItr.next(){
      if (!this.n)
        return null;
      if (this.n===this.p){
        this.n = null;
        return this.p;
      }
      let at;
      let n_diff = calc_dist(this.n.id.d, this.start);
      let p_diff = calc_dist(this.p.id.d, this.start);
      if (n_diff<p_diff){
        at = this.n;
        this.n = this.n.next();
      } else {
        at = this.p;
        this.p = this.p.prev();
      }
      return at;
    }
  });
  calc_dist(a, b){ return Math.abs(...) <0.5..}

*/
/*
VP:
+ NodeId: dist, dist_bits
+ if missing rtt, assume default 1000
* path selection:
  + rm obsolete rt.range
	- rm/unite get_peer/get_peer2 test
  - fix 4_nodes_ring_state_timeout
	- need tests where we pass route info when selecting best rtt
  * calc_rtt_ob_via
    - review XXX with derry in test
    - check XXX on dist (!d && a.eq(b))
  * replace +- fuzzy with ~ fuzzy
    - when we got to closets, make one more jump over it
  * select to forward message with the path that has lowest rtt per bit
  * use Node_map+path selection instead existing obsolete code + fix tests
- with derry:
  - rtt_pb_via
    - what to do when distances are 0 but nodes not equal?
    - how to handle when s===d (for fuzzy)
- remove obsolete
  - review all 'xxx' tests
  - rm buf_util
  - check all NodeId.from in router
  - rename Ws/WrtcChannel to WsConn/WrtcConn
  - remove node.peers
  - remove node.channels (and get_closest/get_closest2)
  - remove path.js
  - cleanup path/rt/route/range usage
- /util
  - rm set.js
  - etask({'_': this})
- rm warning React... in eslint
- optimize mocha tests - improve sinon time api - by default, don't wait for
  external time to finish (eg. mongo/ls)
- lbuffer - how to get msg0 efficiently
- memory leaks (when we remove stuff from cache eg, routes)
- rtt calculation - calculate it during the connection and pass it along fwd
- fix parser
  - conf(id:a-mXYZn-z node:wrtc) - create wrtc nodes
  - a,b,c=node === a,b,c=node:wss (make wss the default)
  - aX>!ping
*/
