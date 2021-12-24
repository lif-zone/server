'use strict'; /*jslint node:true*/ /*global describe,it*/
import assert from 'assert';
import crypto from 'crypto';
import _wrtc from 'electron-webrtc'; // XXX: rm
import evil_dns from 'evil-dns';
import {WebSocketServer} from 'ws';
import fs from 'fs';
import https from 'https';
import Client from './client.js';
import util from '../util/util.js';
import date from '../util/date.js';
import string from '../util/string.js';
import Node from '../peer-relay/client.js';
import {EventEmitter} from 'events';

function normalize(o){
  if (!o.p2 || o.dir!='<')
    return o;
  let p = o.p1;
  o.dir = '>';
  o.p1 = o.p2;
  o.p2 = p;
  return o;
}

// XXX: mv all test api to test_api.js and add test for it
function parse_expr(expr){
  let a = expr.match(/(^[a-zA-Z]{0,2})([<>]+)(.+.*$)/);
  if (!a || a.length!=4)
    throw new Error('invalid expr');
  let {op, params} = parse_cmd(a[3]);
  return normalize({p1: a[1][0]||'', p2: a[1][1]||'', dir: a[2], op, params});
}

function parse_param(s){
  let a = s.split(':'), param = {};
  if (a.length>2)
    throw new Error('invalid param');
  if (!a[0])
  {
    if (a.length!=1)
      throw new Error('invalid param');
  }
  else
    param[a[0]] = a[1]||'';
  return param;
}

function parse_params(str){
  let a = str.split(','), params = {};
  a.forEach(s=>Object.assign(params, parse_param(s)));
  return params;
}

function parse_cmd(cmd){
  let m = cmd.match(/(^[^(^)]+)(\(([^(^)]*)\))?$/);
  if (!m || m.length>4)
    throw new Error('invalid cmd');
  let op = m[1], rest = m[3]||'', params = parse_params(rest);
  return {op, params};
}

describe('test_api', function(){
  it('parse_param', ()=>{
    let t = (s, exp)=>assert.deepEqual(parse_param(s), exp);
    t('', {});
    t('ws', {ws: ''});
    t('ws:80', {ws: '80'});
  });
  it('parse_params', ()=>{
    let t = (s, exp)=>assert.deepEqual(parse_params(s), exp);
    t('', {});
    t('ws', {ws: ''});
    t('ws:80', {ws: '80'});
    t('ws:80,host:lif.zone', {ws: '80', host: 'lif.zone'});
  });
  it('parse_cmd', ()=>{
    let t = (s, op, params)=>assert.deepEqual(parse_cmd(s), {op, params});
    t('connect', 'connect', {});
    t('connect()', 'connect', {});
    t('connect(ws)', 'connect', {ws: ''});
    t('connect(ws:80)', 'connect', {ws: '80'});
    t('connect(ws:80,timeout:5)', 'connect', {ws: '80', timeout: '5'});
  });
  it('parse_expr', ()=>{
    let t = (s, p1, p2, dir, op, params)=>assert.deepEqual(parse_expr(s),
      {p1, p2, dir, op, params});
    t('<listen', '', '', '<', 'listen', {});
    t('a<listen', 'a', '', '<', 'listen', {});
    t('A<listen', 'A', '', '<', 'listen', {});
    t('a<listen(ws)', 'a', '', '<', 'listen', {ws: ''});
    t('a<listen(ws:b)', 'a', '', '<', 'listen', {ws: 'b'});
    t('a<listen(ws:3030)', 'a', '', '<', 'listen', {ws: '3030'});
    t('a>new_node(ws:s)', 'a', '', '>', 'new_node', {ws: 's'});
    t('ab<connect', 'b', 'a', '>', 'connect', {});
    t('ab>connect(ws:3030)', 'a', 'b', '>', 'connect', {ws: '3030'});
    t = (s, exp)=>assert.throws(()=>{ parse_expr(s); }, {message: exp});
    t('', 'invalid expr');
    t('ab', 'invalid expr');
    t('ab<', 'invalid expr');
    t('abc<listen', 'invalid expr');
  });
});

class TestNode extends EventEmitter {
  constructor(opts){
    opts = opts||{};
    super();
    this.id = opts.id ? util.buf_from_str(opts.id) : crypto.randomBytes(20);
    // XXX create: fake certificates fo tests
    const https_opts = {
      key: fs.readFileSync('/var/lif/ssl/STAR_lif_zone.key'),
      cert: fs.readFileSync('/var/lif/ssl/STAR_lif_zone.crt')};
    this.port = opts.port;
    this.https_server = https.createServer(https_opts)
    .listen(this.port, '0.0.0.0');
    this._wss = new WebSocketServer({server: this.https_server});
    this.url = 'wss://lif.zone' + this.port;
    this._wss.on('connection', ws=>{
      console.log('XXX connection');
    });
    this._wss.on('listening', ()=>{
      this._wss.url = 'wss://lif.zone:'+this._wss._server.address().port;
      this.emit('listen');
    });
  }
  destroy(){ this._wss.close(()=>this.https_server.close()); }
}

const nodes = {}, exp_events = [];

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
  let a = string.split_ws(test);
  evil_dns.add('lif.zone', '127.0.0.1');
  for (let i=0; i<a.length; i++)
  {
    let expr = a[i];
    let {p1, p2, dir, op, params} = parse_expr(expr);
    console.log('%s: p1 %s p2 %s dir %s op %s params %s',
      expr, p1, p2, dir, op, params);
    switch (op)
    {
    case 'new_node':
      // XXX: create hard-coded node_ids for the test
      if (role==p1)
        nodes[p1] = new TestNode({port: +params.port});
      else
      {
        assert.ok(!nodes[p1]);
        nodes[p1] = new Node({bootstrap: [nodes[params.ws]._wss.url]});
      }
      if (params.port)
      {
        exp_events.push(p1+'<listen');
      }
      nodes[p1].on('listen', ()=>on_event(p1+'<listen'));
      await wait_until_no_events();
      break;
    case 'connect':
      if (role==p1); // XXX: TODO
      else
        nodes[p1].connect(nodes[p2].id);
      break;
    case 'listen':
      console.log('XXX TODO: %s', op); // XXX: WIP
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
    evil_dns.remove('lif.zone');
  }
}

describe('peer-relay', async function(){
  this.timeout(5000); // XXX HACK
  await it('test', async()=>{
    this.timeout(5000); // XXX HACK
    const t = async test=>await run_test('s', test);
    // XXX: rm port for a>new_node
    await t(`s>new_node(port:4000) a>new_node(ws:s)`);
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

if (0) // XXX: review old-style test and decide if needed
describe('End to End', function(){
  const wrtc = _wrtc();
  wrtc.on('error', function(err){ console.error(err, err.stack); });
  var clients = [];

  function startClient(opts){
    var c = new Client(opts);
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
