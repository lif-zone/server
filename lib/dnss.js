'use strict'; /*jslint node:true*/
import dns2 from "dns2";
const {Packet} = dns2;

const E = {};
export default E;

// XXX stop dns:
// sudo systemctl stop systemd-resolved
E.start = ()=>{
  if (E.server)
    throw new Error('dnss already started');
  let server = E.server = dns2.createServer({
    udp: true, // XXX: support also
    handle: (request, send, rinfo)=>{
      const response = Packet.createResponseFromRequest(request);
      const [question] = request.questions;
      const {name} = question;
      // https://www.cloudflare.com/learning/dns/dns-records/
      response.answers.push({
        name,
        type: Packet.TYPE.A,
        class: Packet.CLASS.IN,
        ttl: 300,
        address: '127.0.0.1'
      });
      send(response);
    }
  });
  server.on('listening', ()=>{
    console.log('dnss: listening');
  });
  server.on('close', ()=>{
    console.log('dnss: closed');
  });
  server.listen({udp: 5333});

};

E.close = ()=>{
  E.server.close();
  E.server = undefined;
}
