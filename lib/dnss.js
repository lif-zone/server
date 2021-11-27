'use strict'; /*jslint node:true*/
import dns2 from 'dns2';
import escapeStringRegexp from 'escape-string-regexp';
const {Packet, TCPClient} = dns2;

const E = {};
export default E;

async function resolve_name(conf, name, response){
  const resolve = TCPClient({dns: conf.ddns});
  try {
    const result = await resolve(name);
    console.log(result.answers);
    response.answers = result.answers;
  } catch(err){
    console.log('ddns: error %o', err);
    // XXX: check how to return error response
  }
  return response;
}

// XXX stop dns:
// sudo systemctl stop systemd-resolved
E.start = (conf)=>{
  if (E.server)
    throw new Error('dnss already started');
  const port = conf.port;
  let server = E.server = dns2.createServer({udp: true, tcp: true,
    handle: async(request, send, rinfo)=>{
      const [question] = request.questions;
      const {name} = question;
      const rdomain = escapeStringRegexp(conf.domain);
      const r = new RegExp('/(^'+rdomain+'$)|(\\.'+rdomain+'$)');
      const response = Packet.createResponseFromRequest(request);
      if (!r.test(name)) // XXX: handle all query types
      {
        await resolve_name(conf, name, response);
        return send(response);
      }
      response.answers.push({name, type: Packet.TYPE.A, class: Packet.CLASS.IN,
        ttl: 300, address: conf.ip});
      send(response);
    }
  });
  server.on('listening',
    ()=>console.log('dnss: listen on ports udp:'+port+', tcp:'+port));
  server.on('close', ()=>console.log('dnss: closed'));
  server.listen({udp: port, tcp: port});

};

E.close = ()=>{
  E.server.close();
  E.server = undefined;
};
