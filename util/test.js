'use strict'; /*jslint node:true*/ /*global describe,it,beforeEach,afterEach*/
// XXX: need jslint mocha: true
// import etask from './etask.js';
import zutil from './util.js';
import array from './array.js';
import assert from 'assert';
import _ from 'underscore';

const assign = Object.assign;

describe('util', ()=>{
    it('if_set', ()=>{
        let t = (val, o, name, exp)=>{
            zutil.if_set(val, o, name);
            assert.deepEqual(o, exp);
        };
        t(undefined, {}, 'a', {});
        t(false, {}, 'a', {a: false});
        t(0, {}, 'a', {a: 0});
        t('X', {}, 'a', {a: 'X'});
        t('X', {b: 'B'}, 'a', {a: 'X', b: 'B'});
    });
    it('f_mset', ()=>{
        let t = (flags, mask, bits, exp)=>
            assert.strictEqual(zutil.f_mset(flags, mask, bits), exp);
        t(0x1077, 0x00ff, 0x1011, 0x1011);
        t(0x1000abcd, 0x000000ff, 0x00000000, 0x1000ab00);
    });
    it('f_lset', ()=>{
        let t = (flags, bits, logic, exp)=>
            assert.strictEqual(zutil.f_lset(flags, bits, logic), exp);
        t(0x1000, 0x0100, true, 0x1100);
        t(0x1000, 0x0100, false, 0x1000);
        t(0x1001, 0x0101, true, 0x1101);
        t(0x00ffff00, 0x10000001, true, 0x10ffff01);
    });
    it('f_meq', ()=>{
        let t = (flags, bits, mask, exp)=>
            assert.strictEqual(zutil.f_meq(flags, bits, mask), exp);
        t(0x1077, 0x00ff, 0x1077, false);
        t(0x1077, 0x00ff, 0x0077, true);
        t(0x00ffff00, 0x10000000, 0x10000001, false);
        t(0x00ffff00, 0x00110000, 0x00110000, true);
    });
    it('f_eq', ()=>{
        let t = (flags, bits, exp)=>assert.strictEqual(
            zutil.f_eq(flags, bits), exp);
        t(0x1077, 0x00ff, false);
        t(0x1077, 0x0077, true);
        t(0x00ffff00, 0x00ff0ff0, false);
        t(0x00ffff00, 0x00ff0000, true);
    });
    it('f_cmp', ()=>{
        let t = (f1, f2, mask, exp)=>
            assert.strictEqual(zutil.f_cmp(f1, f2, mask), exp);
        t(0x1077, 0x1075, 0x00ff, false);
        t(0x1077, 0xab77, 0x00ff, true);
        t(0x00ffff00, 0x0000ffff, 0x00ff0ff0, false);
        t(0x00ffff00, 0x00ffab00, 0x00ff0000, true);
    });
    it('xor', ()=>{
        let t = (a, b, exp)=>assert.strictEqual(zutil.xor(a, b), exp);
        t({}, 'a', false);
        t(3, false, true);
        t(null, [], true);
        t(false, undefined, false);
    });
    it('div_ceil', ()=>{
        let t = (a, b, exp)=>assert.strictEqual(zutil.div_ceil(a, b), exp);
        t(80, 9, 9);
        t(0, 3, 0);
        t(13.5, 3, 5);
    });
    it('ceil_mul', ()=>{
        let t = (a, b, exp)=>assert.strictEqual(zutil.ceil_mul(a, b), exp);
        t(80, 9, 81);
        t(0, 3, 0);
        t(13.5, 3, 15);
    });
    it('floor_mul', ()=>{
        let t = (a, b, exp)=>assert.strictEqual(zutil.floor_mul(a, b), exp);
        t(80, 9, 72);
        t(0, 3, 0);
        t(13.5, 3, 12);
    });
    it('range', ()=>{
        let t = (x, a, b, exp)=>{
            assert.strictEqual(zutil.range(x, a, b), exp.includes('ii'));
            assert.strictEqual(zutil.range.ii(x, a, b), exp.includes('ii'));
            assert.strictEqual(zutil.range.ie(x, a, b), exp.includes('ie'));
            assert.strictEqual(zutil.range.ei(x, a, b), exp.includes('ei'));
            assert.strictEqual(zutil.range.ee(x, a, b), exp.includes('ee'));
        };
        t(0.9, 1, 10, '');
        t(1, 1, 10, 'ii ie');
        t(1.1, 1, 10, 'ii ie ei ee');
        t(9.9, 1, 10, 'ii ie ei ee');
        t(10, 1, 10, 'ii ei');
        t(10.1, 1, 10, '');
    });
    it('clamp', ()=>{
        let t = (l, v, u, exp)=>assert.strictEqual(zutil.clamp(l, v, u), exp);
        t(1, 0, 3, 1);
        t(1, 1, 3, 1);
        t(1, 2, 3, 2);
        t(1, 3, 3, 3);
        t(1, 4, 3, 3);
    });
    it('revcmp', ()=>{
        assert.equal(zutil.revcmp(0, 1), 1);
        assert.equal(zutil.revcmp(1, 0), -1);
        assert.equal(zutil.revcmp(0, 0), 0);
    });
    it('forEach', ()=>{
        let t = (args, exp)=>{
            let ret = [];
            zutil.forEach(args, function(v, k, _this){
                assert(this==='this');
                ret.push(''+v+k);
            }, 'this');
            assert.strictEqual(ret.join(' '), exp);
        };
        t(['a', 'b'], 'a0 b1');
        t(['a', undefined, 'b'], 'a0 undefined1 b2');
        t({A: 'a', B: 'b'}, 'aA bB');
        function ctor(){ this.a = 1; }
        ctor.prototype.b = 2;
        let o = new ctor();
        t(o, '1a 2b');
        let a = ['a'];
        a[2] = 'c';
        a.x = 'X';
        t(a, 'a0 c2 Xx');
    });
    it('find', ()=>{
        let t = (args, exp)=>{
            let ret = zutil.find(args, function(v, k, _this){
                assert(this==='this');
                return v=='b' || k==4;
            }, 'this');
            assert.strictEqual(ret, exp);
        };
        t(['a', 'b'], 'b');
        t(['a', undefined, 'b'], 'b');
        t(['a', 'B'], undefined);
        t(['a', undefined, 'B', 'c', 'd'], 'd');
        t({A: 'a', B: 'b'}, 'b');
        function ctor(){ this.a = 1; }
        ctor.prototype.b = 'b';
        let o = new ctor();
        t(o, 'b');
        let a = ['a'];
        a[2] = 'c';
        a.x = 'b';
        t(a, 'b');
    });
    it('find_prop', ()=>{
        let t = (obj, prop, val, exp)=>
            assert(zutil.find_prop(obj, prop, val)===exp);
        let o = [{a: 1}, {b: 2}];
        t(o, 'a', 2, undefined);
        t(o, 'b', 2, o[1]);
        t(o, 'b', '2', undefined);
        o = {x: {a: 1}, y: {b: 2}};
        t(o, 'a', 2, undefined);
        t(o, 'b', 2, o.y);
    });
    it('union_with', ()=>{
        let t = (args, exp)=>assert.deepStrictEqual(
            zutil.union_with(...args), exp);
        t([undefined], {});
        let plus = (a, b)=>a + b;
        t([plus], {});
        t([plus, {}], {});
        t([plus, {a: 1}, {a: 2}], {a: 3});
        t([plus, [{a: 1}, {a: 2}]], {a: 3});
        t([plus, {a: 1}, {b: 2}], {a: 1, b: 2});
        t([plus, [{a: 1}, {b: 2}]], {a: 1, b: 2});
        t([plus, {a: 1, b: 2}, {b: 3, c: 4}], {a: 1, b: 5, c: 4});
        t([plus, [{a: 1, b: 2}, {b: 3, c: 4}]], {a: 1, b: 5, c: 4});
        t([plus, {a: 1}, {a: 1}, {a: 1}], {a: 3});
        t([plus, [{a: 1}, {a: 1}, {a: 1}]], {a: 3});
        let first = (a, b)=>a;
        t([first, {a: 1}, {a: 2}], {a: 1});
        t([first, [{a: 1}, {a: 2}]], {a: 1});
        t([first, {a: 1}, {a: 2}, {a: 3}], {a: 1});
        t([first, [{a: 1}, {a: 2}, {a: 3}]], {a: 1});
        let last = (a, b)=>b;
        t([last, {a: 1}, {a: 2}, {a: 3}], {a: 3});
        t([last, [{a: 1}, {a: 2}, {a: 3}]], {a: 3});
    });
    it('clone_deep', ()=>{
        let t = obj=>assert.deepStrictEqual(zutil.clone_deep(obj), obj);
        t(undefined);
        t(null);
        t(1);
        t([1, 5]);
        t([[1, [2, 3, [4]]], 5]);
        t({a: '1', b: '2'});
        t({a: {b: 2, c: 3}, d: 4});
        t([{a: 1, b: [new Date(), 2]}, {c: 3}]);
        t({a: null, b: undefined, c: true});
        t({a: null, b: function(a, w){ return a+'b'+w; }});
    });
    it('extend', ()=>{
        let t = (args, res)=>assert.deepStrictEqual(
            zutil.extend(...args), res);
        t([{}], {});
        t([{a: 1, c: 3}, {a: 2, b: 3}], {a: 2, b: 3, c: 3});
        t([{a: 1}, 0, {b: 2}], {a: 1, b: 2});
        function ctor(){ this.a = 1; }
        ctor.prototype.b = 2;
        let o = new ctor();
        t([{c: 3}, o], {a: 1, b: 2, c: 3});
    });
    it('extend_advanced', ()=>{
        function t0(obj){
            let obj1 = zutil.clone(obj), obj2 = zutil.clone(obj);
            arguments[0] = obj1;
            _.extend.apply(arguments);
            arguments[0] = obj2;
            zutil.extend.apply(arguments);
            assert.deepStrictEqual(obj1, obj2);
            for (let i in obj1)
                assert.strictEqual(obj1[i], obj2[i]);
        }
        let t = (o1, o2)=>{
            t0({}, o1);
            t0({}, o2);
            t0(o1, null);
            t0(null, o1);
            t0(o1, o1);
            t0(o2, o2);
            t0(o1, o2);
            t0(o2, o1);
            t0({}, o1, o2);
            t0({}, o2, o1);
            t0({}, {x: o1, y: o2});
            t0({}, [o1, o2]);
            t0({}, {x: o1, y: o2}, [o1, o2]);
        };
        let objs = {a: {id: 0, val: 0}, b: {id: 1, val: 1}};
        let objs2 = {a: {id: 2, val: 2}, z: {id: 3, v: 3}, d: new Date()};
        let arrs = [{id: 0, val: 0}, {id: 1, val: 1}];
        let arrs2 = [{id: 4, val: 4}, {x: 1, y: 1}, new Array(3)];
        arrs2[10] = 10;
        t(objs, objs2);
        t(objs, arrs);
        t(objs, arrs2);
        t(arrs, arrs2);
    });
    it('extend_deep', ()=>{
        let t = (exp, args)=>assert.deepStrictEqual(
            zutil.extend_deep(...args), exp);
        t({}, [{}]);
        t({a: 2, b: 3, c: 3}, [{a: 1, c: 3}, {a: 2, b: 3}]);
        t({a: {b: 1, c: 2}, d: 4}, [{a: {b: 1}}, {a: {c: 2}, d: 4}]);
        t({a: {b: [2]}}, [{a: {b: [1]}}, {a: {b: [2]}}]);
        function f1(){}
        t(f1, [f1, {a: 't'}]);
        assert.strictEqual(f1.a, undefined);
    });
    it('extend_deep_del_null', ()=>{
        let t = (exp, args)=>
            assert.deepStrictEqual(zutil.extend_deep_del_null(...args), exp);
        t({}, [{}]);
        t({a: 2, b: 3, c: 3}, [{a: 1, c: 3}, {a: 2, b: 3}]);
        t({a: {}, d: 4}, [{a: {b: 1}}, {a: {b: null}, d: 4}]);
        t({d: 4}, [{a: {b: 1}}, {a: null, d: 4}]);
        t({a: {}}, [{a: {b: [1]}}, {a: {b: null}}]);
        t({a: {b: 1}, c: {}}, [{a: {b: 1}}, {c: {d: null}}]);
    });
    it('defaults', ()=>{
        let t = (exp, args)=>assert.deepStrictEqual(
            zutil.defaults(...args), exp);
        t({}, [undefined]);
        t({a: 1}, [{}, {a: 1}]);
        t({a: 1, b: 2}, [{}, {a: 1}, {a: 2, b: 2}]);
        t({a: {}}, [{a: {}}, {a: {b: 2}}]);
        t({a: []}, [{a: []}, {a: [2]}]);
    });
    it('defaults_deep', ()=>{
        let t = (exp, args)=>assert.deepStrictEqual(
            zutil.defaults_deep(...args), exp);
        t(undefined, [undefined]);
        t(1, [undefined, 1]);
        t('1', [undefined, '1']);
        t([], [undefined, []]);
        t({a: 1}, [{}, {a: 1}]);
        t({a: 1, b: 2}, [{}, {a: 1}, {a: 2, b: 2}]);
        t({a: {b: 2}}, [{a: {}}, {a: {b: 2}}]);
        t({a: {}}, [{a: {}}, {a: 1}]);
        t({a: 0}, [{a: 0}, {a: {}}]);
        t({a: []}, [{a: []}, {a: [2]}]);
    });
    it('equal_deep', ()=>{
        let t = (a, b, exp)=>assert.strictEqual(
            zutil.equal_deep(a, b), exp);
        t(undefined, undefined, true);
        t(null, null, true);
        t(null, undefined, false);
        t(null, 0, false);
        t(0, 0, true);
        t(0, undefined, false);
        t('', '', true);
        t('', undefined, false);
        t('', null, false);
        t('', 0, false);
        t('', undefined, false);
        t(Infinity, Infinity, true);
        t({}, {}, true);
        t({a: 1}, {a: 2}, false);
        t({a: {}}, {a: {}}, true);
        t({a: undefined}, {}, false);
        t({}, {a: undefined}, false);
        t({a: 1}, {}, false);
        t({}, {a: 1}, false);
        t({a: 1}, {b: 1}, false);
        t([], [], true);
        t([1], [1], true);
        t([{}], [{}], true);
        t([{}], [{}, undefined], false);
        t(a=>a, a=>a, true);
        t(a=>a, b=>b, false);
        t(new Date('2017-01-01'), new Date('2017-01-01'), true);
        t(new Date('2017-01-01'), new Date('2017-01-02'), false);
        t(/foo/, /foo/, true);
        t(/foo/, /foo/i, false);
        t(/foo/, /bar/, false);
        t(new Set(), new Set(), false);
        let s = new Set();
        t(s, s, true);
    });
    it('clone', ()=>{
        let t = obj=>{
            let res = zutil.clone(obj);
            if (obj instanceof Object)
                assert(res!=obj);
            assert.deepStrictEqual(res, obj);
        };
        t({a: 1, b: 2});
        t([1, 2, 3]);
        t(1);
        t('a');
        t(null);
        t(undefined);
        t({a: null, b: undefined});
    });
    it('clone_advanced', ()=>{
        let _t = obj=>{
            let obj1 = zutil.clone(obj), obj2 = zutil.clone(obj);
            assert.deepStrictEqual(obj1, obj2);
            for (let i in obj1)
                assert.strictEqual(obj1[i], obj2[i]);
        };
        let t = (o, o2)=>{
            _t(o);
            _t({x: o});
            _t([o, 2, 3]);
            _t({x: o, y: [o, o]});
        };
        let objs = {a: {id: 0, val: 0}, b: {id: 1, val: 1}};
        let objs2 = {a: {id: 2, val: 2}, z: {id: 3, v: 3}, d: new Date()};
        let arrs = [{id: 0, val: 0}, {id: 1, val: 1}];
        let arrs2 = [{id: 4, val: 4}, {x: 1, y: 1}, new Array(3)];
        arrs2[10] = 10;
        t(objs);
        t(objs2);
        t(arrs);
        t(arrs2);
        t(null);
        t(1);
        t(undefined);
        t('str');
        t(new Date());
    });
    it('clone_inplace', ()=>{
        let t = (dst, src)=>{
            let res = zutil.clone_inplace(dst, src);
            assert(res===dst);
            assert.deepStrictEqual(dst, src);
        };
        t({a: 1, b: 2}, {x: 3, y: 4});
        t([1, 2, 3], ['a', 'b']);
        t({a: null, b: undefined}, {z: 0});
    });
    it('isxxxxx', ()=>{
        let t = (func, re)=>{
            for (let i = 0; i<256; i++)
            {
                let c = String.fromCharCode(i);
                assert.strictEqual(func(c), re.test(c));
            }
        };
        t(zutil.isalpha, /[a-zA-Z]/);
        t(zutil.isdigit, /\d/);
        t(zutil.isalnum, /[a-zA-Z0-9]/);
    });
    it('map_obj', ()=>{
        let t = (o, fn, exp)=>assert.deepStrictEqual(
            zutil.map_obj(o, fn), exp);
        t({}, x=>x, {});
        t({1: 2, 3: 4}, x=>x+1, {1: 3, 3: 5});
    });
    it('sort_obj', ()=>{
        let t = (o, str)=>{
            if (Object.keys(o).length>1)
                assert.notEqual(JSON.stringify(o), str);
            assert.strictEqual(JSON.stringify(zutil.sort_obj(o)), str);
        };
        let obj = {d: 'd'};
        t(obj, '{"d":"d"}');
        t(assign(obj, {b: 2, c: [2, 1]}), '{"b":2,"c":[2,1],"d":"d"}');
        t(assign(obj, {a: {b: 1, a: 2}}),
            '{"a":{"a":2,"b":1},"b":2,"c":[2,1],"d":"d"}');
    });
    it('obj_pluck', ()=>{
        let o = {a: 1, b: {c: 3}};
        let b = o.b;
        assert(zutil.obj_pluck(o, 'b')===b);
        assert.deepStrictEqual(o, {a: 1});
        assert.deepStrictEqual(b, {c: 3});
    });
    it('proto_keys', ()=>{
        function x(){}
        x.prototype.A = null;
        x.prototype.B = null;
        assert.deepStrictEqual(zutil.proto_keys(x.prototype), ['A', 'B']);
    });
    it('values', ()=>{
        assert.deepStrictEqual(zutil.values({}), []);
        assert.deepStrictEqual(zutil.values({a: 1, b: 2}).sort(), [1, 2]);
        assert.deepStrictEqual(zutil.values({a: 1, b: 1}).sort(), [1, 1]);
    });
    it('path', ()=>{
        let t = (path, exp)=>assert.deepStrictEqual(zutil.path(path), exp);
        t('a.b', ['a', 'b']);
        t(['a', 'b'], ['a', 'b']);
        t('', []);
        t('a.b.0', ['a', 'b', '0']);
        t('a[3].b', ['a[3]', 'b']); // not supported. lodash.js is smarter!
    });
    it('get', ()=>{
        let t = (o, path, exp)=>assert.deepStrictEqual(
            zutil.get(o, path), exp);
        t({a: {b: 1}}, 'a.b', 1);
        t({a: {b: 1}}, ['a', 'b'], 1);
        t({a: {b: 1}}, 'a', {b: 1});
        t({a: {b: 1}}, 'a.b.c', undefined);
        t({b: 1}, 'a.b', undefined);
        t({a: 1}, '', {a: 1});
        t({a: 0}, 'a', 0);
        t(undefined, 'a', undefined);
        t(null, 'a', undefined);
        t(null, '', null);
        t({0: 'a', '[0]': 'b'}, ['[0]'], 'b');
        t({a: 1, b: [{c: 42}]}, 'b.0.c', 42);
        assert.strictEqual(zutil.get({a: 1}, 'b', 'not found'), 'not found');
        let x = function(){};
        x.a = {b: 1};
        t(x, 'a.b', 1);
    });
    it('set', ()=>{
        let t = (o, _path, value, exp)=>{
            let ret = zutil.set(o, _path, value);
            assert.equal(ret, o);
            assert.deepStrictEqual(o, exp);
        };
        t({}, ['a'], 1, {a: 1});
        t({a: 2}, ['a'], 1, {a: 1});
        t({a: {}}, ['a'], 1, {a: 1});
        t({a: {}}, ['a', 'b'], 1, {a: {b: 1}});
        t({}, ['a', 'b'], 1, {a: {b: 1}});
    });
    it('unset', ()=>{
        let t = (o, path, exp)=>{
            zutil.unset(o, path);
            assert.deepStrictEqual(o, exp);
        };
        t({a: 1}, 'a', {});
        t({c: 3}, 'a', {c: 3});
        t({a: {b: 2}}, 'a', {});
        t({a: {b: 2}}, 'a.b', {a: {}});
        t({a: {b: 2, c: 3}}, 'a.b', {a: {c: 3}});
        t({a: {b: {c: 3}}}, 'a.c', {a: {b: {c: 3}}});
        t({a: {b: {c: 3}}}, 'a.b.d', {a: {b: {c: 3}}});
        t({a: {b: {c: 3}}}, 'a.d.c', {a: {b: {c: 3}}});
    });
    it('has', ()=>{
        let t = (o, path, exp)=>assert.strictEqual(zutil.has(o, path), exp);
        t({a: {b: 1}}, 'a.b', true);
        t({a: {b: 1}}, ['a', 'b'], true);
        t({a: {b: 1}}, 'a', true);
        t({b: 1}, 'a.b', false);
        t({a: 1}, '', true);
        t({a: 0}, 'a', true);
        t(undefined, 'a', false);
        t(null, 'a', false);
        t(null, '', true);
    });
    it('bool_lookup', ()=>{
        let t = (val, split, res)=>
            assert.deepStrictEqual(zutil.bool_lookup(val, split), res);
        t([], undefined, {});
        t([1, 2, 'a', 'b'], undefined,
            {1: true, 2: true, a: true, b: true});
        t('1 2\na,b', undefined, {1: true, 2: true, 'a,b': true});
        t('1 2 a,b', ',', {'1 2 a': true, b: true});
    });
    it('inherit_init', ()=>{
        class A {}
        class B extends A {}
        function Inject(){ this.injected_inst_prop = 1; }
        Inject.prototype.injected_proto_prop = 1;
        let obj = new B();
        zutil.inherit_init(obj, Inject);
        assert(obj instanceof A);
        assert(obj instanceof B);
        assert(obj.hasOwnProperty('injected_inst_prop'));
        assert(obj.injected_proto_prop);
    });
    it('pick', ()=>{
        let t = (obj, keys, res)=>
            assert.deepStrictEqual(zutil.pick(obj, ...keys), res);
        t({}, [], {});
        t({a: 1}, [], {});
        t({}, ['a'], {});
        t({a: 1}, ['a'], {a: 1});
        t({a: 1, b: 1}, ['a'], {a: 1});
        t({a: undefined}, ['a'], {a: undefined});
        t({a: null}, ['a'], {a: null});
        t({a: 1, b: 1}, ['a', 'c'], {a: 1});
    });
    it('omit', ()=>{
        let t = (obj, keys, res, mes)=>
            assert.deepStrictEqual(zutil.omit(obj, keys), res, mes);
        t({a: 1, b: 2, c: 3}, ['b'], {a: 1, c: 3},
            'can omit a single named property');
        t({a: 1, b: 2, c: 3}, ['a', 'c'], {b: 2},
            'can omit several named properties');
        t({a: 1, b: 2, c: 3}, ['b', 'c'], {a: 1},
            'can omit properties named in an array');
        t(null, ['a', 'b'], {}, 'non objects return empty object');
        t(void 0, ['a'], {}, 'null/undefined return empty object');
        t(5, ['a', 'b'], {}, 'returns empty object for primitives');
        var obj = function(){};
        obj.prototype = {a: 1, b: 2, c: 3};
        t(new obj(), ['b'], {a: 1, c: 3}, 'include prototype props');
    });
    it('escape_dotted_keys', ()=>{
        let t = (obj, res, msg, repl)=>{
            zutil.escape_dotted_keys(obj, repl);
            assert.deepStrictEqual(obj, res, msg);
        };
        t({a: 1, b: 2, c: 3}, {a: 1, b: 2, c: 3},
            'does not change object when there is no dotted fields');
        t({'a.b.c.d': 1, b: 2, 'c.d': 3}, {a_b_c_d: 1, b: 2, c_d: 3},
            'can replace dotted fields in main object');
        t({'a.b.c.d': {'b.c': 2, a: 3}, b: {'a.b': 1}, 'c.d': 3},
            {'a_b_c_d': {'b_c': 2, a: 3}, b: {'a_b': 1}, 'c_d': 3},
            'can replace dotted fields in main and nested object');
        t([{'a.b.c.d': {'b.c': 2, a: 3}, b: {'a.b': 1}}, {'c.d': 3}],
            [{a_b_c_d: {b_c: 2, a: 3}, b: {a_b: 1}}, {c_d: 3}],
            'can replace dotted fields in array of objects');
        t({arr: [{'a.b.c.d': {'b.c': 2, a: 3}, b: {'a.b': 1}}, {'c.d': 3}]},
            {arr: [{a_b_c_d: {b_c: 2, a: 3}, b: {a_b: 1}}, {c_d: 3}]},
            'can replace dotted fields in nested array of objects');
        t({'a.b.c.d': {'b.c': 2, a: 3}, b: {'a.b': 1}, 'c.d': 3},
            {aabacad: {bac: 2, a: 3}, b: {aab: 1}, cad: 3},
            'can replace dotted fields with repl', 'a');
        t(null, null, 'does nothing on non objects');
    });
});

