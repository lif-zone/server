// XXX: replace require with import
const ws_client = require('../lib/ws_client.js');
const SimplePeerWrapper = require('simple-peer-wrapper');
const wsc = ws_client(['wss://poc.lif.zone:3031']);

function test_signalhub(){
  var messages = [];
  wsc.subscribe('my_channel').on('data', msg=>{
    console.log('got msg', msg);
    messages.push(JSON.stringify(msg));
    document.querySelector('#ws_incoming').innerText = messages.join('\n');
  });
}

window.ws_test_send = function ws_test_send(){
  let msg = document.querySelector('#ws_msg').value;
  wsc.broadcast('my_channel', {ts: +Date.now(), msg});
};

function test_simple_peer(){
  console.log('simple_peer: init');
  const options = {
    debug: true,
    serverUrl: 'http://localhost:3030',
    simplePeerOptions: {},
  };
  const spw = new SimplePeerWrapper(options);
  spw.connect();
  spw.on('data', data=>{
    console.log('simple_peer: data %o', data);
  });
  setInterval(()=>{
    spw.send({ts: Date.now()});
  }, 1000);
  window.onbeforeunload = ()=>spw.close();
}

function init(){
  if (location.pathname=='/' &&
    location.hostname=='poc.lif.zone')
  {
    document.body.innerHTML = `
      <div>
        <div><b>LIF</b></div>
        <div>
          <input id=ws_msg value=Message>
          <input type=button value=Broadcast onClick="ws_test_send()">
        </div>
        <pre id=ws_incoming>
        <pre>
      </div>
    `;
    if (0) test_signalhub();
    test_simple_peer();
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
