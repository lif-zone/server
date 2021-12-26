'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach,afterEach*/
// XXX: need jslint mocha: true
import assert from 'assert';
import _wrtc from 'electron-webrtc'; // XXX: rm
import string from '../util/string.js';
import crypto from 'crypto';
import {EventEmitter} from 'events';
import Node from './client.js';
import util from '../util/util.js';
import date from '../util/date.js';
import ws_util from '../util/ws.js';

// XXX: make it automatic for all node/browser
process.on('uncaughtException', e=>{
  console.log('uncaughtException %o', e);
  process.exit(-1);
});
process.on('unhandledRejection', e=>{
  console.error('unhandledRejection %o', e);
  process.exit(-1);
});

function throw_invalid(s, i){
  throw new Error('invalid '+s.substr(0, i)+'^^^'+s.substr(i)); }

// XXX: mv all test api to util/test_api.js
function test_parse_cmd_single(s){
  let state = 'pre', i=0, ret={}, cmd_s=0, cmd_e = s.length, arg_s=0, arg_e=0;
  let parentesis = 0, done = false;
  for (i=0; i<s.length && !done; i++)
  {
    let c = s.charAt(i);
    switch (state)
    {
    case 'pre':
      if (string.is_ws(c))
        continue;
      if ('()'.includes(c))
        throw_invalid(s, i);
      state = 'cmd';
      cmd_s = i;
      break;
    case 'cmd':
      if (')'.includes(c))
        throw_invalid(s, i);
      if (string.is_ws(c))
      {
        cmd_e = i;
        done = true;
      }
      else if ('('.includes(c))
      {
        cmd_e = i;
        arg_s = i+1;
        state = 'arg';
        parentesis++;
      }
      break;
    case 'arg':
      if (c=='(')
        parentesis++;
      if (c==')')
        parentesis--;
      if (parentesis<0)
        throw_invalid(s, i);
      if (!parentesis)
      {
        arg_e = i;
        done = true;
      }
      break;
    default: throw new Error('unknown parser error '+s);
    }
  }
  if (state=='pre')
    throw new Error('invalid empty cmd');
  if (parentesis)
    throw_invalid(s, i);
  let cmd = ret.cmd = s.substr(cmd_s, cmd_e-cmd_s);
  if (arg_e>arg_s)
  {
    if (cmd.includes(':'))
      throw_invalid(cmd, cmd.indexOf(':'));
    ret.arg = s.substr(arg_s, arg_e-arg_s);
  }
  else if (cmd.includes(':'))
  {
    let m = cmd.match(/(^[^:]+):([^:]+$)/);
    if (!m)
      throw_invalid(cmd, cmd.lastIndexOf(':'));
    cmd = ret.cmd = m[1];
    ret.arg = m[2];
  }
  ret.meta = {last: i};
  ret.orig = s.substr(cmd_s, i-cmd_s);
  return ret;
}

function test_parse_cmd_multi(s){
  if (!s)
    return [];
  let ret = [], arg, t = test_parse_cmd_single(s), meta = t.meta;
  if (t.arg)
    arg = test_parse_cmd_multi(t.arg);
  ret.push(arg ? {cmd: t.cmd, arg, orig: t.orig, meta} :
    {cmd: t.cmd, orig: t.orig, meta});
  return ret.concat(test_parse_cmd_multi(s.substr(t.meta.last)));
}

function test_run_plugin(a, cb){
  a.forEach(o=>{
    cb(o);
    if (o.arg)
      test_run_plugin(o.arg, cb);
  });
  return a;
}

function parse_cmd_dir(s){
  if (!/[><=]/.test(s))
    return {cmd: s};
  let m = s.match(/^([a-zA-Z])([a-zA-Z]?)([<>=])([^<^>]*$)/);
  if (!m)
  {
    throw_invalid(s, (s.indexOf('<')+1 ||
      s.indexOf('>')+1 || s.indexOf('=')+1)-1);
  }
  if (m[3]=='=')
  {
    if (m[2])
      throw_invalid(s, 2);
    if (!m[4])
      throw_invalid(s, 2);
  }
  let sd = m[3]=='>' || m[3]=='=' ? {s: m[1], d: m[2]} : {s: m[2], d: m[1]};
  return {...sd, dir: m[3], cmd: m[4], meta: {cmd: s}};
}

