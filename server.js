'use strict'; /*jslint node:true*/
import dnss from './lib/dnss.js';
import https from './lib/https.js';

let DEV = true;
const conf = DEV ? {
  dnss: {port: 53, ip: '127.0.0.1', dns: '8.8.8.8', domain: 'poc.lif.zone'}
} : {
  dnss: {port: 53, ip: '3.12.37.122', dns: '8.8.8.8', domain: 'poc.lif.zone'}
};

function start(){
  console.log('lif server start');
  // XXX: split into seperate process
  dnss.start(conf.dnss); // XXX: need dnss.close()
  https.start(); // XXX: need https.close()
}

start();
