#!/usr/bin/env node
// author: derry. coder: arik.
'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach,afterEach before after*/
// XXX: need jslint mocha: true
import proc from './proc.js';
import etask from './etask.js';
import xutil from './util.js';
import xerr from './xerr.js';
import string from '../util/string.js';
import date from './date.js';
import sprintf from './sprintf.js';
import assert from 'assert';
import assertion from 'assertion';
import net from 'net';
import _ from 'lodash';
import big_object_diff from 'big-object-diff';
const assign = Object.assign;

const E = {};
export default E;

E.currentTest = undefined;
if (xutil.is_mocha())
{
    beforeEach(function(){ E.currentTest = this.currentTest; });
    afterEach(()=>E.currentTest = null);
}
E.currentTest_title = ()=>{
    if (!E.currentTest)
        return '';
    let path = [];
    for (let parent = E.currentTest; parent && !parent.root;
        parent = parent.parent)
    {
        path.unshift(parent.title);
    }
    return path.join(' -> ');
};

let stringify_dates = obj=>_.each(obj, (val, key)=>{
    if (_.isDate(val) && !isNaN(val))
        obj[key] = 'Date Object: '+date.to_sql(val);
    else if (_.isObject(val))
        stringify_dates(val);
});

E.hook_assert = ()=>{
    let AssertionError;
    // avoid forcing running mocha/node with --expose-internals and avoid
    // import AssertionError from 'internal/assert/assertion_error';
    try { assert(false); }
    catch(err){ AssertionError = err.constructor; }
    const print = err=>{
        xerr.flush();
        const stack = new Error().stack;
        let msg = '\n', diff = '';
        msg += stack+'\n';
        if (etask.root.length)
            msg += '\netask '+etask.ps()+'\n';
        if (xutil.is_mocha())
            msg += '*** test '+E.currentTest_title()+' FAILED:\n';
        if (err.message)
            msg += err.message+'\n';
        if (err.operator==='deepEqual'||err.operator=='deepStrictEqual')
        {
            [err.expected, err.actual].forEach(stringify_dates);
            diff = '\ndiff: '
                +big_object_diff.renderDiff(err.expected, err.actual)+'\n';
        }
        msg = sprintf(
            '%s\nexpected: %O\n\nactual:   %O\n%soperator: %s\n',
            msg, err.expected, err.actual, diff, err.operator);
        console.log(msg);
        debugger; // eslint-disable-line no-debugger
    };
    Object.defineProperty(AssertionError.prototype, 'operator', {
      get: function(){ return this._operator; },
      set: function(x){
          this._operator = x;
          try { print(this); }
          catch(e){ console.trace('unknown assert error'); }
          process.exit(1);
      },
    });
};
E.hook_assert();

if (xutil.is_mocha())
    xerr.on_unhandled_exception = err=>assert(false, err);

E.db_conn_str = 'host=127.0.0.1; db=zserver_test';
E.test = (app, test_func, hooks)=>{
    hooks = hooks||{};
    let test_name = (test_func ? test_func.name : '')||'trivial_require_test';
    describe(test_name, ()=>{
    let _app;
    before(()=>etask(function*(){
        if (hooks.before)
            yield hooks.before();
        _app = require(app);
        assert(_app.run);
        if (hooks.port && typeof hooks.port=='function')
            process.env.PORT = yield hooks.port();
        else if (hooks.port)
            process.env.PORT = hooks.port;
        return yield _app.run();
    }));
    after(()=>etask(function*(){
        if (hooks.after)
            yield hooks.after();
        assert(_app.stop);
        return yield _app.stop();
    }));
    /* We need to make sure that at least one test is defined in order for
     * the before/after will be called. */
    it('test_stub', done=>done());
    if (test_func)
        test_func(_app);
    });
};

E.create_test_buffer = ()=>{
    let buf = Buffer.allocUnsafe(256);
    for (let i=0; i<buf.length; i++)
        buf[i] = i;
    return buf;
};

