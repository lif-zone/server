'use strict'; /*jslint node:true*/
const E = {};
export default E;

E.months_long = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
E.months_short = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
    'Sep', 'Oct', 'Nov', 'Dec'];
const months_short_lc = E.months_short.map(function(m){
  return m.toLowerCase(); });

function pad(num, size){ return ('000'+num).slice(-size); }

E.get = date_get;
function date_get(d, _new){
  var y, mon, day, H, M, S, _ms;
  if (d===undefined)
    return new Date();
  if (d==null)
    return new Date(null);
  if (d instanceof Date)
    return _new ? new Date(d) : d;
  if (typeof d=='string')
  {
    var m;
    d = d.trim();
    // check for ISO/SQL/JDate date
    if (m = /^((\d\d\d\d)-(\d\d)-(\d\d)|(\d\d?)-([A-Za-z]{3})-(\d\d(\d\d)?))\s*([\sT](\d\d):(\d\d)(:(\d\d)(\.(\d\d\d))?)?Z?)?$/
      .exec(d))
    {
      H = +m[10]||0; M = +m[11]||0; S = +m[13]||0; _ms = +m[15]||0;
      if (m[2]) // SQL or ISO date
      {
        y = +m[2]; mon = +m[3]; day = +m[4];
        if (!y && !mon && !day && !H && !M && !S && !_ms)
            return new Date(NaN);
        return new Date(Date.UTC(y, mon-1, day, H, M, S, _ms));
      }
      if (m[5]) // jdate
      {
        y = +m[7];
        mon = months_short_lc.indexOf(m[6].toLowerCase())+1;
        day = +m[5];
        if (m[7].length==2)
        {
            y = +y;
            y += y>=70 ? 1900 : 2000;
        }
        return new Date(Date.UTC(y, mon-1, day, H, M, S, _ms));
      }
      // cannot reach here
    }
    // check for string timestamp
    if (/^\d+$/.test(d))
      return new Date(+d);
    // else might be parsed as non UTC!
    return new Date(d);
  }
  if (typeof d=='number')
    return new Date(d);
  throw new TypeError('invalid date '+d);
}
E.to_sql_ms = function(d){
  d = E.get(d);
  if (isNaN(d))
      return '0000-00-00 00:00:00.000';
  return pad(d.getUTCFullYear(), 4)+'-'+pad(d.getUTCMonth()+1, 2)
  +'-'+pad(d.getUTCDate(), 2)
  +' '+pad(d.getUTCHours(), 2)+':'+pad(d.getUTCMinutes(), 2)
  +':'+pad(d.getUTCSeconds(), 2)
  +'.'+pad(d.getUTCMilliseconds(), 3);
};
E.to_sql_sec = function(d){ return E.to_sql_ms(d).slice(0, -4); };
E.to_sql = function(d){
  return E.to_sql_ms(d).replace(/( 00:00:00)?....$/, ''); };
E.to_time_ms = function(d){
  d = E.get(d);
  if (isNaN(d))
      return '00:00:00.000';
  return pad(d.getUTCHours(), 2)+':'+pad(d.getUTCMinutes(), 2)
  +':'+pad(d.getUTCSeconds(), 2)
  +'.'+pad(d.getUTCMilliseconds(), 3);
};

// XXX: add test, optimize for node
E.monotonic = function(){
    let now = Date.now(), last = E.monotonic.last||0;
    if (now < last)
        now = last;
    last = now;
    return now;
};

