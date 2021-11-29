// XXX: replace require with import
var ws_client = require('../lib/ws_client.js');

function test_signalhub(){
  var ws = ws_client(['ws://poc.lif.zone:3030']);
  ws.subscribe('my_channel').on('data', message=>
    console.log('new message received', message));
  ws.on('open', ()=>ws.broadcast('my_channel', {hello: 'world '+Date.now()}));
}

test_signalhub();
