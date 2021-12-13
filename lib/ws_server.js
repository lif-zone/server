'use strict'; /*jslint node:true*/
// XXX: rename file to signal_server.js
import conf from '../server.conf.js';
import fs from 'fs';
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
    ws.ws_id = ++wss.free_id; // XXX: change to uuid
    id_to_ws[ws.ws_id] = ws;
    ws.on('close', ()=>delete id_to_ws[this.ws_id]);
    // XXX HACK: rm xxx_ip/xxx_port and replace('::ffff:'...)
    ws.xxx_ip = (req.socket.remoteAddress||'').replace('::ffff:', '');
    ws.xxx_port = req.socket.remotePort;
    ws.json({event: 'connect', dst: ws.ws_id, data: {ws_id: ws.ws_id,
      ip: ws.xxx_ip, port: ws.xxx_port}});
    // XXX: need on 'json'
    // XXX: put limit on message size
    ws.on('message', (message, bin)=>{
      if (bin)
        return ws.json({error: 'bin not supported'});
      console.log('signal_server: message %s', message);
      const o = JSON.parse(message);
      if (!o)
      {
        return ws.json({error: 'invalid message',
          error_extra: {message, bin}});
      }
      let {dst, event, data} = o;
      let src = ws.ws_id;
      if (dst)
      {
        ws2 = id_to_ws[dst];
        if (!ws2)
        {
          return ws.json({event: 'error',
            data: {decc: 'dst not found', dst, data}});
        }
        ws2.json({event, src, dst, data});
        return;
      }
      if (event=='get_clients') // XXX temporary command for debug
      {
        const clients = [];
        wss.clients.forEach(ws2=>{
          if (ws2.readyState!=WebSocket.OPEN)
            return;
          if (ws2===ws)
            return;
          clients.push({ws_id: ws2.ws_id, ip: ws2.xxx_ip,
            port: ws2.xxx_port});
        });
        ws.json({event: 'reply_get_clients', dst, data: {clients}});
      }
      else
      {
        ws.json({event: 'error', dst,
          data: {desc: 'missing dst or invalid event', event, data}});
      }
    });
  });
  https_server.on('upgrade', (request, socket, head)=>wss.handleUpgrade(
    request, socket, head, ws=>wss.emit('connection', ws, request)));
  console.log('ws_server: listen on ports %s,%s', ws_port, wss_port);
  https_server.listen(wss_port);
};
