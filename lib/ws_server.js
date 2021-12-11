'use strict'; /*jslint node:true*/
// XXX: rename file to signal_server.js
import conf from '../server.conf.js';
import fs from 'fs';
import http from 'http';
import https from 'https';
// XXX: import json6 from 'json-6';
import WebSocket, {WebSocketServer} from 'ws';

const E = {};
export default E;

E.start = function(){
  const opt = {
    key: fs.readFileSync(conf.http_server.ssl.key),
    cert: fs.readFileSync(conf.http_server.ssl.cert),
  };
  const {ws_port, wss_port} = conf.ws_server;
  // XXX: rm http
  const http_server = http.createServer();
  const https_server = https.createServer(opt);
  const wss = new WebSocketServer({noServer: true});
  wss.free_id = 0;
  const id_to_ws = wss.id_to_ws = {};
  // XXX: handle try/catch errors & parse errors
  wss.on('connection', (ws, req)=>{
    let ws2;
    // XXX HACK: wrap it inside WS classs
    ws.json = ws.json||function(o){
      return this.send(JSON.stringify(o)); };
    ws.ws_id = ++wss.free_id;
    id_to_ws[ws.ws_id] = ws;
    ws.on('close', ()=>delete id_to_ws[this.ws_id]);
    // XXX: need on 'json'
    // unite client/server ws code (very similar)
    ws.on('message', (message, bin)=>{
      if (bin)
        return ws.json({error: 'bin not supported'});
      console.log('XXX message %s', message);
      const o = JSON.parse(message);
      if (!o)
      {
        return ws.json({error: 'invalid message',
          error_extra: {message, bin}});
      }
      let {dst, event, data} = o;
      let src = ws.ws_id;
      dst = +dst;
      if (!dst)
      {
        if (event=='get_clients') // XXX temporary command for debug
        {
          const clients = [];
          wss.clients.forEach(ws2=>{
            if (ws2.readyState!=WebSocket.OPEN)
              return;
            if (ws2===ws)
              return;
            clients.push({ws_id: ws2.ws_id, ip: req.socket.remoteAddress,
              port: req.socket.remotePort});
          });
          ws.json({event: 'reply_get_clients', dst, data: {clients}});
        }
        else
        {
          ws.json({event: 'reply_'+event, dst,
            data: {error: 'invalid event'}});
        }
        return;
      }
      ws2 = id_to_ws[dst];
      if (!ws2)
        return ws.json({error: 'dst not found', error_extra: o});
      ws2.json({event, src, dst, data});
    });
  });
  http_server.on('upgrade', (request, socket, head)=>wss.handleUpgrade(request,
    socket, head, ws=>wss.emit('connection', ws, request)));
  https_server.on('upgrade', (request, socket, head)=>wss.handleUpgrade(
    request, socket, head, ws=>wss.emit('connection', ws, request)));
  console.log('ws_server: listen on ports %s,%s', ws_port, wss_port);
  http_server.listen(ws_port);
  https_server.listen(wss_port);
};
