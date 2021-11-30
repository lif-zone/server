'use strict'; /*jslint node:true*/
import conf from '../server.conf.js';
import fs from 'fs';
import http from 'http';
import https from 'https';
import WebSocket, {WebSocketServer} from 'ws';

const E = {};
export default E;

E.start = function(){
  const opt = {
    key: fs.readFileSync(conf.http_server.ssl.key),
    cert: fs.readFileSync(conf.http_server.ssl.cert),
  };
  const {ws_port, wss_port} = conf.ws_server;
  const http_server = http.createServer();
  const https_server = https.createServer(opt);
  const wss = new WebSocketServer({noServer: true});
  wss.on('connection', (ws, req)=>{
    ws.on('message', (data, is_binary)=>{
      wss.clients.forEach(client=>{
        if (client.readyState===WebSocket.OPEN)
          client.send(data, {binary: is_binary});
      });
    });
  });
  http_server.on('upgrade', (request, socket, head)=>wss.handleUpgrade(request,
    socket, head, ws=>wss.emit('connection', ws, request)));
  https_server.on('upgrade', (request, socket, head)=>wss.handleUpgrade(
    request, socket, head, ws=>wss.emit('connection', ws, request)));
  console.log('ws_server: listen on ws %s wss %s', ws_port, wss_port);
  http_server.listen(ws_port);
  https_server.listen(wss_port);
};
