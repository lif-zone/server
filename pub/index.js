// XXX: replace require with import
const ws_client = require('../lib/ws_client.js');

function connect(){
  const wsc = ws_client({urls: ['wss://poc.lif.zone:3031']});
  var messages = [];
  wsc.subscribe('my_channel').on('data', msg=>{
    console.log('got msg', msg);
    messages.push(JSON.stringify(msg));
    document.querySelector('#ws_incoming').innerText = messages.join('\n');
  });
  window.ws_test_send = function ws_test_send(){
    let msg = document.querySelector('#ws_msg').value;
    wsc.broadcast('my_channel', {ts: +Date.now(), msg});
  };
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

