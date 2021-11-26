'use strict'; /*jslint node:true*/
import dnss from './lib/dnss.js';
import https from './lib/https.js';

function start(){
  console.log('lif server start');
  dnss.start(); // XXX: need dnss.close()
  https.start(); // XXX: need dnss.close()
}

start();
