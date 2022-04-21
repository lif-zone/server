// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/

const E = {};
export default E;

E.in_range = function(range, id){
  return range.min.compare(range.max)>=0 ?
    id.compare(range.min)>0 || id.compare(range.max)<0 :
    id.compare(range.min)>0 && id.compare(range.max)<0;
};
