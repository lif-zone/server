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
    ws.on('message', function message(data, is_binary){
      clients.forEach(client=>{
        console.log('Broadcasting on app: %s', client.app);
        client.send(data, {binary: is_binary});
      });
    });
  });
  server.on('upgrade', function upgrade(request, socket, head){
    wss.handleUpgrade(request, socket, head, function done(ws){
      wss.emit('connection', ws, request);
      clients.push(ws);
      ws.on('close', ()=>{
        // XXX: need hashing to quickly find ws
        const i = clients.findIndex(c =>c===ws);
        clients.splice(i, 1);
      });
    });
  });
  console.log('ws_server: listen on %s', port);
  server.listen(port);
};
