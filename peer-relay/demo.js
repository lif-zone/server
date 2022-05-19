// author: derry. coder: arik.
import Node from './node.js';
import {LocalStorage} from 'node-localstorage';
import buf_util from './buf_util.js';
import etask from '../util/etask.js';
import date from '../util/date.js';
import xerr from '../util/xerr.js';
import Req from './req.js';
import ReqHandler from './req_handler.js';
import {dbg_id} from './util.js';
import xlog from '../util/xlog.js';
const log = xlog('demo');
const s2b = buf_util.buf_from_str, b2s = buf_util.buf_to_str;
const localStorage = new LocalStorage('/var/lif/demo_local_storage');
// XXX: make it automatic for all node/browser in proc.js
xerr.set_exception_catch_all(true);
process.on('uncaughtException', err=>xerr.xexit(err));
process.on('unhandledRejection', err=>xerr.xexit(err));
xerr.set_exception_handler('test', (prefix, o, err)=>xerr.xexit(err));
xerr.set_level('NOTICE');

let start = ()=>etask(function _start(){
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
  new ReqHandler({node, cmd: 'test_req'}).on('req', (msg, res)=>{
    log.notice('<req %s', msg.cmd);
    res.send({});
  });
  new ReqHandler({node, stream: true, cmd: 'test_stream'})
  .on('req_start', (msg, res, opt)=>{
    log.notice('<req_start %s', msg.cmd);
    res.send({});
    res.on('req_next', (msg, req, opt)=>{
      log.notice('<req_next %s', msg.cmd);
      res.send_end({});
    });
    res.on('req_end', (msg, req, opt)=>{
      log.notice('<req_end %s', msg.cmd);
    });
  });
  node.on('peer', id=>{
    log.notice('new peer %s req>', dbg_id(id));
    new Req({node, dst: id, cmd: 'test_req'})
    .on('res', msg=>log.notice('<test_req_r'))
    .on('fail', o=>log('test_req_err'))
    .send({});
    new Req({node, dst: id, stream: true, cmd: 'test_stream'})
    .on('res_start', function(type, msg){
      log.notice('<res_start');
      this.send({});
    }).on('res_next', function(type, msg){
      log.notice('<res_next');
      this.send_end({});
    }).on('res_end', function(type, msg){
      log.notice('<res_end');
    }).on('fail', o=>log('test_stream_err')).send({});
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
