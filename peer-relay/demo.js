// author: derry. coder: arik.
import Node from './client.js';
import {LocalStorage} from 'node-localstorage';
import util from '../util/util.js';
const s2b = util.buf_from_str, b2s = util.buf_to_str;
const localStorage = new LocalStorage('/var/lif/demo_local_storage');

start();
async function start(){
  localStorage.setItem('xxx', ''+Date.now());
  let priv = localStorage.getItem('wallet_key_priv');
  let pub = localStorage.getItem('wallet_key_pub');
  if (!priv || !pub){
    priv = pub = undefined;
    console.log('XXX no keys found - generating new keys');
  }
  let node = new Node({keys: {priv: s2b(priv), pub: s2b(pub)}});
  priv = b2s(node.wallet.keys.priv);
  pub = b2s(node.wallet.keys.pub);
  localStorage.setItem('wallet_key_priv', priv);
  localStorage.setItem('wallet_key_pub', pub);
  console.log('XXX node priv %s', b2s(node.wallet.keys.priv));
  console.log('XXX node pub %s', b2s(node.wallet.keys.pub));
}