function plugin_cmd_dir(o){
  let t = parse_cmd_dir(o.cmd);
  let o2 = Object.assign({}, o);
  for (let i in o)
    delete o[i];
  Object.assign(o, t, {arg: o2.arg, orig: o2.orig});
  Object.assign(o.meta||{}, o2.meta);
  return o;
}

function test_parse_rm_meta(a){ return test_run_plugin(a, o=>delete o.meta); }

function test_parse_rm_meta_orig(a){
  return test_run_plugin(a, o=>{
    delete o.meta;
    delete o.orig;
  });
}

function test_parse(s){
  return test_run_plugin(test_parse_cmd_multi(s), plugin_cmd_dir); }

function arg_to_obj(arg){
  let ret = {};
  if (!arg)
    return ret;
  arg.forEach(o=>{
    if (!o.arg || !o.arg.length)
      return ret[o.cmd] = true;
    assert.ok(!o.arg.arg, 'invalid arg '+JSON.stringify(arg));
    assert.ok(o.arg.length==1, 'invalid arg '+JSON.stringify(arg));
    ret[o.cmd] = o.arg[0].cmd;
  });
  return ret;
}

let t_nodes = {}, t_events = [], t_expect = [];
let t_timeout = 2000, t_running;

function test_emit(e){
  assert.ok(t_running, 'test not running');
  assert.ok(e, 'invalid event');
  t_events.push(e);
}

function test_expect(e){
  assert.ok(t_running, 'test not running');
  assert.ok(e, 'invalid event');
  t_expect.push(e);
}

async function test_ensure_no_events(){
  for (let t = date.monotonic(); date.monotonic()-t < t_timeout;)
  {
    await util.sleep(); // XXX HACK: fixme
    if (!t_events.length && !t_expect.length)
      break;
    if (t_events[t_events.length-1]==t_expect[t_expect.length-1])
    {
      t_events.pop();
      t_expect.pop();
    }
  }
  assert.ok(!t_events.length && !t_expect.length,
    'event mismatch '+t_events[t_events.length-1]+' != '+
      t_expect[t_expect.length-1]);
}

class FakeNode extends EventEmitter {
  constructor(opts){
    super();
    this.id = opts.id ? util.buf_from_str(opts.id) : crypto.randomBytes(20);
    this.wsConnector = new EventEmitter();
    if (opts.port)
    {
      let port = opts.port;
      this.wsConnector._wss = new EventEmitter();
      this.wsConnector._wss.port = port;
      this.wsConnector.url = 'wss://'+opts.host+':'+opts.port;
      // XXX HACK: replace setTimeout with tick
      setTimeout(()=>this.wsConnector.emit('listen', {port}));
    }
    if (opts.bootstrap) // XXX HACK: replace setTimeout with tick
      setTimeout(()=>new FakeWS(opts.bootstrap[0], {client: this}));
  }
  destroy(){}
}

function is_fake(role, p){ return role!=p; }

function node_new(fake, name, o){
  assert.ok(!t_nodes[name], 'node already exist '+name);
  o = Object.assign({}, o);
  // XXX: wrap fixing arguments to plugin
  if (o.bootstrap) // XXX: support array
    o.bootstrap = [t_nodes[o.bootstrap].wsConnector.url];
  let node = new (fake ? FakeNode : Node)(o);
  t_nodes[name] = node;
  node.t_name = name;
  if (o.port)
  {
    // XXX: mv to listen on wsConnector._wss
    node.wsConnector.on('listen', e=>test_emit(name+'<listen(ws:'+e.port+')'));
    node.wsConnector._wss.on('connection',
      ws=>{
      // XXX HACK: rm ws.client
      let client = ws.client || node_from_ws(ws);
      test_emit(client.t_name+name+'>connect(ws:'+o.port+')');
      });
  }
}

function node_from_wss_url(url){
  for (let name in t_nodes)
  {
    let node = t_nodes[name];
    if (node.wsConnector.url==url)
      return node;
  }
}

function node_from_ws(ws){
  for (let name in t_nodes)
  {
    let node = t_nodes[name];
    for (let i in node.wsConnector.channels)
    {
      if (node.wsConnector.channels[i].ws===ws.t_ws)
        return node;
    }
  }
}

