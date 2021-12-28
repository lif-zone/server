'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach*/
// XXX: need jslint mocha: true
import assert from 'assert';
import _wrtc from 'electron-webrtc'; // XXX: rm
import crypto from 'crypto';
import {EventEmitter} from 'events';
import Node from './client.js';
import util from '../util/util.js';
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

const test_ensure_no_events = ()=>etask(function*(){
  for (let t = date.monotonic(); date.monotonic()-t < t_timeout;)
  {
    yield util.sleep(); // XXX HACK: fixme
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
});

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

function assert_ws(node){
  assert.ok(t_nodes[node], 'node not found '+node);
  // XXX HACK: need to pass url in bootstrap
  return t_nodes[node].wsConnector.url;
}

function assert_name_new(val){
  assert_not_exist(val);
  assert(/^[a-zA-Z]$/.test(val), 'invalid name '+val);
  return val;
}

function assert_wss(arg){
  let ret = {};
  assert(arg.length>0, 'invalid wss '+stringify(arg));
  arg.forEach(a=>{
    let val = xtest.arg_to_val(a.arg);
    switch (a.cmd)
    {
    case 'port':
      assert(ret.port===undefined, 'multiple '+a.cmd);
      ret.port = assert_port(val);
      break;
    case 'host':
      assert(ret.host===undefined, 'multiple '+a.cmd);
      ret.host = assert_host(val);
    default: 'invalid wss '+a.cmd;
    }
  });
  return ret;
}

function cmd_node(role, c){
  let name, wss, ws;
  c.arg.forEach(a=>{ // XXX derry: review args parsing
    let val = xtest.arg_to_val(a.arg);
    switch (a.cmd)
    {
    case 'name':
      assert(name===undefined, 'multiple '+a.cmd);
      name = assert_name_new(val);
      break;
    case 'wss':
      assert(wss===undefined, 'multiple '+a.cmd);
      wss = assert_wss(val);
      break;
    case 'ws':
      assert(ws===undefined, 'multiple '+a.cmd);
      assert(val===true, 'ws must be boolean');
      ws = val;
      break;
    default: throw new Error('unknown arg '+a.cmd);
    }
  });
  let node = new (is_fake(role, name) ? FakeNode : Node)(assign({}, wss));
  node.t = {name};
  t_nodes[name] = node;
  /*
  let node = new (is_fake(role, s) ? FakeNode : Node)(o);
  t_nodes[s] = node;
  node.t = node.t||{};
  node.t.name = s;
  if (o.port)
  {
    // XXX: mv to listen on wsConnector._wss
    node.wsConnector.on('listen', e=>test_emit(s+'<listen(ws:'+e.port+')'));
    node.wsConnector._wss.on('connection', ws=>{
      // XXX HACK: rm ws.client
      let client = ws.t.client || node_from_ws(ws);
      test_emit(client.t.name+s+'>connect(ws:'+o.port+')');
    });
    node.wsConnector._wss.on('message', data=>{
      test_emit('?'+s+'>message:'+data);
    });
  }
  */
}

function cmd_listen(c){
  test_expect(c.orig);
  return test_ensure_no_events();
}

function cmd_connect(c){
  test_expect(c.orig);
  return test_ensure_no_events();
}

function cmd_find_peers(s, d, o){
/* XXX: WIP
  if (is_fake(role, c.s))
    node_find_peers(c.s, c.d, arg_to_obj(c.arg));
  test_expect(c.orig);
  yield test_ensure_no_events();
*/
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

const test_run = (role, test)=>etask(function*(){
  assert.ok(!t_running, 'test already running');
  t_running = true;
  let a = xtest.test_parse(test);
  for (let i=0, c; i<a.length, c=a[i]; i++)
  {
    switch (c.cmd)
    {
    case 'node': yield cmd_node(role, c); break;
    /*
    case 'listen': yield cmd_listen(c); break;
    case 'connect': yield cmd_connect(c); break;
    case 'findPeers': yield cmd_find_peers(c); break;
    default: throw new Error('unknown cmd '+c.cmd);
    */
    }
    yield util.sleep(); // XXX HACK: fixme
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

class FakeWS extends EventEmitter {
  constructor(url, opts){
    super();
  }
  close(){
  }
  send(s){
  }
}

class FakeWebSocketServer extends EventEmitter {
  constructor(opts){
    super();
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
  it('basic', ()=>zetask(function*(){
    // XXX: need wss://lif.zone:4000 supoort
    const t = (role, test)=>etask(function(){ return test_run(role, test); });
    yield t('s', `
      node(name:s wss(host:lif.zone port:4000))
      node(name:a ws);
      a>connect(wss(host:lif.zone port:4000))
      as>connected
      as<connected
      as>find_peers
      as<found_peers
      sa>find_peers
      sa<found_peers`);
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
