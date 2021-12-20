// XXX: replace require with import
import util from '../util/util.js';
import Node from '../peer-relay/client.js';
import React from 'react';
import ReactDOM from 'react-dom';

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
  on_click = ()=>{ console.log('XXX click %o', this.props.peer); };
  render(){
    let {peer} = this.props;
    let s = {cursor: 'pointer'};
    return <div style={s} onClick={this.on_click}>
      <span>id {util.buf_to_str(peer.id)}</span>
      {peer.ws ? <span> ws {peer.ws.url}</span> : <span> wrtc </span>}
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

let page;
class Page extends React.Component {
  constructor(props){
    super(props);
    page = this;
  } // XXX HACK: find proper way to do it
  state = {};
  render(){
    let {peers} = this.state;
    return <div>
      <b>Peers:</b>
      <Peers peers={peers}/>
    </div>;
  }
}

function peer_relay_init(){
  const react_root = document.querySelector('#react_root');
  const create_element = React.createElement;
  ReactDOM.render(create_element(Page), react_root);
  let node = new Node({bootstrap: ['ws://poc.lif.zone:3032']});
  console.log('XXX node_id %s %o', util.buf_to_str(node.id), node);
  node.on('peer', o=>{
    let peers = node.get_peers().toArray();
    console.log('XXX peers %o', node.get_peers().toArray());
    page.setState({peers});
  });
}

init();


