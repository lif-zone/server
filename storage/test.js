// author: derry. coder: arik.
'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach,afterEach*/
// XXX: need jslint mocha: true
import xerr from '../util/xerr.js';
import xutil from '../util/util.js';

// XXX: make it automatic for all node/browser in proc.js
xerr.set_exception_catch_all(true);
process.on('uncaughtException', err=>xerr.xexit(err));
process.on('unhandledRejection', err=>xerr.xexit(err));
xerr.set_exception_handler('test', (prefix, o, err)=>xerr.xexit(err));
if (!xutil.is_inspect())
  beforeEach(function(){ xerr.set_buffered(true, 1000); });
afterEach(function(){
  xerr.clear();
  xerr.set_buffered(false);
});

describe('indexdb', function(){
  it('api', ()=>{
  });
});
