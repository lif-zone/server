'use strict'; /*jslint node:true*/
import conf from '../server.conf.js';
import WebSocket, {WebSocketServer} from 'ws';
import {createServer} from 'http';

const E = {};
export default E;

E.start = function(){
  let port = conf.ws_server.port;
  const server = createServer();
  const wss = new WebSocketServer({noServer: true});
  wss.on('connection', function connection(ws, req){
    ws.on('message', function message(data, is_binary){
      wss.clients.forEach(client=>{
        if (client.readyState===WebSocket.OPEN)
          client.send(data, {binary: is_binary});
      });
    });
  });
  server.on('upgrade', function upgrade(request, socket, head){
    wss.handleUpgrade(request, socket, head,
      ws=>wss.emit('connection', ws, request));
  });
  console.log('ws_server: listen on %s', port);
  server.listen(port);
};
