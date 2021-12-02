'use strict'; /*jslint node:true*/
import conf from '../server.conf.js';
import fs from 'fs';
import http from 'http';
import https from 'https';
import * as socket_io from 'socket.io';

const E = {};
export default E;

class SimplePeerServer {
  constructor(httpServer, debug){
    this.rooms = [];
    this.roomCounter = 0;
    this.debug = !!debug;
    this.init(httpServer);
  }
  init(httpServer){
    const ioServer = new socket_io.Server(httpServer, {cors: {origin: '*'}});
    ioServer.sockets.on('connection', socket=>{
      socket.on('message', message=>this._handleMessage(message, socket));
      socket.on('initiate peer', room=>this._handleInitiatePeer(room, socket));
      socket.on('sending signal', message=>
        this._handleSendSignal(message, socket));
      socket.on('create or join', ()=>
        this._handleCreateOrJoin(socket, ioServer));
      socket.on('hangup', ()=>this._handleHangup(socket));
      socket.on('disconnect', reason=>this._handleDisconnect(reason));
    });
  }
  _handleMessage(message, socket){
    this.debug && console.log('Client said: ', message);
    // XXX: change to room-only (not broadcast)
    socket.broadcast.emit('message', message);
  }
  _handleInitiatePeer(room, socket){
    this.debug && console.log('Server initiating peer in room '+room);
    socket.to(room).emit('initiate peer', room);
  }
  _handleSendSignal(message, socket){
    this.debug && console.log('Handling send signal to room '+message.room);
    socket.to(message.room).emit('sending signal', message);
  }
  _handleCreateOrJoin(socket, ioServer){
    const clientIds = Array.from(ioServer.sockets.sockets.keys());
    const numClients = clientIds.length;
    this.debug && console.log('NUMCLIENTS, '+numClients);
    if (numClients==1)
    {
      const room = this._createRoom();
      socket.join(room);
      socket.emit('created', room, socket.id);
      this.debug && console.log('Client ID '+socket.id+' created room '+
        room);
    }
    else if (numClients==2)
    {
      const room = this.rooms[0];
      ioServer.sockets.in(room).emit('join', room);
      socket.join(room);
      socket.emit('joined', room, socket.id);
      ioServer.sockets.in(room).emit('ready'); // not being used anywhere
      this.debug && console.log('Client ID '+socket.id+' joined room '+
        room);
    }
    else if (numClients > 2)
    {
      for (let i = 0; i < numClients; i++)
      {
        if (socket.id !== clientIds[i])
        {
          // create a room and join it
          const room = this._createRoom();
          socket.join(room);
          this.debug && console.log('Client ID '+socket.id+' created room '+
            room);
          socket.emit('created', room, socket.id);
          socket.emit('join', room);
          this.debug && console.log('Client ID '+clientIds[i]+' joined room '+
            room);
          ioServer.sockets.sockets.get(clientIds[i]).join(room);
          ioServer.sockets.sockets.get(clientIds[i])
          .emit('joined', room, clientIds[i]);
        }
      }
    }
  }
  _createRoom(){
    const room = 'room'+this.roomCounter;
    this.rooms.push(room);
    this.debug && console.log('number of rooms '+this.rooms.length);
    this.roomCounter++;
    return room;
  }
  _handleHangup(){ this.debug && console.log('received hangup'); }
  _handleDisconnect(reason){
    this.debug && console.log('disconnecting bc '+reason); }
}

E.start = function(){
  const opt = {
    key: fs.readFileSync(conf.http_server.ssl.key),
    cert: fs.readFileSync(conf.http_server.ssl.cert),
  };
  const {ws_port, wss_port} = conf.ws_server;
  const http_server = http.createServer();
  const https_server = https.createServer(opt);
  // XXX: 1. need https 2. need cleanup
  new SimplePeerServer(http_server, true);
  console.log('signal_server: listen on ports %s,%s', ws_port, wss_port);
  http_server.listen(ws_port);
  https_server.listen(wss_port);
};
