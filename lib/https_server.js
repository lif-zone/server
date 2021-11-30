'use strict'; /*jslint node:true*/
import fs from 'fs';
import express from 'express';
import http from 'http';
import https from 'https';
import conf from '../server.conf.js';

const E = {};
export default E;
const cwd = process.cwd();

E.start = ()=>{
  let opt = {
    key: fs.readFileSync(conf.http_server.ssl.key),
    cert: fs.readFileSync(conf.http_server.ssl.cert),
  };
  const {http_port, https_port} = conf.http_server;
  const app = E.app = express();
  app.get('/index.js', (req, res)=>res.sendFile(cwd+'/pub/index.js'));
  app.get('/bundle.js', (req, res)=>res.sendFile(cwd+'/pub/bundle.js'));
  app.get('*', (req, res)=>res.sendFile(cwd+'/pub/index.html'));
  console.log('https_server: listen on ports %s,%s', http_port, https_port);
  http.createServer(app).listen(http_port);
  https.createServer(opt, app).listen(https_port);
};

E.close = ()=>{}; // XXX: TODO
