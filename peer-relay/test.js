// XXX: obsolete - rm
'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach*/
// XXX: need jslint mocha: true
import assert from 'assert';
import Node from './client.js';
import xtest from '../util/test_lib.js';
import etask from '../util/etask.js';
const xetask = xtest.etask;

// XXX: make it automatic for all node/browser
process.on('uncaughtException', e=>{
  console.log('uncaughtException %o', e);
  process.exit(-1);
});
process.on('unhandledRejection', e=>{
  console.error('unhandledRejection %o', e);
  process.exit(-1);
});

let t_nodes = {}, t_cmds, t_i;

const test_run = (role, test)=>etask(function*(){
  assert(!t_cmds && !t_i, 'test already running');
  t_cmds = xtest.test_parse(test);
  for (t_i=0; t_i<t_cmds.length; t_i++)
    yield cmd_run(role, t_cmds[t_i]);
  yield test_end();
  t_cmds = t_i = undefined;
});

const test_end = ()=>etask(function*(){
  assert(t_cmds, 'test not running');
  assert.eq(t_i, t_cmds.length, 'not all cmds run');
  for (let n in t_nodes)
  {
    yield t_nodes[n].destroy();
    delete t_nodes[n];
  }
});

describe('peer-relay', function(){
  beforeEach(function(){
  });
  describe('basic', function(){
    const xit = (name, role, test)=> it(name+'_'+role,
      ()=>xetask(()=>test_run(role, test)));
    let t = (name, test)=>{
      xit(name, 'a', test);
      xit(name, 'b', test);
    };
    t('2_nodes', `node(a) node(b wss(port:4000))`);
  });
});

