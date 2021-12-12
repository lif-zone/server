// XXX: replace require with import
const SignalClient = require('../lib/ws_client.js');
const date = require('../util/date.js');
const util = require('../util/util.js');
const Peer = require('simple-peer');
const SdpTransform = require('sdp-transform');

var log_a = [];

function log(s, o){
  log_a.push(date.to_sql_ms()+' '+s);
  console.log(date.to_sql_ms()+' '+s, o);
  document.querySelector('#log').innerText = log_a.join('\n');
}

function connect(){
  let config = {iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:global.stun.twilio.com:3478?transport=udp'}]};
  const sc = new SignalClient({url: 'wss://poc.lif.zone:3031'});
  window.sc_get_clients = function(){ sc.json({event: 'get_clients'}); };
  sc.on('event-reply_get_clients', e=>{
    let clients = e.data.clients;
    let html = '';
    if (!clients.length)
      html += '<div><b>No clients</b></div>';
    for (let i=0; i<clients.length; i++)
    {
      let client = clients[i];
      html += `<div onClick="sc_set_client(${client.ws_id})">`+
        `WS_ID ${client.ws_id} IP ${client.ip} PORT ${client.port}</div>`;
    }
    document.querySelector('#clients').innerHTML = html;
  });
  sc.on('event-error', e=>log(`>error ${JSON.stringify(e)}`, e));
  sc.on('event-pong', e=>log(
    `<pong src ${e.src} ${util.get(e, 'data.data')}`, e));
  sc.on('event-ping', e=>{
    log(`<ping src ${e.src} ${util.get(e, 'data.data')}`, e);
    log(`>pong dst ${e.src} ${util.get(e, 'data.data')}`);
    sc.json({event: 'pong', dst: e.src, data: {src: e.src,
      data: util.get(e, 'data.data')}});
  });
  window.sc_ping = function(){
    let dst = document.querySelector('#ws_dst').value;
    let data = document.querySelector('#ws_msg').value;
    log(`>ping dst ${dst} ${data}`);
    sc.json({event: 'ping', dst, data: {data}});
  };
  window.sc_set_client= function sc_set_client(ws_id){
    document.querySelector('#ws_dst').value = ws_id; };
  window.sc_webrtc_connect = function(){
    let dst = document.querySelector('#ws_dst').value;
    log(`#webrtc initiate NEW peer ${dst}`, config);
    let peer = new Peer({initiator: true, config});
    peer.on('signal', data=>{
      // XXX: temporary debug code, rm and organize
      if (data.sdp)
        console.log('XXX sdp %o', SdpTransform.parse(data.sdp));
      if (data.candidate)
      {
        console.log('XXX candidate %o',
          SdpTransform.parseRemoteCandidates(data.candidate.candidate));
      }
      log(`>webrtc SDP ready type ${data.type}`, data);
      log(`>webrtc_connect dst ${dst}`, data);
      sc.json({event: 'webrtc_connect', dst, data: {data}});
    });
    peer.on('connect', ()=>{
      let data = document.querySelector('#ws_msg').value;
      log(`<webrtc CONNECT`);
      log(`#webrtc SEND`, data);
      peer.send(data);
    });
    peer.on('data', data=>{
      log(`<webrtc DATA ${data.toString()}`, data);
      console.log('XXX peer DATA %s', data.toString());
    });
    sc.on('event-reply_webrtc_connect', e=>{
      log(`<webrtc got peer SDP ${e.src}`, e);
      peer.signal(e.data.data);
    });
  };
  log(`#webrtc listen NEW peer`);
  var peer2 = new Peer({config}), peer2_dst;
  peer2.on('signal', data=>{
    log(`>webrtc SDP listen ready type ${data.type}`, data);
    log(`>webrtc_reply_connect dst ${peer2_dst}`, data);
    sc.json({event: 'reply_webrtc_connect', dst: peer2_dst, data: {data}});
  });
  sc.on('event-webrtc_connect', e=>{
    log(`event-webrtc_connect`, e);
    let src = e.src, edata = e.data;
    if (peer2_dst && peer2_dst!=src)
      throw new Error('peer2_dst changed');
    peer2_dst = src;
    peer2.signal(edata.data);
  });
  peer2.on('connect', ()=>{
    log(`<webrtc listen CONNECT`);
    log(`#webrtc SEND`);
    peer2.send('ack from peer');
  });
  peer2.on('data', data=>{
    log(`<webrtc DATA ${data.toString()}`, data);
    console.log('XXX peer2 DATA %s', data.toString());
  });
}

function init(){
  if (location.pathname=='/' &&
    location.hostname=='poc.lif.zone')
  {
    document.body.innerHTML = `
      <div>
        <div><b>LIF</b></div>
        <div>
          <input type=button value="Get clients" onClick="sc_get_clients()">
        </div>
        <div>
          Connect to: <input id=ws_dst>
          <input id=ws_msg value=Message>
          <input type=button value=Ping onClick="sc_ping()">
          <input type=button value="WebRTC Connect"
            onClick="sc_webrtc_connect()">
        </div>
        <div>peer_id: <span id=peer_id></span></div>
        <div>
          Clients:
          <div id=clients></div>
        </div>
        <div>
          Pings we got:
          <div id=log></div>
        <div>
      </div>
      <div>
        <b>debugging:</b>
        <p><a href="chrome://webrtc-internals">chrome://webrtc-internals</a></p>
        <p><a href="https://test.webrtc.org/">https://test.webrtc.org/</a></p>
        <p><a href="https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/">https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/</a></p>
        <p><a href="https://cloudbees.com/blog/webrtc-issues-and-how-to-debug-them">https://cloudbees.com/blog/webrtc-issues-and-how-to-debug-them</a></p>
        <p><a href="https://webrtchacks.com/sdp-anatomy/">https://webrtchacks.com/sdp-anatomy/</a></p>
        <pre>window.localStorage.debug = 'simple-peer';</pre>
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

