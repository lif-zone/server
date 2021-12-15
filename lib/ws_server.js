'use strict'; /*jslint node:true*/
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
  wss.on('connection', (ws_src, req)=>{
    let ws_dst;
    ws_src.json = ws_src.json||function(o){
      return this.send(JSON.stringify(o)); };
    ws_src.ws_id = ++wss.free_id; // XXX: change to uuid
    id_to_ws[ws_src.ws_id] = ws_src;
    ws_src.on('close', ()=>delete id_to_ws[this.ws_id]);
    // XXX: need on 'json'
    // XXX: put limit on message size
    ws_src.on('message', (message, bin)=>{
      if (bin)
        return ws_src.json({error: 'bin not supported'});
      console.log('ws_server: message %s', message);
      const o = JSON.parse(message);
      if (!o)
      {
        return ws_src.json({error: 'invalid message',
          error_extra: {message, bin}});
      }
      let {dst, event, data} = o;
      let src = ws_src.ws_id;
      if (dst)
      {
        ws_dst = id_to_ws[dst];
        if (!ws_dst)
        {
          return ws_src.json({event: 'error',
            data: {decc: 'dst not found', dst, data}});
        }
        ws_dst.json({event, src, dst, data});
        return;
      }
      if (event=='get_clients') // XXX temporary command for debug
      {
        const clients = [];
        wss.clients.forEach(ws=>{
          if (ws.readyState!=WebSocket.OPEN)
            return;
          if (ws===ws_src)
            return;
          clients.push({ws_id: ws.ws_id, ip: ws._socket.remoteAddress,
            port: ws._socket.remotePort});
        });
        ws_src.json({event: 'reply_get_clients', dst, data: {clients}});
      }
      else
      {
        ws_src.json({event: 'error', dst,
          data: {desc: 'missing dst or invalid event', event, data}});
      }
    });
  });
  https_server.on('upgrade', (request, socket, head)=>wss.handleUpgrade(
    request, socket, head, ws=>wss.emit('connection', ws, request)));
  console.log('ws_server: listen on ports %s,%s', ws_port, wss_port);
  https_server.listen(wss_port, '0.0.0.0');
};
