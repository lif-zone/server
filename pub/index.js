// XXX: replace require with import
const SignalClient = require('../lib/ws_client.js');
const date = require('../util/date.js');
const util = require('../util/util.js');
const Peer = require('simple-peer');
const SdpTransform = require('sdp-transform');

let log_a = [];

function log(s, o){
  log_a.push(date.to_sql_time_ms()+' '+s);
  console.log(date.to_sql_time_ms()+' '+s, o);
  document.querySelector('#log').innerText = log_a.join('\n');
}

// XXX: mv to webrtc_util.js
function webrtc_str(data){
  let s = '';
  if (data.sdp)
  {
    let sdp = SdpTransform.parse(data.sdp);
    s += `${data.type} ${util.get(sdp, 'origin.address')} `;
    console.log('sdp ', sdp, data);
  }
  if (data.candidate)
  {
    let _candidate = util.get(data, 'candidate.candidate');
    let candidate = SdpTransform.parseRemoteCandidates(_candidate);
    s += `${data.type} ${_candidate}`;
    console.log('sdp ', candidate, data);
  }
  if (!data.sdp && !data.candidate)
  {
    s += `unknown ${data.type}`;
    console.log('sdp ', data);
  }
  return s;
}

function connect(){
  let ws_url = 'wss://poc.lif.zone:3031';
  let stun_url = 'stun:stun.l.google.com:19302';
  // XXX: add stun fallback, eg stun:global.stun.twilio.com:3478?transport=udp
  let config = {iceServers: [{urls: stun_url}]};
  let peer, peer2;
  log(`ws: connect ${ws_url}`);
  const sc = new SignalClient({url: ws_url});
  sc.on('error', e=>log(`ws: <ERROR ${JSON.stringify(e)}`, e));
  sc.on('close', e=>log(`ws: <CLOSE`));
  sc.on('event-error', e=>
    log(`ws: <ERROR ${util.get(e, 'data.desc')} ${JSON.stringify(e)}`, e));
  sc.on('event-connect', e=>{
    let data = e.data||{};
    let s = `ws${data.ws_id} ${data.ip}:${data.port}`;
    document.querySelector('#ws_id').innerHTML = s;
    log(`ws: <connected`);
    log(`wrtc: listen`);
    peer2 = new Peer({config,
        trickle: document.querySelector('#trickle').checked});
    console.log('peer2 %o', peer2);
    peer2._pc.onicecandidateerror =
      e=>log(`ice: onicecandidateerror ${JSON.stringify(e)}`, e);
    peer2._pc.onfingerprintfailure =
      e=>log(`ice: onfingerprintfailure ${JSON.stringify(e)}`, e);
    peer2._pc.onnegotiationneeded =
      e=>log(`ice: onnegotiationneeded ${JSON.stringify(e)}`, e);
    peer2._pc.onconnectionstatechange =
      e=>log(`ice: onconnectionstatechange ${JSON.stringify(e)}`, e);
    peer2.on('error', e=>log('wrtc: <ERROR '+e, e));
    peer2.on('signal', data=>{
      let s = webrtc_str(data);
      log(`ws: >sdp dst ${peer2_dst}`, data);
      document.querySelector('#local').innerHTML += `<div>${s}</div>`;
      sc.json({event: 'sdp', dst: peer2_dst, data: {data}});
    });
    peer2.on('connect', ()=>{
      let data = 'REMOTE_ACK';
      log(`wrtc: <connected`);
      log(`wrtc: >data '${data}'`);
      peer2.send(data);
    });
    peer2.on('data', data=>log(`wrtc: <data '${data.toString()}'`, data));
  });
  window.sc_get_clients = function(){ sc.json({event: 'get_clients'}); };
  sc.on('event-reply_get_clients', e=>{
    let clients = e.data.clients;
    let html = '';
    if (!clients.length)
      html += '<div><b>No clients</b></div>';
    let s = ' STYLE="margin-top: 10px;" ';
    for (let i=0; i<clients.length; i++)
    {
      let client = clients[i];
      html += `<div onClick="sc_set_client(${client.ws_id})">`+
        `<button ${s}>WS${client.ws_id} ${client.ip}:${client.port}`+
        `</button></div>`;
    }
    document.querySelector('#clients').innerHTML = html;
  });
  sc.on('event-pong', e=>log(
    `ws: <PONG src ${e.src} '${util.get(e, 'data.data')}'`, e));
  sc.on('event-ping', e=>{
    log(`ws: <PING src ${e.src} '${util.get(e, 'data.data')}'`, e);
    log(`ws: >PONG dst ${e.src} '${util.get(e, 'data.data')}'`);
    sc.json({event: 'pong', dst: e.src, data: {src: e.src,
      data: util.get(e, 'data.data')}});
  });
  window.sc_ping = function(){
    let dst = document.querySelector('#ws_dst').value;
    let data = document.querySelector('#ws_msg').value;
    log(`ws: >PING dst ${dst} '${data}'`);
    sc.json({event: 'ping', dst, data: {data}});
  };
  window.sc_set_client= function sc_set_client(ws_id){
    document.querySelector('#ws_dst').value = ws_id; };
  window.sc_webrtc_connect = function(){
    document.querySelector('#webrtc_connect_btn').outerHTML =
      '<b><a href="javascript:location.reload();">NEED RELOAD</a></b>';
    let dst = document.querySelector('#ws_dst').value;
    log(`wrtc: connect dst ${dst} ${stun_url}`, config);
    peer = new Peer({initiator: true, config,
      trickle: document.querySelector('#trickle').checked});
    console.log('peer %o', peer);
    peer._pc.onicecandidateerror =
      e=>log(`ice: onicecandidateerror ${JSON.stringify(e)}`, e);
    peer._pc.onfingerprintfailure =
      e=>log(`ice: onfingerprintfailure ${JSON.stringify(e)}`, e);
    peer._pc.onnegotiationneeded =
      e=>log(`ice: onnegotiationneeded ${JSON.stringify(e)}`, e);
    peer._pc.onconnectionstatechange =
      e=>log(`ice: onconnectionstatechange ${JSON.stringify(e)}`, e);
    peer.on('error', e=>log('wrtc: <ERROR '+e, e));
    peer.on('signal', data=>{
      let s = webrtc_str(data);
      log(`ws: >sdp dst ${dst} ${s}`, data);
      document.querySelector('#local').innerHTML += `<div>${s}</div>`;
      // XXX HACK: rename initiator_sdp -> sdp
      sc.json({event: 'initiator_sdp', dst, data: {data}});
    });
    peer.on('connect', ()=>{
      let data = document.querySelector('#ws_msg').value;
      log(`wrtc: <connected`);
      log(`wrtc: >data '${data}'`);
      peer.send(data);
    });
    peer.on('data', data=>log(`wrtc: <data '${data.toString()}'`, data));
    sc.on('event-sdp', e=>{
      let data = util.get(e, 'data.data');
      let s = webrtc_str(data);
      document.querySelector('#remote').innerHTML += `<div>${s}</div>`;
      log(`ws: <sdp src ${e.src} ${s}`, data);
      peer.signal(data);
    });
  };
  let peer2_dst;
  sc.on('event-initiator_sdp', e=>{
    let src = e.src, data = util.get(e, 'data.data');
    if (peer2_dst && peer2_dst!=src)
      throw new Error('peer2_dst changed');
    let s = webrtc_str(data);
    peer2_dst = src;
    log(`ws: <sdp src ${src} ${webrtc_str(data)}`, e);
    document.querySelector('#remote').innerHTML += `<div>${s}</div>`;
    peer2.signal(data);
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
          <input id=ws_msg value=MY_MESSAGE>
          <input type=button value=Ping onClick="sc_ping()">
          <input type=button id=webrtc_connect_btn value="WebRTC Connect"
            onClick="sc_webrtc_connect()">
          <input type=checkbox id=trickle checked>Trickle</checkbox>
        </div>
        <div><b id=ws_id></b></div>
        <div>
          Clients:
          <div id=clients></div>
        </div>
        <div>
          <b>Local SDP</b>
          <div id=local></div>
        <div>
        <div>
          <b>Remote SDP</b>
          <div id=remote></div>
        <div>
        <div>
          <br><b>Events:</b>
          <div id=log></div>
        <div>
      </div>
      <div>
        <hr>
        <b>debugging:</b>
        <p><a href="chrome://webrtc-internals">chrome://webrtc-internals</a></p>
        <p><a href="https://test.webrtc.org/">https://test.webrtc.org/</a></p>
        <p><a href="https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/">https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/</a></p>
        <p><a href="https://cloudbees.com/blog/webrtc-issues-and-how-to-debug-them">https://cloudbees.com/blog/webrtc-issues-and-how-to-debug-them</a></p>
        <p><a href="https://webrtchacks.com/sdp-anatomy/">https://webrtchacks.com/sdp-anatomy/</a></p>
        <p><a href="https://datatracker.ietf.org/doc/html/rfc5245">ICE rfc5245</a></p>
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