E.seq_fn = expected=>{
    let i = 0, ok = true;
    return val=>{
        if (!_.isEqual(expected[i], val))
        {
            console.log('failed. i:%d res:%j exp:%j', i, val, expected[i]);
            ok = false;
        }
        if (typeof expected[i+1]=='function')
            expected[i+1](!ok ? 'error' : undefined);
        i++;
    };
};

let env_stack = [];
E.env_push = set=>{
    assert(env_stack.length<10, 'already pushed env more than 10');
    env_stack.push(xutil.clone(process.env));
    if (set)
        E.set_clone(process.env, set);
};
E.env_pop = ()=>{
    assert(env_stack.length, 'env not pushed');
    E.set_clone(process.env, env_stack.pop());
};

let argv_stack = [];
E.argv_push = set=>{
    assert(argv_stack.length<10, 'already pushed argv more than 10');
    argv_stack.push(process.argv.slice());
    if (set)
        E.set_clone(process.argv, set);
};
E.argv_pop = ()=>{
    assert(argv_stack.length, 'argv not pushed');
    E.set_clone(process.argv, argv_stack.pop());
};

E.set_clone = (dst, src)=>{
    let i;
    if (dst===src)
        return;
    if (dst instanceof Array)
    {
        dst.length = 0;
        for (i=0; i<src.length; i++)
            dst[i] = src[i];
    }
    else if (dst instanceof Object)
    {
        for (i in dst)
            delete dst[i];
        for (i in src)
            dst[i] = src[i];
    }
    else
        assert(0, 'dst not Array or Object');
};

assert.has = (res, exp)=>{
    try { assertion.assert.has(res, exp); }
    catch(e){ assert(0, ''+e); }
};
assert.zero = (result, message)=>assert.equal(result, 0, message);

let test_prop_changes = [];
let on_test_prop_changed = ()=>{
    let old_val;
    while (old_val = test_prop_changes.pop())
    {
        if (old_val.exist)
            old_val.obj[old_val.prop] = old_val.value;
        else
            delete old_val.obj[old_val.prop];
    }
};
if (xutil.is_mocha())
{
    afterEach(()=>{
        if (test_prop_changes.length)
            on_test_prop_changed();
    });
}

E.r_push_pop_prop = function(obj, prop, val){
    let prev, a = arguments, exist;
    if (prop && typeof prop=='object')
    {
        for (let i in prop)
            E.r_push_pop_prop(obj, i, prop[i]);
        return;
    }
    if (E.currentTest!==undefined)
    {
        test_prop_changes.push({obj, prop, value: obj[prop],
            exist: prop in obj});
        obj[prop] = val;
        return;
    }
    beforeEach(()=>{
        exist = prop in obj;
        prev = obj[prop];
        if (a.length==3)
            obj[prop] = val;
    });
    afterEach(()=>{
        if (test_prop_changes.length)
            on_test_prop_changed();
        if (exist)
            obj[prop] = prev;
        else
            delete obj[prop];
    });
};

E.seq_curr = undefined;
E.seq_init = last=>{
    E.seq_curr = undefined;
    E.seq_last = last;
};
E.seq = function(seq){
    if (seq===false || typeof seq=='string')
        assert(0, typeof seq=='string' ? seq : 'should not get here');
    E.seq_curr = E.seq_curr===undefined ? 0 : E.seq_curr+1;
    for (let i=0; i<arguments.length && (seq = arguments[i])<E.seq_curr; i++);
    assert.equal(seq, E.seq_curr, 'expected seq '+E.seq_curr+', but got '+seq);
    return true;
};
E.seq_uninit = ()=>{
    if (E.seq_curr===undefined)
        return;
    if (E.seq_last!==undefined)
    {
        assert.equal(E.seq_curr, E.seq_last, 'expected seq '+E.seq_last+
            ' at end of test, but got '+E.seq_curr);
        E.seq_last = undefined;
    }
    E.seq_curr = undefined;
};
if (xutil.is_mocha())
{
    beforeEach(()=>{
        E.seq_init();
    });
    afterEach(()=>{
        E.seq_uninit();
    });
    // XXX: add sinon.sandbox.create() and this.sinon.restore()
    // and other settings/restores possible
}

