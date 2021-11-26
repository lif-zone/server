'use strict'; /*jslint node:true*/
import dnss from './lib/dnss.js';

function start(){
  console.log('lif server start');
  dnss.start(); // XXX: need dnss.close()
}

start();
