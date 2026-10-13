// Chip.Group's value on the DOM and on Skia: one value or null (a press on
// the chosen chip clears it unless `toggle` is false), or a list in press
// order capped by `max`; `onChange` only on a change.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $write } from 'rrx-core';
import { Rui, Stack, Chip } from 'rui-core';
import { chipGroupApi } from '../src/core/inputs/chip-group.js';
import { both } from './harness.jsx';
import { press, states } from './inputs-harness.jsx';

/** Three chips in a group with `props`. @param {Record<string, any>} props */
const three = props => (
  <Rui>
    <Stack>
      <Chip.Group {...props}>
        <Chip value="a">A</Chip>
        <Chip value="b">B</Chip>
        <Chip value="c">C</Chip>
      </Chip.Group>
    </Stack>
  </Rui>
);

/** Which chips read as checked on the DOM. @param {any} dom */
const checked = dom =>
  dom
    .nodes('Action')
    .filter((/** @type {any} */ n) => n.getAttribute('aria-checked') === 'true')
    .map((/** @type {any} */ n) => n.textContent.trim())
    .join('');

/** Chip.Group apis made inside a view on each renderer. @param {(api: any) => void} use @param {Record<string, any>[]} list */
const inView = (use, ...list) => {
  const { dispose } = both(() => {
    use(list.map(props => chipGroupApi(props)));
    return <Rui />;
  });
  dispose();
};

describe('rui-core Chip.Group value model', () => {
  it('defaults to null single and [] multiple', () => {
    /** @type {any[]} */
    const heard = [];
    const push = (/** @type {any} */ v) => heard.push(v);
    inView(
      ([single, many]) => {
        assert.equal(single.has('a'), false);
        assert.equal(many.has('a'), false);
        many.toggle('b');
        many.toggle('a');
        single.toggle('a');
      },
      { onChange: push },
      { multiple: true, onChange: push },
    );
    assert.deepEqual(heard, [['b'], ['b', 'a'], 'a', ['b'], ['b', 'a'], 'a']);
  });

  it('passes size and disabled through', () => {
    inView(
      ([api]) => {
        assert.equal(api.size, 'lg');
        assert.equal(api.disabled, true);
      },
      { size: 'lg', disabled: true },
    );
  });
});

describe('rui-core Chip.Group on the DOM and on Skia', () => {
  it('single: chooses, moves, clears on the chosen chip', () => {
    const s = states();
    /** @type {any[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => {
      const g = s.make(null);
      return three({ value: g, onChange: (/** @type {any} */ v) => (heard.push(v), $write(g, v)) });
    });
    assert.deepEqual(s.get(), [null, null]);
    press(dom, skia, 'A');
    assert.deepEqual(s.get(), ['a', 'a']);
    assert.equal(checked(dom), 'A');
    press(dom, skia, 'B');
    assert.deepEqual(s.get(), ['b', 'b']);
    press(dom, skia, 'B');
    assert.deepEqual(s.get(), [null, null], 'a press on the chosen chip clears it');
    assert.equal(checked(dom), '');
    assert.deepEqual(heard, ['a', 'a', 'b', 'b', null, null]);
    dispose();
  });

  it('single with toggle={false}: the chosen chip stays chosen, no onChange', () => {
    /** @type {any[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => three({ toggle: false, onChange: (/** @type {any} */ v) => heard.push(v) }));
    press(dom, skia, 'C');
    press(dom, skia, 'C');
    assert.equal(checked(dom), 'C');
    assert.deepEqual(heard, ['c', 'c'], 'one change per renderer, none for the repeat');
    dispose();
  });

  it('single uncontrolled from defaultValue', () => {
    const { dom, skia, dispose } = both(() => three({ defaultValue: 'b' }));
    assert.equal(checked(dom), 'B');
    press(dom, skia, 'A');
    assert.equal(checked(dom), 'A');
    dispose();
  });

  it('multiple: adds and removes in press order', () => {
    const s = states();
    /** @type {any[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => {
      const g = s.make([]);
      return three({ multiple: true, value: g, onChange: (/** @type {any} */ v) => (heard.push(v), $write(g, v)) });
    });
    press(dom, skia, 'C');
    press(dom, skia, 'A');
    assert.deepEqual(s.get(), [['c', 'a'], ['c', 'a']], 'press order');
    press(dom, skia, 'C');
    assert.deepEqual(s.get(), [['a'], ['a']]);
    assert.equal(heard.length, 6);
    dispose();
  });

  it('multiple uncontrolled: [] by default, `max` caps the picks', () => {
    /** @type {any[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => three({ multiple: true, max: 2, onChange: (/** @type {any} */ v) => heard.push(v) }));
    assert.equal(checked(dom), '');
    press(dom, skia, 'A');
    press(dom, skia, 'B');
    press(dom, skia, 'C');
    assert.equal(checked(dom), 'AB', 'a press past max does nothing');
    assert.deepEqual(heard, [['a'], ['a'], ['a', 'b'], ['a', 'b']], 'no onChange past max');
    press(dom, skia, 'A');
    press(dom, skia, 'C');
    assert.equal(checked(dom), 'BC');
    dispose();
  });

  it('controlled: a fixed value stays until its owner takes the change', () => {
    /** @type {any[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => three({ value: 'a', onChange: (/** @type {any} */ v) => heard.push(v) }));
    press(dom, skia, 'B');
    assert.equal(checked(dom), 'A', 'a fixed value stays');
    assert.deepEqual(heard, ['b', 'b']);
    dispose();
  });

  it('a disabled group keeps its value', () => {
    /** @type {any[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => three({ disabled: true, defaultValue: 'a', onChange: (/** @type {any} */ v) => heard.push(v) }));
    press(dom, skia, 'B');
    press(dom, skia, 'A');
    assert.equal(checked(dom), 'A');
    assert.deepEqual(heard, []);
    dispose();
  });
});