E.assert_no_etasks = ()=>{
    let ps = etask.ps({TIME: 0});
    assert(ps==='root\n', 'etask root not empty:\n'+ps);
};

E.assert_etask_err = et=>etask(function*assert_etask_err(){
    try { yield et; }
    catch(e){ return; }
    assert(0, 'expected etask to fail');
});

E.expect_fn = fn=>(err, res)=>{
    if (err)
        throw err;
    return fn();
};

E.assert_mail_eq = (msg, exp)=>{
    if (exp.subject)
        check_string(msg.subject, exp.subject);
    if (exp.to)
        assert.deepEqual(to_mail_arr(msg.to), to_mail_arr(exp.to));
    if (exp.cc || exp.cc===null)
        assert.deepEqual(to_mail_arr(msg.cc), to_mail_arr(exp.cc));
    if (exp.bcc || exp.bcc===null)
        assert.deepEqual(to_mail_arr(msg.bcc), to_mail_arr(exp.bcc));
    if (exp.html)
    {
        check_string((msg.html||'').replace(/\s+/g, ' ')
            .replace(/<br\/?> ?/g, '<br>\n'), exp.html);
    }
    if (exp.text)
        check_string(msg.text, exp.text);
};

const to_mail_arr = v=>{
    let arr = v==null ? [] : Array.isArray(v) ? v : [v];
    return arr.map(it=>it.replace(/^.* <([^>]+)>$/, '$1')).sort();
};

const check_string = (haystack, checks)=>{
    if (!Array.isArray(checks))
        checks = [checks];
    let normalize = str=>str.replace(/\s+/g, ' ')
        .replace(/ ?<br *\/?> ?/g, '<br>');
    haystack = normalize(haystack);
    for (let check of checks)
    {
        if (typeof check=='string' || check.$not)
        {
            let incl = !check.$not, needle = normalize(check.$not||check);
            assert((haystack||'').includes(needle)==incl, 'expected "'+haystack
                +'" to '+(!incl ? 'not ' : '')+'include "'+needle+'"');
        }
        else
            throw new Error('Invalid string check: '+JSON.stringify(check));
    }
};


E.dir = ()=>{
  throw new Error('test_lib.js dir stub');
/*
    import jtools from './jtools.js';
    let jdir = jtools.local_jdir();
    return jdir.bin||jdir.src;
*/
};

E.get_free_port = ()=>etask(function*get_free_port(){
    let port, wait = etask.wait();
    let server = net.createServer();
    server.on('error', err=>{
        server.close();
        xerr.xexit(err);
    });
    server.on('close', ()=>wait.return());
    server.listen(0, ()=>{
        port = server.address().port;
        server.close();
    });
    yield wait;
    server.removeAllListeners();
    return port;
});

E.etask = (opt, states)=>{
    let seq = E.seq;
    if (Array.isArray(opt) || typeof opt=='function')
    {
        states = opt;
        opt = {};
    }
    if (typeof opt=='number')
        opt = {seq: opt};
    opt = opt||{};
    // don't convert to ES6 generators, since this tests etask itself!
    return etask('xtest.etask', [function(){
        seq(0);
        return etask(Object.assign({name: 'et_call'}, opt), states);
    }, function(res){
        assert(!('err' in opt),
            'got etask ret '+res+', expected err '+opt.err);
        if ('ret' in opt)
        {
            if (typeof opt.ret=='function')
                assert(opt.ret(res), 'ret value mismatch');
            else
                assert.deepEqual(res, opt.ret);
        }
        this.via_res = true;
    }, function catch$(err){
        assert('err' in opt, 'got etask err '+(err.stack||err));
        if (typeof opt.err=='function')
            assert(opt.err(err), 'err value mismatch');
        else if (opt.err!='any')
            assert.deepEqual(err, opt.err);
        this.via_err = true;
    }, function finally$(){
        assert.equal(!!this.via_err, 'err' in opt);
        assert.equal(!!this.via_res, !('err' in opt));
        seq(opt.seq||1);
    }]);
};

