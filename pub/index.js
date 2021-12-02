// XXX: replace require with import
const SimplePeerWrapper = require('simple-peer-wrapper');

function connect(){
  const options = {
    debug: true,
    serverUrl: 'wss://poc.lif.zone:3031',
    simplePeerOptions: {},
  };
  const spw = new SimplePeerWrapper(options);
  let socket = spw.socketClient.socket;
  // socket
  socket.on('connect', function(){
    console.log('socket: connect %s', this.io.uri); });
  socket.on('connect_error', o=>console.log('socket: connect_error %o', o));
  socket.on('connect_timeout', ()=>console.log('socket: connect_timeout'));
  socket.on('reconnect', ()=>console.log('socket: reconnect'));
  socket.on('reconnecting', ()=>console.log('socket: reconnecting'));
  socket.on('reconnect_failed', ()=>console.log('socket: reconnect_failed'));
  // signaling
  socket.on('created', room=>console.log('signal: created room %s', room));
  socket.on('full', room=>console.log('signal: full room %s', room));
  socket.on('join', room=>console.log('signal: join room %s', room));
  socket.on('joined', room=>console.log('signal: joined room %s', room));
  socket.on('initiate peer', function(room){
    console.log('signal: XXX initiate peer id %s room %s', this.id, room);
  });
  socket.on('sending signal',
    message=>console.log('signal: sending signal room %o', message));
  socket.on('log', array=>console.log('signal: log %o', array));
  socket.on('message', array=>console.log('signal: message %o', array));
  spw.connect();
  spw.on('error', data=>console.log('spw: error %o', data));
  spw.on('close', data=>console.log('spw: close %o', data));
  spw.on('data', data=>console.log('spw: data %o', data));
  // XXX: need proper handling of unload
  window.onbeforeunload = ()=>spw.close();
  window.webrtc_test_send = ()=>{
    let msg = document.querySelector('#msg').value;
    console.log('XXX send webrtc_test_send %s', msg);
    spw.send({ts: Date.now(), msg});
  };
  window.ws_test_send = ()=>{
    let msg = document.querySelector('#msg').value;
    console.log('XXX send ws_test_send %s', msg);
    socket.send({ts: Date.now(), msg});
  };
}

function init(){
  if (location.pathname=='/' &&
    location.hostname=='poc.lif.zone')
  {
    document.body.innerHTML = `
      <div>
        <div><b>LIF</b></div>
        <div>
          <input id=msg value=Message>
          <input type=button value=Broadcast onClick="ws_test_send()">
          <input type=button value=Broadcast-ws onClick="ws_test_send()">
          <input type=button value=Broadcast-webrtc
            onClick="webrtc_test_send()">
        </div>
        <pre id=ws_incoming>
        <pre>
      </div>
    `;
    connect();
  }
  else if (window.self!==window.top)
    document.body.innerHTML = 'iframe for '+location.href;
  else
  {
    document.body.innerHTML = '<iframe src="'+
      encodeURI(location.pathname)+'"></iframe>';
  }
}

init();
