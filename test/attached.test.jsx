// The joined groups on the DOM and on Skia: Button.Group and
// IconButton.Group draw the frame, its corners and the lines between
// their children; the children draw no border and no radius.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';
import { Rui, Button, IconButton, CheckIcon, CloseIcon, BASE_THEME, pageColors, radiusOf } from 'rui-core';
import { both } from './harness.jsx';
import { items, KIND } from './scene.js';

const border = pageColors(BASE_THEME, 'light').border;
const corner = radiusOf(BASE_THEME, undefined);

/** A group's frame on both renderers, by its ref: [dom, skia]. @param {any[]} refs */
const frames = refs => [refs[0], refs[1]];

/** The Skia items right under a frame, markers left out. @param {any} frame */
function kids(frame) {
  const out = [];
  for (let c = frame.first; c !== null; c = c.next) if (c.kind === KIND.View || c.kind === KIND.Action) out.push(c);
  return out;
}

/** The DOM children of a frame that are primitives. @param {any} frame */
const domKids = frame => [...frame.children].filter((/** @type {any} */ n) => n.hasAttribute('data-ren'));

/** The lines a frame drew: its View children with no content of their own. @param {any} frame */
const lines = frame => kids(frame).filter(k => k.kind === KIND.View && k.first === null);

/** A Skia item's four corner radii. @param {any} item */
const corners = item => [item.style.radiusTopLeft, item.style.radiusTopRight, item.style.radiusBottomRight, item.style.radiusBottomLeft];

/** A Skia item's four border widths. @param {any} item */
const edges = item => [item.style.borderTop, item.style.borderRight, item.style.borderBottom, item.style.borderLeft];

/** Presses a Skia item at its center. @param {any} skia @param {any} item */
function pressAt(skia, item) {
  skia.skia.present();
  const r = item.getBoundingClientRect();
  skia.skia.press(r.x + r.width / 2, r.y + r.height / 2);
  skia.skia.release(r.x + r.width / 2, r.y + r.height / 2);
  $flush(skia.root);
}

