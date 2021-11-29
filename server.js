'use strict'; /*jslint node:true*/
import dns_server from './lib/dns_server.js';
import https from './lib/https.js'; // XXX: rename httpd.js

function start(){
  console.log('lif server start');
  // XXX: split into seperate process
  dns_server.start(); // XXX: need dns_server.close()
  https.start(); // XXX: need https.close()
}

start();
