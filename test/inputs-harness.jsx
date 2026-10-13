// Helpers for the inputs suites: driving the DOM and Skia the same way
// (typing, carets, keys, blur, presses, per-root state, the same text) and
// pointer drags on both (the DOM's boxes taken from their Skia twins).

import assert from 'node:assert/strict';
import { $signal, $read, $flush } from 'rrx-core';
import { $active } from 'ren-core';

// ---------------------------------------------------------------------------
// Driving both renderers the same way

/** The scene items of a kind (4 Edit, 5 Action, 0 View), in tree order. @param {any} skia @param {number} kind */
export function items(skia, kind) {
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

/** The center of an item on Skia. @param {any} item */
export const center = item => {
  const r = item.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};

/** Presses an item on Skia at its center. @param {any} skia @param {any} item */
export function tap(skia, item) {
  const [x, y] = center(item);
  skia.skia.press(x, y);
  skia.skia.release(x, y);
  $flush(skia.root);
}

/** The i-th Edit's value on each renderer. @param {any} dom @param {any} skia @param {number} [i] */
export const values = (dom, skia, i = 0) => {
  $flush(dom.root);
  $flush(skia.root);
  return [dom.nodes('Edit')[i].value, items(skia, 4)[i].draft];
};

/**
 * Types into the i-th Edit on both: on the DOM as the browser does (the new
 * value, then an input event), on Skia through a press and the keys.
 * @param {any} dom @param {any} skia @param {number} i @param {string} text
 */
export function type(dom, skia, i, text) {
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

/**
 * Types into the focused i-th Edit where each renderer's caret is: on the
 * DOM as the browser does (the text inserted at the selection, the caret
 * after it, an input event), on Skia with the keys.
 * @param {any} dom @param {any} skia @param {number} i @param {string} text
 */
export function typeHere(dom, skia, i, text) {
  const node = dom.nodes('Edit')[i];
  for (const ch of text) {
    const [a, b] = [node.selectionStart, node.selectionEnd];
    node.value = node.value.slice(0, a) + ch + node.value.slice(b);
    node.setSelectionRange(a + 1, a + 1);
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
  }
  for (const ch of text) skia.skia.key(ch);
  $flush(skia.root);
}

/** Puts the i-th Edit's caret at `at` on both, through the input's caret API. @param {any} dom @param {any} skia @param {number} i @param {number} at */
export function caretAt(dom, skia, i, at) {
  dom.nodes('Edit')[i].setSelectionRange(at, at);
  items(skia, 4)[i].setSelectionRange(at, at);
}

/** The i-th Edit's caret on each renderer. @param {any} dom @param {any} skia @param {number} i */
export const carets = (dom, skia, i) => [dom.nodes('Edit')[i].selectionStart, items(skia, 4)[i].selectionStart];

/** Replaces the i-th Edit's value on both (a paste over everything). @param {any} dom @param {any} skia @param {number} i @param {string} text */
export function replace(dom, skia, i, text) {
  const node = dom.nodes('Edit')[i];
  node.value = text;
  node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  $flush(dom.root);
  const edit = items(skia, 4)[i];
  if (skia.skia.focused !== edit) tap(skia, edit);
  skia.skia.input(text, text.length, text.length);
  $flush(skia.root);
}

/** A key on the focused node: the DOM's keydown on `node`, Skia's key on its focused item. @param {any} dom @param {any} node @param {any} skia @param {string} key */
export function key(dom, node, skia, key) {
  node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  $flush(dom.root);
  skia.skia.key(key);
  $flush(skia.root);
}

/** Focus leaves the i-th Edit on both. @param {any} dom @param {any} skia @param {number} i */
export function blur(dom, skia, i) {
  const node = dom.nodes('Edit')[i];
  node.focus();
  node.blur();
  $flush(dom.root);
  const edit = items(skia, 4)[i];
  if (skia.skia.focused !== edit) edit.focus();
  edit.blur();
  $flush(skia.root);
}

/** Presses the text `text` on both. @param {any} dom @param {any} skia @param {string} text */
export function press(dom, skia, text) {
  dom.press(text);
  skia.press(text);
}

/** Per-root state: each renderer's root keeps its own signals. */
export function states() {
  /** @type {any[]} */
  const list = [];
  return {
    list,
    /** @param {any} initial */
    make(initial) {
      const s = $signal($active(), initial);
      list.push(s);
      return s;
    },
    /** Each root's value. */
    get: () => list.map(s => $read(s)),
  };
}

/** Same text on both, and it is `expected` when given. @param {any} dom @param {any} skia @param {string} [expected] */
export function same(dom, skia, expected) {
  const a = dom.text();
  const b = skia.text();
  assert.equal(a, b, 'the same text on the DOM and on Skia');
  if (expected !== undefined) assert.equal(a, expected);
  return a;
}

// ---------------------------------------------------------------------------
// Pointers: the DOM's boxes are Skia's (happy-dom lays nothing out), so the
// same points hit the same items on both.

/** The primitives on Skia in tree order (no text runs, no markers). @param {any} skia */
export function primitives(skia) {
  skia.skia.present();
  /** @type {any[]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      if (c.kind <= 7) out.push(c);
      walk(c);
    }
  };
  walk(skia.skia.root);
  return out;
}

/** Gives every DOM primitive the box of its Skia twin. @param {any} dom @param {any} skia */
export function mirror(dom, skia) {
  $flush(dom.root);
  const nodes = [...dom.host.querySelectorAll('[data-ren]')];
  const twins = primitives(skia);
  assert.equal(nodes.length, twins.length, 'the same primitives on both');
  nodes.forEach((n, i) => {
    n.getBoundingClientRect = () => primitives(skia)[i].getBoundingClientRect();
  });
  return nodes;
}

/** The deepest DOM primitive whose box holds a point. @param {any} dom @param {any} skia @param {number} x @param {number} y */
export function hit(dom, skia, x, y) {
  const nodes = mirror(dom, skia);
  let found = null;
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) found = n;
  }
  if (found === null) throw new Error(`nothing at ${x}, ${y}`);
  return found;
}

/**
 * A drag through points on both: press at the first, move through the
 * rest, release at the last (the DOM's events stay on the pressed node, as
 * a capture keeps them).
 * @param {any} dom @param {any} skia @param {[number, number][]} points
 */
export function drag(dom, skia, points) {
  const [x0, y0] = points[0];
  const node = hit(dom, skia, x0, y0);
  const send = (/** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) => {
    node.dispatchEvent(new dom.window.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, buttons: type === 'pointerup' ? 0 : 1 }));
    $flush(dom.root);
  };
  send('pointerdown', x0, y0);
  skia.skia.press(x0, y0);
  for (const [x, y] of points.slice(1)) {
    send('pointermove', x, y);
    skia.skia.move(x, y);
  }
  const [x1, y1] = points[points.length - 1];
  send('pointerup', x1, y1);
  skia.skia.release(x1, y1);
  skia.skia.leave();
  $flush(skia.root);
  $flush(dom.root);
}

/** The box of the first Skia primitive a test picks. @param {any} skia @param {(item: any) => boolean} pick */
export function boxOf(skia, pick) {
  const item = primitives(skia).find(pick);
  if (item === undefined) throw new Error('no such item');
  return item.getBoundingClientRect();
}

/** The first scene item below `n` with this label. @param {any} n @param {string} label @returns {any} */
export function findLabeled(n, label) {
  for (let c = n.first; c !== null; c = c.next) {
    if (c.label === label) return c;
    const found = findLabeled(c, label);
    if (found !== null) return found;
  }
  return null;
}
