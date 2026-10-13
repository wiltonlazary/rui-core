// rui-core/hooks' value hooks: $patch's patches, $model's two modes and
// $validated's validity, on a root of their own (root first), inside a
// component, and driving an Edit the same on the DOM and on Skia.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { $root, $signal, $read, $write, $flush, $dispose, $memo, $effect } from 'rrx-core';
import { View, Label, Edit } from 'ren-core';
import { $patch, $model, $validated } from 'rui-core/hooks';
import { both, onDom } from './harness.jsx';

let R = $root('values');
beforeEach(() => {
  R = $root('values');
});
afterEach(() => $dispose(R));

/** Flushes, then reads. @param {any} node */
const now = node => ($flush(R), $read(node));

/**
 * Runs `fn` in a component on the DOM (the short spelling): its result, and
 * a read that flushes that view's root first.
 * @template T @param {() => T} fn @returns {[T, (node: any) => any, () => void]}
 */
function inView(fn) {
  /** @type {any} */
  let out;
  const dom = onDom(() => void (out = fn()));
  return [out, node => ($flush(dom.root), $read(node)), dom.dispose];
}

describe('$patch', () => {
  it('lays object and function parts over the current keys', () => {
    const card = $patch(R, { name: 'Ada', city: 'Lyon', plan: 'free' });
    card.set({ city: 'Porto' });
    assert.deepEqual(now(card.value), { name: 'Ada', city: 'Porto', plan: 'free' });
    card.set(current => ({ plan: current.plan === 'free' ? 'team' : 'free' }));
    assert.deepEqual(now(card.value), { name: 'Ada', city: 'Porto', plan: 'team' });
  });

  it('removes a key given as undefined', () => {
    /** @type {{ name: string, city?: string, plan: string }} */
    const start = { name: 'Ada', city: 'Lyon', plan: 'free' };
    const card = $patch(R, start);
    card.set({ city: undefined });
    const v = now(card.value);
    assert.deepEqual(v, { name: 'Ada', plan: 'free' });
    assert.equal('city' in v, false);
  });

  it('writes nothing for a part that changes nothing', () => {
    /** @type {{ name: string, city?: string, plan: string }} */
    const start = { name: 'Ada', plan: 'free' };
    const card = $patch(R, start);
    let runs = 0;
    const seen = $memo(R, () => (runs++, $read(card.value)));
    const before = now(seen);
    assert.equal(runs, 1);
    card.set({ name: 'Ada' });
    card.set({ city: undefined });
    card.set(null);
    card.set(() => undefined);
    card.set({});
    assert.equal(now(seen), before, 'the same object');
    assert.equal(runs, 1, 'no reader reran');
    card.set({ plan: 'team' });
    assert.notEqual(now(seen), before);
    assert.equal(runs, 2);
  });

  it('replaces nested objects and never holds the caller\'s object', () => {
    const start = { name: 'Ada', address: { city: 'Lyon', zip: '69001' } };
    const card = $patch(R, start);
    assert.notEqual(now(card.value), start);
    card.set({ address: { city: 'Porto' } });
    assert.deepEqual(now(card.value).address, { city: 'Porto' }, 'one level only');
    assert.deepEqual(start, { name: 'Ada', address: { city: 'Lyon', zip: '69001' } }, 'the caller\'s object is untouched');
  });

  it('takes the short spelling inside a scope', () => {
    const [card, read, dispose] = inView(() => $patch({ plan: 'free' }));
    card.set({ plan: 'team' });
    assert.deepEqual(read(card.value), { plan: 'team' });
    dispose();
  });
});

