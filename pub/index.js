// XXX: replace require with import
const ws_client = require('../lib/ws_client.js');
const wsc = ws_client(['ws://poc.lif.zone:3030']);
function test_signalhub(){
  wsc.subscribe('my_channel').on('data', message=>
    console.log('new message received', message));
}

window.ws_test_send = function ws_test_send(){
  let msg = document.querySelector('#ws_msg').value;
  wsc.broadcast('my_channel', {msg, ts: +Date.now()});
};

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
      </div>
    `;
    test_signalhub();
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
