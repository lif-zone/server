// XXX: replace require with import
var signalhub = require('../lib/ws_client.js');

function test_signalhub(){
  console.log('xxx hello %o %o', require, signalhub);
  var hub = signalhub(['ws://poc.lif.zone:3030']);
  hub.subscribe('my-channel')
    .on('data', function(message){
      console.log('new message received', message);
    });
    setTimeout(function(){
      console.log('XXX broadcast');
      hub.broadcast('my-channel', {hello: 'world '+Date.now()});
    }, 2000);
}

test_signalhub();
