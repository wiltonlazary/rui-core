// Led, Spinner and Rings: small indicators drawn with Shape and
// animated on the Clock (the core's `$elapsed`), the same frames on every
// renderer.

import { View, Label, Shape, For, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { alpha } from '../../theme/colors.js';
import { colorOf, pageColors, sized } from '../../theme/resolve.js';
import { pass, unlabeled } from '../../core/layout/layout.jsx';
import { arc } from '../../core/feedback/loader.jsx';
import { $elapsed } from '../../core/feedback/anim.js';
import { textual } from '../../core/data/badge.jsx';
import { DECOR, UNSEEN, named } from '../../theme/meaning.js';
import { labelsIn } from '../../theme/labels.js';

/** @typedef {Record<string, any>} Figure */

/**
 * A small indicator's size: px, or a step of the theme's `sizes.indicator` (md
 * by default).
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {any} size
 */
const px = (theme, size) => sized(theme.sizes.indicator, size, 'md');

/**
 * A led's own proportions (drawing geometry, not style): the lens's radius
 * as a share of the size, and its highlight's size and offset from the
 * center as shares of the lens's radius.
 */
const LENS = Object.freeze({ radius: 0.36, shine: 0.45, shineX: 0.55, shineY: 0.6 });

/**
 * A led's figures: a halo, the lens and a highlight; `level` (0 to 1) is
 * how lit it is. The theme's opacity steps tint them: the halo up to
 * `soft`, the lens from `soft` to solid, the highlight from `soft` to `muted`.
 * @param {number} size @param {string} color @param {number} level
 * @param {{ soft: number, muted: number }} opacity the theme's opacity steps
 * @returns {Figure[]}
 */
export function ledFigures(size, color, level, opacity) {
  const c = size / 2;
  const r = size * LENS.radius;
  const lit = Math.max(0, Math.min(1, level));
  /** @type {Figure[]} */
  const out = [];
  if (lit > 0) out.push({ kind: 'oval', x: 0, y: 0, right: size, bottom: size, color: alpha(color, opacity.soft * lit) });
  out.push({ kind: 'oval', x: c - r, y: c - r, right: c + r, bottom: c + r, color: alpha(color, opacity.soft + (1 - opacity.soft) * lit) });
  const h = r * LENS.shine;
  const x = c - r * LENS.shineX;
  const y = c - r * LENS.shineY;
  out.push({ kind: 'oval', x, y, right: x + h, bottom: y + h, color: alpha('#ffffff', opacity.soft + (opacity.muted - opacity.soft) * lit) });
  return out;
}

/**
 * A status light (a led): `value` (on, true by default), `color`
 * ('green'), `offColor` (the color, faded), `size` (xs to xl, the theme's `sizes.indicator`,
 * or px; md 16), `animate` (false) with `effect` ('pulse' or 'flash') and
 * `duration` (1000 ms, one period), `label` beside it. The light
 * means an `img` named 'On' or 'Off'.
 * @param {Record<string, any>} props
 */
export function Led(props) {
  const ui = $ui();
  const on = () => read(props.value) !== false;
  const time = $elapsed(() => on() && read(props.animate) === true);
  const size = () => px(ui.theme(), read(props.size));
  const level = () => {
    if (!on()) return 0;
    if (read(props.animate) !== true) return 1;
    const period = Math.max(1, Number(read(props.duration) ?? 1000)); // cycle: one pulse or flash period, not a transition
    const phase = (time() % period) / period;
    return read(props.effect) === 'flash' ? (phase < 0.5 ? 1 : 0) : (1 + Math.cos(phase * 2 * Math.PI)) / 2;
  };
  const figures = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const color = on() ? colorOf(theme, scheme, read(props.color) ?? 'green') : colorOf(theme, scheme, read(props.offColor) ?? read(props.color) ?? 'green');
    return ledFigures(size(), color, level(), theme.opacity);
  };
  const style = styled(props, theme => ({ direction: 'row', align: 'center', gap: theme.spacing.xs }));
  return (
    <View {...unlabeled(props)} style={style}>
      <Shape role="img" aria-label={() => (on() ? 'On' : 'Off')} shapes={figures} style={() => ({ width: size(), height: size(), shrink: 0 })} />
      {props.label === undefined ? null : textual(props.label) ? <Label text={props.label} style={styled({}, (theme, scheme) => ({ fontSize: theme.fontSizes.sm, color: pageColors(theme, scheme).text }))} /> : props.label}
    </View>
  );
}

/**
 * A spinner's figures at time `t`: `segments` spokes (or dots) around the
 * center, the lead one opaque and the ones behind it fading; the lead
 * moves one segment per `speed / segments` ms; the last fades to `faint`.
 * @param {{ size: number, segments: number, thickness: number, inner: number, color: string, kind: string, speed: number, t: number, direction: number, faint: number }} o
 * @returns {Figure[]}
 */
