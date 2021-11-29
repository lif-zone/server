'use strict'; /*jslint node:true*/
const env = process.env, DEV = env.DEV;
const E = {
  dns_server: {port: 53, ip: DEV ? '127.0.0.1' : '3.12.37.122', dns: '8.8.8.8',
    domain: 'poc.lif.zone'
  }, http_server: {
    ssl: {key: '/var/lif/ssl/STAR_lif_zone.key',
      cert: '/var/lif/ssl/STAR_lif_zone.crt'}
  },
};

export default E;
