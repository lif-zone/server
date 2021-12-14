'use strict'; /*jslint node:true*/
import Turn from 'node-turn';

const E = {};
export default E;

E.start = function(){
  console.log('turn_server: listen on port 3478');
  E.server = new Turn({authMech: 'long-term',
    credentials: {username: 'password'}});
  E.server.start();
};
