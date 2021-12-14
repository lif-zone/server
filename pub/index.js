// XXX: replace require with import
const ws_client = require('../lib/ws_client.js');
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

function get_ice_servers(val){
  // XXX: get list of public available stun servers
  let google = {urls: 'stun:stun.l.google.com:19302'};
  let twilio = {urls: 'stun:global.stun.twilio.com:3478?transport=udp'};
  let stun = {urls: 'stun:'+location.hostname};
  let turn = {urls: 'turn:'+location.hostname, username: 'username',
    credential: 'password'};
  let stun_bad = {urls: 'stun:stun.bad.com'};
  let turn_bad = {urls: 'turn:turn.bad.com', credential: 'password'};
  switch (val)
  {
  case 'google': return {iceServers: [google]};
  case 'twilio': return {iceServers: [twilio]};
  case 'stun': return {iceServers: [stun]};
  case 'turn': return {iceServers: [turn]};
  case 'all': return {iceServers: [google, twilio, stun, turn]};
  case 'stun_bad': return {iceServers: [stun_bad]};
  case 'turn_bad': return {iceServers: [turn_bad]};
  default: throw new Error('invalid option '+val);
  }
}

function connect(){
  let ws_url = 'wss://poc.lif.zone:3031';
  let peer, peer2;
  log(`ws: connect ${ws_url}`);
  const wsc = new ws_client({url: ws_url});
  wsc.on('error', e=>log(`ws: <ERROR ${JSON.stringify(e)}`, e));
  wsc.on('close', e=>log(`ws: <close`));
  wsc.on('event-error', e=>
    log(`ws: <ERROR ${util.get(e, 'data.desc')} ${JSON.stringify(e)}`, e));
  wsc.on('event-connect', e=>{
    let data = e.data||{};
    let s = `ws${data.ws_id} ${data.ip}:${data.port}`;
    document.querySelector('#ws_id').innerHTML = s;
    log(`ws: <connected`);
  });
  window.wsc_get_clients = function(){ wsc.json({event: 'get_clients'}); };
  wsc.on('event-reply_get_clients', e=>{
    let clients = e.data.clients;
    let html = '';
    if (!clients.length)
      html += '<div><b>No clients</b></div>';
    let s = ' STYLE="margin-top: 10px;" ';
    for (let i=0; i<clients.length; i++)
    {
      let client = clients[i];
      html += `<div onClick="wsc_set_client(${client.ws_id})">`+
        `<button ${s}>ws${client.ws_id} ${client.ip}:${client.port}`+
        `</button></div>`;
    }
    document.querySelector('#clients').innerHTML = html;
  });
  wsc.on('event-pong', e=>log(
    `ws: <pong src ${e.src} '${util.get(e, 'data.data')}'`, e));
  wsc.on('event-ping', e=>{
    log(`ws: <ping src ${e.src} '${util.get(e, 'data.data')}'`, e);
    log(`ws: >pong dst ${e.src} '${util.get(e, 'data.data')}'`);
    wsc.json({event: 'pong', dst: e.src, data: {src: e.src,
      data: util.get(e, 'data.data')}});
  });
  window.wsc_ping = function(){
    let dst = document.querySelector('#ws_dst').value;
    let data = document.querySelector('#ws_msg').value;
    log(`ws: >ping dst ${dst} '${data}'`);
    wsc.json({event: 'ping', dst, data: {data}});
  };
  window.wsc_set_client= function wsc_set_client(ws_id){
    document.querySelector('#ws_dst').value = ws_id; };
  window.wsc_webrtc_connect = function(){
    let config = get_ice_servers(document.querySelector('#ice_servers').value);
    let ice_servers = JSON.stringify(config.iceServers).replace(/"/g, '');
    document.querySelector('#webrtc_connect_btn').outerHTML =
      '<b><a href="javascript:location.reload();">NEED RELOAD</a></b>';
    let dst = document.querySelector('#ws_dst').value;
    log(`wrtc: connect dst ${dst} ${ice_servers}`, config);
    peer = new Peer({initiator: true, config,
      trickle: document.querySelector('#trickle').checked});
    console.log('peer %o', peer);
    if (window && window.xxx_debug)
    {
      peer._pc.onicecandidateerror =
        e=>log(`ice: onicecandidateerror ${JSON.stringify(e)}`, e);
      peer._pc.onfingerprintfailure =
        e=>log(`ice: onfingerprintfailure ${JSON.stringify(e)}`, e);
      peer._pc.onnegotiationneeded =
        e=>log(`ice: onnegotiationneeded ${JSON.stringify(e)}`, e);
      // peer._pc.onconnectionstatechange =
      //  e=>log(`ice: onconnectionstatechange ${JSON.stringify(e)}`, e);
    }
    peer.on('error', e=>log('wrtc: <ERROR '+e, e));
    peer.on('signal', data=>{
      let s = webrtc_str(data);
      log(`ws: >sdp dst ${dst} ${s}`, data);
      document.querySelector('#local').innerHTML += `<div>${s}</div>`;
      // XXX HACK: rename initiator_sdp -> sdp
      wsc.json({event: 'initiator_sdp', dst, data: {data}});
    });
    peer.on('connect', ()=>{
      let data = document.querySelector('#ws_msg').value;
      log(`wrtc: <connected`);
      log(`wrtc: >data '${data}'`);
      peer.send(data);
    });
    peer.on('data', data=>log(`wrtc: <data '${data.toString()}'`, data));
    wsc.on('event-sdp', e=>{
      let data = util.get(e, 'data.data');
      let s = webrtc_str(data);
      document.querySelector('#remote').innerHTML += `<div>${s}</div>`;
      log(`ws: <sdp src ${e.src} ${s}`, data);
      peer.signal(data);
    });
  };
  let peer2_dst;
  wsc.on('event-initiator_sdp', e=>{
    let src = e.src, data = util.get(e, 'data.data');
    if (peer2_dst && peer2_dst!=src)
      throw new Error('peer2_dst changed');
    let s = webrtc_str(data);
    peer2_dst = src;
    log(`ws: <sdp src ${src} ${s}`, e);
    document.querySelector('#remote').innerHTML += `<div>${s}</div>`;
    if (!peer2)
    {
      let config = get_ice_servers(
        document.querySelector('#ice_servers').value);
      let ice_servers = JSON.stringify(config.iceServers).replace(/"/g, '');
      log(`wrtc: listen ${ice_servers}`);
      peer2 = new Peer({config,
          trickle: document.querySelector('#trickle').checked});
      console.log('peer2 %o', peer2);
      if (window && window.xxx_debug)
      {
        peer2._pc.onicecandidateerror =
          e=>log(`ice: onicecandidateerror ${JSON.stringify(e)}`, e);
        peer2._pc.onfingerprintfailure =
          e=>log(`ice: onfingerprintfailure ${JSON.stringify(e)}`, e);
        peer2._pc.onnegotiationneeded =
          e=>log(`ice: onnegotiationneeded ${JSON.stringify(e)}`, e);
        // peer2._pc.onconnectionstatechange =
        //  e=>log(`ice: onconnectionstatechange ${JSON.stringify(e)}`, e);
      }
      peer2.on('error', e=>log('wrtc: <ERROR '+e, e));
      peer2.on('signal', data=>{
        let s = webrtc_str(data);
        log(`ws: >sdp dst ${peer2_dst} ${s}`, data);
        document.querySelector('#local').innerHTML += `<div>${s}</div>`;
        wsc.json({event: 'sdp', dst: peer2_dst, data: {data}});
      });
      peer2.on('connect', ()=>{
        log(`wrtc: <connected`);
      });
      peer2.on('data', data=>{
        log(`wrtc: <data '${data.toString()}'`, data);
        let data2 = 'REMOTE_ACK';
        log(`wrtc: >data '${data2}'`);
        peer2.send(data2);
      });
    }
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
          <input type=button value="Get clients" onClick="wsc_get_clients()">
        </div>
        <div>
          Connect to: <input id=ws_dst>
          <input id=ws_msg value=MY_MESSAGE>
          <select id=ice_servers>
            <option value="all">All STUN/TURN</option>
            <option value="google">Google Stun</option>
            <option value="twilio">Twilio Stun</option>
            <option value="stun">LIF Stun</option>
            <option value="turn">LIF TURN</option>
            <option value="stun_bad">Not working Stun</option>
            <option value="turn_bad">Not working TURN</option>
          </select>
          <input type=button value=Ping onClick="wsc_ping()">
          <input type=button id=webrtc_connect_btn value="WebRTC Connect"
            onClick="wsc_webrtc_connect()">
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

