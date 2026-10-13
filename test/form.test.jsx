// rui-core/form's engine: paths, rules, marks, lists, bindings, submit and
// keyed inputs on a root of its own, then forms driving Edits, a TextInput
// and a Checkbox the same way on the DOM and on Skia.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { $root, $read, $flush, $dispose, $scope, $enter, $stop, $memo, $at, $untrack } from 'rrx-core';
import { View, Label, Edit, Action, For, $active } from 'ren-core';
import { Rui, Stack, TextInput, Checkbox } from 'rui-core';
import { $form, EACH, required, length } from 'rui-core/form';
import { both } from './harness.jsx';
import { writeAt } from '../src/form/paths.js';

/** A fresh root per test. */
let R = $root('form');
beforeEach(() => {
  R = $root('form');
});
afterEach(() => $dispose(R));

/** A memo of `read` and how often it ran. @param {() => any} read */
function counted(read) {
  let runs = 0;
  const memo = $memo(R, () => (runs++, read()));
  return { read: () => $read(memo), runs: () => runs };
}

/** A fake event: records its preventDefault. */
const fakeEvent = () => ({ prevented: 0, preventDefault() { this.prevented++; } });

const short = (/** @type {any} */ v) => (typeof v === 'string' && v.length < 3 ? 'Too short' : null);

describe('$form: paths and values', () => {
  it('sets and gets nested paths, tracking one field', () => {
    const form = $form(R, { values: { title: 'Launch', venue: { room: 'A' } } });
    const room = counted(() => form.get('venue.room'));
    assert.equal(room.read(), 'A');
    form.set('title', 'Party');
    assert.equal(room.read(), 'A');
    assert.equal(room.runs(), 1, 'a change of title does not rerun a reader of venue.room');
    form.set('venue.room', (/** @type {string} */ r) => r + 'B');
    assert.equal(room.read(), 'AB');
    assert.equal(room.runs(), 2);
    assert.equal(form.get('venue.floor'), undefined);
    assert.equal(form.get('nothing.here.at.all'), undefined, 'a missing path is undefined, never null');
    assert.equal($at(form.values, ['venue', 'room']), 'AB', 'the store takes $at');
  });

  it('never mutates the old values and makes missing containers', () => {
    const first = { crew: [{ role: 'lead' }], meta: { a: 1 } };
    const form = $form(R, { values: /** @type {any} */ (first) });
    const before = form.get();
    form.set('crew.0.role', 'host');
    assert.equal(first.crew[0].role, 'lead', 'the first values are untouched');
    assert.equal(before.crew[0].role, 'lead');
    assert.equal(form.get().meta, before.meta, 'the rest is shared');
    form.set('crew.3.role', 'late');
    assert.equal(form.get('crew').length, 4, 'a list grows past its end');
    assert.equal(form.get('crew.2'), undefined);
    form.set('fresh.0.name', 'x');
    assert.ok(Array.isArray(form.get('fresh')), 'an index makes a list');
    form.set('box.inner', 1);
    assert.deepEqual(form.get('box'), { inner: 1 }, 'a key makes an object');
  });

  it('merges an object or the result of a function', () => {
    const form = $form(R, { values: { a: 1, b: { c: 2 }, d: 3 } });
    form.merge({ a: 10 });
    assert.deepEqual(form.get(), { a: 10, b: { c: 2 }, d: 3 });
    form.merge((/** @type {any} */ v) => ({ d: v.a + v.d }));
    assert.deepEqual(form.get(), { a: 10, b: { c: 2 }, d: 13 });
  });
});

