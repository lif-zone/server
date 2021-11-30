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
  let app = E.app = express();
  app.get('/index.js', (req, res)=>res.sendFile(cwd+'/pub/index.js'));
  app.get('/bundle.js', (req, res)=>res.sendFile(cwd+'/pub/bundle.js'));
  app.get('*', (req, res)=>res.sendFile(cwd+'/pub/index.html'));
  console.log('http_server: listen on ports 80/443');
  http.createServer(app).listen(80);
  https.createServer(opt, app).listen(443);
};

E.close = ()=>{}; // XXX: TODO