E.set = E.r_push_pop_prop;

E.stub_mongo = (mdb, sandbox, stub_opt)=>{
    stub_opt = stub_opt||{};
    let collections = {};
    sandbox.stub(mdb, 'open', coll_name=>etask([()=>{
        return {coll_name, coll: get_coll(coll_name)};
    }]));
    sandbox.stub(mdb, 'find_one', (conn, filter, order, opt)=>etask([()=>{
        conn = ensure_conn(conn);
        let docs = conn.coll.filter(compile_filter(filter));
        return docs.length&&project(docs[0], opt&&opt.fields) || docs[0];
    }]));
    sandbox.stub(mdb, 'find_all', (conn, filter, opt)=>etask([()=>{
        conn = ensure_conn(conn);
        let docs = conn.coll.filter(compile_filter(filter));
        return docs.map(doc=>project(doc, opt&&opt.projection));
    }]));
    sandbox.stub(mdb, 'count', (conn, filter)=>etask([()=>{
        conn = ensure_conn(conn);
        return conn.coll.filter(compile_filter(filter)).length;
    }]));
    sandbox.stub(mdb, 'insert', (conn, doc)=>etask([()=>{
        conn = ensure_conn(conn);
        if (doc._id && conn.coll.some(d=>_.eq(d._id==doc._id)))
            throw new Error('Duplicate id');
        if (!doc._id)
            doc._id = conn.coll_name+'#'+(conn.coll.length+1);
        conn.coll.push(mongo_clone(doc));
        return {insertedIds: [doc._id]};
    }]));
    sandbox.stub(mdb, 'remove', (conn, filter)=>etask([()=>{
        if (!stub_opt.apply_updates)
            return;
        filter = compile_filter(filter);
        conn = ensure_conn(conn);
        collections[conn.coll_name] = conn.coll.filter(doc=>!filter(doc));
    }]));
    sandbox.stub(mdb, 'update', (conn, filter, upd)=>etask([()=>{
        if (!stub_opt.apply_updates)
            return;
        conn = ensure_conn(conn);
        let docs = conn.coll.filter(compile_filter(filter));
        docs.forEach(doc=>{
            _.forEach(upd.$set, (v, k)=>_.set(doc, k.split('.'), v));
            _.forEach(upd.$unset, (v, k)=>{
                k = k.split('.');
                let parent = k.length>1 ? _.get(doc, k.slice(0, -1)) : doc;
                if (parent!=null && typeof parent=='object')
                    delete parent[k[k.length-1]];
            });
        });
    }]));
    sandbox.stub(mdb, 'save', (conn, doc)=>etask([()=>{
        conn = ensure_conn(conn);
        let write_idx;
        if (doc._id)
        {
            for (let i=0; i<conn.coll.length && write_idx==null; i++)
            {
                if (conn.coll[i]._id==doc._id)
                    write_idx = i;
            }
        }
        if (write_idx==null)
            write_idx = conn.coll.length;
        if (!doc._id)
            doc._id = conn.coll_name+'#'+(conn.coll.length+1);
        conn.coll[write_idx] = mongo_clone(doc);
    }]));
    sandbox.stub(mdb, 'ensure_index', ()=>etask([()=>{}]));
    mdb.stub_doc = (coll_name, doc)=>{
        get_coll(coll_name).push(doc);
        return doc;
    };
    mdb.get_stubbed_doc = (coll_name, filter)=>{
        return get_coll(coll_name).find(filter); };
    sandbox.stub(mdb, 'map_reduce', (conn, opt)=>etask([()=>{
        conn = ensure_conn(conn);
        let mapped = {};
        global.emit = (key, val)=>{
            (mapped[key]||(mapped[key] = [])).push(val); };
        conn.coll.filter(compile_filter(opt.query))
            .forEach(doc=>opt.map.apply(doc));
        delete global.emit;
        return Object.keys(mapped).map(key=>({_id: key,
            value: opt.reduce(key, mapped[key])}));
    }]));
    let _restore = sandbox.restore;
    sandbox.restore = function(){
        delete mdb.stub_doc;
        return _restore.apply(this, arguments);
    };
    function ensure_conn(v){
        if (v && v.coll)
            return v;
        v = ''+v;
        return {coll_name: v, coll: get_coll(v)};
    }
    function get_coll(coll_name){
        let coll = collections[coll_name];
        if (!coll)
            coll = collections[coll_name] = [];
        return coll;
    }
    function compile_filter(filter){
        if (filter==null)
            return ()=>1;
        let checks = [];
        let stack = [{path: '', val: filter}];
        let _get = (v, k)=>k=='' ? v : _.get(v, k);
        while (stack.length)
        {
            let obj = stack.pop(), path = obj.path, val = obj.val;
            if (path.charAt(path.lastIndexOf('.')+1)=='$')
            {
                let operator = path.substr(path.lastIndexOf('.')+1);
                path = path.substr(0, path.lastIndexOf('.'));
                if (operator=='$lt')
                    checks.push(doc=>_get(doc, path)<val);
                else if (operator=='$lte')
                    checks.push(doc=>_get(doc, path)<=val);
                else if (operator=='$gt')
                    checks.push(doc=>_get(doc, path)>val);
                else if (operator=='$gte')
                    checks.push(doc=>_get(doc, path)>=val);
                else if (operator=='$ne')
                    checks.push(doc=>_get(doc, path)!==val);
                else if (operator=='$exists')
                {
                    if (val)
                        checks.push(doc=>_get(doc, path)!==undefined);
                    else
                        checks.push(doc=>_get(doc, path)===undefined);
                }
                else if (operator=='$and')
                {
                    let sub_checks = val.map(compile_filter);
                    checks.push(doc=>sub_checks.every(f=>f(doc)));
                }
                else if (operator=='$or')
                {
                    let sub_checks = val.map(compile_filter);
                    checks.push(doc=>sub_checks.some(f=>f(doc)));
                }
                else if (operator=='$in')
                    checks.push(doc=>val.includes(_get(doc, path)));
                else if (operator=='$nin')
                    checks.push(doc=>!val.includes(_get(doc, path)));
                else if (operator=='$elemMatch')
                {
                    let elem_filter = compile_filter(val);
                    checks.push(doc=>{
                        let arr = _get(doc, path);
                        return Array.isArray(arr) && arr.some(elem_filter);
                    });
                }
                else if (operator=='$regex')
                {
                    checks.push(doc=>{
                        let pathv = _get(doc, path);
                        return typeof pathv=='string' && val.test(pathv);
                    });
                }
                else if (operator=='$not' && val instanceof RegExp)
                {
                    checks.push(doc=>{
                        let pathv = _get(doc, path);
                        return typeof pathv!='string' || !val.test(pathv);
                    });
                }
                else if (operator=='$not')
                {
                    let check = compile_filter(val);
                    checks.push(doc=>!check(doc));
                }
                else
                    throw new Error('Operator not supported (yet): '+operator);
            }
            else if (val==null||typeof val!='object')
                checks.push(doc=>_get(doc, path)==val);
            else if (val instanceof mdb.object_id)
            {
                checks.push(doc=>{
                    let doc_val = _get(doc, path);
                    if (doc_val==null)
                        return false;
                    if (doc_val._bsontype=='ObjectID')
                        doc_val = doc_val.id.toString('hex');
                    return ''+doc_val==''+val;
                });
            }
            else
            {
                for (let k in val)
                    stack.push({path: path+(path&&'.'||'')+k, val: val[k]});
            }
        }
        return doc=>checks.every(check=>check(doc));
    }
    function project(doc, prjn){
        if (!prjn)
            return mongo_clone(doc);
        let res = {};
        if (prjn._id!=false && doc._id!=null)
        {
            res._id = _.cloneDeep(doc._id);
            if (res._id && res._id._bsontype=='ObjectID')
                res._id = mdb.object_id(res._id.id.toString('hex'));
        }
        for (let k in prjn)
        {
            let v = _.get(doc, k);
            if (k=='_id' || v===undefined)
                continue;
            _.set(res, k, _.cloneDeep(v));
        }
        return res;
    }
    function mongo_clone(doc){
        doc = _.cloneDeep(doc);
        if (doc._id && doc._id._bsontype=='ObjectID')
            doc._id = mdb.object_id(doc._id.id.toString('hex'));
        return doc;
    }
};