describe('$form: rules', () => {
  const rules = {
    title: required('Needs a title'),
    venue: { room: short },
    crew: { role: required('Who?') },
  };
  const values = { title: '', venue: { room: 'A' }, crew: [{ role: 'lead' }, { role: '' }] };

  it('nested and list rules give an exact error map', () => {
    const form = $form(R, { values, rules });
    assert.equal(form.valid(), false);
    assert.equal(form.valid('crew.0.role'), true);
    assert.equal(form.valid('crew.1.role'), false);
    assert.deepEqual(form.allErrors(), {}, 'valid() shows nothing');
    const { ok, errors } = form.validate();
    assert.equal(ok, false);
    const expected = { title: 'Needs a title', 'venue.room': 'Too short', 'crew.1.role': 'Who?' };
    assert.deepEqual(errors, expected);
    assert.deepEqual(form.allErrors(), expected);
    assert.equal($at(form.errors, ['venue.room']), 'Too short');
    assert.equal($at(form.errors, ['crew.0.role']), null, "a missing error reads as the store's missing value");
  });

  it("afterError 'check' checks a shown error again on change", () => {
    const form = $form(R, { values, rules });
    form.validate();
    form.set('venue.room', 'B');
    assert.equal(form.allErrors()['venue.room'], 'Too short', 'still failing');
    form.set('venue.room', 'Hall');
    assert.equal(form.allErrors()['venue.room'], undefined, 'cleared when fixed');
    form.set('venue.room', 'C');
    assert.equal(form.allErrors()['venue.room'], undefined, 'no error shown, none checked');
  });

  it('check(path) returns its shape and shows or clears the error', () => {
    const form = $form(R, { values, rules });
    assert.deepEqual(form.check('title'), { ok: false, error: 'Needs a title' });
    assert.deepEqual(form.allErrors(), { title: 'Needs a title' });
    form.set('title', 'Launch');
    assert.deepEqual(form.check('title'), { ok: true, error: null });
    assert.deepEqual(form.check('no.rule'), { ok: true, error: null });
    assert.deepEqual(form.allErrors(), {});
  });

  it('setError by path, map and function; clear', () => {
    const form = $form(R, { values });
    form.setError('title', 'Taken');
    const seen = counted(() => form.allErrors());
    seen.read();
    form.setError('title', 'Taken');
    seen.read();
    assert.equal(seen.runs(), 1, 'the same error is a no-op');
    form.setError('title', false);
    assert.deepEqual(form.allErrors(), {}, 'a no-error value removes it');
    form.setError({ a: 'x', b: null, c: undefined, d: false, e: 0 });
    assert.deepEqual(form.allErrors(), { a: 'x', e: 0 }, 'no-error entries dropped');
    form.setError((/** @type {any} */ now) => ({ ...now, f: 'y' }));
    assert.deepEqual(form.allErrors(), { a: 'x', e: 0, f: 'y' });
    form.clear('a');
    assert.deepEqual(form.allErrors(), { e: 0, f: 'y' });
    form.clear();
    assert.deepEqual(form.allErrors(), {});
  });

  it('a function rule on a list checks the list, not its items', () => {
    const form = $form(R, { values: { tags: ['a'] }, rules: { tags: length(2, Infinity, 'Two tags') } });
    assert.deepEqual(form.check('tags.0'), { ok: true, error: null }, 'no item rule');
    assert.deepEqual(form.check('tags'), { ok: false, error: 'Two tags' });
    form.insert('tags', 'b');
    assert.equal(form.valid(), true);
  });

  it('inherited members are no rules and no data: toString, constructor, __proto__', () => {
    const form = $form(R, { values: { name: 'Ada' }, rules: { name: required('Name') } });
    assert.deepEqual(form.check('toString'), { ok: true, error: null }, 'no rule named toString');
    assert.deepEqual(form.check('constructor'), { ok: true, error: null }, 'no rule named constructor');
    const written = writeAt({}, ['__proto__'], { polluted: true });
    assert.ok(Object.hasOwn(written, '__proto__'), '__proto__ kept as a key of the data');
    assert.equal(Object.getPrototypeOf(written), Object.prototype, 'the prototype untouched');
    assert.equal(/** @type {any} */ ({}).polluted, undefined);
    const deep = writeAt({ a: {} }, ['a', '__proto__', 'x'], 1);
    assert.deepEqual(Object.keys(deep.a), ['__proto__']);
    assert.equal(deep.a.__proto__ === Object.prototype, false);
  });

  it('reads only own keys: a constructor field left out is missing, a __proto__ error survives a list edit', async () => {
    const { runOne } = await import('../src/form/rules.js');
    const { readAt } = await import('../src/form/paths.js');
    assert.equal(runOne({ constructor: required('Required') }, {}, 'constructor'), 'Required', 'no inherited constructor as a value');
    assert.equal(readAt({}, ['toString']), undefined);
    const form = $form(R, { values: { constructor: '', items: ['a'] }, rules: { constructor: required('Required') } });
    assert.deepEqual(form.validate(), { ok: false, errors: { constructor: 'Required' } });
    form.setError('__proto__', 'Odd');
    form.setError('items.0', 'Item');
    form.insert('items', 'b', 0);
    assert.equal(form.allErrors()['items.1'], 'Item', 'the item error moved with its item');
    assert.equal(Object.hasOwn(form.allErrors(), '__proto__'), true, 'the __proto__ mark kept as data');
    assert.equal(form.allErrors().__proto__, 'Odd');
  });

  it('names Object.prototype holds are plain keys everywhere: rules, schemas, errors, bindings', async () => {
    const { fromJSON, fromHTML, toHTML } = await import('rui-core/editor');
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      // Mark types and tags: no such mark.
      assert.equal(toHTML(fromJSON({ blocks: [{ type: 'paragraph', text: 'x', marks: [{ type: name, from: 0, to: 1 }] }] })), '<p>x</p>', `${name}: no mark type`);
      if (/^[a-z]/i.test(name)) {
        assert.equal(toHTML(fromHTML(`<p><${name}>x</${name}></p>`)), '<p>x</p>', `${name}: no mark tag`);
        assert.equal(fromHTML(`<p>&${name};</p>`).blocks[0].text, `&${name};`, `${name}: no entity`);
      }
      // A function schema names no error there.
      const schema = $form(R, { values: {}, rules: () => ({}) });
      assert.deepEqual(schema.check(name), { ok: true, error: null }, `${name}: a schema has no error there`);
      assert.equal(schema.valid(name), true);
      // The errors map keeps the name as data, through setError and allErrors.
      const form = $form(R, { values: {} });
      assert.equal(form.bind(name).error?.(), undefined, `${name}: no error bound before one is set`);
      assert.equal(form.dirty(name), false, `${name}: not dirty`);
      form.setError({ [name]: 'E' });
      assert.equal(Object.hasOwn(form.allErrors(), name), true, `${name}: kept as an own key`);
      assert.equal(form.allErrors()[name], 'E');
      assert.equal(Object.getPrototypeOf(form.allErrors()), Object.prototype, `${name}: the prototype untouched`);
      assert.equal(form.bind(name).error?.(), 'E', `${name}: the bound error`);
    }
  });

  it('names Object.prototype holds are plain keys in patches, chart rows, theme tables and named modals', async () => {
    const { $patch } = await import('rui-core/hooks');
    const { fieldsOf } = await import('../src/ext/charts/shared.jsx');
    const { themeOf, BASE_THEME, colorOf } = await import('rui-core');
    const { breakpointOf } = await import('../src/theme/breakpoints.js');
    const { sized, shadowOf } = await import('../src/theme/resolve.js');
    const { Modals, $modals } = await import('rui-core/modals');
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      // A patch writes the name as data.
      const card = $patch(R, { a: 1 });
      card.set(JSON.parse(`{"${name}": {"admin": true}, "b": 2}`));
      const v = $read(card.value);
      assert.equal(Object.hasOwn(v, name), true, `${name}: patched in as an own key`);
      assert.equal(Object.getPrototypeOf(v), Object.prototype, `${name}: the prototype untouched`);
      // A chart row's field of that name is kept.
      assert.deepEqual(Object.entries(fieldsOf(JSON.parse(`{"${name}": "f", "v": 1}`))), [[name, 'f'], ['v', 1]], `${name}: a row field kept`);
      // Theme tables look the name up as their own entry only.
      assert.equal(colorOf(BASE_THEME, 'light', name), name, `${name}: no theme color`);
      assert.ok(Number.isNaN(breakpointOf(BASE_THEME, name)), `${name}: no breakpoint`);
      assert.equal(sized(BASE_THEME.spacing, name), BASE_THEME.spacing.md, `${name}: no spacing step, the fallback`);
      assert.equal(shadowOf(BASE_THEME, name), undefined, `${name}: no shadow`);
      assert.throws(() => themeOf({ accent: name }), /RUI: accent/, `${name}: no accent`);
      const merged = themeOf(JSON.parse(`{"${name}": {"x": 1}}`));
      assert.equal(Object.hasOwn(merged, name), true, `${name}: an override is the theme's own data`);
      assert.equal(/** @type {any} */ (themeOf()).x, undefined, `${name}: nothing inherits it`);
      // A named modal of that name does not exist.
      /** @type {any[]} */
      const apis = [];
      const Page = () => (apis.push($modals()), null);
      const view = () => (
        <Rui>
          <Modals named={{ demo: () => null }}>
            <Page />
          </Modals>
        </Rui>
      );
      const { dom, dispose } = both(view);
      assert.throws(() => {
        apis[0].showNamed(name);
        $flush(dom.root);
      }, /RUI: no named modal/, `${name}: no named modal`);
      dispose();
    }
  });

  it('names Object.prototype holds are no theme step, color, motion or size anywhere', async () => {
    const { BASE_THEME, themeOf, Badge, Text, Modal, Drawer, List } = await import('rui-core');
    const { variantColors, styleProps, shadesOf } = await import('../src/theme/resolve.js');
    const { durationOf } = await import('../src/theme/motion.js');
    const { easeOf, EASES } = await import('../src/core/misc/tween.js');
    const { presetOf, EFFECTS } = await import('../src/core/misc/collapse.jsx');
    const { languageOf, tokenColor, SYNTAX_LIGHT } = await import('rui-core/snippet');
    const { onDom } = await import('./harness.jsx');
    for (const theme of [BASE_THEME, themeOf({ spacing: { xxl: 48 } })]) {
      for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
        const colors = variantColors(theme, 'light', 'soft', name);
        assert.ok(Object.values(colors).every(v => typeof v === 'string'), `${name}: variant colors are colors`);
        assert.deepEqual(shadesOf(theme, name), shadesOf(theme, undefined), `${name}: the accent's shades`);
        const style = styleProps(theme, 'light', { p: name, m: name, gap: name });
        assert.equal(JSON.stringify(style).includes('function') || Object.values(style).flat().some(v => typeof v === 'function'), false, `${name}: no function in the style`);
        assert.equal(durationOf(name, 190), 190, `${name}: no MOTION preset`);
        assert.equal(easeOf(name), EASES['ease-out'], `${name}: no easing`);
        assert.equal(presetOf(name), EFFECTS.fade, `${name}: no effect`);
        assert.equal(languageOf(name), 'plain', `${name}: no language`);
        assert.equal(tokenColor(SYNTAX_LIGHT, /** @type {any} */ (name)), SYNTAX_LIGHT.text, `${name}: no token color`);
        const dom = onDom(() => (
          <Rui theme={theme}>
            <Badge size={name}>b</Badge>
            <Text size={name}>t</Text>
            <Modal open size={name} portal={false} motion={0}>
              <Text>m</Text>
            </Modal>
            <Drawer open at={name} portal={false} motion={0}>
              <Text>d</Text>
            </Drawer>
            <List marker={name}>
              <List.Item>li</List.Item>
            </List>
          </Rui>
        ));
        const styles = [...dom.document.body.querySelectorAll('[data-ren]')].map((/** @type {any} */ n) => n.getAttribute('style') ?? '').join(' ');
        assert.doesNotMatch(styles, /function|NaN|undefined/, `${name}: Badge, Text, Modal, Drawer and List fall back`);
        const shapes = [...dom.document.body.querySelectorAll('[data-ren="Shape"]')].map((/** @type {any} */ n) => n.innerHTML).join(' ');
        assert.doesNotMatch(shapes, /NaN|undefined/, `${name}: the list marker is drawn`);
        dom.dispose();
      }
    }
  });

  it('a schema function gives the errors for validate and check', () => {
    /** @type {any[]} */
    const calls = [];
    const form = $form(R, {
      values: { a: '', b: 'ok' },
      rules: (/** @type {any} */ v) => (calls.push(v), { a: v.a === '' ? 'Empty' : null, b: false }),
    });
    assert.deepEqual(form.validate(), { ok: false, errors: { a: 'Empty' } });
    assert.deepEqual(form.check('b'), { ok: true, error: null });
    assert.deepEqual(form.check('a'), { ok: false, error: 'Empty' });
    assert.equal(form.valid('b'), true);
    form.set('a', 'x');
    assert.deepEqual(form.allErrors(), {}, "afterError 'check' through the schema");
    const none = $form(R, { values: { a: 1 }, rules: () => null });
    assert.deepEqual(none.validate(), { ok: true, errors: {} });
    assert.equal(calls[0].a, '', 'the schema gets the values');
  });

  it('a rule gets the value, all values and the path', () => {
    /** @type {any[]} */
    const seen = [];
    const form = $form(R, { values: { crew: [{ role: 'x' }] }, rules: { crew: { role: (/** @type {any[]} */ ...args) => (seen.push(args), null) } } });
    form.check('crew.0.role');
    assert.deepEqual(seen[0], ['x', form.get(), 'crew.0.role']);
  });
});