describe('array', ()=>{
    it('copy', ()=>{
        let t = a=>assert.deepStrictEqual(a, array.copy(a));
        t([]);
        t([1]);
        t([1, 2]);
        t([1, 2, 3]);
        t([1, 2, 3, 4]);
        t([1, 2, 3, 4, 5]);
        t([1, 2, 3, 4, 5, 6]);
        t([3, 2, 1]);
        t([6, 5, 4, 3, 2, 1]);
        t([null]);
        t([undefined]);
        t([1, null, 1]);
        t([1, undefined, 1]);
        t([null, 1, 2]);
        t([undefined, 1, 2]);
        t([1, null]);
        t([1, undefined]);
    });
    it('push', ()=>{
        let t = (args, res)=>{
            let n = array.push(...args);
            assert.deepStrictEqual(args[0], res);
            assert.strictEqual(n, args[0].length);
        };
        t([[]], []);
        t([[], 3, 4], [3, 4]);
        t([[1, 2]], [1, 2]);
        t([[1, 2], 3, 4], [1, 2, 3, 4]);
        t([[]], []);
        t([[], []], []);
        t([[], [3, 4]], [3, 4]);
        t([[1, 2], []], [1, 2]);
        t([[1, 2], [3, 4]], [1, 2, 3, 4]);
        t([[1, 2], [3, 4], [5, 6]], [1, 2, 3, 4, 5, 6]);
        t([[], null], [null]);
        t([[], null, [2]], [null, 2]);
        t([[], undefined], [undefined]);
        t([[], false], [false]);
        t([[], 0], [0]);
        t([[], 'abc'], ['abc']);
        t([[], {a: 'aa'}], [{a: 'aa'}]);
    });
    it('unshift', ()=>{
        let t = (args, res)=>{
            let n = array.unshift(...args);
            assert.deepStrictEqual(args[0], res);
            assert.strictEqual(n, args[0].length);
        };
        t([[]], []);
        t([[], []], []);
        t([[], [3, 4]], [3, 4]);
        t([[1, 2], []], [1, 2]);
        t([[1, 2], [3, 4]], [3, 4, 1, 2]);
        t([[1, 2], [3, 4], [5, 6]], [3, 4, 5, 6, 1, 2]);
        t([[], null], [null]);
        t([[], null, [2]], [null, 2]);
        t([[], undefined], [undefined]);
        t([[], false], [false]);
        t([[], 0], [0]);
        t([[], 'abc'], ['abc']);
        t([[], {a: 'aa'}], [{a: 'aa'}]);
    });
    it('rotate', ()=>{
        let t = (a, n, exp)=>{
            assert.deepStrictEqual(array.rotate(a, n), a); // mutate and return
            assert.deepStrictEqual(a, exp);
        };
        t([], 11, []);
        t([1], 16, [1]);
        t([1, 2, 3, 4], 0, [1, 2, 3, 4]);
        t([1, 2, 3, 4], 1, [2, 3, 4, 1]);
        t([1, 2, 3, 4], 2, [3, 4, 1, 2]);
        t([1, 2, 3, 4], 3, [4, 1, 2, 3]);
        t([1, 2, 3, 4], -4, [1, 2, 3, 4]);
        t([1, 2, 3, 4], -3, [2, 3, 4, 1]);
        t([1, 2, 3, 4], -2, [3, 4, 1, 2]);
        t([1, 2, 3, 4], -1, [4, 1, 2, 3]);
        t([1, 2, 3, 4], 5, [2, 3, 4, 1]);
    });
    it('slice', ()=>{
        let t = (exp, res)=>assert.deepStrictEqual(exp, res);
        t((function(){ return array.slice(arguments); }()), []);
        t((function(){ return array.slice(arguments); }(2)), [2]);
        t((function(){ return array.slice(arguments); }(1, 2, 3)), [1, 2, 3]);
        t((function(){ return array.slice(arguments, 1); }(1, 2, 3)), [2, 3]);
        t((function(){ return array.slice(arguments, 1, 2); }(1, 2, 3)), [2]);
        t((function(){ return array.slice(arguments, 0, -1); }(1, 2, 3)),
            [1, 2]);
    });
    it('compact', ()=>{
        let t = (val, res)=>{
            let n = val.length;
            assert.deepStrictEqual(array.compact(val), res);
            assert.strictEqual(n, val.length);
        };
        t([], []);
        t([1, 'a', 'b'], [1, 'a', 'b']);
        t([0, 1, undefined, 'a', null, 'b', ''], [1, 'a', 'b']);
    });
    it('compact_self', ()=>{
        let t = (val, res)=>{
            assert.deepStrictEqual(array.compact_self(val), res);
            assert.strictEqual(res.length, val.length);
        };
        t([], []);
        t([1, 'a', 'b'], [1, 'a', 'b']);
        t([0, 1, undefined, 'a', null, 'b', ''], [1, 'a', 'b']);
    });
    it('flatten_shallow', ()=>{
        let t = (val, res)=>assert.deepStrictEqual(
            array.flatten_shallow(val), res);
        t([], []);
        t([1, [2, 3], [4, [5, 6]]], [1, 2, 3, 4, [5, 6]]);
    });
    it('flatten', ()=>{
        let t = (val, res)=>assert.deepStrictEqual(array.flatten(val), res);
        t([], []);
        t([1, [2, 3], [4, [5, 6]]], [1, 2, 3, 4, 5, 6]);
    });
    it('unique', ()=>{
        let t = (val, res)=>assert.deepStrictEqual(array.unique(val), res);
        t([], []);
        t([1, 2, 3], [1, 2, 3]);
        t([1, 1], [1]);
        t([1, '1', 1], [1, '1']);
        t([1, 2, 1], [1, 2]);
        t(['svc_lib', 'zutil', 'svc_ipc', 'zutil'], ['svc_lib', 'zutil',
            'svc_ipc']);
    });
    it('to_nl', ()=>{
        let t = (val, sep, res)=>assert.deepStrictEqual(
            array.to_nl(val, sep), res);
        t([], undefined, '');
        t(['a', 'b'], undefined, 'a\nb\n');
        t(['a', 1], '\t', 'a\t1\t');
    });
    it('sed', ()=>{
        let t = (val, regex, replace, res)=>
            assert.deepStrictEqual(array.sed(val, regex, replace), res);
        t(['a', 'bb', 'b'], /b/, 'B', ['a', 'Bb', 'B']);
        t(['a', 'bb', 'b'], /b$/, 'B', ['a', 'bB', 'B']);
        t(['a', 'bb', 'b'], /b/g, 'B', ['a', 'BB', 'B']);
        t(['a', 'bb', 'b'], /^(..)/, 'X$1', ['a', 'Xbb', 'b']);
        let input;
        t(input = ['a'], /a/g, 'A', ['A']);
        assert.strictEqual(input[0], 'a');
    });
    it('grep', ()=>{
        let t = (val, regex, replace, res)=>
            assert.deepStrictEqual(array.grep(val, regex, replace), res);
        t(['a', 'bb', 'b'], /b/, undefined, ['bb', 'b']);
        t(['a', 'bb', 'b'], /b$/, 'B', ['bB', 'B']);
        t(['a', 'bb', 'b'], /b/g, 'B', ['BB', 'B']);
        t(['a', 'bb', 'b'], /^(..)/, 'X$1', ['Xbb']);
        let input;
        t(input = ['a'], /a/g, 'A', ['A']);
        assert.strictEqual(input[0], 'a');
    });
    it('rm_elm', ()=>{
        let t = (a, elm, exp_a, exp_res)=>{
            let res = array.rm_elm(a, elm);
            assert.deepStrictEqual(a, exp_a);
            assert.strictEqual(res, exp_res);
        };
        t([], 1, [], undefined);
        t([1], 1, [], 1);
        t([1], '1', [1], undefined);
        t([1, 2, 1, 2], 1, [2, 1, 2], 1);
        t([1, 2, 1, 2], 2, [1, 1, 2], 2);
        t([1, 2], 2, [1], 2);
    });
    it('rm_elm_tail', ()=>{
        let t = (a, elm, exp_a, exp_res)=>{
            let res = array.rm_elm_tail(a, elm);
            assert.deepStrictEqual(a, exp_a);
            assert.strictEqual(res, exp_res);
        };
        t([], 1, [], undefined);
        t([1], 1, [], 1);
        t([1], '1', [1], undefined);
        t([1, 2, 1, 2], 1, [1, 2, 2], 1);
        t([1, 2, 1, 2], 2, [1, 2, 1], 2);
        t([1, 2], 2, [1], 2);
    });
    it('add_elm', ()=>{
        let t = (a, elm, exp_a, exp_res)=>{
            let res = array.add_elm(a, elm);
            assert.deepStrictEqual(a, exp_a);
            assert.strictEqual(res, exp_res);
        };
        t([], 1, [1], 1);
        t([1], 1, [1], undefined);
        t([1], '1', [1, '1'], '1');
        t([1, 2, 1, 2], 2, [1, 2, 1, 2], undefined);
        t([1, 2], 3, [1, 2, 3], 3);
    });
    it('split_every', ()=>{
        let t = (to, n, exp_res)=>{
            let a = [];
            for (let i=1; i<=to; ++i)
                a.push(i);
            let res = array.split_every(a, n);
            assert.deepStrictEqual(res, exp_res);
        };
        t(0, 1, []);
        t(0, 10, []);
        t(1, 1, [[1]]);
        t(1, 2, [[1]]);
        t(5, 1, [[1], [2], [3], [4], [5]]);
        t(5, 2, [[1, 2], [3, 4], [5]]);
        t(5, 3, [[1, 2, 3], [4, 5]]);
        t(6, 2, [[1, 2], [3, 4], [5, 6]]);
        t(6, 3, [[1, 2, 3], [4, 5, 6]]);
        t(6, 4, [[1, 2, 3, 4], [5, 6]]);
        t(6, 5, [[1, 2, 3, 4, 5], [6]]);
        t(6, 6, [[1, 2, 3, 4, 5, 6]]);
    });
    it('split_at', ()=>{
        let t = (a, exp, delim)=>
            assert.deepStrictEqual(array.split_at(a, delim), exp);
        t(['', '', '', ''], []);
        t(['a', 'b', 'c', 'b', 'd'], [['a'], ['c'], ['d']], 'b');
        t(['a', 'b', 'c', '', 'a', 'b'], [['a', 'b', 'c'], ['a', 'b']]);
        t(['a', '', '', 'c', ''], [['a'], ['c']]);
    });
    it('to_array', ()=>{
        let t = (a, exp_a)=>assert.deepStrictEqual(array.to_array(a), exp_a);
        t(null, []);
        t(undefined, []);
        t(false, [false]);
        t(0, [0]);
        t('', ['']);
        t('hello', ['hello']);
        t({a: 1}, [{a: 1}]);
        t([1, 2, 3], [1, 2, 3]);
    });
    describe('Array.prototype', ()=>{
        before(()=>array.prototype_install());
        after(()=>array.prototype_uninstall());
        it('sed', ()=>{
            let t = (val, regex, replace, res)=>
                assert.deepStrictEqual(val.sed(regex, replace), res);
            t(['a', 'bb', 'b'], /b/, 'B', ['a', 'Bb', 'B']);
            t(['a', 'bb', 'b'], /b$/, 'B', ['a', 'bB', 'B']);
        });
        it('grep', ()=>{
            let t = (val, regex, replace, res)=>
                assert.deepStrictEqual(val.grep(regex, replace), res);
            t(['a', 'bb', 'b'], /b$/, 'B', ['bB', 'B']);
            t(['a', 'bb', 'b'], /b/g, 'B', ['BB', 'B']);
        });
        it('to_nl', ()=>{
            let t = (val, sep, res)=>assert.deepStrictEqual(
                val.to_nl(sep), res);
            t([], undefined, '');
            t(['a', 1], '\t', 'a\t1\t');
        });
        it('push_a', ()=>{
            let t = (val, args, res)=>{
                assert.strictEqual(val.push_a(...args), res.length);
                assert.deepStrictEqual(val, res);
            };
            t([], [null, undefined, '', 3], [null, undefined, '', 3]);
            t([3], [[1, 2], 'string', [null, 4]],
                [3, 1, 2, 'string', null, 4]);
        });
        it('unshift_a', ()=>{
            let t = (val, args, res)=>{
                assert.strictEqual(val.unshift_a(...args), res.length);
                assert.deepStrictEqual(val, res);
            };
            t([], [null, undefined, '', 3], [null, undefined, '', 3]);
            t([3, '1'], [[1, 2], 'str', [null, 4]],
                [1, 2, 'str', null, 4, 3, '1']);
        });
    });
});

