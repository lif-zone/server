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
    // XXX: {urls: 'stun:global.stun.twilio.com:3478?transport=udp'}
  ]};
  const sc = new SignalClient({url: 'wss://poc.lif.zone:3031'});
  sc.on('error', e=>log(`signal: <ERROR ${JSON.stringify(e)}`, e));
  sc.on('close', e=>log(`signal: <CLOSE`));
  sc.on('event-error', e=>log(`signal: <ERROR ${JSON.stringify(e)}`, e));
  sc.on('event-connect', e=>{
    let data = e.data||{};
    let s = `ws_id ${data.ws_id} ${data.ip}:${data.port}`;
    document.querySelector('#ws_id').innerHTML = s;
    log(`signal: >CONNECTED `+s, e);
  });
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
        `WS_ID ${client.ws_id} IP ${client.ip}:${client.port}</div>`;
    }
    document.querySelector('#clients').innerHTML = html;
  });
  sc.on('event-pong', e=>log(
    `signal: <PONG src ${e.src} ${util.get(e, 'data.data')}`, e));
  sc.on('event-ping', e=>{
    log(`signal: <PING src ${e.src} ${util.get(e, 'data.data')}`, e);
    log(`signal: >PONG dst ${e.src} ${util.get(e, 'data.data')}`);
    sc.json({event: 'pong', dst: e.src, data: {src: e.src,
      data: util.get(e, 'data.data')}});
  });
  window.sc_ping = function(){
    let dst = document.querySelector('#ws_dst').value;
    let data = document.querySelector('#ws_msg').value;
    log(`signal: >PING dst ${dst} ${data}`);
    sc.json({event: 'ping', dst, data: {data}});
  };
  window.sc_set_client= function sc_set_client(ws_id){
    document.querySelector('#ws_dst').value = ws_id; };
  let peer;
  window.sc_webrtc_connect = function(){
    document.querySelector('#webrtc_connect_btn').outerHTML =
      '<b>RELOAD TO CONNECT AGAIN</b>';
    if (peer)
      peer.destroy();
    let dst = document.querySelector('#ws_dst').value;
    let stun = JSON.stringify(config.iceServers);
    log(`webrtc: CONNECT ${dst} ${stun}`, config);
    peer = new Peer({initiator: true, config});
    peer.on('error', e=>log('webrtc: <ERROR '+e, e));
    peer.on('signal', data=>{
      if (data.sdp)
      {
        let sdp = SdpTransform.parse(data.sdp);
        log(`webrtc: local_peer SDP ${data.type} `+
          `${util.get(sdp, 'origin.address')} `+
          `sessionId ${util.get(sdp, 'origin.sessionId')}`,
          {sdp, data});
      }
      if (data.candidate)
      {
          let _candidate = util.get(data, 'candidate.candidate');
          let candidate = SdpTransform.parseRemoteCandidates(_candidate);
        log(`webrtc: local_peer SDP ${data.type} ${_candidate}`,
          {candidate, data});
      }
      if (!data.sdp && !data.candidate)
        log(`webrtc: local_peer SDP unknown ${data.type}`, data);
      log(`signal: >webrtc_connect dst ${dst}`, data);
      sc.json({event: 'webrtc_connect', dst, data: {data}});
    });
    peer.on('connect', ()=>{
      let data = document.querySelector('#ws_msg').value;
      log(`webrtc: <CONNECTED`);
      log(`webrtc: >SEND ${data}`);
      peer.send(data);
    });
    peer.on('data', data=>log(`webrtc: <DATA ${data.toString()}`, data));
    sc.on('event-reply_webrtc_connect', e=>{
      let data = util.get(e, 'data.data');
      if (data.sdp)
      {
        let sdp = SdpTransform.parse(data.sdp);
        log(`signal: <reply_webrtc_connect rmt ${e.src} SDP ${data.type} `+
          `${util.get(sdp, 'origin.address')} `+
          `sessionId ${util.get(sdp, 'origin.sessionId')}`,
          {sdp, e});
      }
      if (data.candidate)
      {
        let _candidate = util.get(data, 'candidate.candidate');
        let candidate = SdpTransform.parseRemoteCandidates(_candidate);
        log(`signal: <reply_webrtc_connect rmt ${e.src} SDP `+
          `${data.type} ${_candidate}`, {candidate, e});
      }
      if (!data.sdp && !data.candidate)
      {
        log(`signal: <reply_webrtc_connect rmt ${e.src} SDP `+
          `unknown ${data.type}`, e);
      }
      peer.signal(e.data.data);
    });
  };
  log(`webrtc: LISTEN`);
  var peer2 = new Peer({config}), peer2_dst;
  peer2.on('error', e=>log('webrtc: <ERROR '+e, e));
  peer2.on('signal', data=>{
    log(`>webrtc SDP listen ready type ${data.type}`, data);
    log(`>webrtc_reply_connect dst ${peer2_dst}`, data);
    sc.json({event: 'reply_webrtc_connect', dst: peer2_dst, data: {data}});
  });
  sc.on('event-webrtc_connect', e=>{
    log(`signal: event-webrtc_connect`, e);
    let src = e.src, edata = e.data;
    if (peer2_dst && peer2_dst!=src)
      throw new Error('peer2_dst changed');
    peer2_dst = src;
    peer2.signal(edata.data);
  });
  peer2.on('connect', ()=>{
    let data = 'REMOTE_ACK';
    log(`webrtc: <CONNECTED`);
    log(`webrtc: >SEND ${data}`);
    peer2.send(data);
  });
  peer2.on('data', data=>log(`webrtc: <DATA ${data.toString()}`, data));
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
          <input id=ws_msg value=MY_MESSAGE>
          <input type=button value=Ping onClick="sc_ping()">
          <input type=button id=webrtc_connect_btn value="WebRTC Connect"
            onClick="sc_webrtc_connect()">
        </div>
        <div>ws_id: <span id=ws_id></span></div>
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

