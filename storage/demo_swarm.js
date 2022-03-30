// author: derry. coder: arik.
import Swarm from 'hyperswarm';

start();

async function start(){
  const [seed] = process.argv.slice(2);
  if (seed){
    console.log('running as swarm demo');
    const swarm1 = new Swarm({seed: Buffer.alloc(32).fill(seed)});
    swarm1.on('connection', function(connection, info){
      console.log('swarm 1 got a server connection:',
        connection.remotePublicKey, connection.publicKey,
        connection.handshakeHash);
      connection.on('error', err => console.error('1 CONN ERR:', err));
    });
    console.log('SWARM 1 KEYPAIR:', swarm1.keyPair);
    const key = Buffer.alloc(32).fill(7);
    const discovery1 = swarm1.join(key);
    await discovery1.flushed();
    return;
  }
  console.log('running as standalone swarm demo');
  const swarm1 = new Swarm({seed: Buffer.alloc(32).fill(4)});
  const swarm2 = new Swarm({seed: Buffer.alloc(32).fill(5)});

  console.log('SWARM 1 KEYPAIR:', swarm1.keyPair);
  console.log('SWARM 2 KEYPAIR:', swarm2.keyPair);

  swarm1.on('connection', function(connection, info){
    console.log('swarm 1 got a server connection:',
      connection.remotePublicKey, connection.publicKey,
      connection.handshakeHash);
    connection.on('error', err => console.error('1 CONN ERR:', err));
    // Do something with `connection info` is a PeerInfo object
  });
  swarm2.on('connection', function(connection, info){
    console.log('swarm 2 got a client connection:',
      connection.remotePublicKey, connection.publicKey,
      connection.handshakeHash);
    connection.on('error', err => console.error('2 CONN ERR:', err));
  });
  const key = Buffer.alloc(32).fill(7);
  const discovery1 = swarm1.join(key);
  await discovery1.flushed();
  swarm2.join(key);
  // await swarm2.flush()
  // await discovery.destroy() // Stop lookup up and announcing this topic.
}
