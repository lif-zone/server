// XXX: replace require with import
const SignalClient = require('../lib/ws_client.js');

function connect(){
  const sc = new SignalClient({url: 'wss://poc.lif.zone:3031'});
  window.sc_broadcast = function sc_broadcast(){
    sc.broadcast({ts: +Date.now()});
  };
  window.sc_get_clients = async function sc_get_clients(){
    try {
      let o = await sc.cmd('get_clients');
      // let o = await sc.cmd('webrtc_connect', {ws_id: 1}, {timeout: 10});
      console.log('XXX clients %o', o);
    } catch(err){
      console.log('XXX error %o', err);
    }
  };
  /* XXX: obsolete, rm
  const peer_id = crypto.randomUUID();
  document.querySelector('#peer_id').innerText = peer_id;
  var messages = [];
  const wsc = ws_client({peer_id, urls: ['wss://poc.lif.zone:3031']});
  wsc.subscribe('my_channel').on('data', msg=>{
    console.log('got msg', msg);
    messages.push(JSON.stringify(msg));
    document.querySelector('#ws_incoming').innerText = messages.join('\n');
  });
  window.sc_broadcast= function sc_broadcast(){
    let msg = document.querySelector('#ws_msg').value;
    wsc.broadcast('my_channel', {peer_id, ts: +Date.now(), msg});
  };
  */
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
          <input id=ws_msg value=Message>
          <input type=button value=Broadcast onClick="sc_broadcast()">
        </div>
        <br>
        <div>peer_id: <span id=peer_id></span></div>
        <pre id=ws_incoming><pre>
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

