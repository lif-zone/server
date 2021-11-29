'use strict'; /*jslint node:true*/
import conf from '../server.conf.js';
import {WebSocketServer} from 'ws';
import {createServer} from 'http';

const E = {};
export default E;

E.start = function(){
  let port = conf.ws_server.port;
  const server = createServer();
  const wss = new WebSocketServer({noServer: true});
  var clients = [];
  wss.on('connection', function connection(ws, req){
    console.log('XXX on:connection');
    ws.on('message', function message(data, is_binary){
      console.log('XXX on:message %s is_binary %s', data, is_binary);
      var jsond;
      try { jsond = JSON.parse(data); }
      catch(e){ return console.error('ws_server: %o', e.message); }
      console.log('XXX on:message json %o', jsond);
      clients.forEach(client=>{
        console.log('Broadcasting on app: %s', client.app);
        client.send(data, {binary: is_binary});
      });
    });
  });
  server.on('upgrade', function upgrade(request, socket, head){
    console.log('XXX on:upgrade');
    wss.handleUpgrade(request, socket, head, function done(ws){
      console.log('XXX handleUpgrade');
      wss.emit('connection', ws, request);
      clients.push(ws);
      ws.on('close', ()=>{
        console.log('XXX close');
        // XXX: need hashing to quickly find ws
        const i = clients.findIndex(c =>c===ws);
        clients.splice(i, 1);
      });
    });
  });
  console.log('ws_server: listen on %s', port);
  server.listen(port);
};
