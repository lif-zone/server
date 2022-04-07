// author: derry. coder: arik.
'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach,afterEach*/
// XXX: need jslint mocha: true
import assert from 'assert';
import xerr from '../util/xerr.js';
import xutil from '../util/util.js';
import setGlobalVars from 'indexeddbshim';
const window = global.window = global;
setGlobalVars();

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
    assert(window.indexedDB);
    const customerData = [
      {ssn: "444-44-4444", name: "Bill", age: 35, email: "bill@company.com"},
      {ssn: "555-55-5555", name: "Donna", age: 32, email: "donna@home.org"}
    ];
    indexedDB.__setConfig('checkOrigin', false);
    var request = window.indexedDB.open('mocha_test', 2);
    request.onerror = e=>{
      console.log('error %o', e);
    };
    request.onsuccess = e=>{
      debugger;
      console.log('success');
      var db = e.target.result;
      let req = db.transaction("customers").objectStore("customers")
      .get("444-44-4444");
      req.onsuccess =
        e=>console.log("Name for SSN 444-44-4444 is "+e.target.result.name);
      req.onerror = e=>console.log("error get");
      console.log('success2');
    };
    request.onupgradeneeded = e=>{
      console.log('onupgradeneeded');
      var db = e.target.result;
      var objectStore = db.createObjectStore("customers", { keyPath: "ssn" });
      objectStore.createIndex("name", "name", { unique: false });
      objectStore.createIndex("email", "email", { unique: true });
      objectStore.transaction.oncomplete = e=>{
        var customerObjectStore = db.transaction("customers", "readwrite")
        .objectStore("customers");
        customerData.forEach(function(customer){
          customerObjectStore.add(customer);
        });
      };
    };
  });
});
