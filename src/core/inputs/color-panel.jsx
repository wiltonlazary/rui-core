// ColorPicker's saturation panel: saturation across, brightness down, over
// the picker's hue. A drag or a key picks a new saturation and brightness;
// the hue and alpha stay. Places keep their fractions; only shown numbers round.

import { View } from 'ren-core';
import { radiusOf } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { clamp } from './shared.js';
import { drag, thumb, ramp, solid, formatColor, parseColor } from './color.jsx';

/** @typedef {import('./color.jsx').HSVA} HSVA */

/**
 * A key's new saturation and brightness from the current ones, on whole
 * steps (`round(current) ± step`), clamped to 0-100; null for a key the
 * panel does not take. Arrows step by 1 (10 with Shift), PageUp/PageDown
 * brightness by 10, Home/End set saturation to 0/100.
 * @param {string} key @param {boolean} shift @param {number} s @param {number} v
 * @returns {{ s: number, v: number } | null}
 */
function panelKey(key, shift, s, v) {
  const step = shift ? 10 : 1;
  const S = Math.round(s);
  const V = Math.round(v);
  /** @type {[number, number] | null} */
  const next =
    key === 'ArrowRight' ? [S + step, v]
    : key === 'ArrowLeft' ? [S - step, v]
    : key === 'ArrowUp' ? [s, V + step]
    : key === 'ArrowDown' ? [s, V - step]
    : key === 'PageUp' ? [s, V + 10]
    : key === 'PageDown' ? [s, V - 10]
    : key === 'Home' ? [0, v]
    : key === 'End' ? [100, v]
    : null;
  return next === null ? null : { s: clamp(next[0], 0, 100), v: clamp(next[1], 0, 100) };
}

/** The panel's words for a color: its saturation and brightness, rounded. @param {HSVA} c */
const panelText = c => `Saturation ${Math.round(c.s)}%, brightness ${Math.round(c.v)}%`;

/**
 * The saturation panel: `color()` the picker's HSVA, `onPick(hsva, end)`
 * its new color (`end` once a gesture is done: a release, a cancel, a
 * key), `thumb()` the thumb's side, `height()` the panel's height. As wide
 * as the picker, its corners `radius.sm`; its ground white to the pure hue
 * across, clear to the theme's black down over it. A place (x, y from 0 to
 * 1) is `s = 100·x`, `v = 100·(1 − y)`, unrounded.
 * @param {{ color: () => HSVA, onPick: (c: HSVA, end: boolean) => void, thumb: () => number, height: () => number }} m
 */
export function saturationPanel({ color, onPick, thumb: side, height }) {
  const ui = $ui();
  const d = drag(([x, y], end) => onPick({ ...color(), s: 100 * x, v: 100 * (1 - y) }, end), () => false);
  const onKey = (/** @type {any} */ e) => {
    const c = color();
    const next = panelKey(e.key, e.shiftKey === true, c.s, c.v);
    if (next === null) return;
    e.preventDefault?.();
    onPick({ ...c, ...next }, true);
  };
  const corner = () => radiusOf(ui.theme(), 'sm');
  /** @returns {Record<string, any>} */
  const look = () => ({
    height: height(),
    radius: corner(),
    overflow: 'visible',
    cursor: 'crosshair',
    touchAction: 'none',
    background: ramp('#ffffff', solid({ h: color().h, s: 100, v: 100, a: 1 })),
  });
  /** @returns {Record<string, any>} */
  const shade = () => {
    const black = ui.theme().black;
    const base = parseColor(black) ?? { h: 0, s: 0, v: 0, a: 1 };
    return { position: 'absolute', inset: 0, radius: corner(), background: ramp(formatColor({ ...base, a: 0 }, 'hex', true), black, 180) };
  };
  const place = () => {
    const c = color();
    const half = side() / 2;
    return { left: `${c.s}%`, top: `${100 - c.v}%`, margin: [-half, 0, 0, -half] };
  };
  const meaning = { 'aria-valuenow': () => Math.round(color().s), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuetext': () => panelText(color()) };
  return (
    <View ref={d.ref} style={look} onPointerDown={d.down} onPointerMove={d.move} onPointerUp={d.up} onPointerCancel={d.cancel}>
      <View style={shade} />
      {thumb(side, place, onKey, 'Saturation', meaning, () => solid(color()))}
    </View>
  );
}
