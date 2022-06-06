// author: derry. coder: arik.
'use strict'; /*jslint node:true*/
import WS, {WebSocketServer} from 'ws';
const E = {};
export default E;

// to enable overloarding Ws for unittest
E.WS = WS;
E.WebSocketServer = WebSocketServer;
