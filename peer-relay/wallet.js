// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import hcrypto from 'hypercore-crypto';
import assert from 'assert';
import hash from 'object-hash';

let excludeKeys = key=>['path', 'sign'].indexOf(key)!=-1;

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
      let {publicKey, secretKey} = hcrypto.keyPair();
      this.keys = {priv: secretKey, pub: publicKey};
    }
  }
  hash_passthrough(o){
    return hash(o, {respectType: false, excludeKeys,
      algorithm: 'passthrough'});
  }
  hash_obj(o){
    // XXX: need to exclude path/sign only from root, not from sub keys
    return Uint8Array.from(hash(o, {respectType: false, excludeKeys}));
  }
  sign(o){
    // XXX: we use sha1 algorithm. need to find a more secured one (blake?)
    return hcrypto.sign(this.hash_obj(o), this.keys.priv);
  }
  verify(o, sign, pub){
    pub = pub || this.keys.pub;
    sign = sign || o.sign;
    return hcrypto.verify(this.hash_obj(o), sign, pub);
  }
}