describe('test_api', function(){
   it('test_parse_cmd_single_valid', ()=>{
    const t = (s, exp, exp_last)=>{
      let ret = test_parse_cmd_single(s);
      let {last} = ret.meta;
      delete ret.meta;
      delete ret.orig;
      assert.deepEqual(ret, exp);
      assert.equal(last, exp_last);
    };
    t('open', {cmd: 'open'}, 4);
    t('open ', {cmd: 'open'}, 5);
    t('open b', {cmd: 'open'}, 5);
    t('open:a', {cmd: 'open', arg: 'a'}, 6);
    t('open:ab', {cmd: 'open', arg: 'ab'}, 7);
    t('open()', {cmd: 'open'}, 6);
    t('open() ', {cmd: 'open'}, 6);
    t('open( )', {cmd: 'open', arg: ' '}, 7); // XXX: maybe arg:undefined?
    t('open(a) ', {cmd: 'open', arg: 'a'}, 7);
    t('open(a b) ', {cmd: 'open', arg: 'a b'}, 9);
    t('open(a b)  ', {cmd: 'open', arg: 'a b'}, 9);
    t('open(a(b)) ', {cmd: 'open', arg: 'a(b)'}, 10);
    t('open(role c)', {cmd: 'open', arg: 'role c'}, 12);
    t('open(roles(ct>))', {cmd: 'open', arg: 'roles(ct>)'}, 16);
    t('open(a) b', {cmd: 'open', arg: 'a'}, 7);
    t('open(a) (', {cmd: 'open', arg: 'a'}, 7);
    t('open(a) )', {cmd: 'open', arg: 'a'}, 7);
    t('bc>(hc hget)', {cmd: 'bc>', arg: 'hc hget'}, 12);
  });
  it('test_parse_cmd_single_invalid', ()=>{
    const t = (s, exp)=>{ assert.throws(()=>{ test_parse_cmd_single(s); },
      {message: exp}); };
    t('abcdefg)12345678', 'invalid abcdefg^^^)12345678');
    t(')', 'invalid ^^^)');
    t('(', 'invalid ^^^(');
    t('a)', 'invalid a^^^)');
    t('a(b()', 'invalid a(b()^^^');
    t('a(b () ', 'invalid a(b () ^^^');
    t('a:(b)', 'invalid a^^^:');
    t('a:b:c', 'invalid a:b^^^:c');
    t('', 'invalid empty cmd');
    t(' ', 'invalid empty cmd');
  });
  it('test_run_plugin', ()=>{
    const t = (a, exp)=>{
      let a2 = test_run_plugin(a, o=>o.cmd = o.cmd+o.cmd);
      assert.equal(a, a2);
      assert.deepEqual(a, exp);
    };
    t([{cmd: 'a'}], [{cmd: 'aa'}]);
    t([{cmd: 'a'}, {cmd: 'b'}], [{cmd: 'aa'}, {cmd: 'bb'}]);
    t([{cmd: 'a', arg: [{cmd: 'c'}]}, {cmd: 'b'}],
      [{cmd: 'aa', arg: [{cmd: 'cc'}]}, {cmd: 'bb'}]);
    t([{cmd: 'a', arg: [{cmd: 'c'}]}, {cmd: 'b', arg: [{cmd: 'd'}]}],
      [{cmd: 'aa', arg: [{cmd: 'cc'}]}, {cmd: 'bb', arg: [{cmd: 'dd'}]}]);
  });
  it('test_parse_cmd_multi_valid', ()=>{
    const t = (s, exp)=>{
      let ret = test_parse_cmd_multi(s);
      ret = test_parse_rm_meta_orig(ret);
      assert.deepEqual(ret, exp);
    };
    t('a', [{cmd: 'a'}]);
    t('a b', [{cmd: 'a'}, {cmd: 'b'}]);
    t('a(c) b', [{cmd: 'a', arg: [{cmd: 'c'}]}, {cmd: 'b'}]);
    t('a(c) b(d)', [{cmd: 'a', arg: [{cmd: 'c'}]},
      {cmd: 'b', arg: [{cmd: 'd'}]}]);
    t('a(c d(5))',
      [{cmd: 'a', arg: [{cmd: 'c'}, {cmd: 'd', arg: [{cmd: '5'}]}]}]);
    t('a(c d(5s + 3))', [{cmd: 'a', arg: [{cmd: 'c'},
      {cmd: 'd', arg: [{cmd: '5s'}, {cmd: '+'}, {cmd: '3'}]}
      ]}]);
    t('ab>connect', [{cmd: 'ab>connect'}]);
    t('ab>(test go(now 3 send:4))', [{cmd: 'ab>', arg: [{cmd: 'test'},
      {cmd: 'go', arg: [{cmd: 'now'}, {cmd: '3'}, {cmd: 'send',
        arg: [{cmd: '4'}]}]}]}]);
  });
  it('test_parse_cmd_multi_valid_orig', ()=>{
    const t = (s, exp)=>{
      let ret = test_parse_cmd_multi(s);
      ret = test_parse_rm_meta(ret);
      assert.deepEqual(ret, exp);
    };
    t('ab>connect', [{cmd: 'ab>connect', orig: 'ab>connect'}]);
    t('ab>connect(a)', [{cmd: 'ab>connect', orig: 'ab>connect(a)',
      arg: [{cmd: 'a', orig: 'a'}]}]);
  });
  it('test_parse_cmd_multi_invalid', ()=>{
    const t = (s, exp)=>{ assert.throws(()=>{ test_parse_cmd_multi(s); },
      {message: exp}); };
    t('a(', 'invalid a(^^^');
    t('a(b()', 'invalid a(b()^^^');
    t('a(b)(', 'invalid ^^^(');
    t('a( )', 'invalid empty cmd');
  });
  it('parse_cmd_dir', ()=>{
    const t = (s, exp)=>{
      let ret = parse_cmd_dir(s);
      delete ret.meta;
      delete ret.orig;
      assert.deepEqual(ret, exp);
    };
    t('a', {cmd: 'a'});
    t('a>', {s: 'a', d: '', dir: '>', cmd: ''});
    t('a<', {s: '', d: 'a', dir: '<', cmd: ''});
    t('aB>', {s: 'a', d: 'B', dir: '>', cmd: ''});
    t('aB<', {s: 'B', d: 'a', dir: '<', cmd: ''});
    t('a>b', {s: 'a', d: '', dir: '>', cmd: 'b'});
    t('a>bc', {s: 'a', d: '', dir: '>', cmd: 'bc'});
    t('ab>c', {s: 'a', d: 'b', dir: '>', cmd: 'c'});
    t('ab<c', {s: 'b', d: 'a', dir: '<', cmd: 'c'});
    t('a=b', {s: 'a', d: '', dir: '=', cmd: 'b'});
  });
  it('parse_cmd_dir_invalid', ()=>{
    const t = (s, exp)=>{ assert.throws(()=>{ parse_cmd_dir(s); },
      {message: exp}); };
    t('a>>', 'invalid a^^^>>');
    t('abc>', 'invalid abc^^^>');
    t('>', 'invalid ^^^>');
    t('a=', 'invalid a=^^^');
    t('=a', 'invalid ^^^=a');
    t('=', 'invalid ^^^=');
    t('ab=c', 'invalid ab^^^=c');
  });
});

