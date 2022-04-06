// author: derry. coder: arik.
import Node from './client.js';
import {LocalStorage} from 'node-localstorage';
import util from '../util/util.js';
import etask from '../util/etask.js';
import date from '../util/date.js';
import xerr from '../util/xerr.js';
import Req from './req.js';
import ReqHandler from './req_handler.js';
import {dbg_id} from './util.js';
import xlog from '../util/xlog.js';
const log = xlog('demo');
const s2b = util.buf_from_str, b2s = util.buf_to_str;
const localStorage = new LocalStorage('/var/lif/demo_local_storage');
// XXX: make it automatic for all node/browser in proc.js
xerr.set_exception_catch_all(true);
process.on('uncaughtException', err=>xerr.xexit(err));
process.on('unhandledRejection', err=>xerr.xexit(err));
xerr.set_exception_handler('test', (prefix, o, err)=>xerr.xexit(err));
xerr.set_level('NOTICE');

let start = ()=>etask(function*_start(){
  let [mode, port, bootstrap] = process.argv.slice(2);
  if (!mode || !port)
    exit('usage: node demo.js [client|server] [PORT] [BOOTSTRAP]');
  if (bootstrap)
    bootstrap = [bootstrap];
  let priv = localStorage.getItem(mode+'_wallet_key_priv');
  let pub = localStorage.getItem(mode+'_wallet_key_pub');
  if (!priv || !pub){
    priv = pub = undefined;
    log.notice('no keys found - generating new keys');
  }
  let node = new Node({port, bootstrap, http: true,
    keys: priv && pub ? {priv: s2b(priv), pub: s2b(pub)}: undefined});
  priv = b2s(node.wallet.keys.priv);
  pub = b2s(node.wallet.keys.pub);
  localStorage.setItem(mode+'_wallet_key_priv', priv);
  localStorage.setItem(mode+'_wallet_key_pub', pub);
  let test_req = new ReqHandler({node, cmd: 'test_req'})
  .on('req', (msg, res)=>{
    log.notice('<req %s', msg.cmd);
    res.send({});
  });
  node.on('peer', id=>{
    log.notice('new peer %s req>', dbg_id(id));
    let req = new Req({node, dst: id, cmd: 'test_req'});
    req.on('res', msg=>log.notice('<test_req_r'));
    req.send({});
  });
  setInterval(()=>{}, date.ms.HOUR); // XXX HACK: to keep node runnning
  log.notice('node priv %s', b2s(node.wallet.keys.priv));
  log.notice('node pub %s', b2s(node.wallet.keys.pub));
  log.notice('mode '+mode+' running');
});

await start();

function exit(msg){
  console.error(msg);
  process.exit(1);
}
