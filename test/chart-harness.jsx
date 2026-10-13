// Helpers for the chart suites: Skia's primitives in tree order, Shape
// records compared on both renderers, the pointer on both, and the shared
// sample data.

import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';


/** The Skia primitives in tree order (Views to Shapes). @param {any} skia */
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

/** A Shape record as the attributes ren-dom writes for it. @param {Record<string, any>} r */
export function asDom(r) {
  const stroke = r.stroke ?? 0;
  /** @type {any[]} */
  let parts;
  if (r.kind === 'line') parts = ['line', r.x, r.y, r.right, r.bottom, 'stroke', r.color, r.stroke ?? 1];
  else {
    if (r.kind === 'oval') parts = ['ellipse', (r.x + r.right) / 2, (r.y + r.bottom) / 2, (r.right - r.x) / 2, (r.bottom - r.y) / 2];
    else if (r.kind === 'rect' || r.kind === 'round') parts = ['rect', r.x, r.y, r.right - r.x, r.bottom - r.y, r.kind === 'round' ? (r.radius ?? 6) : null];
    else {
      const p = r.points;
      let d = `M${p[0]} ${p[1]}`;
      for (let i = 2; i < p.length; i += 2) d += ` L${p[i]} ${p[i + 1]}`;
      if (r.closed) d += ' Z';
      parts = ['path', d];
    }
    // A gradient fill: the DOM's SVG gradient (its url), Skia's shade.
    const fill = r.fill == null ? r.color : typeof r.fill === 'object' ? 'gradient' : r.fill;
    parts.push(...(stroke > 0 || (r.kind === 'path' && !r.closed) ? ['none', r.color, stroke || 1] : [fill]));
  }
  return parts.map(v => (v == null ? '' : String(v))).join('|');
}

/** An SVG child as the same string. @param {any} el */
export function fromDom(el) {
  const a = (/** @type {string} */ n) => el.getAttribute(n);
  const tag = el.tagName.toLowerCase();
  /** @type {any[]} */
  let parts;
  if (tag === 'line') return ['line', a('x1'), a('y1'), a('x2'), a('y2'), 'stroke', a('stroke'), a('stroke-width')].map(v => v ?? '').join('|');
  if (tag === 'ellipse') parts = ['ellipse', a('cx'), a('cy'), a('rx'), a('ry')];
  else if (tag === 'rect') parts = ['rect', a('x'), a('y'), a('width'), a('height'), a('rx')];
  else parts = ['path', a('d')];
  parts.push(...(a('fill') === 'none' ? ['none', a('stroke'), a('stroke-width')] : [a('fill')?.startsWith('url(') ? 'gradient' : a('fill')]));
  return parts.map(v => v ?? '').join('|');
}

/**
 * The figures of every Shape on both renderers, in tree order: Skia's
 * records, and the DOM's SVG children, as ren-dom's attributes.
 * @param {any} dom @param {any} skia
 */
export function figures(dom, skia) {
  $flush(dom.root);
  const d = [...dom.host.querySelectorAll('[data-ren="Shape"]')].map((/** @type {any} */ s) => [...s.children].filter((/** @type {any} */ c) => c.tagName.toLowerCase() !== 'defs').map(fromDom));
  const k = primitives(skia).filter(n => n.kind === 7).map(n => (n.shapes ?? []).map(asDom));
  return { dom: d, skia: k };
}

/** Asserts the same text and the same figures on both, and returns the text. @param {any} dom @param {any} skia */
export function same(dom, skia) {
  const text = dom.text();
  assert.equal(skia.text(), text, 'the same text');
  const f = figures(dom, skia);
  assert.deepEqual(f.dom, f.skia, 'the same Shape records');
  assert.ok(f.skia.flat().length > 0, 'something drawn');
  return text;
}

/** Gives every DOM primitive the box of its Skia twin (happy-dom lays nothing out). @param {any} dom @param {any} skia */
export function mirror(dom, skia) {
  $flush(dom.root);
  const nodes = [...dom.host.querySelectorAll('[data-ren]')];
  const twins = primitives(skia);
  assert.equal(nodes.length, twins.length, 'the same primitives on both');
  nodes.forEach((n, i) => {
    n.getBoundingClientRect = () => twins[i].getBoundingClientRect();
  });
  return nodes;
}

/**
 * Moves the pointer to (x, y) on both: Skia hit tests; the DOM gets a
 * pointermove on the topmost primitive there (boxes mirrored from Skia).
 * @param {any} dom @param {any} skia @param {number} x @param {number} y
 */
export function hover(dom, skia, x, y) {
  const nodes = mirror(dom, skia);
  let found = null;
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) found = n;
  }
  if (found === null) throw new Error(`nothing at ${x}, ${y}`);
  found.dispatchEvent(new dom.window.PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
  $flush(dom.root);
  skia.skia.move(x, y);
  $flush(skia.root);
}

/** The pointer leaves on both. @param {any} dom @param {any} skia */
export function leave(dom, skia) {
  for (const n of dom.host.querySelectorAll('[data-ren]')) n.dispatchEvent(new dom.window.PointerEvent('pointerleave', { bubbles: false }));
  $flush(dom.root);
  skia.skia.leave();
  $flush(skia.root);
}

// Visits by source.
export const visits = [
  { label: 'Ads', value: 520, color: 'lime' },
  { label: 'Email', value: 390, color: 'violet' },
  { label: 'Links', value: 390, color: 'orange' },
];