async function test_run(role, test){
  assert.ok(!t_running, 'test already running');
  t_running = true;
  let a = test_parse(test);
  for (let i=0; i<a.length; i++)
  {
    let c = a[i];
    // XXX: mv arg_to_obj to plugin
    switch (c.cmd)
    {
    case 'node_new':
      assert.equal(c.dir, '=');
      assert.ok(!c.d, 'unexpected dst '+c.d);
      node_new(is_fake(role, c.s), c.s, arg_to_obj(c.arg));
      break;
    case 'listen':
      test_expect(c.orig);
      await test_ensure_no_events();
      break;
    case 'connect':
      test_expect(c.orig);
      await test_ensure_no_events();
      break;
    default: throw new Error('unknown cmd '+c.cmd);
    }
    await util.sleep(); // XXX HACK: fixme
  }
  await test_end();
  t_running = false;
}

async function test_end(){
  assert.ok(t_running, 'test not running');
  test_ensure_no_events();
  for (let n in t_nodes)
  {
    await t_nodes[n].destroy();
    delete t_nodes[n];
  }
  test_ensure_no_events();
}

class FakeWS extends EventEmitter {
  constructor(url, opts){
    super();
    opts = opts||{};
    this.client = opts.client;
    this.server = opts.server;
    if (url)
    {
      let node= node_from_wss_url(url);
      // XXX HACK: rm client/server
      let ws = new FakeWS(undefined, {client: opts.client, server: node});
      ws.t_ws = this;
      node.wsConnector.t_ws = node.wsConnector.t_ws||[];
      node.wsConnector.t_ws.push(ws); // XXX: need cleanup
      // XXX HACK: setTimeout is a hack
      setTimeout(()=>node.wsConnector._wss.emit('connection', ws));
    }
  }
  close(){
  }
}

