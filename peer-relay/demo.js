// author: derry. coder: arik.
import Node from './client.js';
import {LocalStorage} from 'node-localstorage';

const localStorage = new LocalStorage('/var/lif/demo_local_storage');

start();
async function start(){
  console.log('XXX load %s', localStorage.getItem('xxx'));
  localStorage.setItem('xxx', ''+Date.now());
  console.log('XXX new %s', localStorage.getItem('xxx'));
}

