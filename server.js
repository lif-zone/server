'use strict'; /*jslint node:true*/
import conf from './server.conf.js';
import dnss from './lib/dnss.js';
import https from './lib/https.js'; // XXX: rename httpd.js

function start(){
  console.log('lif server start');
  // XXX: split into seperate process
  dnss.start(conf.dnss); // XXX: need dnss.close()
  https.start(); // XXX: need https.close()
}

start();
