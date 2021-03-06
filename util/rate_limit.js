// author: derry. coder: arik.
'use strict'; /*zlint node, br*/
const E = rate_limit;
export default E;

function rate_limit(rl, ms, n){
    var now = Date.now();
    if (!rl.count || rl.ts+ms<now)
    {
        rl.count = 1;
        rl.ts = now;
        return true;
    }
    rl.count++;
    return rl.count<=n;
}

E.leaky_bucket = function leaky_bucket(size, rate){
    this.size = size;
    this.rate = rate;
    this.time = Date.now();
    this.level = 0;
};

E.leaky_bucket.prototype.inc = function(inc){
    if (inc===undefined)
        inc = 1;
    var now = Date.now();
    this.level -= this.rate * (now - this.time);
    this.time = now;
    if (this.level<0)
        this.level = 0;
    var new_level = this.level + inc;
    if (new_level>this.size)
        return false;
    this.level = new_level;
    return true;
};