describe('$form: validateOn and afterError', () => {
  it('validateOn.change and blur: true through bind, with each change shape', () => {
    const form = $form(R, {
      values: { username: '', email: '', other: '' },
      rules: { username: short, email: short, other: short },
      validateOn: { change: ['username'], blur: true },
    });
    const user = form.bind('username');
    user.onChange({ value: 'ab' });
    assert.deepEqual(form.allErrors(), { username: 'Too short' }, 'checked on change');
    user.onChange('abc');
    assert.deepEqual(form.allErrors(), {}, 'a plain value');
    const email = form.bind('email');
    email.onChange({ target: { value: 'x' } });
    assert.equal(form.get('email'), 'x', 'a DOM-like event');
    assert.deepEqual(form.allErrors(), {}, 'not listed for change');
    email.onBlur?.();
    assert.deepEqual(form.allErrors(), { email: 'Too short' }, 'blur: true checks every field');
    assert.equal(form.touched('email'), true);
  });

  it("afterError 'clear' and 'keep'", () => {
    const clear = $form(R, { values: { a: '' }, rules: { a: short }, afterError: 'clear' });
    clear.validate();
    clear.set('a', 'b');
    assert.deepEqual(clear.allErrors(), {}, 'cleared though still failing');
    const keep = $form(R, { values: { a: '' }, rules: { a: short }, afterError: 'keep' });
    keep.validate();
    keep.set('a', 'long enough');
    assert.deepEqual(keep.allErrors(), { a: 'Too short' }, 'kept though fixed');
  });
});

