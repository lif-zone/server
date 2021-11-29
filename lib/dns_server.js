import dns2 from 'dns2';
import escapeStringRegexp from 'escape-string-regexp';
const {Packet, TCPClient} = dns2;
import conf from '../server.conf.js';

const E = {};
export default E;

async function resolve_name(name, response){
  // XXX: use UDPClient and fallack to TCPClient
  const resolve = TCPClient({dns: conf.dns_server.dns_server});
  try {
    const result = await resolve(name);
    response.answers = result.answers;
  } catch(err){
    console.log('dns_server: error %o', err);
    // XXX: check how to return error response
  }
  return response;
}

// XXX stop dns:
// sudo systemctl stop systemd-resolved
E.start = ()=>{
  if (E.server)
    throw new Error('dns_server already started');
  const {port, domain, ip} = conf.dns_server;
  let server = E.server = dns2.createServer({udp: true, tcp: true,
    handle: async(request, send, rinfo)=>{
      const [question] = request.questions;
      const {name} = question;
      const rdomain = escapeStringRegexp(domain);
      const r = new RegExp('(^'+rdomain+'$)|(\\.'+rdomain+'$)');
      const response = Packet.createResponseFromRequest(request);
      if (!r.test(name)) // XXX: handle all query types
      {
        // simple dns client to have internet connectivity
        // when running dns server we need to stop local systemd-resolved
        // and system will not have any dns for resolution
        await resolve_name(name, response);
        return send(response);
      }
      response.answers.push({name, type: Packet.TYPE.A, class: Packet.CLASS.IN,
        ttl: 300, address: ip});
      send(response);
    }
  });
  server.on('listening',
    ()=>console.log('dns_server: listen on ports udp:'+port+', tcp:'+port));
  server.on('close', ()=>console.log('dns_server: closed'));
  server.listen({udp: port, tcp: port});

};

E.close = ()=>{
  E.server.close();
  E.server = undefined;
};
