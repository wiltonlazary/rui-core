// rui-core/more, interactive goodies: JsonTree and Compare on the
// DOM and on Skia, the same presses, keys and drags, the same state.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Rui, Text, Clock, manualClock } from 'rui-core';
import { $flush, $signal, $write, $read } from 'rrx-core';
import { $active, View } from 'ren-core';
import { JsonTree, Compare } from 'rui-core/more';
import { both } from './harness.jsx';
import { primitives, drag, mirror, pressLabel, keyOn } from './more-harness.jsx';

describe('JsonTree on the DOM and on Skia', () => {
  const data = { name: 'rui', version: 1, tags: ['ui', 'portable'], meta: { ok: true, none: null } };

  it('shows the root level expanded, colors values by type, expands and collapses nodes', () => {
    /** @type {any[]} */
    const toggles = [];
    const view = () => (
      <Rui>
        <JsonTree data={data} onExpandedChange={(/** @type {string[]} */ ids, /** @type {{ path: any[], open: boolean }} */ c) => toggles.push(`${c.path.join('.')}:${c.open}:${ids.join('|')}`)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 400 });
    assert.equal(dom.text(), 'root: { "name": "rui" "version": 1 "tags": […] 2 items "meta": {…} 2 items }');
    assert.equal(skia.text(), dom.text());
    pressLabel(dom, skia, 'tags');
    assert.equal(dom.text(), 'root: { "name": "rui" "version": 1 "tags": [ 0: "ui" 1: "portable" ] "meta": {…} 2 items }');
    assert.equal(skia.text(), dom.text());
    keyOn(dom, skia, 'meta', 'ArrowRight');
    assert.match(dom.text(), /"meta": \{ "ok": true "none": null \} \}$/);
    assert.equal(skia.text(), dom.text());
    keyOn(dom, skia, 'tags', 'ArrowLeft');
    assert.match(dom.text(), /"tags": \[…\] 2 items/);
    assert.equal(skia.text(), dom.text());
    // Each toggle tells the expanded ids after it ('' the root), on each renderer.
    assert.deepEqual(toggles, ['tags:true:|tags', 'tags:true:|tags', 'meta:true:|tags|meta', 'meta:true:|tags|meta', 'tags:false:|meta', 'tags:false:|meta']);
    // Colors: a string green, a number blue (the light scheme shades).
    const color = (/** @type {string} */ text) => primitives(skia).find(i => i.kind === 5 && i.first?.caption === text)?.style.color;
    assert.equal(color('"rui"'), 0xff05803a);
    assert.equal(color('1'), 0xff006bc1);
    dispose();
  });

  it('copies a value on press, and honors defaultExpanded and maxDepth', () => {
    /** @type {string[]} */
    const copies = [];
    const view = () => (
      <Rui>
        <JsonTree data={data} defaultExpanded maxDepth={1} title="config" onCopy={(/** @type {string} */ t, /** @type {any[]} */ p) => copies.push(`${p.join('.')}=${t}`)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 400 });
    assert.equal(dom.text(), 'config: { "name": "rui" "version": 1 "tags": […] 2 items "meta": {…} 2 items }');
    assert.equal(skia.text(), dom.text());
    pressLabel(dom, skia, 'Copy name');
    pressLabel(dom, skia, 'Copy version');
    assert.deepEqual(copies, ['name=rui', 'name=rui', 'version=1', 'version=1']);
    dispose();
  });

  it('copies a BigInt as its digits, and a value JSON cannot write as its text', () => {
    /** @type {string[]} */
    const copies = [];
    const view = () => (
      <Rui>
        <JsonTree data={{ big: 12345678901234567890n, nested: { n: 7n }, fn: () => 1 }} defaultExpanded onCopy={(/** @type {string} */ t, /** @type {any[]} */ p) => copies.push(`${p.join('.')}=${t}`)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 400 });
    pressLabel(dom, skia, 'Copy big');
    pressLabel(dom, skia, 'Copy nested.n');
    pressLabel(dom, skia, 'Copy fn');
    assert.deepEqual(copies, ['big=12345678901234567890', 'big=12345678901234567890', 'nested.n=7', 'nested.n=7', 'fn=() => 1', 'fn=() => 1']);
    dispose();
  });
});

