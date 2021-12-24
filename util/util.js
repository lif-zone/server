'use strict'; /*jslint node:true*/
import {Buffer} from 'buffer';
const E = {};
export default E;

// XXX: add test, optimize for node
E.monotonic = function(){
    let now = Date.now(), last = E.monotonic.last||0;
    if (now < last)
        now = last;
    last = now;
    return now;
};

// XXX: use etask
E.sleep = function(ms){
  let wait = E.wait();
  setTimeout(()=>wait.continue());
  return wait;
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

E.path = function(path){
    if (Array.isArray(path))
        return path;
    path = ''+path;
    if (!path)
        return [];
    return path.split('.');
};
E.get = function(o, path, def){
    path = E.path(path);
    for (var i=0; i<path.length; i++)
    {
        if (!o || typeof o!='object'&&typeof o!='function' || !(path[i] in o))
            return def;
        o = o[path[i]];
    }
    return o;
};
E.set = function(o, path, value){
    var orig = o;
    path = E.path(path);
    for (var i=0; i<path.length-1; i++)
    {
        var p = path[i];
        o = o[p] || (o[p] = {});
    }
    o[path[path.length-1]] = value;
    return orig;
};
E.unset = function(o, path){
    path = E.path(path);
    for (var i=0; i<path.length-1; i++)
    {
        var p = path[i];
        if (!o[p])
            return;
        o = o[p];
    }
    delete o[path[path.length-1]];
};
E.buf_to_str = function(b){ return b ? b.toString('hex') : ''; };
E.buf_from_str = function(s){ return Buffer.from(s, 'hex'); };