E.stub_req = opt=>{
    let req = {
        query: Object.assign({}, opt&&opt.query),
        headers: {},
        body: opt&&opt.body,
    };
    if (opt&&opt.headers)
    {
        for (let k in opt.headers)
            req.headers[k.toLowerCase()] = opt.headers[k];
    }
    req.get = k=>req.headers[k.toLowerCase()];
    req.zparam = (k, def)=>{
        // eslint-disable-next-line no-prototype-builtins
        if (req.body && req.body[k]!=null && req.body.hasOwnProperty(k))
            return req.body[k];
        return req.query[k]!=null ? req.query[k] : def;
    };
    return req;
};

E.stub_res = sb=>{
    let res = {state: {}, data: {}};
    res.data.headers = {};
    res.status = s=>{
        if (res.state.sent)
            throw new Error('Already sent');
        res.state.status = s;
        return res;
    };
    sb.spy(res, 'status');
    res.send = body=>{
        if (res.state.sent)
            throw new Error('Already sent');
        res.state.status = res.state.status||200;
        if (body!==undefined)
            res.data.body = body;
        res.state.sent = true;
        return res;
    };
    res.json = res.send;
    sb.spy(res, 'send');
    sb.spy(res, 'json');
    res.sendStatus = s=>{
        if (res.state.sent)
            throw new Error('Already sent');
        res.state.status = s;
        res.state.sent = true;
        return res;
    };
    sb.spy(res, 'sendStatus');
    res.redirect = url=>{
        if (res.state.sent)
            throw new Error('Already sent');
        res.state.status = 302;
        res.data.headers.location = url;
        res.state.sent = true;
        return res;
    };
    sb.spy(res, 'redirect');
    let set_header = (k, v)=>res.data.headers[(''+k).toLowerCase()] = ''+v;
    res.set = function(k_or_obj, v){
        if (res.state.sent)
            throw new Error('Already sent');
        if (v===undefined && k_or_obj!=null && typeof k_or_obj=='object')
        {
            for (let k in k_or_obj)
                set_header(k, v);
        }
        else
            set_header(k_or_obj, v);
        return res;
    };
    sb.spy(res, 'set');
    res.end = ()=>{
        if (res.state.sent)
            throw new Error('Already sent');
        res.state.status = res.state.status||200;
        res.state.sent = true;
        return res;
    };
    sb.spy(res, 'end');
    res.cookie = (name, value, opt)=>{
        if (res.state.sent)
            throw new Error('Already sent');
        res.data.cookies = res.data.cookies||{};
        res.data.cookies[name] = {value, opt};
    };
    return res;
};