describe('$form: touched and dirty', () => {
  it('touches on blur by default, on input when asked; paths cover what is under them', () => {
    const blur = $form(R, { values: { a: { b: 1 } } });
    blur.set('a.b', 2);
    assert.equal(blur.touched(), false);
    blur.bind('a.b').onBlur?.();
    assert.equal(blur.touched('a.b'), true);
    assert.equal(blur.touched('a'), true, 'a prefix covers its fields');
    assert.equal(blur.touched('a.bc'), false);
    assert.equal(blur.touched(), true);
    const input = $form(R, { values: { a: 1 }, touchOn: 'input' });
    input.set('a', 2);
    assert.equal(input.touched('a'), true);
  });

  it('touch, touch(map), untouch; initial marks and errors', () => {
    const form = $form(R, { values: {}, touched: { a: true }, dirty: { b: true }, errors: { a: 'x', b: null, c: false } });
    assert.equal(form.touched('a'), true);
    assert.equal(form.dirty('b'), true);
    assert.deepEqual(form.allErrors(), { a: 'x' });
    form.touch('c', true);
    assert.equal(form.touched('c'), true);
    form.touch('c', false);
    assert.equal(form.touched('c'), false);
    form.touch({ d: true });
    assert.equal(form.touched('a'), false, 'a map replaces every mark');
    assert.equal(form.touched('d'), true);
    form.untouch();
    assert.equal(form.touched(), false);
  });

  it('dirty compares with the clean values; marks win; settle and markDirty', () => {
    const form = $form(R, { values: { a: 1, d: new Date(5), list: [1, 2] } });
    const dirty = counted(() => form.dirty());
    assert.equal(dirty.read(), false);
    form.set('a', 2);
    assert.equal(dirty.read(), true);
    assert.equal(form.dirty('a'), true);
    assert.equal(form.dirty('list'), false);
    form.set('a', 1);
    assert.equal(dirty.read(), false, 'back to the first value is clean');
    form.set('d', new Date(5));
    form.set('list', [1, 2]);
    assert.equal(form.dirty(), false, 'equal by structure and by time');
    form.markDirty({ a: true, list: false });
    assert.equal(form.dirty('a'), true, 'a mark wins');
    form.set('list', [3]);
    assert.equal(form.dirty('list'), false, 'a false mark wins too');
    assert.equal(form.dirty(), true);
    form.settle();
    assert.equal(form.dirty(), false, 'settled: the marks go, the current values are clean');
    form.set('a', 5);
    form.settle({ a: 5, d: new Date(5), list: [3] });
    assert.equal(form.dirty(), false);
    form.reset();
    assert.deepEqual(form.get(), { a: 1, d: new Date(5), list: [1, 2] }, 'settle leaves the reset target');
  });
});

