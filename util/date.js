'use strict'; /*jslint node:true*/
// XXX: rename file to signal_server.js
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
