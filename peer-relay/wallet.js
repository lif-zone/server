'use strict'; /*jslint node:true, browser:true*/
import crypto from 'hypercore-crypto';
import assert from 'assert';

export default class Wallet {
  constructor(opt){
    opt = opt||{};
    let {priv, pub} = opt.keys||{};
    if (priv || pub)
    {
      assert(priv && pub, 'must specify both priv/pub keys');
      // XXX assert valid priv/pub keys and that they match
      this.keys = {priv, pub};
    }
    else
    {
      let {publicKey, secretKey} = crypto.keyPair();
      this.keys = {priv: secretKey, pub: publicKey};
    }
  }
  hash_obj(o){
    return crypto.data(Uint8Array.from(typeof o=='string' ? o :
      JSON.stringify(o)));
  }
}

