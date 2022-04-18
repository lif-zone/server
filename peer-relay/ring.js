// author: derry. coder: arik.
'use strict'; /*jslint node:true, browser:true*/
import {EventEmitter} from 'events';

export default class Ring extends EventEmitter {
  constructor(opt){
    super();
    if (!opt)
      opt = {};
  }
}
