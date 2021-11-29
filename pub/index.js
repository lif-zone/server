// XXX: replace require with import
var ws_client = require('../lib/ws_client.js');

function test_signalhub(){
  console.log('xxx hello %o %o', require, ws_client);
  var ws = ws_client(['ws://poc.lif.zone:3030']);
  ws.subscribe('my-channel').on('data', message=>
    console.log('new message received', message));
  ws.on('open', ()=>{
    console.log('XXX broadcast');
    ws.broadcast('my-channel', {hello: 'world '+Date.now()});
  });
}

test_signalhub();