class FakeWebSocketServer extends EventEmitter {
  constructor(opts){
    super();
    let port = opts.port;
    this.init();
    this._server = {address: ()=>({port})};
  }
  async init(){
    await util.sleep(); // XXX HACK: fixme
    this.emit('listening');
  }
  close(cb){
    if (cb)
      cb();
  }
}

describe('peer-relay', async function(){
  // XXX HACK: organize it nicely and use sinon
  beforeEach(function(){
    ws_util.orig_WebSocketServer = ws_util.WebSocketServer;
    ws_util.WebSocketServer = FakeWebSocketServer;
    ws_util.orig_WS = ws_util.WS;
    ws_util.WS = FakeWS;
  });
  afterEach(function(){
    ws_util.WS = ws_util.orig_WS;
  });
  this.timeout(2*t_timeout);
  await it('test', async()=>{
    const t = async(role, test)=>await test_run(role, test);
    // XXX: review if to use = or reuse ':'
    await t('s', `s=node_new(host:lif.zone port:4000) s<listen(ws:4000)
      a=node_new(bootstrap:s) as>connect(ws:4000)`);
    await t('a', `s=node_new(host:lif.zone port:4000) s<listen(ws:4000)
      a=node_new(bootstrap:s) as>connect(ws:4000)`);
  });
});

