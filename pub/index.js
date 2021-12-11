// XXX: replace require with import
const SignalClient = require('../lib/ws_client.js');
const date = require('../util/date.js');
const Peer = require('simple-peer');
const React = require('react');
const ReactDOM = require('react-dom');

function connect(){
  const sc = new SignalClient({url: 'wss://poc.lif.zone:3031'});
  var pings = [];
  sc.on('event-error', e=>{
    pings.push(`${date.to_sql_ms()} >error ${JSON.stringify(e)}`);
    document.querySelector('#log').innerText = pings.join('\n');
  });
  sc.on('event-pong', e=>{
    pings.push(`${date.to_sql_ms()} <pong src ${e.src}`);
    document.querySelector('#log').innerText = pings.join('\n');

  });
  sc.on('event-ping', e=>{
    pings.push(`${date.to_sql_ms()} <ping src ${e.src}`);
    pings.push(`${date.to_sql_ms()} >pong dst ${e.src}`);
    document.querySelector('#log').innerText = pings.join('\n');
    sc.json({event: 'pong', dst: e.src, data: {src: e.src, data: e.data}});
  });
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
  window.sc_ping = function(){
    let dst = document.querySelector('#ws_dst').value;
    let data = document.querySelector('#ws_msg').value;
    pings.push(`${date.to_sql_ms()} >ping dst ${dst}`);
    document.querySelector('#log').innerText = pings.join('\n');
    sc.json({event: 'ping', dst, data: {data}});
  };
  window.sc_set_client= function sc_set_client(ws_id){
    document.querySelector('#ws_dst').value = ws_id;
  };
  window.sc_get_clients = function(){ sc.json({event: 'get_clients'}); };
  window.sc_webrtc_connect = function(){
    let dst = document.querySelector('#ws_dst').value;
    console.log('XXX sc_webrtc_connect %s', dst);
    let peer = new Peer({initiator: true, config: {iceServers: [
      {urls: 'stun:stun.l.google.com:19302'},
      {urls: 'stun:global.stun.twilio.com:3478?transport=udp'}]}});
    peer.on('signal', data=>{
      console.log('XXX peer got self data %o', data);
      sc.json({event: 'webrtc_connect', dst, data: {data}});
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
  peer2.on('signal', data=>{
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
    return e('button', {onClick: ()=>this.setState({liked: true})}, 'React');
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

