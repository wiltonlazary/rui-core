// Panes on the DOM and on Skia: sizes in pixels or percents, each pane's
// bounds, the handle's drag and keys, the orientation, a controlled list
// and its commits, and the theme's first size, key step and handle thickness.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Rui, Text, Panes, themeOf, BASE_THEME } from 'rui-core';
import { moveHandle } from '../src/core/layout/panes.jsx';
import { both } from './harness.jsx';
import { primitives, drag, mirror, center, keyOn, action } from './more-harness.jsx';

/** A pane's Skia box: the View whose first child shows `caption`. @param {any} skia @param {string} caption */
const pane = (skia, caption) => primitives(skia).find(i => i.kind === 0 && i.first?.caption === caption).getBoundingClientRect();

/** Drags the handle labeled `label` by `dx`, `dy` on both, through `steps` points. @param {any} dom @param {any} skia @param {string} label @param {[number, number][]} by */
const dragHandle = (dom, skia, label, by) => {
  mirror(dom, skia);
  const [x, y] = center(action(dom, skia, label).item);
  drag(dom, skia, [[x, y], ...by.map(([dx, dy]) => /** @type {[number, number]} */ ([x + dx, y + dy]))], { node: action(dom, skia, label).node });
};

describe('Panes: the handle step', () => {
  it('moves a handle within both panes\' bounds; the last unsized pane keeps its minimum', () => {
    const b = [{ min: 50, max: 300 }, { min: 100, max: 400 }, { min: 80, max: Infinity }];
    assert.deepEqual(moveHandle([200, 200], b, 0, 150, Infinity), [300, 100]);
    assert.deepEqual(moveHandle([200, 200], b, 0, -500, Infinity), [50, 350]);
    assert.deepEqual(moveHandle([200, 200], b, 1, 500, 600), [200, 320], 'the last pane keeps its minimum');
    assert.deepEqual(moveHandle([200, 200], b, 1, -500, 600), [200, 100]);
    // Every pane sized (percents): a pair shares its sum.
    assert.deepEqual(moveHandle([50, 50], [{ min: 20, max: 100 }, { min: 30, max: 100 }], 0, 40, Infinity), [70, 30]);
  });

  it('never shrinks a pane it grows when the list already overflows the room', () => {
    const b = [{ min: 0, max: Infinity }, { min: 0, max: Infinity }, { min: 50, max: Infinity }];
    // 300 + 300 in a room of 400: the last handle has no room to give.
    assert.deepEqual(moveHandle([300, 300], b, 1, 8, 400), [300, 300]);
    // Shrinking it still works.
    assert.deepEqual(moveHandle([300, 300], b, 1, -8, 400), [300, 292]);
  });
});

