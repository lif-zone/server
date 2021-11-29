// XXX: replace require with import
var ws_client = require('../lib/ws_client.js');

function test_signalhub(){
  var ws = ws_client(['ws://poc.lif.zone:3030']);
  ws.subscribe('my_channel').on('data', message=>
    console.log('new message received', message));
  ws.on('open', ()=>ws.broadcast('my_channel', {hello: 'world '+Date.now()}));
}

function init(){
  if (location.pathname=='/' &&
    location.hostname=='poc.lif.zone')
  {
    document.body.innerHTML = '<b>LIF</b>';
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
