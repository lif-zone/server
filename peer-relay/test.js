'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach*/
// XXX: need jslint mocha: true
import assert from 'assert';
import _wrtc from 'electron-webrtc'; // XXX: rm
import crypto from 'crypto';
import {EventEmitter} from 'events';
import Node from './client.js';
import util from '../util/util.js';
import array from '../util/array.js';
import xurl from '../util/url.js';
import date from '../util/date.js';
import ws_util from '../util/ws.js';
import xtest from '../util/test_lib.js';
import etask from '../util/etask.js';
const zetask = xtest.etask, stringify = JSON.stringify, assign = Object.assign;
// XXX: make it automatic for all node/browser
process.on('uncaughtException', e=>{
  console.log('uncaughtException %o', e);
  process.exit(-1);
});
process.on('unhandledRejection', e=>{
  console.error('unhandledRejection %o', e);
  process.exit(-1);
});

let t_nodes = {}, t_events = [], t_pending = [];
let t_queue = [];
let t_timeout = 2000, t_running;

function test_emit(e){
  console.log('emit: %s', e);
  assert.ok(t_running, 'test not running');
  assert.ok(e, 'invalid event');
  t_events.push(e);
}

function test_pending(e){
  assert.ok(t_running, 'test not running');
  assert.ok(e, 'invalid event');
  t_pending.push(e);
}
// eslint-disable-next-line no-unused-vars
const test_ensure_no_pending_events = ()=>etask(function*(){
  for (let t = date.monotonic(); date.monotonic()-t < t_timeout;)
  {
    yield util.sleep(); // XXX HACK: fixme
    if (t_events[0]==t_pending[0])
    {
      t_events.shift();
      t_pending.shift();
    }
    if (!t_pending.length)
      return;
  }
  console.log('queue %o', t_queue);
  throw new Error('pending events '+stringify(t_pending)+ ' got'+
    stringify(t_events));
});

const test_ensure_no_events = ()=>etask(function*(){
  for (let t = date.monotonic(); date.monotonic()-t < t_timeout;)
  {
    yield util.sleep(); // XXX HACK: fixme
    if (!t_events.length && !t_pending.length)
      break;
    if (t_events[t_events.length-1]==t_pending[t_pending.length-1])
    {
      t_events.pop();
      t_pending.pop();
    }
  }
  assert.ok(!t_events.length && !t_pending.length,
    'event mismatch '+stringify(t_events)+' != '+stringify(t_pending));
});

class FakeNode extends EventEmitter {
  constructor(opts){
    super();
    this.id = opts.id ? util.buf_from_str(opts.id) : crypto.randomBytes(20);
    this.wsConnector = new FakeWsConnector(this.id);
    this.wsConnector.on('connection', c=>{
      this.emit('connection', c);
    });
  }
  destroy(){}
  connect_ws(url){
    this.wsConnector.connect(url);
  }
}

class FakeChannel extends EventEmitter {
  constructor(opts){
    super();
    this.id = opts.id;
    this.localID = opts.localID;
    this.on('message', msg=>{
      let s = node_from_id(util.buf_from_str(msg.from));
      let d = node_from_id(util.buf_from_str(msg.to));
      let p, {type, data} = msg.data;
      switch (type)
      {
        case 'findPeers':
          p = node_from_id(util.buf_from_str(data));
          test_emit(s.t.name+d.t.name+'>'+type+'('+p.t.name+')');
          break;
        case 'foundPeers':
          assert(data.length==1, 'TODO: multiple peers'); // XXX TODO
          p = node_from_id(util.buf_from_str(data[0]));
          test_emit(s.t.name+d.t.name+'>'+type+'('+p.t.name+')');
          break;
        default: assert(false, 'unexpected msg '+type);
      }
    });
  }
  send(msg){
    let s = node_from_id(this.localID), d = node_from_id(this.id);
    let {type} = msg.data;
    switch (type)
    {
    case 'findPeers': send_msg(s.t.name, d.t.name, msg); break;
    case 'foundPeers': send_msg(s.t.name, d.t.name, msg); break;
    default: assert(false, 'unexpected msg '+type);
    }
  }
  destroy(){}
}

function send_msg(s, d, msg){
  let channel = node_get_channel(d, s);
  let channel2 = node_get_channel(s, d);
  if (!channel || !channel2)
    t_queue.push({s, d, msg: assign({}, msg)});
  else
    channel.emit('message', msg);
}

function try_send_queue(){
  let q = t_queue.filter(o=>node_get_channel(o.d, o.s) &&
    node_get_channel(o.s, o.d));
  q.forEach(o=>{
    let channel = node_get_channel(o.d, o.s);
    channel.emit('message', o.msg);
  });
  q.forEach(o=>array.rm_elm(t_queue, o));
}

class FakeWsConnector extends EventEmitter {
  constructor(id, port, host){
    super();
    this.id = id;
  }
  connect(url){
    let node = node_from_url(url);
    let channel = new FakeChannel({localID: this.id, id: node.id});
    this.emit('connection', channel);
    let channel2 = new FakeChannel({localID: node.id, id: this.id});
    setTimeout(()=>{
      node.wsConnector.emit('connection', channel2);
      try_send_queue();
    }, 100);
  }
  destroy(){}
}

function is_fake(role, p){ return role!=p; }

