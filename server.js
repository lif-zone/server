'use strict'; /*jslint node:true*/
import dns_server from './lib/dns_server.js';
import https_server from './lib/https_server.js';
import ws_server from './lib/ws_server.js';
import signal_server from './lib/signal_server.js';

function init(){
  console.log('lif server start');
  // XXX: split into seperate process
  dns_server.start(); // XXX: need dns_server.stop()
  https_server.start(); // XXX: need https_server.stop()
  if (0) ws_server.start(); // XXX: need ws_server.stop()
  signal_server.start(); // XXX: need signal_server.stop()
}

init();
