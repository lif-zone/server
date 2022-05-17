// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/

const E = {};
export default E;

// XXX: need test
E.cmp = function(a, b){ return a.compare(b); };

E.in_range = function(range, id){
  return range.min.compare(range.max)>=0 ?
    id.compare(range.min)>0 || id.compare(range.max)<0 :
    id.compare(range.min)>0 && id.compare(range.max)<0;
};
