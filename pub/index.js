// XXX: replace require with import
import util from '../util/util.js';
import Node from '../peer-relay/client.js';
import React from 'react';
import ReactDOM from 'react-dom';

let page, g_data = 'hello', node;

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
  on_send = ()=>node.send(this.props.peer.id, g_data);
  render(){
    let {peer} = this.props;
    return <div>
      <span>id {util.buf_to_str(peer.id)} </span>
      {peer.ws ? <span> ws {peer.ws.url} </span> : <span>wrtc </span>}
      <button onClick={this.on_send}>send</button>
    </div>;
  }
}

function Peers(props){
  let a = [], {peers} = props;
  if (peers)
  {
    peers.forEach(peer=>a.push(<Peer peer={peer}
      key={util.buf_to_str(peer.id)}/>));
  }
  return a;
}

class Page extends React.Component {
  constructor(props){
    super(props);
    page = this;
  } // XXX HACK: find proper way to do it
  state = {};
  on_data = e=>g_data = e.target.value;
  render(){
    let {peers, log, id} = this.state;
    return <div>
      <div>data <input defaultValue={g_data} onChange={this.on_data}/></div>
      <div><b>Self ID</b> {id}</div>
      <div>
        <b>Log</b>
        <div>{log}</div>
      </div>
      <b>Peers</b>
      <Peers peers={peers}/>
    </div>;
  }
}

function peer_relay_init(){
  const react_root = document.querySelector('#react_root');
  const create_element = React.createElement;
  ReactDOM.render(create_element(Page), react_root);
  node = new Node({bootstrap: ['ws://poc.lif.zone:3032']});
  console.log('node id %s %o', util.buf_to_str(node.id), node);
  node.on('peer', o=>{
    let peers = node.get_peers().toArray();
    console.log('XXX peers %o', node.get_peers().toArray());
    page.setState({peers});
  });
  node.on('message', (data, from)=>page.setState({log: data}));
  page.setState({id: util.buf_to_str(node.id)});
}

init();