describe('JsonTree expanded, controlled', () => {
  const data = { name: 'rui', version: 1, tags: ['ui', 'portable'], meta: { ok: true, none: null } };
  it('shows the ids in `expanded`, and only tells a toggle', () => {
    /** @type {string[][]} */
    const told = [];
    const view = () => (
      <Rui>
        <JsonTree data={data} expanded={['', 'meta']} defaultExpanded onExpandedChange={(/** @type {string[]} */ ids) => told.push(ids)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 400 });
    assert.equal(dom.text(), 'root: { "name": "rui" "version": 1 "tags": […] 2 items "meta": { "ok": true "none": null } }');
    assert.equal(skia.text(), dom.text());
    pressLabel(dom, skia, 'tags');
    assert.equal(dom.text(), 'root: { "name": "rui" "version": 1 "tags": […] 2 items "meta": { "ok": true "none": null } }', 'the owner decides');
    assert.deepEqual(told, [['', 'tags', 'meta'], ['', 'tags', 'meta']]);
    keyOn(dom, skia, 'meta', 'ArrowLeft');
    assert.deepEqual(told.slice(2), [[''], ['']]);
    dispose();
  });
});

describe('JsonTree ids of a dotted key and of a nested path', () => {
  // The key 'a.b' has the id 'a\.b'; the path a, b has 'a.b'.
  const data = { a: { b: { y: 2 } }, 'a.b': { x: 1 } };

  it('toggles each on its own, uncontrolled', () => {
    /** @type {string[][]} */
    const told = [];
    const view = () => (
      <Rui>
        <JsonTree data={data} defaultExpanded={['', 'a']} counts={false} onExpandedChange={(/** @type {string[]} */ ids) => told.push(ids)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 400 });
    assert.equal(dom.text(), 'root: { "a": { "b": {…} } "a.b": {…} }');
    assert.equal(skia.text(), dom.text());
    // The first 'a.b' in the tree is the path a, b.
    pressLabel(dom, skia, 'a.b');
    assert.equal(dom.text(), 'root: { "a": { "b": { "y": 2 } } "a.b": {…} }', 'the dotted key stays closed');
    assert.equal(skia.text(), dom.text());
    assert.deepEqual(told, [['', 'a', 'a.b'], ['', 'a', 'a.b']]);
    dispose();
  });

  it('shows each by its own id, controlled', () => {
    const shown = (/** @type {string[]} */ expanded) => {
      const view = () => (
        <Rui>
          <JsonTree data={data} expanded={expanded} counts={false} />
        </Rui>
      );
      const { dom, skia, dispose } = both(view, { width: 480, height: 400 });
      const text = dom.text();
      assert.equal(skia.text(), text);
      dispose();
      return text;
    };
    assert.equal(shown(['', 'a', 'a.b']), 'root: { "a": { "b": { "y": 2 } } "a.b": {…} }');
    assert.equal(shown(['', 'a', 'a\\.b']), 'root: { "a": { "b": {…} } "a.b": { "x": 1 } }');
  });

  it('tells the dotted key by its escaped id', () => {
    /** @type {string[][]} */
    const told = [];
    const view = () => (
      <Rui>
        <JsonTree data={{ 'a.b': { x: 1 }, 'c\\d': { y: 2 } }} counts={false} onExpandedChange={(/** @type {string[]} */ ids) => told.push(ids)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 400 });
    pressLabel(dom, skia, 'a.b');
    pressLabel(dom, skia, 'c\\d');
    assert.equal(dom.text(), 'root: { "a.b": { "x": 1 } "c\\\\d": { "y": 2 } }');
    assert.equal(skia.text(), dom.text());
    assert.deepEqual(told.at(-1), ['', 'a\\.b', 'c\\\\d']);
    dispose();
  });
});

