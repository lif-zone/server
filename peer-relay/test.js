'use strict'; /*jslint node:true*/ /*global describe,it*/
import assert from 'assert';
import _wrtc from 'electron-webrtc'; // XXX: rm
import string from '../util/string.js';
import {EventEmitter} from 'events';
import Node from './client.js';

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
  ret.meta = {last: i, orig: s};
  return ret;
}

function test_parse_cmd_multi(s){
  if (!s)
    return [];
  let ret = [], arg, t = test_parse_cmd_single(s), meta = t.meta;
  if (t.arg)
    arg = test_parse_cmd_multi(t.arg);
  ret.push(arg ? {cmd: t.cmd, arg, meta} : {cmd: t.cmd, meta});
  return ret.concat(test_parse_cmd_multi(s.substr(t.meta.last)));
}

function test_run_plugin(a, cb){
  console.log('XXX a %s %o', typeof a, a);
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
  Object.assign(o, t, {arg: o2.arg});
  Object.assign(o.meta||{}, o2.meta);
  return o;
}

function test_parse_rm_meta(a){ return test_run_plugin(a, o=>delete o.meta); }
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

let t_nodes = {};

class FakeNode extends EventEmitter {
  constructor(opts){
    super();
  }
  destroy(){}
}

function new_node(fake, name, o){
  assert.ok(!t_nodes[name], 'node already exist '+name);
  let node = new (fake ? FakeNode : Node)(o);
  t_nodes[name] = node;
}

describe('test_api', function(){
   it('test_parse_cmd_single_valid', ()=>{
    const t = (s, exp, exp_last)=>{
      let ret = test_parse_cmd_single(s);
      let {last} = ret.meta;
      delete ret.meta;
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
      ret = test_parse_rm_meta(ret);
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
    t('ab>(test go(now 3 send:4))', [{cmd: 'ab>', arg: [{cmd: 'test'},
      {cmd: 'go', arg: [{cmd: 'now'}, {cmd: '3'}, {cmd: 'send',
        arg: [{cmd: '4'}]}]}]}]);
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
  let a = test_parse(test);
  for (let i=0; i<a.length; i++)
  {
    let c = a[i];
    switch (c.cmd)
    {
    case 'new_node':
      assert.equal(c.dir, '=');
      console.log('XXX %o %s%s', c.cmd, c.s, c.dir);
      console.log('XXX obj %o', arg_to_obj(c.arg));
      assert.ok(/[a-zA-Z]/.test(c.s), 'invalid node name '+c.s);
      new_node(c.s!=role, c.s, arg_to_obj(c.arg));
      break;
    default: throw new Error('unknown cmd '+c.cmd);
    }
  }
  await test_end();
}

async function test_end(){
  for (let n in t_nodes)
    await t_nodes[n].destroy();
}

describe('peer-relay', async function(){
  this.timeout(5000); // XXX HACK
  await it('test', async()=>{
    const t = async(role, test)=>await test_run(role, test);
    // XXX: review if to use = or reuse ':'
    await t('s', `s=new_node(host:lif.zone port:4000) a=new_node(ws:s)`);
  });
});

/* XXX: obsolete, rm
import Node from '../peer-relay/client.js';
import {WebSocketServer} from 'ws';
import date from '../util/date.js';
import crypto from 'crypto';
import evil_dns from 'evil-dns';
import fs from 'fs';
import https from 'https';
import util from '../util/util.js';

class TestNode extends EventEmitter {
  constructor(opts){
    let {host, port} = opts = opts||{};
    super();
    this.id = opts.id ? util.buf_from_str(opts.id) : crypto.randomBytes(20);
    // XXX create: fake certificates fo tests
    const https_opts = {
      key: fs.readFileSync('/var/lif/ssl/STAR_'+host.replace('.', '_')+'.key'),
      cert: fs.readFileSync(
        '/var/lif/ssl/STAR_'+host.replace('.', '_')+'.crt')};
    this.port = port;
    this.wsConnector = new EventEmitter();
    if (port)
    {
      this.https_server = https.createServer(https_opts)
      .listen(this.port, '0.0.0.0');
      this.wsConnector._wss = new WebSocketServer({server: this.https_server});
      this.url = 'wss://'+host+':'+port;
      this.wsConnector._wss.on('connection', ws=>{
        console.log('XXX connection');
      });
      this.wsConnector._wss.on('listening', ()=>{
        this.wsConnector.url =
          'wss://'+host+':'+this.wsConnector._wss._server.address().port;
        this.wsConnector.emit('listening');
      });
    }
  }
  destroy(){
    if (this.wsConnector._wss)
    {
      this.wsConnector._wss.close();
      this.https_server.close();
    }
  }
}

let nodes = {}, exp_events = [];

async function wait_until_no_events(){
  const max = 1000;
  await util.sleep(); // XXX HACK
  const t = date.monotonic();
  while (exp_events.length && date.monotonic()-t < max)
    await util.sleep(); // XXX HACK
  assert.ok(!exp_events.length, 'pending events:\n'+exp_events.join('\n'));
}

function on_event(e){
  assert.equal(e, exp_events[0]);
  exp_events.shift();
}

async function run_test(role, test){
  if (true) return; // XXX: rm obsolete run_test
  let a = string.split_ws(test);
  evil_dns.add('lif.zone', '127.0.0.1');
  for (let i=0; i<a.length; i++)
  {
    let expr = a[i];
//    let {p1, p2, dir, op, params} = parse_expr(expr);
    let {p1, p2, dir, op, params} = {};
    console.log('%s: p1 %s p2 %s dir %s op %s params %s',
      expr, p1, p2, dir, op, params);
    switch (op)
    {
    case 'new_node':
      // XXX: create hard-coded node_ids for the test
      if (role==p1)
        nodes[p1] = new TestNode({host: 'lif.zone', port: +params.port});
      else
      {
        assert.ok(!nodes[p1]);
        nodes[p1] = new Node({port: +params.port, bootstrap:
          params.ws ? [nodes[params.ws].wsConnector.url] : []});
      }
      if (params.port)
      {
        exp_events.push(p1+'<listen');
        nodes[p1].wsConnector.on('listening', ()=>nodes[p1].emit('listen'));
      }
      nodes[p1].on('listen', ()=>on_event(p1+'<listen'));
      await wait_until_no_events();
      break;
    case 'connect':
      if (role==p1); // XXX: TODO
      else
        nodes[p1].connect(nodes[p2].id);
      break;
    default: throw new Error('invalid op '+op);
    }
    await util.sleep(); // XXX HACK
  }
  await test_end();

  async function test_end(){
    await wait_until_no_events();
    assert.ok(!exp_events.length);
    for (let i in nodes)
      nodes[i].destroy(()=>{});
    nodes = {};
    evil_dns.remove('lif.zone');
  }
}

describe('peer-relay', async function(){
  this.timeout(5000); // XXX HACK
  await it('test', async()=>{
    const t = async(role, test)=>await run_test(role, test);
    // XXX: rm port for a>new_node
    await t('s', `s>new_node(port:4000) a>new_node(ws:s)`);
    await t('a', `s>new_node(port:4000) a>new_node(ws:s)`);
    // await t(`s>new_node a>new_node(ws:s)`);
    // await t(`s>new_node a>new_node(ws:s) as>connect`);
    if (0) // XXX: WIP
    t(`s<listen as>connect`);
    if (0) // XXX: WIP
    t(`s<listen as>connect sa>send(handshake-offer)
      as>send(handshake-answer) as>send(findPeers) sa>send(findPeers)
      as>send(foundPeers) sa>send(foundPeers)`);
  });
});
*/

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
