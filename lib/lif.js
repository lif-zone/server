'use strict'; /*jslint node:true, browser:true*/
import uuidv4 from 'uuid';

const E = {};
export default E;

E.new_uuid = ()=>uuidv4();

E.new_node = uuid=>new LIFNode(uuid);

class LIFNode {
  constructor(uuid){
    this.uuid = uuid;
  }
}

/* XXX: API
let self_uuid = localStorage.self_uuid = localStorage.self_uuid || new_uuid();
let node = lif.new_node(self_uuid);
let conn = node.new_conn(remote);
conn.send({msg: ‘hello’});
conn.on(‘message’, e=>conn.send(‘you sent me ‘+e.msg));
node.on(‘connection’, conn=>conn.send(‘hi ‘+conn.uuid));
*/