describe('Compare on the DOM and on Skia', () => {
  it('without `w`, keeps its first section as wide as its box, from its onResize alone (Skia)', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const boxes = [];
    const view = () => {
      const box = $signal($active(), 320);
      boxes.push(box);
      return (
        <Clock value={clock}>
          <Rui>
            <View style={() => ({ width: $read(box) })}>
              <Compare h={100} before={<Text>Before</Text>} after={<Text>After</Text>} />
            </View>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    /** The width of the section the 'Before' text is in (its nearest View with a set width). */
    const section = () => {
      skia.text();
      $flush(skia.root);
      skia.text();
      let item = primitives(skia).find(i => i.kind === 3 && i.caption === 'Before');
      while (item != null && Number.isNaN(item.style.width)) item = item.parent;
      return item?.style.width;
    };
    // No frame of the clock has passed: the first layout's resize gives the width.
    assert.equal(section(), 320);
    for (const box of boxes) $write(box, 200);
    assert.equal(section(), 200, 'and each resize after it');
    assert.equal(dom.text(), skia.text());
    dispose();
  });

  it('moves the slider by a drag with capture, and by the keys', () => {
    /** @type {number[]} */
    const values = [];
    const view = () => (
      <Rui>
        <Compare w={400} h={200} before={<Text>Before</Text>} after={<Text>After</Text>} onChange={(/** @type {number} */ v) => values.push(v)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    assert.equal(dom.text(), 'After Before');
    assert.equal(skia.text(), dom.text());
    mirror(dom, skia);
    // Drag from 25% to 75%, past the right edge at the end (clamped), captured.
    drag(dom, skia, [[100, 100], [300, 100], [460, 120]]);
    assert.deepEqual(values, [25, 25, 75, 75, 100, 100]);
    keyOn(dom, skia, 'Compare', 'ArrowLeft');
    keyOn(dom, skia, 'Compare', 'ArrowLeft', true);
    assert.deepEqual(values.slice(6), [99, 99, 89, 89]);
    let clip = primitives(skia).find(i => i.kind === 3 && i.caption === 'Before');
    while (clip.style.overflow !== 1) clip = clip.parent;
    assert.equal(Math.round(clip.getBoundingClientRect().width), Math.round(400 * 0.89));
    dispose();
  });

  it('follows the pointer without a press in hover mode, and stacks vertically', () => {
    /** @type {number[]} */
    const values = [];
    const view = () => (
      <Rui>
        <Compare w={300} h={200} orientation="vertical" mode="hover" defaultValue={10} before={<Text>Top</Text>} after={<Text>Bottom</Text>} onChange={(/** @type {number} */ v) => values.push(v)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    mirror(dom, skia);
    const node = dom.document.querySelector('[data-ren="View"]');
    node.dispatchEvent(new dom.window.PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true, pointerId: 1 }));
    skia.skia.move(50, 50);
    assert.deepEqual(values, [25, 25]);
    keyOn(dom, skia, 'Compare', 'End');
    assert.deepEqual(values.slice(2), [100, 100]);
    dispose();
  });
});

describe('Compare inside its border', () => {
  it('the divider lands under the pointer, bordered or not', () => {
    /** @type {number[]} */
    const lines = [];
    for (const border of [0, 20]) {
      /** @type {number[]} */
      const values = [];
      const view = () => (
        <Rui>
          <Compare w={400} h={200} style={{ border }} before={<Text>Before</Text>} after={<Text>After</Text>} onChange={(/** @type {number} */ v) => values.push(v)} />
        </Rui>
      );
      const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
      mirror(dom, skia);
      drag(dom, skia, [[110, 100]]);
      let clip = primitives(skia).find((/** @type {any} */ i) => i.kind === 3 && i.caption === 'Before');
      while (clip.style.overflow !== 1) clip = clip.parent;
      const r = clip.getBoundingClientRect();
      lines.push(Math.round(r.x + r.width));
      dispose();
    }
    assert.deepEqual(lines, [110, 110], 'the clip\'s edge, the divider, at the pointer');
  });
});

describe('Compare vertical inside its border', () => {
  it('the first section is as high as the second, inside the border', () => {
    const view = () => (
      <Rui>
        <Compare orientation="vertical" w={400} h={200} style={{ border: 20 }} before={<Text>Before</Text>} after={<Text>After</Text>} />
      </Rui>
    );
    const { skia, dispose } = both(view, { width: 480, height: 300 });
    skia.text();
    const box = (/** @type {string} */ cap) => {
      let n = primitives(skia).find((/** @type {any} */ i) => i.kind === 3 && i.caption === cap);
      while (n.parent && n.parent.style.overflow !== 1) n = n.parent;
      return n.getBoundingClientRect();
    };
    assert.equal(box('Before').height, box('After').height);
    dispose();
  });
});