if (0) // XXX: review old-style test and decide if needed
describe('End to End', function(){
  const wrtc = _wrtc();
  wrtc.on('error', function(err){ console.error(err, err.stack); });
  var clients = [];

  function startClient(opts){
    var c = new Node(opts);
    clients.push(c);
    return c;
  }

  this.afterEach(function(done){
    function destroy(){
      if (clients.length===0)
        done();
      else
        clients.pop().destroy(destroy);
    }
    destroy();
  });
  it('two peers connect', function(done){
    var c1 = startClient({port: 8001, bootstrap: []});
    var c2 = startClient({port: 8002, bootstrap: ['ws://localhost:8001']});
    var count = 0;
    c1.on('peer', function(id){
      assert.ok(id.equals(c2.id));
      assert.ok(count<=2);
      count++;
      if (count === 2)
        done();
    });
    c2.on('peer', function(id){
      assert.ok(id.equals(c1.id));
      assert.ok(count <= 2);
      count++;
      if (count === 2)
        done();
    });
  });
  it('direct message', function(done){
    var c1 = startClient({port: 8001, bootstrap: []});
    var c2 = startClient({port: 8002, bootstrap: ['ws://localhost:8001']});
    var count = 0;

    c1.on('peer', function(id){
      assert.ok(id.equals(c2.id));
      c1.send(id, 'TEST1');
    });

    c2.on('peer', function(id){
      assert.ok(id.equals(c1.id));
      c2.send(id, 'TEST2');
    });

    c1.on('message', function(msg, id){
      assert.ok(id.equals(c2.id));
      assert.equal(msg, 'TEST2');
      assert.ok(count <= 2);
      count++;
      if (count === 2)
        done();
    });

    c2.on('message', function(msg, id){
      assert.ok(id.equals(c1.id));
      assert.equal(msg, 'TEST1');
      assert.ok(count <= 2);
      count++;
      if (count === 2)
        done();
    });
  });

  it('send message before connect', function(done){
    var c1 = startClient({port: 8001, bootstrap: []});
    var c2 = startClient({port: 8002, bootstrap: ['ws://localhost:8001']});
    var count = 0;

    c1.on('message', function(msg, id){
      assert.ok(id.equals(c2.id));
      assert.equal(msg, 'TEST2');
      assert.ok(count <= 2);
      count++;
      if (count === 2)
        done();
    });

    c2.on('message', function(msg, id){
      assert.ok(id.equals(c1.id));
      assert.equal(msg, 'TEST1');
      assert.ok(count <= 2);
      count++;
      if (count === 2)
        done();
    });

    c2.send(c1.id, 'TEST2');
    c1.send(c2.id, 'TEST1');
  });

  it('relay message', function(done){
    // c1 <-> c2 <-> c3
    var c2 = startClient({port: 8002, bootstrap: []});
    var c1 = startClient({port: 8001, bootstrap: ['ws://localhost:8002']});
    var c3 = startClient({port: 8003, bootstrap: ['ws://localhost:8002']});
    var n = 0;
    c1.on('peer', function(id){
      if (n==0)
        assert.equal(id.toString('hex'), c2.id.toString('hex'));
      else if (n==1)
        assert.equal(id.toString('hex'), c3.id.toString('hex'));
      else
        assert.ok(false);
      n++;
      c1.send(c3.id, 'TEST');
    });

    c3.on('message', function(msg, id){
      assert.equal(id.toString('hex'), c1.id.toString('hex'));
      assert.equal(msg, 'TEST');
      done();
    });
  });

  it('clients automatically populate', function(done){
    // c1 <-> c2 <-> c3
    var c2 = startClient({port: 8002, bootstrap: []});
    var c1 = startClient({port: 8001, bootstrap: ['ws://localhost:8002']});
    var c3 = startClient({port: 8003, bootstrap: ['ws://localhost:8002']});

    var c1PeerEvent = false;
    var c3PeerEvent = false;

    c1.on('peer', function(id){
      if (id.equals(c2.id));
        // c1.connect(c3.id)
      else if (id.equals(c3.id))
      {
        c1PeerEvent = true;
        c1.disconnect(c2.id);
        c1.send(c3.id, 'TEST');
      }
      else
        assert.ok(false);
    });

    c3.on('peer', function(id){
      assert.ok(id.equals(c1.id) || id.equals(c2.id));
      if (id.equals(c1.id)) c3PeerEvent = true;
    });

    c3.on('message', function(msg, id){
      assert.ok(id.equals(c1.id));
      assert.equal(msg, 'TEST');
      assert.ok(c1PeerEvent);
      assert.ok(c3PeerEvent);
      done();
    });
  });

  // it('webrtc connect and send message', function(done){
  //   // c1 <-> c2 <-> c3
  //   var c2 = startClient({ port: 8002, bootstrap: [] })
  //   var c1 = startClient({ wrtc: wrtc, bootstrap: ['ws://localhost:8002'] })
  //   var c3 = startClient({ wrtc: wrtc, bootstrap: ['ws://localhost:8002'] })

  //   c1.on('peer', function (id){
  //     assert.ok(id.equals(c2.id) || id.equals(c3.id))
  //     if (id.equals(c3.id)) c1.send(c3.id, 'TEST')
  //   })

  //   c3.on('message', function (msg, id){
  //     assert.ok(id.equals(c1.id))
  //     assert.equal(msg, 'TEST')
  //     done()
  //   })
  // })

  // it('relay chain', function (done){
  //   var peers = []
  //   for (var i = 0; i < 10; i++){
  //     peers.push(startClient({
  //       port: 8000 + i,
  //       bootstrap: i === 0 ? [] : ['ws://localhost:' + (8000 + i - 1)]
  //     }))
  //   }

  //   var first = peers[0]
  //   var last = peers[peers.length - 1]

  //   last.on('message', function (msg, id){
  //     assert.ok(id.equals(first.id))
  //     assert.equal('TEST', msg)
  //     done()
  //   })

  //   onBootstrap(peers, function (){
  //     first.send(last.id, 'TEST')
  //   })
  // })
});

// function onBootstrap (peers, cb){
//   for (var p of peers){
//     p.on('peer', function (){
//       if (isBootstrapped()) cb()
//     })
//   }
//
//   function isBootstrapped (){
//     for (var p of peers){
//       if (p.peers.count() === 0) return false
//     }
//     return true
//   }
// }