function node_from_url(url){
  for (let name in t_nodes)
  {
    let node = t_nodes[name];
    if (node.t.wss && node.t.wss.url==url)
      return node;
  }
}

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

function assert_wss(val){
  let host, port, arg = xtest.test_parse(val);
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

function cmd_node(role, c){
  // XXX: add xtest.test_parse_unique (to avoid multiple args)
  let arg = xtest.test_parse(c.arg);
  let name, wss;
  util.forEach(arg, a=>{
    switch (a.cmd)
    {
    case 'name': name = assert_name_new(a.arg); break;
    case 'wss': wss = assert_wss(a.arg); break;
    default: throw new Error('unknown arg '+a.cmd);
    }
  });
  let fake = is_fake(role, name);
  let node = new (fake ? FakeNode : Node)(
    assign({WsConnector: FakeWsConnector}, wss));
  let id = util.buf_to_str(node.id);
  node.t = {id, name, fake, wss, channels: []};
  t_nodes[name] = node;
  node.on('connection', channel=>{
    let s = node_from_id(channel.localID), d = node_from_id(channel.id);
    node.t.channels.push(channel);
    test_emit(s.t.name+d.t.name+'>connected');
    try_send_queue();
  });
}

function cmd_connect(c){
  let wss, arg = xtest.test_parse(c.arg);
  util.forEach(arg, a=>{
    switch (a.cmd)
    {
    case 'wss':
      assert(wss===undefined, 'multiple '+a.cmd);
      wss = assert_wss_url(a.arg);
      break;
    default: throw new Error('unknown arg '+a.cmd);
    }
  });
  assert_exist(c.s);
  assert(!c.d);
  assert.equal(c.dir, '>');
  if (wss)
    t_nodes[c.s].connect_ws(wss);
  else
    throw new Error('not implemented yet');
}

function cmd_event(c){
  // XXX: check what to assert for events
  test_pending(c.orig);
}

const cmd_find_peers = c=>etask(function(){
  let s = t_nodes[c.s], d = t_nodes[c.d];
  // XXX: check what to assert for events
  if (s.t.fake)
  {
    var msg = {to: d.id.toString('hex'), from: s.id.toString('hex'),
      path: [s.id.toString('hex')],
      nonce: '' + Math.floor(1e15 * Math.random()),
      data: {type: 'findPeers', data: util.buf_to_str(s.id)}};
    send_msg(c.d, c.s, msg);
  }
  test_pending(c.orig);
});

const cmd_found_peers = c=>etask(function(){
  let s = t_nodes[c.s], d = t_nodes[c.d];
  // XXX: check what to assert for events
  if (s.t.fake)
  {

    var msg = {to: d.id.toString('hex'), from: s.id.toString('hex'),
      path: [s.id.toString('hex')],
      nonce: '' + Math.floor(1e15 * Math.random()),
      data: {type: 'foundPeers', data: [util.buf_to_str(d.id)]}};
    send_msg(c.d, c.s, msg);
  }
  test_pending(c.orig);
});

const test_run = (role, test)=>etask(function*(){
  assert.ok(!t_running, 'test already running');
  t_running = true;
  let a = xtest.test_parse(test);
  for (let i=0, c; i<a.length, c=a[i]; i++)
  {
    console.log('cmd: %s', c.orig);
    switch (c.cmd)
    {
    case 'node': yield cmd_node(role, c); break;
    case 'connect': yield cmd_connect(c); break;
    case 'connected': yield cmd_event(c); break;
    case 'findPeers': yield cmd_find_peers(c); break;
    case 'foundPeers': yield cmd_found_peers(c); break;
    default: throw new Error('unknown cmd '+c.cmd);
    }
  }
  yield test_end();
  t_running = false;
});

const test_end = ()=>etask(function*(){
  assert.ok(t_running, 'test not running');
  yield test_ensure_no_events();
  for (let n in t_nodes)
  {
    yield t_nodes[n].destroy();
    delete t_nodes[n];
  }
  yield test_ensure_no_events();
});

// XXX: rm
class FakeWS extends EventEmitter {
  constructor(url, opts){
    super();
    throw new Error('FakeWS');
  }
  close(){
  }
  send(s){
  }
}

// XXX: rm
class FakeWebSocketServer extends EventEmitter {
  constructor(opts){
    super();
    throw new Error('FakeWebSocketServer');
  }
  init = ()=>{
  }
  close(cb){
    if (cb)
      cb();
  }
}

describe('peer-relay', function(){
  beforeEach(function(){
    xtest.set(ws_util, 'WS', FakeWS);
    xtest.set(ws_util, 'WebSocketServer', FakeWebSocketServer);
    // XXX TODO: same for WRTC
  });
  this.timeout(2*t_timeout);
  describe('basic', ()=>zetask(function(){
    const t = (name, test)=>{
      if (0)
      it(name+'_a', ()=>zetask(()=>test_run('a', test)));
      it(name+'_s', ()=>zetask(()=>test_run('s', test)));
    };
    t('2_peers', `
      node(name:s wss(host:lif.zone port:4000))
      node(name:a)
      a>connect(wss(wss://lif.zone:4000))
      as>connected
      sa>connected
      as>findPeers(a)
      as>foundPeers(s)
      sa>findPeers(s)
      `);
  }));
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
