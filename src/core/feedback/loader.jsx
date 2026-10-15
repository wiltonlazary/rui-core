// Loader: three loaders (ring, bars, dots) drawn with Shape and
// animated on the Clock (theme/motion.js), the same frames on every renderer.

import { Shape, read } from 'ren-core';
import { marks } from '../../theme/meaning.js';
import { $ui, BASE_THEME } from '../../theme/theme.jsx';
import { colorOf, sized } from '../../theme/resolve.js';
import { styled } from '../../theme/style.js';
import { alpha } from '../../theme/colors.js';
import { MOTION } from '../../theme/motion.js';
import { $elapsed } from './anim.js';
import { labelsIn } from '../../theme/labels.js';

/**
 * A loader's size in pixels: px, or a step of `theme`'s `sizes.loader`
 * (BASE_THEME's by default).
 * @param {any} size @param {import('../../theme/theme.jsx').RuiThemeValue} [theme]
 */
export const loaderSize = (size, theme = BASE_THEME) => sized(theme.sizes.loader, size, 'md');

/**
 * Points of an arc: center, radius, from and to in degrees (0 at the top,
 * clockwise), in `steps` segments.
 * @param {number} cx @param {number} cy @param {number} r @param {number} from @param {number} to @param {number} [steps]
 */
export function arc(cx, cy, r, from, to, steps = Math.max(2, Math.ceil(Math.abs(to - from) / 8))) {
  const out = new Array((steps + 1) * 2);
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps - 90) * Math.PI) / 180;
    out[i * 2] = cx + r * Math.cos(a);
    out[i * 2 + 1] = cy + r * Math.sin(a);
  }
  return out;
}

/** A wave from 0 up to 1 and back over one cycle, `phase` 0 to 1. @param {number} phase */
const wave = phase => (1 - Math.cos(phase * 2 * Math.PI)) / 2;

/**
 * The figures of a loader at time `t` (ms), in `theme`'s ratios and
 * opacity steps (BASE_THEME's by default).
 * @param {string} kind @param {number} size @param {string} color @param {number} t
 * @param {import('../../theme/theme.jsx').RuiThemeValue} [theme]
 * @returns {Record<string, any>[]}
 */
export function loaderFigures(kind, size, color, t, theme = BASE_THEME) {
  if (kind === 'bars') {
    // A level meter: four bars on a 7-unit row (bar, gap, …), standing on the
    // baseline and rising in turn from a mark's height (`ratios.mark` of the
    // size) to full height. The cycle is five
    // base motions (950 ms), each bar half a base motion (95 ms) behind.
    const low = theme.ratios.mark;
    const unit = size / 7;
    /** @type {Record<string, any>[]} */
    const out = [];
    for (let i = 0; i < 4; i++) {
      const phase = (((t - i * (MOTION.base / 2)) % (MOTION.base * 5)) + MOTION.base * 5) % (MOTION.base * 5) / (MOTION.base * 5);
      const h = size * (low + (1 - low) * wave(phase));
      const x = i * 2 * unit;
      out.push({ kind: 'rect', x, y: size - h, right: x + unit, bottom: size, color });
    }
    return out;
  }
  if (kind === 'dots') {
    // A wave: three dots of a quarter of the size, an eighth apart, each lifted
    // by half its size in turn and full while up (`opacity.soft` at rest). The cycle is
    // four calm motions (1200 ms), each dot half a calm motion (150 ms) behind.
    const d = size / 4;
    const gap = size / 8;
    const period = MOTION.calm * 4;
    const rest = theme.opacity.soft;
    /** @type {Record<string, any>[]} */
    const out = [];
    for (let i = 0; i < 3; i++) {
      const phase = (((t - i * (MOTION.calm / 2)) % period) + period) % period / period;
      // Up for the first half of the cycle, resting for the second.
      const k = phase < 0.5 ? Math.sin(phase * 2 * Math.PI) : 0;
      const x = i * (d + gap);
      const y = d / 2 - (d / 2) * k;
      out.push({ kind: 'oval', x, y, right: x + d, bottom: y + d, color: alpha(color, rest + (1 - rest) * k) });
    }
    return out;
  }
  // ring: a faint track (`opacity.faint`) and an arc on it that turns once every four
  // calm motions (1200 ms) while it grows from a quarter to three quarters of
  // the ring and back; the stroke is a tenth of the size.
  const stroke = Math.max(1, size / 10);
  const r = (size - stroke) / 2;
  const period = MOTION.calm * 4;
  const phase = (t % period) / period;
  const start = phase * 360;
  const sweep = 90 + 180 * wave(phase);
  return [
    { kind: 'path', points: arc(size / 2, size / 2, r, 0, 360), color: alpha(color, theme.opacity.faint), stroke },
    { kind: 'path', points: arc(size / 2, size / 2, r, start, start + sweep), color, stroke },
  ];
}

/**
 * A loader: `kind` ring (default: an arc turning and breathing on a faint
 * track), bars (a level meter rising in turn) or dots (a wave lifting each
 * dot in turn); `size` (xs to xl, the theme's `sizes.loader`, or px), `color` (the accent color by
 * default). Its cycles are multiples of rui's MOTION presets, so it moves
 * in step with the rest of the interface. It animates while it lives.
 * It means a `status` named 'Loading' (its `aria-label` names it otherwise).
 * @param {Record<string, any>} props
 */
export function Loader(props) {
  const ui = $ui();
  const time = $elapsed();
  const size = () => loaderSize(read(props.size), ui.theme());
  const kind = () => read(props.kind) ?? 'ring';
  const color = () => colorOf(ui.theme(), ui.scheme(), read(props.color));
  // Dots lift by half their size: the row is a quarter and an eighth high.
  const height = () => (kind() === 'dots' ? (size() * 3) / 8 : size());
  return (
    <Shape
      role="status"
      aria-label={() => labelsIn().loading}
      {...marks(props)}
      shapes={() => loaderFigures(kind(), size(), color(), time(), ui.theme())}
      style={styled(props, () => ({ width: size(), height: height(), shrink: 0 }))}
    />
  );
}
