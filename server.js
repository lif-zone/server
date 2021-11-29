'use strict'; /*jslint node:true*/
import dns_server from './lib/dns_server.js';
import https_server from './lib/https_server.js';
import ws_server from './lib/ws_server.js';

function init(){
  console.log('lif server start');
  // XXX: split into seperate process
  dns_server.start(); // XXX: need dns_server.stop()
  https_server.start(); // XXX: need https_server.stop()
  ws_server.start(); // XXX: need ws_server.stop()
}

init();
