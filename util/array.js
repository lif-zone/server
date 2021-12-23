'use strict'; /*jslint node:true,browser:true*/
const E = {};
export default E;

E.compact = function(a){ return E.compact_self(a.slice()); };
E.compact_self = function(a){
    var i, j, n = a.length;
    for (i=0; i<n && a[i]; i++);
    if (i==n)
        return a;
    for (j=i; i<n; i++)
    {
        if (!a[i])
            continue;
        a[j++] = a[i];
    }
    a.length = j;
    return a;
};
