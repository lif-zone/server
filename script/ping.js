import ping from 'ping';
import etask from '../util/etask.js';
import date from '../util/date.js';

// XXX: make it automatic for all node/browser
process.on('uncaughtException', e=>{
  console.log('uncaughtException %o', e);
  process.exit(-1);
});
process.on('unhandledRejection', e=>{
  console.error('unhandledRejection %o', e);
  process.exit(-1);
});

function init(){
  let host = 'google.com', timeout=500, slow=150, interval=1000, last;
  console.log('ping %s timeout %sms slow %sms interval %sms',
    host, timeout, slow, interval);
  etask(function*(){
    try {
      while (true)
      {
        let res = yield ping.promise.probe(host, {timeout: timeout/1000});
        if (!res.alive || res.time>slow)
        {
          console.log('%s ping %s', date.to_sql_ms(),
            res.alive ? 'SLOW '+res.time+'ms' : 'FAILED');
          last = date.monotonic();
        }
        else if (last)
        {
          console.log('%s ping OK after %ss', date.to_sql_ms(),
            (date.monotonic()-last)/1000);
          last = undefined;
        }
        yield etask.sleep(interval);
      }
    } catch(err){ console.error('ERROR %s', err); }
  });
}

init();
