'use strict'; /*jslint node:true*/
// XXX: rename file to signal_server.js
const E = module.exports = {};

// XXX: add test, optimize for node
E.monotonic = function(){
    let now = Date.now(), last = E.monotonic.last||0;
    if (now < last)
        now = last;
    last = now;
    return now;
};

// XXX: use etask
E.wait = function(){
  let resolve, reject;
  let p = new Promise((_resolve, _reject)=>{
    resolve = _resolve;
    reject = _reject;
  });
  p.continue = o=>resolve(o);
  p.throw = error=>reject(error);
  return p;
};
