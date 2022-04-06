// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import xutil from '../util/util.js';
import xerr from '../util/xerr.js';
import sprintf from '../util/sprintf.js';

export function dbg_id(id){
  try {
    if (!id)
      return 'no_id';
    if (typeof id!='string')
      id = xutil.buf_to_str(id);
    return id.substr(id.length-3);
  } catch(err){
    xerr('invalid id %s error %s', id, err);
    return 'invalid_id';
  }
}
export function dbg_msg(msg){ return sprintf('%s %s %s %s:%s',
  dbg_sd(msg.from, msg.to), msg.cmd, msg.type, msg.req_id, msg.seq); }

export function dbg_sd(s, d){ return dbg_id(s)+'->'+dbg_id(d); }