export function spinnerFigures(o) {
  const n = Math.max(3, Math.floor(o.segments));
  const c = o.size / 2;
  const lead = Math.floor((o.t / Math.max(1, o.speed)) * n) % n;
  const outer = c - o.thickness / 2;
  const inner = Math.min(outer, c * o.inner);
  /** @type {Figure[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const behind = (((lead - i * o.direction) % n) + n) % n;
    const color = alpha(o.color, 1 - (behind / n) * (1 - o.faint));
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    if (o.kind === 'dots') {
      const r = o.thickness / 2;
      const x = c + outer * cos;
      const y = c + outer * sin;
      out.push({ kind: 'oval', x: x - r, y: y - r, right: x + r, bottom: y + r, color });
    } else out.push({ kind: 'line', x: c + inner * cos, y: c + inner * sin, right: c + outer * cos, bottom: c + outer * sin, stroke: o.thickness, color });
  }
  return out;
}

const SPINNER_SEGMENTS = 12; // count: a spinner's spokes, as a clock's hours
const SPINNER_TURN = 1000; // ms: one turn of a spinner, a loop and no transition

/**
 * A spinner of spokes or dots, drawn with Shape:
 * `size` (xs to xl on the theme's `sizes.loader`, or px; md), `segments` (12), `thickness` (size /
 * segments, at least 1.5), `inner` (the spokes' inner radius, a share of the radius: `ratios.glyph`),
 * `kind` ('lines' or 'dots'), `speed` (ms a turn: 1000), `direction`
 * ('clockwise' or 'counterclockwise'), `color`. It means a `status` named
 * 'Loading' (its `aria-label` names it otherwise), as Loader.
 * @param {Record<string, any>} props
 */
export function Spinner(props) {
  const ui = $ui();
  const time = $elapsed();
  const size = () => sized(ui.theme().sizes.loader, read(props.size));
  const segments = () => Number(read(props.segments) ?? SPINNER_SEGMENTS);
  const figures = () =>
    spinnerFigures({
      size: size(),
      segments: segments(),
      // A segment as thick as the ring's share of it, never under 1.5 px.
      thickness: Number(read(props.thickness) ?? Math.max(1.5, size() / segments())),
      inner: Number(read(props.inner) ?? ui.theme().ratios.glyph),
      color: colorOf(ui.theme(), ui.scheme(), read(props.color)),
      kind: read(props.kind) ?? 'lines',
      speed: Number(read(props.speed) ?? SPINNER_TURN),
      direction: read(props.direction) === 'counterclockwise' ? -1 : 1,
      t: time(),
      faint: ui.theme().opacity.faint,
    });
  return <Shape role="status" aria-label={() => labelsIn().loading} {...pass(props)} shapes={figures} style={styled(props, () => ({ width: size(), height: size(), shrink: 0 }))} />;
}

/**
 * Concentric rings' figures, the outermost first: each ring's track (its
 * color at `trackOpacity`) and its arc from the top, clockwise.
 * @param {number} size @param {number} thickness @param {number} gap
 * @param {{ value: number, color: string }[]} rings @param {number} trackOpacity @param {boolean} round
 * @returns {Figure[]}
 */
export function ringsFigures(size, thickness, gap, rings, trackOpacity, round) {
  const c = size / 2;
  /** @type {Figure[]} */
  const out = [];
  rings.forEach((ring, i) => {
    const r = c - thickness / 2 - i * (thickness + gap);
    if (r <= thickness / 2) return;
    out.push({ kind: 'oval', x: c - r, y: c - r, right: c + r, bottom: c + r, color: alpha(ring.color, trackOpacity), stroke: thickness });
    const sweep = (Math.max(0, Math.min(100, ring.value)) * 360) / 100;
    if (sweep <= 0) return;
    out.push({ kind: 'path', points: arc(c, c, r, 0, sweep), color: ring.color, stroke: thickness });
    if (round)
      for (const deg of [0, sweep]) {
        const a = ((deg - 90) * Math.PI) / 180;
        const x = c + r * Math.cos(a);
        const y = c + r * Math.sin(a);
        out.push({ kind: 'oval', x: x - thickness / 2, y: y - thickness / 2, right: x + thickness / 2, bottom: y + thickness / 2, color: ring.color });
      }
  });
  return out;
}

/**
 * Concentric progress rings, one a value: `rings` ({ value
 * (percent), color }[], outermost first), `size` (`sizes.box.ring`, 112), `thickness` (`sizes.progress.lg`, 10),
 * `gap` (half `spacing.xs`, 4), `round` (true: round ends), `trackOpacity` (the theme's `opacity.faint`: each track
 * is its ring's color, translucent), `label` in the middle. It means a `group`
 * named by its text label, of a `progressbar` per ring (out of sight).
 * @param {Record<string, any>} props
 */
export function Rings(props) {
  const ui = $ui();
  const size = () => Number(read(props.size) ?? ui.theme().sizes.box.ring);
  const figures = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const rings = (read(props.rings) ?? []).map((/** @type {any} */ r) => ({ value: Number(read(r.value) ?? 0), color: colorOf(theme, scheme, read(r.color)) }));
    return ringsFigures(size(), Number(read(props.thickness) ?? theme.sizes.progress.lg), Number(read(props.gap) ?? theme.spacing.xs / 2), rings, Number(read(props.trackOpacity) ?? theme.opacity.faint), read(props.round) !== false);
  };
  const style = styled(props, () => ({ width: size(), height: size(), shrink: 0 }));
  return (
    <View role="group" aria-label={named(props.label)} {...unlabeled(props)} style={style}>
      <Shape shapes={figures} style={() => ({ position: 'absolute', top: 0, left: 0, width: size(), height: size() })} />
      <View style={UNSEEN}>
        <For by="position" each={() => read(props.rings) ?? []}>{ring => <View role="progressbar" aria-valuenow={() => Number(read(ring().value) ?? 0)} aria-valuemin={0} aria-valuemax={100} />}</For>
      </View>
      {props.label === undefined ? null : (
        <View {...(textual(props.label) ? DECOR : null)} style={() => ({ position: 'absolute', top: 0, left: 0, width: size(), height: size(), align: 'center', justify: 'center' })}>
          {textual(props.label) ? <Label text={props.label} style={{ textAlign: 'center' }} /> : props.label}
        </View>
      )}
    </View>
  );
}
