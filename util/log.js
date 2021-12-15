'use strict'; /*jslint node:true*/
const date = require('./date.js');
module.exports = log;

let log_a = [];

function log(s, o){
  log_a.push(date.to_sql_time_ms()+' '+s);
  console.log(date.to_sql_time_ms()+' '+s, o);
  document.querySelector('#log').innerText = log_a.join('\n');
}