describe('$form: reset and rebase', () => {
  it('reset goes back to the target and clears errors and marks; with an event it prevents it', () => {
    const form = $form(R, { values: { a: 1 }, rules: { a: (/** @type {number} */ v) => (v > 5 ? 'Big' : null) } });
    form.set('a', 9);
    form.validate();
    form.touch('a', true);
    form.markDirty({ a: true });
    form.reset();
    assert.deepEqual(form.get(), { a: 1 });
    assert.deepEqual(form.allErrors(), {});
    assert.equal(form.touched(), false);
    assert.equal(form.dirty(), false);
    form.set('a', 2);
    const event = fakeEvent();
    form.reset(event);
    assert.equal(event.prevented, 1);
    assert.equal(form.get('a'), 1);
  });

  it('rebase moves the target and the clean values, keeping the current ones', () => {
    const form = $form(R, { values: { a: 1 } });
    form.set('a', 2);
    form.rebase({ a: 3 });
    assert.equal(form.get('a'), 2);
    assert.equal(form.dirty(), true);
    form.set('a', 3);
    assert.equal(form.dirty(), false);
    form.set('a', 4);
    form.reset();
    assert.equal(form.get('a'), 3);
  });
});

describe('$form: lists', () => {
  it('insert at 0, at the end and clamped; a missing list starts empty', () => {
    const form = $form(R, { values: /** @type {any} */ ({ items: ['b'] }) });
    form.insert('items', 'a', 0);
    form.insert('items', 'c');
    form.insert('items', 'z', 99);
    form.insert('items', 'first', -4);
    assert.deepEqual(form.get('items'), ['first', 'a', 'b', 'c', 'z']);
    form.insert('fresh', 1);
    assert.deepEqual(form.get('fresh'), [1]);
  });

  it('move, remove and replace, with out-of-range indexes changing nothing', () => {
    const form = $form(R, { values: { items: ['a', 'b', 'c', 'd'] } });
    form.move('items', 0, 2);
    assert.deepEqual(form.get('items'), ['b', 'c', 'a', 'd']);
    form.move('items', 3, 0);
    assert.deepEqual(form.get('items'), ['d', 'b', 'c', 'a']);
    form.remove('items', 1);
    assert.deepEqual(form.get('items'), ['d', 'c', 'a']);
    form.replace('items', 1, 'x');
    assert.deepEqual(form.get('items'), ['d', 'x', 'a']);
    const before = form.get('items');
    form.replace('items', 3, 'y');
    form.replace('items', -1, 'y');
    form.remove('items', 7);
    assert.equal(form.get('items'), before);
  });

  it('errors, touched and dirty marks follow their items; a removed item takes its own', () => {
    const form = $form(R, {
      values: { items: [{ n: '' }, { n: 'b' }, { n: '' }], itemsOther: 1 },
      rules: { items: { n: required('Name') } },
    });
    form.validate();
    form.touch({ 'items.2.n': true, itemsOther: true });
    form.markDirty({ 'items.0': true });
    assert.deepEqual(form.allErrors(), { 'items.0.n': 'Name', 'items.2.n': 'Name' });
    form.insert('items', { n: 'new' }, 0);
    assert.deepEqual(form.allErrors(), { 'items.1.n': 'Name', 'items.3.n': 'Name' });
    assert.equal(form.touched('items.3.n'), true);
    assert.equal(form.touched('itemsOther'), true, 'a key that only starts alike stays');
    assert.equal(form.dirty('items.1'), true);
    form.move('items', 3, 0);
    assert.deepEqual(form.allErrors(), { 'items.0.n': 'Name', 'items.2.n': 'Name' });
    assert.equal(form.touched('items.0'), true);
    form.remove('items', 0);
    assert.deepEqual(form.allErrors(), { 'items.1.n': 'Name' }, "the removed item's error goes");
    assert.equal(form.touched('items'), false, 'and its touched mark');
    assert.equal(form.dirty('items.1'), true);
    form.remove('items', 1);
    assert.deepEqual(form.allErrors(), {});
    assert.equal(form.dirty('items.1'), false);
  });
});

