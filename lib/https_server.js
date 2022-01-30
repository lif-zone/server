// author: derry. coder: arik.
'use strict'; /*jslint node:true*/
import fs from 'fs';
import express from 'express';
import http from 'http';
import https from 'https';
import escape from 'escape-html';
import conf from '../server.conf.js';
const E = {}, cwd = process.cwd();
export default E;
let debug_get_log_func;

E.start = opt=>{
  debug_get_log_func = opt.debug_get_log;
  let _opt = {
    key: fs.readFileSync(conf.http_server.ssl.key),
    cert: fs.readFileSync(conf.http_server.ssl.cert),
  };
  const {http_port, https_port} = conf.http_server;
  const app = E.app = express();
  app.get('/__lif_debug_get_log', debug_get_log);
  app.get('/index.js', (req, res)=>res.sendFile(cwd+'/pub/index.js'));
  app.get('/bundle.js', (req, res)=>res.sendFile(cwd+'/pub/bundle.js'));
  app.get('*', (req, res)=>res.sendFile(cwd+'/pub/index.html'));
  console.log('https_server: listen on ports %s,%s', http_port, https_port);
  http.createServer(app).listen(http_port);
  https.createServer(_opt, app).listen(https_port);
};

function debug_get_log(req, res){
  let port = req.query.port||3032;
  if (!debug_get_log_func)
    return res.send('DEBUG DISABLED');
  let pre = '';
  debug_get_log_func(port).forEach(s=>{
    pre += escape(s)+'\n';
  });
  res.send(`<html>
    <body>
      <pre>${pre}</pre>
    </body>
  </html>`);
}

E.close = ()=>{}; // XXX: TODO
