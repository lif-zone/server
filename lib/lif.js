'use strict'; /*jslint node:true*/

const E = {};
module.exports = E;

/* XXX: API
let self_uuid = localStorage.self_uuid = localStorage.self_uuid || new_uuid();
let node = lif.new_node(self_uuid);
let conn = node.new_conn(remote);
conn.send({msg: ‘hello’});
conn.on(‘message’, e=>conn.send(‘you sent me ‘+e.msg));
node.on(‘connection’, conn=>conn.send(‘hi ‘+conn.uuid));
*/