describe('$form: bind', () => {
  it('value and checked accessors; null shows empty, 0 stays', () => {
    const form = $form(R, { values: { name: null, count: 0, ok: 'yes', agree: true } });
    const name = form.bind('name');
    assert.equal(name.value?.(), '');
    assert.equal(form.bind('count').value?.(), 0);
    assert.equal(form.bind('missing').value?.(), '');
    const ok = form.bind('ok', { as: 'checked' });
    assert.equal(ok.checked?.(), false, 'only true is checked');
    assert.equal('value' in ok, false);
    const agree = form.bind('agree', { as: 'checked' });
    assert.equal(agree.checked?.(), true);
    agree.onChange({ target: { checked: false } });
    assert.equal(form.get('agree'), false);
    agree.onChange(true);
    assert.equal(form.get('agree'), true);
    agree.onChange(false);
    assert.equal(form.get('agree'), false);
    agree.onChange({ checked: true });
    assert.equal(form.get('agree'), true);
    form.setError('name', 'Who?');
    assert.equal(name.error?.(), 'Who?');
    assert.equal(form.bind('count').error?.(), undefined);
  });

  it('{ error: false, focus: false } gives only onChange and the value', () => {
    const form = $form(R, { values: { a: '', b: false } });
    assert.deepEqual(Object.keys(form.bind('a', { error: false, focus: false })).sort(), ['onChange', 'value']);
    assert.deepEqual(Object.keys(form.bind('b', { as: 'checked', error: false, focus: false })).sort(), ['checked', 'onChange']);
    assert.deepEqual(Object.keys(form.bind('a')).sort(), ['error', 'onBlur', 'onChange', 'value']);
  });
});

describe('$form: submit', () => {
  it('invalid: onInvalid gets the errors; valid: the handler gets the transformed values', () => {
    /** @type {any[]} */
    const seen = [];
    const form = $form(R, {
      values: { name: '', age: '7' },
      rules: { name: required('Name') },
      transform: (/** @type {any} */ v) => ({ ...v, age: Number(v.age) }),
    });
    const send = form.submit(
      (values, event) => seen.push(['ok', values, event]),
      errors => seen.push(['bad', errors]),
    );
    const event = fakeEvent();
    send(event);
    assert.equal(event.prevented, 1);
    assert.deepEqual(seen, [['bad', { name: 'Name' }]]);
    assert.deepEqual(form.allErrors(), { name: 'Name' }, 'shown');
    form.set('name', 'Ada');
    send();
    assert.deepEqual(seen[1].slice(0, 2), ['ok', { name: 'Ada', age: 7 }]);
    assert.deepEqual(form.output({ name: 'x', age: '2' }), { name: 'x', age: 2 });
  });

  it('busy while an async handler runs, then false after a success or a failure', async () => {
    const form = $form(R, { values: {} });
    /** @type {(() => void)[]} */
    const ends = [];
    /** The handler's promise: the test awaits what the form awaits. @type {Promise<any>} */
    let running = Promise.resolve();
    const send = form.submit(() => (running = new Promise((resolve, reject) => ends.push(resolve, () => reject(new Error('no'))))));
    send();
    assert.equal($read(form.busy), true);
    ends[0]();
    await running;
    await Promise.resolve();
    $flush(R);
    assert.equal($read(form.busy), false);
    // A failing handler: a thenable, so the test holds the rejection the form hands on.
    /** @type {(error: unknown) => unknown} */
    let fail = () => undefined;
    const failing = form.submit(() => ({ then: (/** @type {any} */ _, /** @type {any} */ onFail) => void (fail = onFail) }));
    failing();
    assert.equal($read(form.busy), true);
    assert.throws(() => fail(new Error('no')), /no/, "the handler's error stays visible, not swallowed");
    await Promise.resolve();
    $flush(R);
    assert.equal($read(form.busy), false, 'false after a rejection too');
  });
});

describe('$form: onChange and watch', () => {
  it('onChange once per command with the values and the previous ones', () => {
    /** @type {any[]} */
    const seen = [];
    const form = $form(R, { values: { a: 1, items: [1] }, onChange: (v, p) => seen.push([v, p]) });
    form.set('a', 2);
    assert.deepEqual(seen, [[{ a: 2, items: [1] }, { a: 1, items: [1] }]]);
    form.set('a', 2);
    assert.equal(seen.length, 1, 'no change, no call');
    form.insert('items', 2, 0);
    form.merge({ a: 3 });
    form.reset();
    assert.equal(seen.length, 4, 'one per command');
    form.validate();
    assert.equal(seen.length, 4);
  });

  it('watch calls back after changes of its field only, until its owner ends', () => {
    const form = $form(R, { values: { a: 1, b: 1 } });
    /** @type {any[]} */
    const seen = [];
    const scope = $scope(R);
    $enter(scope, () => form.watch('a', (value, previous) => seen.push([value, previous])));
    $flush(R);
    assert.deepEqual(seen, [], 'not for the initial value');
    form.set('a', 2);
    assert.deepEqual(seen, [[2, 1]]);
    form.set('b', 5);
    assert.deepEqual(seen, [[2, 1]], "not for another field's change");
    $stop(scope);
    form.set('a', 3);
    assert.deepEqual(seen, [[2, 1]], 'stopped with its owner');
  });
});

