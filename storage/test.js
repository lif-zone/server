// author: derry. coder: arik.
import hypercore from 'hypercore';
import xerr from '../util/xerr.js';
import date from '../util/date.js';

function init(){
  var feed = hypercore('/tmp/hypercore_db1', {valueEncoding: 'utf-8'});
  feed.append('line '+date.to_sql_ms(), err=>{
    if (err)
      return console.log('XXX error %o', err);
    xerr.notice('core len %s', feed.length);
    for (let i=0; i<feed.length; i++)
      feed.get(i, (err, data)=>console.log('i %s %s', i, data));
  });
}

init();
