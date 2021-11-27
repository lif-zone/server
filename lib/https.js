'use strict'; /*jslint node:true*/
import express from 'express';

const E = {};
export default E;
const cwd = process.cwd();

E.start = ()=>{
  let app = E.app = express();
  app.get('*', (req, res)=>res.sendFile(cwd+'/pub/index.html'));
  console.log('https: listen on port 80');
  app.listen(80); // XXX support https
};

E.close = ()=>{}; // XXX: TODO