describe('$form: per root and EACH', () => {
  it('two roots make two forms', () => {
    const other = $root('other');
    const a = $form(R, { values: { x: 1 } });
    const b = $form(other, { values: { x: 1 } });
    a.set('x', 2);
    assert.equal(b.get('x'), 1);
    $dispose(other);
  });

  it('EACH is a symbol; a pattern matches any index, a string one path', () => {
    assert.equal(typeof EACH, 'symbol');
    const form = $form(R, {
      values: { items: [{ name: '', qty: 0, note: '' }, { name: '', qty: 0, note: '' }], other: { x: { name: '' } }, name: '' },
      rules: { items: { name: short, qty: (/** @type {number} */ q) => (q < 1 ? 'One at least' : null), note: short }, other: { x: { name: short } }, name: short },
      validateOn: { change: [['items', EACH, 'name'], 'name', ['other', EACH, 'name']], blur: [['items', EACH, 'qty']] },
    });
    form.set('items.1.name', 'a');
    assert.deepEqual(form.allErrors(), { 'items.1.name': 'Too short' }, 'any index');
    form.set('items.0.note', 'a');
    form.set('other.x.name', 'a');
    assert.deepEqual(form.allErrors(), { 'items.1.name': 'Too short' }, 'EACH never matches a key');
    form.set('name', 'a');
    assert.equal(form.allErrors().name, 'Too short', 'a plain string is exact');
    form.bind('items.0.qty').onBlur?.();
    assert.equal(form.allErrors()['items.0.qty'], 'One at least');
    form.bind('items.0').onBlur?.();
    assert.equal(form.allErrors()['items.0'], undefined, 'a different length does not match');
  });
});

describe('$form: keyed', () => {
  it('bind gives defaults; only the form re-keys, per path and around it', () => {
    const form = $form(R, { values: { name: 'Ada', agree: true, user: { city: 'Lima', zip: '1' }, items: [{ n: 'a' }] }, keyed: true });
    assert.equal(form.keyed, true);
    const name = form.bind('name');
    assert.equal(name.defaultValue, 'Ada');
    assert.equal('value' in name, false);
    assert.equal(form.bind('agree', { as: 'checked' }).defaultChecked, true);
    assert.equal(form.bind('none').defaultValue, '');
    const keys = () => ['name', 'agree', 'user.city', 'user.zip', 'items.0.n'].map(p => form.keyOf(p));
    const tracked = counted(() => form.keyOf('user.city'));
    tracked.read();
    const k0 = keys();
    name.onChange('Bea');
    assert.deepEqual(keys(), k0, 'typing keeps every key');
    form.set('name', 'Cy');
    const k1 = keys();
    assert.notEqual(k1[0], k0[0], 'set re-keys its field');
    assert.deepEqual(k1.slice(1), k0.slice(1), 'and no other');
    form.set('name', 'Di', { remount: false });
    assert.deepEqual(keys(), k1, 'remount: false');
    tracked.read();
    const runs = tracked.runs();
    form.set('user.zip', '2');
    tracked.read();
    assert.equal(tracked.runs(), runs, 'a sibling does not wake the key');
    form.set('user', { city: 'Rome', zip: '2' });
    const k2 = keys();
    assert.notEqual(k2[2], k1[2], 'an ancestor re-keys its fields');
    assert.notEqual(k2[3], k1[3]);
    assert.equal(k2[0], k1[0]);
    form.insert('items', { n: 'b' });
    const k3 = keys();
    assert.notEqual(k3[4], k2[4], 'a list edit re-keys the fields under it');
    assert.deepEqual(k3.slice(0, 4), k2.slice(0, 4));
    form.reset();
    const k4 = keys();
    k4.forEach((k, i) => assert.notEqual(k, k3[i], 'reset re-keys everything'));
    assert.equal(form.bind('name').defaultValue, 'Ada', 'the first value again');
    form.merge({ name: 'Eve' });
    assert.notEqual(form.keyOf('user.zip'), k4[3], 'merge re-keys everything');
  });

  it('not keyed: constant keys', () => {
    const form = $form(R, { values: { a: 1 } });
    const key = form.keyOf('a');
    form.set('a', 2);
    form.reset();
    assert.equal(form.keyOf('a'), key);
    assert.equal(form.bind('a').value?.(), 1);
  });
});

// ---------------------------------------------------------------------------
// On the DOM and on Skia

