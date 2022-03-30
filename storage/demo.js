// author: derry. coder: arik.
import net from 'net';
import hypercore from 'hypercore';

const [mode, port, key] = process.argv.slice(2);
if (['client', 'server'].indexOf(mode)==-1 || !port){
  exit('usage: node index.js [client|server] [PORT] [KEY]');
}
const hostname = 'localhost';

const feed = hypercore(mode=='client' ?
  '/tmp/demo_client' : '/tmp/demo_server', key, {valueEncoding: 'utf8'});
feed.ready(()=>{
  console.log(`key:  ${feed.key.toString('hex')}`);
  console.log(`dkey: ${feed.discoveryKey.toString('hex')}`);
  if (!key){
    console.log('server append len %s', feed.length);
    feed.append('*** '+Date());
    let i=0;
    setInterval(function(){
      i++;
      feed.append('item '+i);
    }, 3000);
  }
});

if (mode=='client'){
  const socket = net.connect(port, hostname);
  onconnection(socket, true);
} else {
  const server = net.createServer(socket => onconnection(socket, false));
  server.listen(port, hostname, ()=>{
    console.log(`server listening on `+
      `${server.address().address}:${server.address().port}`);
  });
}

function onconnection(socket, isInitiator){
  const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`new connection from ${remoteAddr}`);
  console.log(`starting to replicate`, feed);
  const proto = feed.replicate(isInitiator, {live: true, noise: false});
  feed.on('error', err=>console.error('feed: error %o', err));
  feed.on('download', ()=>console.log('feed: download len %s', feed.length));
  feed.on('upload', ()=>console.log('feed: upload'));
  feed.on('append', ()=>console.log('feed: append'));
  feed.on('sync', ()=>console.log('feed: sync'));
  feed.on('close', ()=>console.log('feed: close'));
  feed.on('ready', ()=>console.log('feed: ready'));
  proto.pipe(socket).pipe(proto);
  socket.on('close', ()=>console.log(`connection closed from ${remoteAddr}`));
}

function exit(msg){
  console.error(msg);
  process.exit(1);
}
