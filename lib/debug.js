'use strict'; /*jslint node:true, browser:true*/
const E = {};
import util from '../util/util.js';
const bstr = util.buf_to_str;
export default E;

function _peer_id(node, id){
  return id==bstr(node.id) ? 'self' : id.substr(id.length-3); }

E.peer_id = function(node, id){
  return typeof id=='string' ? _peer_id(node, id) : _peer_id(node, bstr(id));
};

E.set_trace = function(opt){
  let {node, cb} = opt;
  const peer_id = id=>E.peer_id(node, id);
  node.on('connection', conn=>{
    cb('node: <conn '+peer_id(conn.id)+' '+
      (conn.ws ? 'ws '+conn.ws.url : 'wrtc'));
  });
  node.on('peer', id=>cb(`node: peer connected ${peer_id(id)}`));
  node.on('message',
    (data, src)=>cb(`node: <msg src ${peer_id(src)} ${data}`));
  node.router.on('send', msg=>{
    cb('router: >'+msg.data.type+' src '+peer_id(msg.from)+
      ' dst '+peer_id(msg.to)+
      (msg.path.length ? ' path '+msg.path.join('/') : ''));
  });
  node.router.on('message',
    (data, from)=>cb('router: <'+data.type+' src '+peer_id(from)));
  node.router.on('relay', msg=>{
    cb('router: >relay '+msg.data.type+' src '+peer_id(msg.from)+
      ' dst '+peer_id(msg.to)+' path '+msg.path.join('/'));
  });
};
