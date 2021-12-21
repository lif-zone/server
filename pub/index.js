'use strict'; /*jslint node:true, browser:true*/
import crypto from 'crypto';
import React from 'react';
import ReactDOM from 'react-dom';
import queryString from 'query-string';
import util from '../util/util.js';
import date from '../util/date.js';
import Node from '../peer-relay/client.js';
const bstr = util.buf_to_str;
let qs_o = queryString.parse(location.search);
let qs_port = qs_o.port||3032;
let qs_storage = qs_o.storage||'lif';

let node, page, g_data = 'hello', g_dst, g_log = [];

function peer_id(id){
  return typeof id=='string' ? id.substr(0, 3) : bstr(id).substr(0, 3); }

function init(){
  if (location.pathname=='/' &&
    location.hostname=='poc.lif.zone')
  {
    document.body.innerHTML = '<div id=react_root></div>';
    peer_relay_init();
  }
  else if (window.self!==window.top)
    document.body.innerHTML = 'iframe for '+location.href;
  else
  {
    document.body.innerHTML = '<iframe src="'+
      encodeURI(location.pathname)+'"></iframe>';
  }
}

class Peer extends React.Component {
  on_send = ()=>send(this.props.peer.id, g_data);
  on_peer = ()=>page.setState({dst: g_dst = bstr(this.props.peer.id)});
  render(){
    let {peer} = this.props;
    let s = {cursor: 'pointer'};
    return <div>
      <span style={s} onClick={this.on_peer}>{peer_id(bstr(peer.id))}</span>
      {peer.ws ? <span> ws {peer.ws.url} </span> : <span> wrtc </span>}
      <span> id {bstr(peer.id)} </span>
      <button onClick={this.on_send}>send</button>
    </div>;
  }
}

function Peers(props){
  let a = [], {peers} = props;
  if (peers)
  {
    peers.forEach(peer=>a.push(<Peer peer={peer}
      key={bstr(peer.id)}/>));
  }
  return a;
}

class Page extends React.Component {
  constructor(props){
    super(props);
    page = this;
  } // XXX HACK: find proper way to do it
  state = {dst: ''};
  on_data = e=>g_data = e.target.value;
  on_dst = e=>{
    g_dst = e.target.value;
    this.setState({dst: g_dst});
  };
  on_send = ()=>send(g_dst, g_data);
  on_server = e=>{
    qs_o.port = e.target.value;
    location.search = queryString.stringify(qs_o);
  }
  on_storage = e=>{
    qs_o.storage = e.target.value;
    location.search = queryString.stringify(qs_o);
  };
  render(){
    let {peers, log, id, dst} = this.state;
    return <div>
      <div>
        <b>Connected to:</b>
        <select onChange={this.on_server} value={qs_port}>
          <option value='3032'>Port 3032</option>
          <option value='3033'>Port 3033</option>
        </select>
        <b> localStorage prefix</b>
        <input defaultValue={qs_storage} onChange={this.on_storage}/>
      </div>
      <hr/>
      <div>
        <b>Dst</b> <input value={dst} onChange={this.on_dst}/>
        <b> Data</b> <input defaultValue={g_data} onChange={this.on_data}/>
        <button onClick={this.on_send}>send</button>
      </div>
      <div><b>Self ID</b> {id}</div>
      <div>
        <b>Log</b>
        <pre>{log}</pre>
      </div>
      <b>Peers</b>
      <Peers peers={peers}/>
    </div>;
  }
}

function add_log(s){
  g_log.push(date.to_sql_ms()+': '+s);
  page.setState({log: g_log.join('\n')});
}

function send(dst, data){
  if (!dst)
    return add_log(`error missing dst`);
  add_log(`>msg ${data} dst ${peer_id(dst)}`);
  node.send(dst, data);
}

function peer_relay_init(){
  let id_name = qs_storage+'_node_id';
  let id = localStorage[id_name];
  if (!id)
    id = localStorage[id_name] = bstr(crypto.randomBytes(20));
  const react_root = document.querySelector('#react_root');
  const create_element = React.createElement;
  ReactDOM.render(create_element(Page), react_root);
  node = new Node({id, bootstrap: ['ws://poc.lif.zone:'+qs_port]});
  console.log('node id %s %o', bstr(node.id), node);
  node.on('peer', o=>{
    let peers = node.get_peers().toArray();
    page.setState({peers});
  });
  node.on('message',
    (data, src)=>add_log(`<msg ${data} src ${peer_id(src)}`));
  page.setState({id: bstr(node.id)});
}

init();


