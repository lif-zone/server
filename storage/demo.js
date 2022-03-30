// author: derry. coder: arik.
import hypercore from 'hypercore';
import Swarm from 'hyperswarm';

start();
async function start(){
 const [mode, port, key] = process.argv.slice(2);
  if (['client', 'server'].indexOf(mode)==-1 || !port)
    exit('usage: node index.js [client|server] [PORT] [KEY]');
  const is_client = mode=='client';
  const feed = hypercore(is_client ?
    '/tmp/demo_client' : '/tmp/demo_server', key, {valueEncoding: 'utf8'});
  feed.ready(()=>{
    console.log(`key:  ${feed.key.toString('hex')}`);
    console.log(`dkey: ${feed.discoveryKey.toString('hex')}`);
    if (!is_client){
      console.log('server append len %s', feed.length);
      feed.append('*** '+Date());
      let i=0;
      setInterval(function(){
        i++;
        console.log('feed.append %s', i);
        feed.append('item '+i);
      }, 3000);
    }
  });
  feed.on('error', err=>console.error('feed: error %o', err));
  feed.on('download', ()=>console.log('feed: download len %s', feed.length));
  feed.on('upload', ()=>console.log('feed: upload'));
  feed.on('append', ()=>console.log('feed: append'));
  feed.on('sync', ()=>console.log('feed: sync'));
  feed.on('close', ()=>console.log('feed: close'));
  feed.on('ready', ()=>console.log('feed: ready'));
  console.log('run swarm demo');
  const swarm1 = new Swarm({seed: Buffer.alloc(32).fill(is_client ? 6 : 7)});
  swarm1.on('connection', function(connection, info){
    console.log('swarm 1 got a server connection:',
      connection.remotePublicKey, connection.publicKey,
      connection.handshakeHash);
    onconnection(connection, !is_client);
    connection.on('error', err => console.error('1 CONN ERR:', err));
  });
  console.log('SWARM 1 KEYPAIR:', swarm1.keyPair);
  const topic = Buffer.alloc(32).fill(8);
  const discovery1 = swarm1.join(topic);
  await discovery1.flushed();

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
    socket.on('close',
      ()=>console.log(`connection closed from ${remoteAddr}`));
  }
}

function exit(msg){
  console.error(msg);
  process.exit(1);
}