function throw_invalid(s, i){
  throw new Error('invalid '+s.substr(0, i)+'^^^'+s.substr(i)); }

function assert_invalid(exp, s, i){
  if (!exp)
    throw_invalid(s, i);
}

E.test_parse_cmd_single = function(s){
  let state = 'pre', i, ret={}, cmd_s=0, cmd_e = s.length, arg_s=0, arg_e=0;
  let parentesis = 0, done = false;
  for (i=0; i<s.length && !done; i++)
  {
    let c = s.charAt(i);
    switch (state)
    {
    case 'pre':
      if (string.is_ws(c))
        continue;
      assert_invalid(!'()'.includes(c), s, i);
      state = 'cmd';
      cmd_s = i;
      break;
    case 'cmd':
      assert_invalid(!')'.includes(c), s, i);
      if (string.is_ws(c))
      {
        cmd_e = i;
        done = true;
      }
      else if ('('.includes(c))
      {
        cmd_e = i;
        arg_s = i+1;
        state = 'arg';
        parentesis++;
      }
      break;
    case 'arg':
      if (c=='(')
        parentesis++;
      if (c==')')
        parentesis--;
      assert_invalid(parentesis>=0, s, i);
      if (!parentesis)
      {
        arg_e = i;
        done = true;
      }
      break;
    default: throw new Error('unknown parser error '+s);
    }
  }
  if (state=='pre')
    return;
  assert_invalid(!parentesis, s, i);
  let cmd = ret.cmd = s.substr(cmd_s, cmd_e-cmd_s);
  if (arg_e>arg_s)
  {
    assert_invalid(!cmd.includes(':'), cmd, cmd.indexOf(':'));
    ret.arg = s.substr(arg_s, arg_e-arg_s);
  }
  else if (cmd.includes(':'))
  {
    let m = cmd.match(/(^[^:]+):([^:]+$)/);
    assert_invalid(m, cmd, cmd.lastIndexOf(':'));
    cmd = ret.cmd = m[1];
    ret.arg = m[2];
  }
  ret.meta = {last: i};
  ret.orig = s.substr(cmd_s, i-cmd_s).trim();
  return ret;
};