describe('$model', () => {
  it('controlled by a node: follows the owner, set only tells onChange', () => {
    const volume = $signal(R, 4);
    /** @type {any[][]} */
    const told = [];
    const knob = $model(R, { value: volume, onChange: (v, ...rest) => told.push([v, ...rest]) });
    assert.equal(knob.controlled, true);
    assert.equal(now(knob.value), 4);
    knob.set(7, 'wheel');
    assert.equal(now(knob.value), 4, 'nothing kept here');
    assert.deepEqual(told, [[7, 'wheel']], 'the payload passes');
    $write(volume, 7);
    assert.equal(now(knob.value), 7);
    knob.set(7);
    assert.equal(told.length, 1, 'the value shown now does nothing');
  });

  it('controlled by an accessor and by a plain value', () => {
    const volume = $signal(R, 2);
    /** @type {number[]} */
    const told = [];
    const byAccessor = $model(R, { value: () => $read(volume) * 10, onChange: v => told.push(v) });
    assert.equal(byAccessor.controlled, true);
    assert.equal(now(byAccessor.value), 20);
    $write(volume, 3);
    assert.equal(now(byAccessor.value), 30);
    const byValue = $model(R, { value: 5, onChange: v => told.push(v) });
    assert.equal(byValue.controlled, true);
    byValue.set(6);
    assert.equal(now(byValue.value), 5);
    assert.deepEqual(told, [6]);
  });

  it('uncontrolled: defaultValue, else fallback; null is a real value', () => {
    /** @type {any[]} */
    const told = [];
    const knob = $model(R, { defaultValue: 3, fallback: 0, onChange: v => told.push(v) });
    assert.equal(knob.controlled, false);
    assert.equal(now(knob.value), 3);
    knob.set(9);
    assert.equal(now(knob.value), 9);
    assert.deepEqual(told, [9]);
    knob.set(9);
    assert.deepEqual(told, [9], 'the same value calls nothing');

    assert.equal(now($model(R, { fallback: 0 }).value), 0);
    assert.equal(now($model(R, { defaultValue: null, fallback: 0 }).value), null);
    assert.equal(now($model(R, {}).value), undefined);
  });

  it('takes the short spelling inside a scope', () => {
    const [knob, read, dispose] = inView(() => $model({ defaultValue: 1 }));
    knob.set(2);
    assert.equal(read(knob.value), 2);
    dispose();
  });

  it('drives an Edit the same on the DOM and on Skia', () => {
    /** @type {any[]} */
    const edits = [];
    const view = () => {
      const code = $model({ defaultValue: 'ABCD' });
      return (
        <View>
          <Edit value={code.value} onChange={(/** @type {any} */ e) => code.set(e.value)} ref={(/** @type {any} */ n) => edits.push(n)} />
          <Label>{() => `code ${$read(code.value)}`}</Label>
        </View>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'ABCD code ABCD');
    assert.equal(skia.text(), 'ABCD code ABCD');
    const [domEdit, skiaEdit] = edits;
    domEdit.value = 'ABCD12';
    domEdit.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    skiaEdit.focus();
    skia.skia.type('12');
    $flush(skia.root);
    assert.equal(dom.text(), 'ABCD12 code ABCD12');
    assert.equal(skia.text(), dom.text());
    dispose();
  });
});

describe('$validated', () => {
  const coupon = (/** @type {string} */ v) => /^[A-Z]{4}\d{2}$/.test(v) || 'Four capitals, then two digits';

  it('the first value\'s validity from check, and good kept through a failure', () => {
    const code = $validated(R, 'SAVE10', { check: coupon });
    assert.equal(now(code.valid), true);
    assert.equal(now(code.good), 'SAVE10');
    assert.equal(now(code.reason), null);
    code.set('save');
    assert.equal(now(code.value), 'save');
    assert.equal(now(code.valid), false);
    assert.equal(now(code.good), 'SAVE10', 'kept through a failure');
    assert.equal(now(code.reason), 'Four capitals, then two digits');
    code.set('DEAL25');
    assert.equal(now(code.valid), true);
    assert.equal(now(code.good), 'DEAL25', 'moved by a pass');
    assert.equal(now(code.reason), null);
  });

  it('a failing first value leaves good undefined; a non-string failure has no reason', () => {
    const code = $validated(R, 'nope', { check: coupon });
    assert.equal(now(code.valid), false);
    assert.equal(now(code.good), undefined);
    assert.equal(now(code.reason), 'Four capitals, then two digits');
    const quiet = $validated(R, 'x', { check: v => v.length > 3 });
    assert.equal(now(quiet.valid), false, 'only true passes');
    assert.equal(now(quiet.reason), null);
  });

  it('a stated valid skips check for the first value', () => {
    let calls = 0;
    const check = (/** @type {string} */ v) => (calls++, coupon(v));
    const code = $validated(R, 'draft', { check, valid: true });
    assert.equal(calls, 0);
    assert.equal(now(code.valid), true);
    assert.equal(now(code.good), 'draft');
    code.set('draft');
    assert.equal(calls, 1, 'the same value is checked again');
    assert.equal(now(code.valid), false);
    assert.equal(now(code.good), 'draft');
  });

  it('writes a set in one batch, and only the nodes that change', () => {
    const code = $validated(R, 'SAVE10', { check: coupon });
    let runs = 0;
    $effect(R, () => void (runs++, $read(code.value), $read(code.valid), $read(code.good), $read(code.reason)));
    $flush(R);
    assert.equal(runs, 1);
    code.set('bad');
    assert.equal(runs, 2, 'the batch ran the reader once for four writes');
    let valueRuns = 0;
    const shown = $memo(R, () => (valueRuns++, $read(code.value)));
    now(shown);
    code.set('bad');
    assert.equal(now(shown), 'bad');
    assert.equal(valueRuns, 1, 'the same value is not written again');
    $flush(R);
    assert.equal(runs, 2);
  });

  it('takes the short spelling inside a scope', () => {
    const [code, read, dispose] = inView(() => $validated('A', { check: v => v === 'A' }));
    assert.equal(read(code.valid), true);
    code.set('B');
    assert.equal(read(code.valid), false);
    dispose();
  });
});
