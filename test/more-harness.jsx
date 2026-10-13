// Helpers for the rui-core/more suites: Skia's primitives in tree order, the
// DOM's boxes taken from their Skia twins (happy-dom lays nothing out), and
// pointer drags and presses on both renderers.

import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';

/** The primitives on Skia in tree order (the overlay's after the page's). @param {any} skia */
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
  if (skia.skia.overlay) walk(skia.skia.overlay);
  return out;
}

/** Gives every DOM primitive the box of its Skia twin. @param {any} dom @param {any} skia */
export function mirror(dom, skia) {
  $flush(dom.root);
  $flush(skia.root);
  const nodes = [...dom.document.querySelectorAll('[data-ren]')];
  const twins = primitives(skia);
  assert.equal(nodes.length, twins.length, 'the same primitives on both');
  nodes.forEach((n, i) => {
    n.getBoundingClientRect = () => twins[i].getBoundingClientRect();
  });
}

/** The topmost DOM primitive under a point (after mirror). @param {any} dom @param {number} x @param {number} y @param {(n: any) => boolean} [only] */
export function domAt(dom, x, y, only) {
  let node = null;
  for (const n of dom.document.querySelectorAll('[data-ren]')) {
    const r = n.getBoundingClientRect();
    if (x >= r.left && x < r.right && y >= r.top && y < r.bottom && (only === undefined || only(n))) node = n;
  }
  return node;
}

/**
 * A drag on both: the DOM's pointer events on `node` (or the node under
 * the first point), moves and release on it as capture keeps them.
 * @param {any} dom @param {any} skia @param {[number, number][]} points @param {{ node?: any, button?: number, clock?: any, ms?: number }} [o]
 */
export function drag(dom, skia, points, o = {}) {
  mirror(dom, skia);
  const [x0, y0] = points[0];
  const node = o.node ?? domAt(dom, x0, y0);
  assert.ok(node != null, 'something under the pointer on the DOM');
  const button = o.button ?? 0;
  const send = (/** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) =>
    node.dispatchEvent(new dom.window.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, button, buttons: type === 'pointerup' ? 0 : 1 << button }));
  send('pointerdown', x0, y0);
  skia.skia.press(x0, y0, 1, false, { button, buttons: 1 << button });
  $flush(dom.root);
  $flush(skia.root);
  for (const [x, y] of points.slice(1)) {
    if (o.clock && o.ms) o.clock.advance(o.ms);
    send('pointermove', x, y);
    skia.skia.move(x, y, { buttons: 1 << button });
    $flush(dom.root);
    $flush(skia.root);
  }
  const [x1, y1] = points[points.length - 1];
  send('pointerup', x1, y1);
  skia.skia.release(x1, y1, { button, buttons: 0 });
  $flush(dom.root);
  $flush(skia.root);
}

/** The center of a Skia primitive. @param {any} item */
export const center = item => {
  const r = item.getBoundingClientRect();
  return /** @type {[number, number]} */ ([r.left + r.width / 2, r.top + r.height / 2]);
};

/** The Action labeled `label` on both: the DOM node and the Skia item. @param {any} dom @param {any} skia @param {string} label */
export function action(dom, skia, label) {
  $flush(dom.root);
  const node = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === label);
  const item = primitives(skia).find(i => i.kind === 5 && String(typeof i.label === 'function' ? i.label() : i.label) === label);
  if (node === undefined || item === undefined) throw new Error(`no "${label}" Action (dom ${node !== undefined}, skia ${item !== undefined})`);
  return { node, item };
}

/** Presses the Action labeled `label` on both. @param {any} dom @param {any} skia @param {string} label */
export function pressLabel(dom, skia, label) {
  const { node, item } = action(dom, skia, label);
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  $flush(dom.root);
  const [x, y] = center(item);
  skia.skia.press(x, y);
  skia.skia.release(x, y);
  $flush(skia.root);
}

/** A key on the Action labeled `label`, focused, on both. @param {any} dom @param {any} skia @param {string} label @param {string} key @param {boolean} [shift] */
export function keyOn(dom, skia, label, key, shift = false) {
  const { node, item } = action(dom, skia, label);
  node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true }));
  $flush(dom.root);
  item.focus();
  skia.skia.key(key, shift, { shiftKey: shift });
  $flush(skia.root);
}

/** Painted figures of every Shape on Skia, and on the DOM the SVG children count. @param {any} skia */
export function skiaShapes(skia) {
  return primitives(skia).filter(i => i.kind === 7 || i.shapes != null);
}

/** The DOM's text, portals included (the harness's `text()` reads its host only). @param {any} dom */
export function allText(dom) {
  $flush(dom.root);
  /** @type {string[]} */
  const out = [];
  const hidden = (/** @type {any} */ n) => {
    for (let x = n; x != null; x = x.parentElement) if (x.style?.display === 'none') return true;
    return false;
  };
  for (const node of dom.document.body.querySelectorAll('[data-ren]')) {
    const role = node.getAttribute('data-ren');
    if ((role !== 'Label' && role !== 'Action' && role !== 'Edit') || hidden(node)) continue;
    if (role === 'Action' && node.querySelector('[data-ren]') !== null) continue;
    out.push(role === 'Edit' ? node.value || node.placeholder || '' : node.textContent);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/** Clicks the innermost Action or View showing `text` anywhere in the DOM document (portals too). @param {any} dom @param {string} text */
export function domPress(dom, text) {
  $flush(dom.root);
  const node = [...dom.document.body.querySelectorAll('[data-ren="Action"], [data-ren="View"]')].filter(n => n.textContent.trim() === text).pop();
  if (node === undefined) throw new Error(`no "${text}" to press on the DOM in: ${allText(dom)}`);
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  $flush(dom.root);
}