E.test_parse_cmd_multi = function(s){
  if (!s)
    return [];
  let ret = [], t = E.test_parse_cmd_single(s);
  if (!t)
    return;
  ret.push(t);
  let rest = E.test_parse_cmd_multi(s.substr(t.meta.last));
  if (rest)
    ret = ret.concat(rest);
  return ret;
};

E.test_parse_cmd_multi_level = function(s){
  if (!s)
    return [];
  let ret = [], arg, t = E.test_parse_cmd_single(s);
  if (!t)
    return;
  let meta = t.meta;
  if (t.arg)
    arg = E.test_parse_cmd_multi_level(t.arg);
  ret.push(arg ? {cmd: t.cmd, arg, orig: t.orig, meta} :
    {cmd: t.cmd, orig: t.orig, meta});
  let rest = E.test_parse_cmd_multi_level(s.substr(t.meta.last));
  if (rest)
    ret = ret.concat(rest);
  return ret;
};

E.test_run_plugin = function(a, cb){
  if (!Array.isArray(a))
    return;
  a.forEach(o=>{
    cb(o);
    if (o.arg)
      E.test_run_plugin(o.arg, cb);
  });
  return a;
};

E.parse_cmd_dir = function(s){
  let _d = s.search(/[<>=]/);
  if (_d==-1)
    return {cmd: s};
  let loop = [], dir = s[_d], a='', b='', comma, no_comma, fuzzy;
  let dot_a, dot_b;
  for (let i=0; i<_d+1; i++)
  {
    let ch = s[i];
    if (ch=='~'){
      assert_invalid(!fuzzy, s, i);
      assert_invalid(dir=='>' && i==_d-1 || dir=='<' && !i, s, i);
      fuzzy = true;
      continue;
    }
    assert_invalid(/[a-z,.<>=]/i.test(ch), s, i);
    if (ch=='.'){
      if (b)
        dot_b = true;
      else if (a)
        dot_a = true;
    }
    else if (/[<>=,]/.test(ch))
    {
      if (ch==','){
        assert_invalid(!no_comma, s, i);
        comma = true;
      }
      assert_invalid(a||b, s, i);
      if (loop.length)
      {
        assert_invalid(a&&b, s, i);
        assert_invalid(loop[loop.length-1].s && loop[loop.length-1].d, s, i);
      }
      assert_invalid(dir!='=' || !b, s, i);
      let sd = /[>=]/.test(dir) ? {s: a, d: b, dir} : {s: b, d: a, dir};
      if (dot_a){
        sd.dot = true;
        dot_a = false;
      }
      assert_invalid(!dot_b, s, i);
      loop.push({...sd});
      a = b = '';
    }
    else if (a && b)
    {
      no_comma = true;
      assert_invalid(!comma, s, i);
      assert_invalid(dir!='=' || !b, s, i);
      let sd = /[>=]/.test(dir) ? {s: a, d: b, dir} : {s: b, d: a, dir};
      if (dot_a){
        sd.dot = true;
        dot_a = false;
      }
      if (dot_b){
        dot_a = true;
        dot_b = false;
      }
      loop.push({...sd});
      a = b;
      b = ch;
    }
    else if (!a)
      a = ch;
    else if (!b)
      b = ch;
    else
      assert(false);
  }
  assert_invalid(loop.length, _d);
  if (dir=='<')
    loop.reverse();
  let cmd = s.substr(_d+1), seq = true;
  for (let i=1; seq && i<loop.length; i++){
    if (loop[i-1].dir!=loop[i].dir)
      seq = false;
    else if (loop[i-1].d!=loop[i].s)
      seq = false;
  }
  if (loop.length==1 && fuzzy)
    loop[0].d = loop[0].d+'~';
  return assign(loop.length>1 ? {loop} : loop[0], {cmd, meta: {cmd: s}},
    seq ? {s: loop[0].s, d: loop[loop.length-1].d,
    dir: loop[0].dir} : undefined);
};

