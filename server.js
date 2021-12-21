'use strict'; /*jslint node:true*/
import nconf from 'nconf';
import util from './util/util.js';
import dns_server from './lib/dns_server.js';
import https_server from './lib/https_server.js';
import turn_server from './lib/turn_server.js';
import peer_relay from './peer-relay/client.js';
import crypto from 'crypto';

function init(){
  nconf.argv().env().file({file: '/var/lif/node_config.json'});
  let id = nconf.get('node_id'), id2 = nconf.get('node_id2');
  if (!id || !id2)
  {
    id = id || util.buf_to_str(crypto.randomBytes(20));
    id2 = id2 || util.buf_to_str(crypto.randomBytes(20));
    nconf.set('node_id', id);
    nconf.set('node_id2', id2);
    nconf.save();
  }
  console.log('lif server start');
  // XXX: split into seperate process
  dns_server.start(); // XXX: need dns_server.stop()
  https_server.start(); // XXX: need https_server.stop()
  turn_server.start(); // XXX: need turn_server.stop()
  new peer_relay({id, bootstrap: [], port: 3032});
  new peer_relay({id: id2, bootstrap: ['ws://poc.lif.zone:3032'], port: 3033});
}

init();