describe('Panes on the DOM and on Skia', () => {
  it('pixels: drags a handle with capture and moves it with the keys, the same on both', () => {
    /** @type {number[][]} */
    const sizes = [];
    /** @type {number[][]} */
    const commits = [];
    const view = () => (
      <Rui>
        <Panes h={200} w={460} defaultSizes={[150, 150]} onSizesChange={(/** @type {number[]} */ s) => sizes.push(s)} onCommit={(/** @type {number[]} */ s) => commits.push(s)}>
          <Panes.Pane min={100} max={250}>
            <Text>Left</Text>
          </Panes.Pane>
          <Panes.Pane min={60}>
            <Text>Middle</Text>
          </Panes.Pane>
          <Panes.Pane min={80}>
            <Text>Right</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    assert.equal(dom.text(), 'Left Middle Right');
    assert.equal(skia.text(), dom.text());
    assert.equal(Math.round(pane(skia, 'Left').width), 150);
    dragHandle(dom, skia, 'Resize pane 1', [[40, 0], [400, 0]]);
    assert.deepEqual(sizes.slice(0, 4), [[190, 110], [190, 110], [240, 60], [240, 60]]);
    assert.equal(Math.round(pane(skia, 'Left').width), 240, 'the middle keeps its 60 px');
    // A key steps by `step` (default `spacing.xs`, apart from the handle's thickness); Home takes the pane to its minimum.
    const step = BASE_THEME.spacing.xs;
    keyOn(dom, skia, 'Resize pane 1', 'ArrowLeft');
    keyOn(dom, skia, 'Resize pane 1', 'Home');
    assert.deepEqual(sizes.slice(4), [[240 - step, 60 + step], [240 - step, 60 + step], [100, 200], [100, 200]]);
    // The middle's handle: the last pane keeps its 80 px (460 - 2 * 8 - 100 - 80 = 264 for the middle).
    keyOn(dom, skia, 'Resize pane 2', 'End');
    assert.deepEqual(sizes.slice(8), [[100, 264], [100, 264]]);
    // Shift steps five times.
    keyOn(dom, skia, 'Resize pane 2', 'ArrowLeft', true);
    assert.deepEqual(sizes.slice(10), [[100, 264 - 5 * step], [100, 264 - 5 * step]]);
    // Each drag's end and each key commit the sizes.
    assert.deepEqual(commits.slice(-2), [[100, 264 - 5 * step], [100, 264 - 5 * step]]);
    assert.deepEqual(commits.slice(0, 2), [[240, 60], [240, 60]], 'the drag committed where it ended, once on each');
    dispose();
  });

  it('percents: a drag shares the room, within each pane\'s percent bounds', () => {
    /** @type {string[][]} */
    const changes = [];
    /** @type {string[][]} */
    const commits = [];
    const view = () => (
      <Rui>
        <Panes w={400} h={100} defaultSizes={['50%']} onSizesChange={(/** @type {string[]} */ s) => changes.push(s)} onCommit={(/** @type {string[]} */ s) => commits.push(s)}>
          <Panes.Pane min="20%">
            <Text>left</Text>
          </Panes.Pane>
          <Panes.Pane min="30%">
            <Text>right</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 200 });
    assert.equal(dom.text(), 'left right');
    assert.equal(skia.text(), dom.text());
    // The room: 400 less the 8 px handle; the missing size shares the rest.
    assert.equal(Math.round(pane(skia, 'left').width), 196);
    assert.equal(Math.round(pane(skia, 'right').width), 196);
    // 39.2 px is 10% of the room.
    dragHandle(dom, skia, 'Resize pane 1', [[39.2, 0]]);
    assert.deepEqual(changes, [['60%', '40%'], ['60%', '40%']]);
    assert.ok(Math.abs(pane(skia, 'left').width - 235.2) < 1, `the left pane grew: ${pane(skia, 'left').width}`);
    // Bounds: the right pane keeps 30%.
    dragHandle(dom, skia, 'Resize pane 1', [[400, 0]]);
    assert.deepEqual(changes.at(-1), ['70%', '30%']);
    assert.deepEqual(commits, [['60%', '40%'], ['60%', '40%'], ['70%', '30%'], ['70%', '30%']]);
    // The separator's value and bounds in percents.
    const { node } = action(dom, skia, 'Resize pane 1');
    assert.deepEqual(['aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-orientation'].map(a => node.getAttribute(a)), ['70', '20', '100', 'vertical']);
    dispose();
  });

  it('percents: a missing size shares what is left; `sizes` controls the list', () => {
    const view = () => (
      <Rui>
        <Panes w={400} h={100} defaultSizes={['50%']}>
          <Panes.Pane>
            <Text>a</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>b</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>c</Text>
          </Panes.Pane>
        </Panes>
        <Panes w={400} h={100} sizes={['20%', '80%']}>
          <Panes.Pane>
            <Text>d</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>e</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    const grows = dom.nodes('View').filter((/** @type {any} */ n) => n.style.flexGrow !== '').map((/** @type {any} */ n) => Number(n.style.flexGrow));
    // Each percent is a grow of its fraction of the room.
    assert.deepEqual(grows, [0.5, 0.25, 0.25, 0.2, 0.8]);
    skia.text();
    assert.equal(Math.round(pane(skia, 'a').width), Math.round((400 - 16) / 2));
    assert.ok(Math.abs(pane(skia, 'd').width - (400 - 8) * 0.2) < 1, `d is 20% of the room: ${pane(skia, 'd').width}`);
    dispose();
  });

  it('percents are of the room: under 100% leaves the rest empty, over 100% shares it, a missing pane keeps its minimum', () => {
    const view = () => (
      <Rui>
        <Panes w={408} h={100} defaultSizes={['30%', '30%']}>
          <Panes.Pane>
            <Text>a</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>b</Text>
          </Panes.Pane>
        </Panes>
        <Panes w={416} h={100} defaultSizes={['80%', '50%']}>
          <Panes.Pane>
            <Text>c</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>d</Text>
          </Panes.Pane>
          <Panes.Pane min="10%">
            <Text>e</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    skia.text();
    const near = (/** @type {string} */ caption, /** @type {number} */ px) => assert.ok(Math.abs(pane(skia, caption).width - px) < 1, `${caption}: ${pane(skia, caption).width}, not ${px}`);
    // The room: 408 less the 8 px handle, 400; 30% is 120 px, 40% stays empty.
    near('a', 120);
    near('b', 120);
    // 416 less two handles, 400; 80% + 50% + the missing pane's 10% minimum share it: 140 parts.
    near('c', (400 * 80) / 140);
    near('d', (400 * 50) / 140);
    near('e', (400 * 10) / 140);
    const { node } = action(dom, skia, 'Resize pane 2');
    assert.equal(node.getAttribute('aria-valuenow'), '50');
    dispose();
  });

  it('percents: a drag moves the handle by the pointer when the sizes leave spare room', () => {
    /** @type {string[][]} */
    const changes = [];
    const view = () => (
      <Rui>
        <Panes w={408} h={100} defaultSizes={['30%', '30%']} onSizesChange={(/** @type {string[]} */ s) => changes.push(s)}>
          <Panes.Pane>
            <Text>a</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>b</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    // 40 px is 10% of the 400 px room.
    dragHandle(dom, skia, 'Resize pane 1', [[40, 0]]);
    assert.deepEqual(changes, [['40%', '20%'], ['40%', '20%']]);
    assert.ok(Math.abs(pane(skia, 'a').width - 160) < 1, `a: ${pane(skia, 'a').width}`);
    dispose();
  });

  it('percents: a number among them is pixels of the measured room', () => {
    /** @type {string[][]} */
    const changes = [];
    const view = () => (
      <Rui>
        <Panes w={416} h={100} defaultSizes={[100, '30%']} onSizesChange={(/** @type {string[]} */ s) => changes.push(s)}>
          <Panes.Pane>
            <Text>a</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>b</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>c</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    skia.text();
    mirror(dom, skia);
    // The room: 416 less two handles, 400; 100 px is 25% of it, the last pane takes the 45% left.
    const near = (/** @type {string} */ caption, /** @type {number} */ px) => assert.ok(Math.abs(pane(skia, caption).width - px) < 1, `${caption}: ${pane(skia, caption).width}, not ${px}`);
    near('a', 100);
    near('b', 120);
    near('c', 180);
    // A key steps 8 px, 2% of the room.
    keyOn(dom, skia, 'Resize pane 1', 'ArrowRight');
    assert.deepEqual(changes, [['27%', '28%', '45%'], ['27%', '28%', '45%']]);
    dispose();
  });

  it('a pixel list takes percent bounds of the measured room', () => {
    /** @type {number[][]} */
    const sizes = [];
    const view = () => (
      <Rui>
        <Panes w={408} h={100} defaultSizes={[200]} onSizesChange={(/** @type {number[]} */ s) => sizes.push(s)}>
          <Panes.Pane max="75%">
            <Text>A</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>B</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    mirror(dom, skia);
    // The room: 408 less the 8 px handle, 400; End takes the pane to 75% of it.
    keyOn(dom, skia, 'Resize pane 1', 'End');
    assert.deepEqual(sizes, [[300], [300]]);
    assert.equal(Math.round(pane(skia, 'A').width), 300);
    dispose();
  });

  it('vertical: stacks the panes; the handle moves with the up and down keys and a vertical drag', () => {
    /** @type {number[][]} */
    const sizes = [];
    const view = () => (
      <Rui>
        <Panes orientation="vertical" w={200} h={300} defaultSizes={[100]} step={20} onSizesChange={(/** @type {number[]} */ s) => sizes.push(s)}>
          <Panes.Pane min={40}>
            <Text>Top</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>Bottom</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 400 });
    skia.text();
    const top = pane(skia, 'Top');
    const bottom = pane(skia, 'Bottom');
    assert.equal(Math.round(top.height), 100);
    assert.equal(Math.round(bottom.top - top.top), 100 + BASE_THEME.spacing.xs, 'stacked past the handle');
    const { node } = action(dom, skia, 'Resize pane 1');
    assert.equal(node.getAttribute('aria-orientation'), 'horizontal');
    keyOn(dom, skia, 'Resize pane 1', 'ArrowRight');
    assert.deepEqual(sizes, [], 'the across keys do nothing');
    keyOn(dom, skia, 'Resize pane 1', 'ArrowDown');
    keyOn(dom, skia, 'Resize pane 1', 'ArrowUp');
    assert.deepEqual(sizes, [[120], [120], [100], [100]]);
    dragHandle(dom, skia, 'Resize pane 1', [[30, 25]]);
    assert.deepEqual(sizes.slice(4), [[125], [125]], 'only the vertical move counts');
    assert.equal(Math.round(pane(skia, 'Top').height), 125);
    dispose();
  });

  it('controlled: `sizes` holds the panes, `onSizesChange` and `onCommit` tell the proposal', () => {
    /** @type {number[][]} */
    const changes = [];
    /** @type {number[][]} */
    const commits = [];
    const view = () => (
      <Rui>
        <Panes w={400} h={100} sizes={[150]} step={10} onSizesChange={(/** @type {number[]} */ s) => changes.push(s)} onCommit={(/** @type {number[]} */ s) => commits.push(s)}>
          <Panes.Pane>
            <Text>A</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>B</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    keyOn(dom, skia, 'Resize pane 1', 'ArrowRight');
    assert.deepEqual(changes, [[160], [160]]);
    assert.deepEqual(commits, [[160], [160]]);
    assert.equal(Math.round(pane(skia, 'A').width), 150, 'its owner keeps its own');
    dispose();
  });

  it('lays out and tells a given size within its pane\'s bounds, initial or controlled', () => {
    const view = () => (
      <Rui>
        <Panes w={408} h={100} defaultSizes={[50]}>
          <Panes.Pane min={100} max={300}>
            <Text>A</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>B</Text>
          </Panes.Pane>
        </Panes>
        <Panes w={408} h={100} sizes={['90%', '10%']}>
          <Panes.Pane max="60%">
            <Text>C</Text>
          </Panes.Pane>
          <Panes.Pane min="25%">
            <Text>D</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    skia.text();
    assert.equal(Math.round(pane(skia, 'A').width), 100, 'the initial 50 px keeps the 100 px minimum');
    assert.equal(Math.round(pane(skia, 'C').width), 240, 'the controlled 90% keeps the 60% maximum');
    assert.equal(Math.round(pane(skia, 'D').width), 100, 'the controlled 10% keeps the 25% minimum');
    // Each separator's value within its bounds.
    const [first, second] = dom.nodes('Action').filter((/** @type {any} */ n) => n.getAttribute('role') === 'separator');
    assert.deepEqual(['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].map(a => first.getAttribute(a)), ['100', '100', '300']);
    assert.deepEqual(['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].map(a => second.getAttribute(a)), ['60', '0', '60']);
    dispose();
  });

  it('commits only a key that changed the sizes', () => {
    /** @type {number[][]} */
    const changes = [];
    /** @type {number[][]} */
    const commits = [];
    const view = () => (
      <Rui>
        <Panes w={400} h={100} defaultSizes={[100]} onSizesChange={(/** @type {number[]} */ s) => changes.push(s)} onCommit={(/** @type {number[]} */ s) => commits.push(s)}>
          <Panes.Pane min={100}>
            <Text>A</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>B</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    mirror(dom, skia);
    // At its minimum already: Home and the shrinking key move nothing.
    keyOn(dom, skia, 'Resize pane 1', 'Home');
    keyOn(dom, skia, 'Resize pane 1', 'ArrowLeft');
    assert.deepEqual(changes, []);
    assert.deepEqual(commits, [], 'a key that moved nothing commits nothing');
    const step = BASE_THEME.spacing.xs;
    keyOn(dom, skia, 'Resize pane 1', 'ArrowRight');
    assert.deepEqual(commits, [[100 + step], [100 + step]]);
    dispose();
  });

  it('takes its first pane size and handle thickness from the theme (sizes.box.pane, spacing.xs)', () => {
    const view = () => (
      <Rui theme={themeOf({ sizes: { box: { pane: 120 } }, spacing: { xs: 10 } })}>
        <Panes h={100} w={400}>
          <Panes.Pane>
            <Text>A</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>B</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    assert.equal(Math.round(pane(skia, 'A').width), 120);
    assert.equal(Math.round(action(dom, skia, 'Resize pane 1').item.getBoundingClientRect().width), 10);
    // The keys' step reads `spacing.xs` too, on its own: `handleSize` does not set it.
    keyOn(dom, skia, 'Resize pane 1', 'ArrowRight');
    assert.equal(Math.round(pane(skia, 'A').width), 130);
    dispose();
  });

  it('draws the line and grip in each handle unless `handle` is off, and sizes its handles by `handleSize`', () => {
    const view = (/** @type {boolean} */ handle) => () => (
      <Rui>
        <Panes h={100} w={300} handle={handle} handleSize={12}>
          <Panes.Pane>
            <Text>A</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>B</Text>
          </Panes.Pane>
        </Panes>
      </Rui>
    );
    for (const handle of [true, false]) {
      const { dom, skia, dispose } = both(view(handle), { width: 480, height: 300 });
      const { node, item } = action(dom, skia, 'Resize pane 1');
      assert.equal(node.children.length, handle ? 2 : 0, `the DOM's line and grip: ${handle}`);
      // Skia keeps an anchor (kind 9) for each reactive slot; the line and the grip are Views.
      const views = [];
      for (let k = item.first; k !== null; k = k.next) if (k.kind === 0) views.push(k);
      assert.equal(views.length, handle ? 2 : 0, `Skia's line and grip: ${handle}`);
      assert.equal(Math.round(item.getBoundingClientRect().width), 12);
      // The keys step by `spacing.xs`, not by the handle's thickness.
      keyOn(dom, skia, 'Resize pane 1', 'ArrowRight');
      assert.equal(Math.round(pane(skia, 'A').width), BASE_THEME.sizes.box.pane + BASE_THEME.spacing.xs);
      dispose();
    }
  });
});

describe('Panes share the room inside their padding and border', () => {
  it('a drag moves percent sizes the same, padded, bordered or plain', () => {
    /** @type {string[]} */
    const seen = [];
    for (const extra of [{}, { p: 20 }, { style: { border: 20 } }]) {
      /** @type {any[]} */
      const changes = [];
      const w = extra.p || extra.style ? 448 : 408;
      const view = () => (
        <Rui>
          <Panes w={w} h={100} {...extra} defaultSizes={['30%', '30%']} onSizesChange={(/** @type {any} */ s) => changes.push(s)}>
            <Panes.Pane>
              <Text>a</Text>
            </Panes.Pane>
            <Panes.Pane>
              <Text>b</Text>
            </Panes.Pane>
          </Panes>
        </Rui>
      );
      const { dom, skia, dispose } = both(view, { width: 520, height: 300 });
      mirror(dom, skia);
      const { node, item } = action(dom, skia, 'Resize pane 1');
      const [x, y] = center(item);
      drag(dom, skia, [[x, y], [x + 40, y]], { node });
      seen.push(JSON.stringify(changes.at(-1)));
      dispose();
    }
    assert.equal(seen[1], seen[0], `padded: ${seen[1]} as plain ${seen[0]}`);
    assert.equal(seen[2], seen[0], `bordered: ${seen[2]} as plain ${seen[0]}`);
  });
});
