'use strict'; /*jslint node:true*/ /*global describe,it*/
import assert from 'assert';
import Client from './client.js';
import _wrtc from 'electron-webrtc';
import string from '../util/string.js';
import Node from '../peer-relay/client.js';

function normalize(o){
  if (!o.p2 || o.dir!='>')
    return o;
  let p = o.p1;
  o.dir = '<';
  o.p1 = o.p2;
  o.p2 = p;
  return o;
}

// XXX: mv all test api to test_api.js and add test for it
function parse_expr(expr){
  // XXX: change to match
  let a = expr.split(/(^[a-zA-Z]{0,2})([<>]+)(.+.*$)/);
  if (a.length!=5)
    throw new Error('invalid expr');
  return normalize({p1: a[1][0]||'', p2: a[1][1]||'', dir: a[2], op: a[3]});
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
    let t = (s, p1, p2, dir, op)=>assert.deepEqual(parse_expr(s),
      {p1, p2, dir, op});
    t('<listen', '', '', '<', 'listen');
    t('a<listen', 'a', '', '<', 'listen');
    t('A<listen', 'A', '', '<', 'listen');
    t('a<listen(ws:3030)', 'a', '', '<', 'listen(ws:3030)');
    t('ab<connect', 'a', 'b', '<', 'connect');
    t('ab>connect(ws:3030)', 'b', 'a', '<', 'connect(ws:3030)');
    t = (s, exp)=>assert.throws(()=>{ parse_expr(s); }, {message: exp});
    t('', 'invalid expr');
    t('ab', 'invalid expr');
    t('ab<', 'invalid expr');
    t('abc<listen', 'invalid expr');
  });
});

function run_test(role, test){
  const nodes = {};
  let a = string.split_ws(test);
  for (let i=0; i<a.length; i++)
  {
    let expr = a[i];
    let {p1, p2, dir, op, params} = parse_expr(expr);
    console.log('%s: p1 %s p2 %s dir %s op %s params %s',
      expr, p1, p2, dir, op, params);
    switch (op)
    {
    case 'new_node':
      if (role==p1);
      else
      {
        assert.ok(!nodes[p1]);
        // XXX: create hard-coded node_ids for the test
        nodes[p1] = new Node();
      }
      console.log('XXX TODO: %s', op); // XXX: WIP
      break;
    case 'listen':
      console.log('XXX TODO: %s', op); // XXX: WIP
      break;
    case 'connect':
      console.log('XXX TODO: %s', op); // XXX: WIP
      break;
    default: throw new Error('invalid op '+op);
    }
  }
  // XXX: cleanup
}

describe('basic', function(){
  it('test', ()=>{
    const t = test=>run_test('s', test);
    t(`s<new_node a<new_node`);
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