E.plugin_cmd_dir = function(o){
  let t = E.parse_cmd_dir(o.cmd);
  let o2 = assign({}, o);
  for (let i in o)
    delete o[i];
  assign(o, t, {arg: o2.arg, orig: o2.orig});
  o.meta = assign(o.meta||{}, o2.meta);
  return o;
};

E.test_parse_rm_meta = function(a){
  return E.test_run_plugin(a, o=>delete o.meta); };

E.test_parse_rm_meta_orig = function(a){
  return E.test_run_plugin(a, o=>{
    delete o.meta;
    delete o.orig;
  });
};

E.test_parse = function(s){
  return E.test_run_plugin(E.test_parse_cmd_multi(s), E.plugin_cmd_dir); };

E.arg_to_val = function(arg){
  if (!arg)
    return true;
  if (arg.length==1 && !arg[0].arg)
    return arg[0].cmd;
  return arg;
};

E.arg_to_obj = function(arg){
  let ret = {};
  arg.forEach(o=>{
    assert(ret[o.cmd]===undefined, 'duplicated arg '+o.cmd);
    if (!o.arg)
      ret[o.cmd] = true;
    else if (o.arg.length==1 && !o.arg[0].arg)
      ret[o.cmd] = o.arg[0].cmd;
    else
      ret[o.cmd] = o.arg;
  });
  return ret;
};

E.arg_to_obj_multi = function(arg){
  let ret = {};
  arg.forEach(o=>{
    assert(ret[o.cmd]===undefined, 'duplicated arg '+o.cmd);
    if (!o.arg)
      ret[o.cmd] = true;
    else if (o.arg.length==1 && !o.arg[0].arg)
      ret[o.cmd] = o.arg[0].cmd;
    else
      ret[o.cmd] = E.arg_to_obj_multi(o.arg);
  });
  return ret;
};

function xerr_cb(level, args){
  assert(level>xerr.L.ERR, 'xerr L.'+xerr.LINV[level]+' in mocha'); }

E.xerr_level = function(level){
  if (level===undefined)
    return xerr.unregister(xerr_cb);
  xerr_cb.level = level;
  xerr.register(xerr_cb);
};

if (xutil.is_mocha())
{
  proc.xexit_init();
  E.xerr_level(xerr.L.ERR);
}
