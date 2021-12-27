'use strict'; /*zlint node*/
const E = {};
export default E;
const assign = Object.assign;

var token_re = /\(|\)|(\\.|[^()])+/g;
var unesc_table = {r: '\r', n: '\n', t: '\t'};
var esc_table = {'\r': '\\r', '\n': '\\n', '\t': '\\t', '(': '\\(',
    ')': '\\)'};
E.from_str = function(set, opt){
    token_re.lastIndex = 0; // reset sticky global
    var toks = set.match(token_re), result = {}, stack = [result], tok;
    var new_elm = false;
    opt = assign({remove_top: true, remove_empty: true}, opt);
    function remove_empty_elements(res){
        if (typeof res!='object')
            return false;
        if (!Object.keys(res).length)
            return true;
        for (var i in res)
        {
            if (remove_empty_elements(res[i]))
                res[i] = null;
        }
    }
    var i;
    for (i=0; i<toks.length; i++)
    {
        tok = toks[i];
        var ne = {};
        switch (tok[0])
        {
        default:
            if (!(tok = tok.replace(/^\s+/, '').replace(/\s+$/, '')))
                continue;
            if (!new_elm)
                throw 'Unexpected element '+tok;
            var remove = tok[0]==='-';
            tok = tok.replace(/\\(.)/g, function(tok, m){
                return unesc_table[m[0]] || m[0]; });
            if (remove)
                delete stack[0][tok.slice(1)];
            else
                stack[0][tok] = ne;
            stack.unshift(ne);
            new_elm = false;
            break;
        case '(':
            if (new_elm)
            {
                stack[0][''] = ne;
                stack.unshift(ne);
            }
            new_elm = true;
            break;
        case ')':
            if (new_elm)
            {
                /* Handle the case of () e.g.: ((a())) */
                stack[0][''] = ne;
                new_elm = false;
            }
            else
            {
                var j, k, l;
                if (opt.normalize)
                {
                    for (j in stack[0])
                    {
                        if ((k=Object.keys(stack[0][j])).length==1
                            && typeof (l=stack[0][j][k[0]])=='object'
                            && !Object.keys(l).length)
                        {
                            stack[0][j] = k[0];
                        }
                    }
                }
                stack.shift();
            }
            break;
        }
    }
    if (stack.length!=1)
        throw 'Extra '+(stack.length-1)+' elements';
    if (opt.remove_empty)
        remove_empty_elements(result);
    if (!opt.remove_top)
        return result;
    for (i in result) /* strip the 1st level */
        return result[i];
};

E.escape = function(val){
    return val.replace(/[\r\n\t()]/g, function(m){ return esc_table[m]; }); };

E.to_str = function(json, opt){
    opt = assign({wrap: true}, opt);
    var res = opt.wrap ? '(' : '';
    function json2set_str(json){
        if (json===undefined)
            return;
        if (typeof json!='object')
            return res += '('+E.escape(''+json)+')';
        for (var i in json)
        {
            res += '('+E.escape(i);
            json2set_str(json[i]);
            res += ')';
        }
    }
    json2set_str(json);
    return res+(opt.wrap ? ')' : '');
};

E.cmp = function(a, b){
    var a_num = /^[1-9][0-9]*$/.test(a);
    var b_num = /^[1-9][0-9]*$/.test(b);
    if (a_num && b_num)
    {
        return a.length!=b.length ? a.length-b.length :
            a<b ? -1 : a>b ? 1 : 0;
    }
    if (!a_num !== !b_num)
        return !!a_num - !!b_num;
    return a>b ? 1 : a<b ? -1 : 0;
};

E.get_val = function(set){
    var val, i;
    for (i in set)
    {
        if (val===undefined || E.cmp(val, i)>0)
            val = i;
    }
    return val;
};

E.cd = function(set){
    var i;
    for (i=1; i<arguments.length; i++)
    {
        if (!(set instanceof Object))
            return null;
        set = set[arguments[i]];
    }
    return set;
};
E.get_null = function(set){
    set = E.cd.apply(null, arguments);
    return set ? E.get_val(set) : null;
};

E.get = function(set){
    return E.get_null.apply(set, arguments) || ''; };