/** The scene items of a kind (4 Edit, 5 Action), in tree order. @param {any} skia @param {number} kind */
function items(skia, kind) {
  skia.skia.present();
  /** @type {any[]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      if (c.kind === kind) out.push(c);
      walk(c);
    }
  };
  walk(skia.skia.root);
  return out;
}

/** Presses an item on Skia at its center. @param {any} skia @param {any} item */
function tap(skia, item) {
  const r = item.getBoundingClientRect();
  const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
  skia.skia.press(x, y);
  skia.skia.release(x, y);
  $flush(skia.root);
}

/** Types at the end of the i-th Edit on both. @param {any} dom @param {any} skia @param {number} i @param {string} text */
function type(dom, skia, i, text) {
  const node = dom.nodes('Edit')[i];
  for (const ch of text) {
    node.value = node.value + ch;
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
  }
  const edit = items(skia, 4)[i];
  if (skia.skia.focused !== edit) tap(skia, edit);
  skia.skia.key('End');
  for (const ch of text) skia.skia.key(ch);
  $flush(skia.root);
}

/** Focus leaves the i-th Edit on both. @param {any} dom @param {any} skia @param {number} i */
function blur(dom, skia, i) {
  const node = dom.nodes('Edit')[i];
  node.focus();
  node.blur();
  $flush(dom.root);
  const edit = items(skia, 4)[i];
  if (skia.skia.focused !== edit) edit.focus();
  edit.blur();
  $flush(skia.root);
}

/** The same text on both. @param {any} dom @param {any} skia @param {string} expected */
function same(dom, skia, expected) {
  assert.equal(dom.text(), skia.text(), 'the same text on the DOM and on Skia');
  assert.equal(dom.text(), expected);
}

describe('$form on the DOM and on Skia', () => {
  it('Edits bound to a form: typing, change checks, a list insert, submit errors, a fix, dirty', () => {
    /** @type {any[]} */
    const forms = [];
    /** @type {any[]} */
    const sent = [];
    const view = () => {
      const form = $form({
        values: { title: '', items: [{ name: 'Tea' }] },
        rules: { title: required('Needs a title'), items: { name: short } },
        validateOn: { change: [['items', EACH, 'name']] },
      });
      forms.push(form);
      const send = form.submit(values => sent.push(values));
      return (
        <View style={{ padding: 8, gap: 4 }}>
          <Edit {...form.bind('title', { error: false })} />
          <Label>{() => form.bind('title').error?.() ?? 'fine'}</Label>
          <For each={() => form.get('items').map((/** @type {any} */ _, /** @type {number} */ i) => i)}>
            {(/** @type {() => number} */ at) => {
              const i = $untrack($active(), at);
              return (
                <View>
                  <Edit {...form.bind(`items.${i}.name`, { error: false })} />
                  <Label>{() => `item ${i}: ${form.allErrors()[`items.${i}.name`] ?? 'ok'}`}</Label>
                </View>
              );
            }}
          </For>
          <Action onPress={() => form.insert('items', { name: '' })}>Add</Action>
          <Action onPress={() => send()}>Send</Action>
          <Label>{() => (form.dirty() ? 'changed' : 'unchanged')}</Label>
        </View>
      );
    };
    const { dom, skia, dispose } = both(view);
    same(dom, skia, 'fine Tea item 0: ok Add Send unchanged');
    dom.press('Add');
    skia.press('Add');
    same(dom, skia, 'fine Tea item 0: ok item 1: ok Add Send changed');
    type(dom, skia, 2, 'ab');
    same(dom, skia, 'fine Tea item 0: ok ab item 1: Too short Add Send changed');
    dom.press('Send');
    skia.press('Send');
    same(dom, skia, 'Needs a title Tea item 0: ok ab item 1: Too short Add Send changed');
    assert.equal(sent.length, 0);
    type(dom, skia, 0, 'Go');
    type(dom, skia, 2, 'c');
    same(dom, skia, 'Go fine Tea item 0: ok abc item 1: ok Add Send changed');
    blur(dom, skia, 0);
    assert.deepEqual(forms.map(f => f.touched('title')), [true, true]);
    dom.press('Send');
    skia.press('Send');
    assert.deepEqual(sent, [
      { title: 'Go', items: [{ name: 'Tea' }, { name: 'abc' }] },
      { title: 'Go', items: [{ name: 'Tea' }, { name: 'abc' }] },
    ]);
    dispose();
  });

  it('keyed TextInput and Checkbox: typing reaches the form; set and reset re-mount them', () => {
    /** @type {any[]} */
    const forms = [];
    const view = () => {
      const form = $form({ values: { name: 'Ada', agree: false }, keyed: true });
      forms.push(form);
      return (
        <Rui>
          <Stack>
            {() => (form.keyOf('name'), <TextInput label="Name" {...form.bind('name')} />)}
            {() => (form.keyOf('agree'), <Checkbox label="Agree" {...form.bind('agree', { as: 'checked' })} />)}
            <Label>{() => `form ${form.get('name')} ${form.get('agree')}`}</Label>
          </Stack>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const edits = () => {
      $flush(dom.root);
      $flush(skia.root);
      return [dom.nodes('Edit')[0].value, items(skia, 4)[0].draft];
    };
    same(dom, skia, 'Name Ada Agree form Ada false');
    type(dom, skia, 0, 'm');
    assert.deepEqual(edits(), ['Adam', 'Adam']);
    dom.press('Agree');
    skia.press('Agree');
    assert.deepEqual(forms.map(f => [f.get('name'), f.get('agree')]), [['Adam', true], ['Adam', true]], 'typed values reach the form');
    for (const f of forms) f.set('name', 'Bo');
    assert.deepEqual(edits(), ['Bo', 'Bo'], 'set re-mounts the input with the value');
    same(dom, skia, 'Name Bo Agree form Bo true');
    for (const f of forms) f.reset();
    assert.deepEqual(edits(), ['Ada', 'Ada'], 'reset re-mounts with the first value');
    same(dom, skia, 'Name Ada Agree form Ada false');
    const checked = () => [dom.nodes('Action')[0].getAttribute('aria-checked'), items(skia, 5)[0].selected];
    assert.deepEqual(checked(), ['false', false], 'the checkbox re-mounted unchecked');
    dispose();
  });
});