describe('Button.Group and IconButton.Group', () => {
  it('a row of Button, Button.Addon, Button: same text and presses, a 1 px line between each pair', () => {
    /** @type {string[]} */
    const pressed = [];
    /** @type {any[]} */
    const refs = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Button.Group ref={(/** @type {any} */ n) => refs.push(n)}>
          <Button onPress={() => pressed.push('left')}>Left</Button>
          <Button.Addon>mid</Button.Addon>
          <Button variant="outline" onPress={() => pressed.push('right')}>Right</Button>
        </Button.Group>
      </Rui>
    ));
    assert.equal(dom.text(), 'Left mid Right');
    assert.equal(skia.text(), 'Left mid Right');
    dom.press('Left');
    dom.press('Right');
    skia.press('Left');
    skia.press('Right');
    assert.deepEqual(pressed, ['left', 'right', 'left', 'right']);
    const [domFrame, frame] = frames(refs);
    const parts = kids(frame);
    assert.equal(parts.length, 5, 'three children and two lines');
    const drawn = lines(frame);
    assert.equal(drawn.length, 2);
    const box = frame.getBoundingClientRect();
    for (const line of drawn) {
      const r = line.getBoundingClientRect();
      assert.equal(r.width, 1, 'a hairline');
      assert.equal(r.height, box.height - 2, 'as tall as the row');
    }
    // Edge to edge: each part starts where the one before it ends.
    const rects = parts.map(p => p.getBoundingClientRect());
    for (let i = 1; i < rects.length; i++) assert.equal(rects[i].x, rects[i - 1].x + rects[i - 1].width);
    assert.equal(rects[0].x, box.x + 1, 'inside the frame\'s edge');
    const domLines = domKids(domFrame).filter((/** @type {any} */ n) => n.children.length === 0 && n.getAttribute('data-ren') === 'View');
    assert.equal(domLines.length, 2);
    assert.deepEqual(domLines.map((/** @type {any} */ n) => [n.style.width, n.style.background || n.style.backgroundColor]), [['1px', border], ['1px', border]]);
    dispose();
  });

  it('children draw no border and no radius; the frame has the corner, a 1 px border in border, and clips', () => {
    /** @type {any[]} */
    const refs = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Button.Group ref={(/** @type {any} */ n) => refs.push(n)}>
          <Button radius="xl">One</Button>
          <Button.Addon radius="xl">two</Button.Addon>
          <Button variant="outline">Three</Button>
        </Button.Group>
      </Rui>
    ));
    const [domFrame, frame] = frames(refs);
    skia.text();
    const drawn = lines(frame);
    const children = kids(frame).filter(k => !drawn.includes(k));
    assert.equal(children.length, 3);
    for (const child of children) {
      assert.deepEqual(edges(child), [0, 0, 0, 0]);
      assert.deepEqual(corners(child), [0, 0, 0, 0]);
    }
    const domChildren = domKids(domFrame).filter((/** @type {any} */ n) => n.textContent !== '');
    assert.equal(domChildren.length, 3);
    for (const child of domChildren) {
      assert.equal(child.style.borderWidth || child.style.borderTopWidth, '0px');
      assert.equal(child.style.borderRadius || '0px', '0px');
    }
    assert.deepEqual(corners(frame), [corner, corner, corner, corner]);
    assert.deepEqual(edges(frame), [1, 1, 1, 1]);
    assert.equal(domFrame.style.borderRadius, `${corner}px`);
    assert.equal(domFrame.style.borderColor, border);
    assert.equal(domFrame.style.overflow, 'hidden');
    dispose();
  });

  it('a vertical IconButton.Group: lines across, as wide as its widest child plus the edge', () => {
    /** @type {any[]} */
    const refs = [];
    const { skia, dispose } = both(() => (
      <Rui>
        <IconButton.Group orientation="vertical" ref={(/** @type {any} */ n) => refs.push(n)}>
          <IconButton label="a" size="sm"><CheckIcon /></IconButton>
          <IconButton label="b" size="lg"><CloseIcon /></IconButton>
        </IconButton.Group>
      </Rui>
    ));
    skia.text();
    const frame = refs[1];
    const box = frame.getBoundingClientRect();
    assert.equal(box.width, BASE_THEME.sizes.icon.lg + 2);
    const [line] = lines(frame);
    const r = line.getBoundingClientRect();
    assert.deepEqual([r.height, r.width], [1, box.width - 2], 'one pixel high, full width');
    const [a, b] = kids(frame).filter(k => k.kind === KIND.Action).map(k => k.getBoundingClientRect());
    assert.equal(r.y, a.y + a.height);
    assert.equal(b.y, r.y + 1);
    dispose();
  });

  it('divider by px and step, radius on the frame', () => {
    for (const divider of [2, 'md']) {
      /** @type {any[]} */
      const refs = [];
      const { dom, dispose } = both(() => (
        <Rui>
          <Button.Group divider={divider} radius="xs" ref={(/** @type {any} */ n) => refs.push(n)}>
            <Button>A</Button>
            <Button>B</Button>
          </Button.Group>
        </Rui>
      ));
      dom.text();
      const frame = refs[1];
      assert.deepEqual(edges(frame), [2, 2, 2, 2], String(divider));
      assert.equal(lines(frame)[0].getBoundingClientRect().width, 2);
      assert.deepEqual(corners(frame), Array(4).fill(BASE_THEME.radius.xs));
      assert.equal(refs[0].style.borderRadius, `${BASE_THEME.radius.xs}px`);
      dispose();
    }
  });

  it('one child has no line; a null child between two makes one line', () => {
    /** @type {any[]} */
    const refs = [];
    const { skia, dispose } = both(() => (
      <Rui>
        <Button.Group ref={(/** @type {any} */ n) => refs.push(n)}>
          <Button>Solo</Button>
        </Button.Group>
        <Button.Group ref={(/** @type {any} */ n) => refs.push(n)}>
          <Button>A</Button>
          {null}
          {false}
          <>
            <Button>B</Button>
          </>
        </Button.Group>
      </Rui>
    ));
    skia.text();
    assert.equal(lines(refs[2]).length, 0);
    assert.equal(lines(refs[3]).length, 1, 'null and false skipped, the fragment opened');
    assert.equal(kids(refs[3]).length, 3);
    dispose();
  });

  it('a Button inside a grouped child\'s content is not grouped', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Button.Group>
          <Button start={<Button radius="sm">Inner</Button>}>Outer</Button>
        </Button.Group>
      </Rui>
    ));
    assert.equal(skia.text(), 'Inner Outer');
    const inner = items(skia, KIND.Action).find(a => a.parent?.kind === KIND.Action);
    assert.ok(inner !== undefined);
    assert.deepEqual(edges(inner), [1, 1, 1, 1]);
    assert.deepEqual(corners(inner), Array(4).fill(BASE_THEME.radius.sm));
    const domInner = dom.nodes('Action').find((/** @type {any} */ n) => n.textContent === 'Inner');
    assert.equal(domInner.style.borderRadius, `${BASE_THEME.radius.sm}px`);
    dispose();
  });

  it('a disabled Button in a group keeps its disabled fill and ignores presses', () => {
    /** @type {string[]} */
    const pressed = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Button.Group>
          <Button disabled onPress={() => pressed.push('off')}>Off</Button>
          <Button onPress={() => pressed.push('on')}>On</Button>
        </Button.Group>
      </Rui>
    ));
    dom.press('Off');
    skia.press('Off');
    dom.press('On');
    assert.deepEqual(pressed, ['on']);
    const off = dom.nodes('Action').find((/** @type {any} */ n) => n.textContent === 'Off');
    assert.equal(off.style.background || off.style.backgroundColor, pageColors(BASE_THEME, 'light').disabled);
    assert.equal(off.getAttribute('aria-disabled'), 'true');
    const drawn = items(skia, KIND.Action)[0];
    pressAt(skia, drawn);
    assert.deepEqual(pressed, ['on']);
    dispose();
  });

  it('outside a group a Button keeps its 1 px border and its radius', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Button variant="outline">Alone</Button>
        <IconButton label="i"><CheckIcon /></IconButton>
        <Button.Addon>add</Button.Addon>
      </Rui>
    ));
    skia.text();
    const actions = items(skia, KIND.Action);
    for (const a of actions) {
      assert.deepEqual(edges(a), [1, 1, 1, 1]);
      assert.deepEqual(corners(a), [corner, corner, corner, corner]);
    }
    const addon = items(skia, KIND.View).find(v => v.first?.kind === KIND.Label);
    assert.deepEqual(edges(addon), [1, 1, 1, 1]);
    assert.equal(dom.nodes('Action')[0].style.borderRadius, `${corner}px`);
    dispose();
  });
});
