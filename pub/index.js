// XXX: replace require with import
const SignalClient = require('../lib/ws_client.js');
const Peer = require('simple-peer');
const React = require('react');
const ReactDOM = require('react-dom');

function connect(){
  const sc = new SignalClient({url: 'wss://poc.lif.zone:3031'});
  window.sc_broadcast = function(){ sc.broadcast({ts: +Date.now()}); };
  window.sc_ping = async function(){
    let html;
    let dst = document.querySelector('#ws_dst').value;
    let ts = new Date();
    let data = document.querySelector('#ws_msg').value;
    try {
      let pong = await sc.cmd('ping', dst, {ts, data});
      if (pong.error)
        html = `<div><b>ping Error ${pong.error}</b></div>`;
      else
        html = `<div>${pong.ts} ping ok</div>`;
    } catch(err){
      html = `<div><b>ping Error ${err}</b></div>`;
    }
    document.querySelector('#ws_ping').innerHTML = html;
  };
  window.sc_set_client= function sc_set_client(ws_id){
    document.querySelector('#ws_dst').value = ws_id;
  };
  window.sc_get_clients = async function(){
    let html = '';
    try {
      let o = await sc.cmd('get_clients');
      // let o = await sc.cmd('webrtc_connect', {ws_id: 1}, {timeout: 10});
      console.log('XXX clients %o', o);
      if (!o.clients.length)
        html += '<div><b>No clients</b></div>';
      for (let i=0; i<o.clients.length; i++)
      {
        let client = o.clients[i];
        html += `<div onClick="sc_set_client(${client.ws_id})">`+
          `WS_ID ${client.ws_id} IP ${client.ip} PORT ${client.port}</div>`;
      }
    } catch(err){
      console.log('XXX error %o', err);
      html = `<div><b>Error getting clients ${err}</b></div>`;
    }
    document.querySelector('#ws_clients').innerHTML = html;
  };
  var pings = [];
  sc.on('ping', o=>{
    pings.push(JSON.stringify(o));
    document.querySelector('#ws_pings').innerText = pings.join('\n');
  });
  window.sc_webrtc_connect = async function(){
    let dst = document.querySelector('#ws_dst').value;
    console.log('XXX sc_webrtc_connect %s', dst);
    let peer = new Peer({initiator: true, config: {iceServers: [
      {urls: 'stun:stun.l.google.com:19302'},
      {urls: 'stun:global.stun.twilio.com:3478?transport=udp'}]}});
    peer.on('signal', async data=>{
      console.log('XXX peer got self data %o', data);
      let eid = Math.random();
      sc.json({event: 'webrtc_connect', dst, data: {eid, data}});
    });
    peer.on('connect', ()=>{
      console.log('XXX peer CONNECT');
      peer.send('peer1 -> peer2');
    });
    peer.on('data', data=>{
      console.log('XXX peer DATA %s', data.toString());
    });
    sc.on('event-reply_webrtc_connect', e=>{
      console.log('XXX got event-reply_webrtc_connect %o', e);
      peer.signal(e.data.data);
    });
  };
  var peer2 = new Peer(), peer2_data, peer2_dst;
  peer2.on('signal', async data=>{
    peer2_data = data;
    console.log('XXX peer2 got self data %o', peer2_data);
    sc.json({event: 'reply_webrtc_connect', dst: peer2_dst, data: {data}});
  });
  sc.on('event-webrtc_connect', e=>{
    console.log('XXX got event-webrtc_connect %o', e);
    let src = e.src, edata = e.data;
    if (peer2_dst && peer2_dst!=src)
      throw new Error('peer2_dst changed');
    peer2_dst = src;
    peer2.signal(edata.data);
  });
  peer2.on('connect', ()=>{
    console.log('XXX peer2 CONNECT');
    peer2.send('reply peer2 -> peer1');
  });
  peer2.on('data', data=>{
    console.log('XXX peer2 DATA %s', data.toString());
  });
}

class Page extends React.Component {
  render(){
    const e = React.createElement;
    return e(
      'button',
      { onClick: () => this.setState({ liked: true }) },
      'React');
  }
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
          <input type=button value=Broadcast onClick="sc_broadcast()">
        </div>
        <div id=ws_ping></div>
        <br>
        <div>peer_id: <span id=peer_id></span></div>
        <div>
          Clients:
          <div id=ws_clients></div>
        </div>
        <div>
          Pings we got:
          <div id=ws_pings></div>
        <div>
      </div>
      <div id=react_root></div>
    `;
    connect();
    const react_root = document.querySelector('#react_root');
    const e = React.createElement;
    ReactDOM.render(e(Page), react_root);
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

