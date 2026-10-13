// Shared pieces of this wave's compound components: the children of a
// component read as parts (a Card's sections, a Timeline's items, a List's
// items, …) with their place among them, and the small icons drawn with
// the portable Shape.

import { Lazy, Shape, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { tables } from '../../own.js';

/** Whether a part prop is its options object (not a node, `true` or `false`). @param {any} v @returns {v is Record<string, any>} */
export const partOptions = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

/** A component's children as a flat array. @param {any} children @returns {any[]} */
export const flat = children => (children == null ? [] : Array.isArray(children) ? children.flat(Infinity) : [children]);

/** Whether a child is an element of `component`. @param {any} child @param {Function} component */
export const isPart = (child, component) => child instanceof Lazy && child.component === component;

/**
 * The children, with each element of `component` given `extra(index, count)`
 * props (its place among the parts); other children pass as they are.
 * @param {any} children @param {Function} component @param {(index: number, count: number) => Record<string, any>} extra
 * @returns {any[]}
 */
export function parts(children, component, extra) {
  const list = flat(children);
  let count = 0;
  for (const c of list) if (isPart(c, component)) count++;
  let i = 0;
  return list.map(c => (isPart(c, component) ? new Lazy(c.component, { ...c.props, ...extra(i++, count) }) : c));
}

/** A chevron's drawing (a V in a unit square) by where it points at rest, and how far it turns as it opens. */
const POINTS = tables({
  down: { v: [0.25, 0.35, 0.5, 0.65, 0.75, 0.35], sweep: 180 },
  end: { v: [0.35, 0.25, 0.65, 0.5, 0.35, 0.75], sweep: 90 },
  start: { v: [0.65, 0.25, 0.35, 0.5, 0.65, 0.75], sweep: -90 },
});

/**
 * A chevron in a `size` square (`theme.sizes.glyph.md` by default), one
 * drawing turned by the style's `rotate` as `open` goes from 0 to 1.
 * `point`: where it points at rest; `down` (the default) turns 180 degrees
 * to point up, `end` turns 90 degrees clockwise and `start` 90 degrees
 * counterclockwise, both to point down.
 * @param {{ size?: any, color?: any, open?: () => number, stroke?: number, point?: any }} props (point: 'down', 'end' or 'start', or a function of one)
 */
export function Chevron(props) {
  const ui = $ui();
  const side = () => read(props.size) ?? ui.theme().sizes.glyph.md;
  const at = () => POINTS[/** @type {'down' | 'end' | 'start'} */ (read(props.point) ?? 'down')];
  const shapes = () => {
    const s = side();
    return [{ kind: 'path', points: at().v.map((/** @type {number} */ n) => n * s), stroke: props.stroke ?? 1.5, color: read(props.color) }];
  };
  const style = () => {
    const s = side();
    const p = props.open === undefined ? 0 : props.open();
    return { width: s, height: s, shrink: 0, ...(p === 0 ? null : { rotate: p * at().sweep }) };
  };
  return <Shape shapes={shapes} style={style} />;
}

/**
 * A person's silhouette (Avatar's placeholder) in a `size` square.
 * @param {{ size: () => number, color: () => string }} props
 */
export function Person(props) {
  const side = () => props.size();
  const shapes = () => {
    const s = side();
    const color = props.color();
    return [
      { kind: 'oval', x: s * 0.3, y: s * 0.08, right: s * 0.7, bottom: s * 0.48, color },
      { kind: 'path', points: [s * 0.1, s * 0.95, s * 0.2, s * 0.65, s * 0.5, s * 0.55, s * 0.8, s * 0.65, s * 0.9, s * 0.95], closed: true, color },
    ];
  };
  return <Shape shapes={shapes} style={() => ({ width: side(), height: side(), shrink: 0 })} />;
}
