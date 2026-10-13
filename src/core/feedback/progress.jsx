// Progress (with Progress.Track, Progress.Segment and Progress.Text),
// Ring and Arc: bars as Views, rings and arcs drawn
// with Shape; stripes are Shape parallelograms moving on the Clock.

import { View, Label, Shape, Show, $context, $lookup, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui, BASE_THEME } from '../../theme/theme.jsx';
import { alpha } from '../../theme/colors.js';
import { colorOf, radiusOf, pageColors, sized } from '../../theme/resolve.js';
import { pass, unlabeled } from '../layout/layout.jsx';
import { $elapsed } from './anim.js';
import { $follow } from '../misc/tween.js';
import { arc } from './loader.jsx';
import { textual } from './feedback.jsx';
import { DECOR } from '../../theme/meaning.js';
import { MOTION, durationOf } from '../../theme/motion.js';
import { markOn } from '../inputs/shared.js';
import { partOptions } from '../data/parts.jsx';

/** The track's color. @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {'light' | 'dark'} scheme */
const track = (theme, scheme) => pageColors(theme, scheme).track;

/** A duration prop (ms or a MOTION preset), calm by default. @param {Record<string, any>} props */
const calm = props => () => durationOf(read(props.duration), MOTION.calm);

/** A track's settings, for its segments and labels (outside a track: the md bar's). */
const Bar = $context(/** @type {{ height: () => number, radius: () => number }} */ ({ height: () => BASE_THEME.sizes.progress.md, radius: () => 0 }));
/** A segment's fill, for its text's ink. */
const Fill = $context(/** @type {{ color: () => any }} */ ({ color: () => undefined }));

/** How wide the stripes run, px: past any bar's width, clipped by the section. */
const STRIPES_SPAN = 1600; // geometry: a reach past any bar, not a look

/**
 * The stripes (white at `theme.opacity.faint`, leaning back at -45°,
 * `sizes.box.stripe` apart, 12 px) as parallelograms, `offset` px along (0
 * to the stripe period), in `theme`
 * (BASE_THEME by default).
 * @param {number} height @param {number} offset
 * @param {import('../../theme/theme.jsx').RuiThemeValue} [theme]
 */
export function stripes(height, offset, theme = BASE_THEME) {
  /** @type {Record<string, any>[]} */
  const out = [];
  const color = alpha(theme.white, theme.opacity.faint);
  const stripe = theme.sizes.box.stripe;
  for (let x = offset - stripe - height; x < STRIPES_SPAN; x += stripe) {
    out.push({ kind: 'path', closed: true, color, points: [x, 0, x + stripe / 2, 0, x + height + stripe / 2, height, x + height, height] });
  }
  return out;
}

/**
 * The track of a bar with segments: `size` (xs to xl, the theme's
 * `sizes.progress`, or px), `radius`,
 * `children` (Progress.Segment).
 * @param {Record<string, any>} props
 */
function ProgressTrack(props) {
  const ui = $ui();
  const height = () => {
    const s = read(props.size);
    return sized(ui.theme().sizes.progress, s, 'md');
  };
  const radius = () => radiusOf(ui.theme(), read(props.radius));
  const style = styled(props, (theme, scheme) => ({
    direction: 'row',
    align: 'stretch',
    height: height(),
    radius: radius(),
    overflow: 'hidden',
    background: track(theme, scheme),
  }));
  return (
    <Bar value={{ height, radius }}>
      <View {...pass(props)} style={style}>
        {props.children}
      </View>
    </Bar>
  );
}

/**
 * One segment of a bar: `value` (percent), `color`, `striped`, `moving`
 * (motion along the fill, on its own or with stripes: striped, the
 * stripes run; plain, a sheen `theme.ratios.mark` of the fill wide, white
 * at `theme.opacity.faint`, sweeps across every four calm motions),
 * `duration` (to follow a new value: ms or a MOTION preset; calm, 300 ms),
 * `children` (a Progress.Text). It means a `progressbar` with its value,
 * 0 to 100.
 * @param {Record<string, any>} props
 */
function ProgressSegment(props) {
  const ui = $ui();
  const bar = $lookup(Bar);
  const value = () => Number(read(props.value) ?? 0);
  const shown = $follow(value, calm(props));
  const style = styled(props, theme => {
    const v = Math.max(0, Math.min(100, shown()));
    return {
      width: `${v}%`,
      shrink: 0,
      align: 'center',
      justify: 'center',
      overflow: 'hidden',
      // The track's rounded clip shapes its ends.
      background: colorOf(theme, ui.scheme(), read(props.color)),
    };
  });
  const striped = () => read(props.striped) === true;
  const moving = () => read(props.moving) === true;
  const time = $elapsed(moving);
  const figures = () => {
    const stripe = ui.theme().sizes.box.stripe;
    return stripes(bar.height(), moving() ? ((time() / 1000) * stripe) % stripe : 0, ui.theme());
  };
  /** The sheen's share of the fill, percent, and where it starts: from before the start to past the end. */
  const share = () => ui.theme().ratios.mark * 100;
  const sheen = () => {
    const period = MOTION.calm * 4;
    const at = ((time() % period) / period) * (100 + share()) - share();
    return { position: 'absolute', top: 0, bottom: 0, left: `${at}%`, width: `${share()}%`, background: alpha(ui.theme().white, ui.theme().opacity.faint) };
  };
  return (
    <View role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} {...pass(props)} style={style}>
      <Show when={striped}>
        <Shape shapes={figures} style={() => ({ position: 'absolute', top: 0, left: 0, width: STRIPES_SPAN, height: bar.height() })} />
      </Show>
      <Show when={() => moving() && !striped()}>
        <View {...DECOR} style={/** @type {any} */ (sheen)} />
      </Show>
      <Fill value={{ color: () => read(props.color) }}>{props.children}</Fill>
    </View>
  );
}

/**
 * A segment's text: the largest step of the type scale that fits inside
 * the bar with 1 px clear above and below (xs at the least), at weight 600,
 * in black or white by the theme's contrast rule on the segment's fill, so
 * it reads on any color.
 * @param {Record<string, any>} props
 */
function ProgressText(props) {
  const bar = $lookup(Bar);
  const fill = $lookup(Fill);
  const ui = $ui();
  const style = styled(props, theme => {
    const room = bar.height() - 2;
    const steps = Object.values(theme.fontSizes).sort((a, b) => a - b);
    const fontSize = steps.filter(f => f <= room).at(-1) ?? steps[0];
    return {
      color: markOn(theme, ui.scheme(), undefined, fill.color()),
      fontWeight: theme.weights.strong,
      fontSize,
      lineHeight: 1,
      select: 'none',
    };
  });
  return <Label text={props.children} style={style} />;
}

/**
 * A bar: `value` (percent), `color`, `size`, `radius`, `striped`,
 * `moving` (see Progress.Segment), `duration` (to follow a new value: ms or a MOTION preset;
 * calm, 300 ms).
 * @param {Record<string, any>} props
 */
export function Progress(props) {
  return (
    <ProgressTrack {...props}>
      <ProgressSegment value={props.value} color={props.color} striped={props.striped} moving={props.moving} duration={props.duration} />
    </ProgressTrack>
  );
}
Progress.Track = ProgressTrack;
Progress.Segment = ProgressSegment;
Progress.Text = ProgressText;

/**
 * The figures of a ring: the track and each segment's arc from the top,
 * clockwise.
 * @param {number} size @param {number} thickness @param {string} trackColor
 * @param {{ value: number, color: string }[]} segments @param {boolean} round
 */
export function ringFigures(size, thickness, trackColor, segments, round) {
  const t = Math.min(thickness, size / 2);
  const r = (size - t) / 2;
  const c = size / 2;
  /** @type {Record<string, any>[]} */
  const out = [{ kind: 'oval', x: t / 2, y: t / 2, right: size - t / 2, bottom: size - t / 2, color: trackColor, stroke: t }];
  let at = 0;
  for (const s of segments) {
    const sweep = (Math.max(0, Math.min(100 - at, s.value)) * 360) / 100;
    if (sweep <= 0) continue;
    const from = (at * 360) / 100;
    out.push({ kind: 'path', points: arc(c, c, r, from, from + sweep), color: s.color, stroke: t });
    if (round) for (const deg of [from, from + sweep]) out.push(cap(c, c, r, deg, t, s.color));
    at += s.value;
  }
  return out;
}

/** A round cap: a disc of the stroke's width at an arc's end. @param {number} cx @param {number} cy @param {number} r @param {number} deg @param {number} t @param {string} color */
function cap(cx, cy, r, deg, t, color) {
  const a = ((deg - 90) * Math.PI) / 180;
  const x = cx + r * Math.cos(a);
  const y = cy + r * Math.sin(a);
  return { kind: 'oval', x: x - t / 2, y: y - t / 2, right: x + t / 2, bottom: y + t / 2, color };
}

/**
 * A ring of segments: `segments` ({ value, color }[], percents), `size`
 * (112), `thickness` (px or a `theme.sizes.progress` step; lg, 10, by
 * default: a heavy bar's stroke), `label` (in the middle, clear of the ring by
 * its thickness and `theme.spacing.xs`), `round` (round
 * caps), `trackColor`, `duration` (the segments follow new values: ms or
 * a MOTION preset; calm, 300 ms). It means a `progressbar`, its value the segments' sum, its
 * text label its `aria-valuetext`.
 * @param {Record<string, any>} props
 */
export function Ring(props) {
  const ui = $ui();
  const size = () => Number(read(props.size) ?? ui.theme().sizes.box.ring);
  const thickness = () => sized(ui.theme().sizes.progress, read(props.thickness), 'lg');
  /** A segment's value. @param {number} i */
  const valueAt = i => Number(read(read(props.segments)?.[i]?.value) ?? 0);
  // The segments there at first follow new values; later ones take theirs at once.
  const moving = Array.from({ length: (read(props.segments) ?? []).length }, (_, i) => $follow(() => valueAt(i), calm(props)));
  const figures = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const root = read(props.trackColor);
    const segments = (read(props.segments) ?? []).map((/** @type {any} */ s, /** @type {number} */ i) => ({ value: i < moving.length ? moving[i]() : Number(read(s.value) ?? 0), color: colorOf(theme, scheme, read(s.color)) }));
    return ringFigures(size(), thickness(), root == null ? track(theme, scheme) : colorOf(theme, scheme, root), segments, read(props.round) === true);
  };
  const style = styled(props, () => ({ width: size(), height: size(), shrink: 0 }));
  const sum = () => (read(props.segments) ?? []).reduce((/** @type {number} */ n, /** @type {any} */ s) => n + Number(read(s.value) ?? 0), 0);
  return (
    <View role="progressbar" aria-valuenow={sum} aria-valuemin={0} aria-valuemax={100} aria-valuetext={textual(props.label) ? props.label : undefined} {...unlabeled(props)} style={style}>
      <Shape shapes={figures} style={() => ({ position: 'absolute', top: 0, left: 0, width: size(), height: size() })} />
      {props.label === undefined ? null : (
        <View {...(textual(props.label) ? DECOR : null)} style={() => ({ position: 'absolute', top: 0, left: 0, width: size(), height: size(), align: 'center', justify: 'center', padding: thickness() + ui.theme().spacing.xs })}>
          {textual(props.label) ? <Label text={props.label} style={{ textAlign: 'center' }} /> : props.label}
        </View>
      )}
    </View>
  );
}

/** A sweep in degrees, held within one turn either way: negative runs counterclockwise. @param {number} sweep */
const turn = sweep => Math.max(-360, Math.min(360, sweep));

/**
 * The box an arc takes in its square of `size`: the arc from `start`
 * along `sweep` (degrees clockwise from the top; a negative sweep runs
 * counterclockwise), its stroke `thickness` wide, as
 * `{ x, y, width, height }` in the square.
 * @param {number} size @param {number} thickness @param {number} start @param {number} sweep
 */
export function arcBox(size, thickness, start, sweep) {
  const c = size / 2;
  const r = (size - thickness) / 2;
  const radii = [r - thickness / 2, r + thickness / 2];
  const span = turn(sweep);
  // The same bounds either way round: from the lower angle to the higher.
  const lo = Math.min(start, start + span);
  const hi = Math.max(start, start + span);
  /** Degrees to a point at a radius. @param {number} deg @param {number} at */
  const point = (deg, at) => [c + at * Math.sin((deg * Math.PI) / 180), c - at * Math.cos((deg * Math.PI) / 180)];
  const points = [lo, hi].flatMap(deg => radii.map(at => point(deg, at)));
  // Each quarter turn the arc passes reaches the square's edge there.
  for (let q = Math.ceil(lo / 90) * 90; q <= hi; q += 90) points.push(point(q, radii[1]));
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  // Whole micro-pixels: sin and cos of a quarter turn are not exactly 0.
  const clean = (/** @type {number} */ v) => Math.round(v * 1e6) / 1e6;
  const x = clean(Math.min(...xs));
  const y = clean(Math.min(...ys));
  return { x, y, width: clean(Math.max(...xs)) - x, height: clean(Math.max(...ys)) - y };
}

/**
 * The figures of an arc in its box (`arcBox`): the track from `start`
 * along `sweep` (degrees clockwise from the top; negative runs
 * counterclockwise), and the filled part from `start`, `value` percent
 * of the sweep, the same way round.
 * @param {number} size @param {number} thickness @param {number} value percent
 * @param {number} start @param {number} sweep
 * @param {string} empty @param {string} filled
 */
export function arcFigures(size, thickness, value, start, sweep, empty, filled) {
  const box = arcBox(size, thickness, start, sweep);
  const r = (size - thickness) / 2;
  const span = turn(sweep);
  const cx = size / 2 - box.x;
  const cy = size / 2 - box.y;
  /** @type {Record<string, any>[]} */
  const out = [{ kind: 'path', points: arc(cx, cy, r, start, start + span), color: empty, stroke: thickness }];
  const fill = (Math.max(0, Math.min(100, value)) * span) / 100;
  if (fill !== 0) out.push({ kind: 'path', points: arc(cx, cy, r, start, start + fill), color: filled, stroke: thickness });
  return out;
}

/** Where an Arc's label goes. */
const ARC_LABEL_AT = /** @type {const} */ (['center', 'bottom', 'end']);

/**
 * An arc of a ring: `value` (percent), `size` (180: the side of the ring
 * it is part of), `thickness` (px or a `theme.sizes.progress` step;
 * xl, 14, by default), `sweep` (the degrees it spans, 180 by
 * default, up to 360 either way: a negative sweep runs counterclockwise),
 * `start` (the angle it starts at, in degrees clockwise from the top;
 * `-sweep / 2` by default, so it stands centered over the top and opens at
 * the bottom: -90 for the default half ring, 90 for `sweep={-180}`),
 * `fillColor` (or `color`), `trackColor`, `duration` (ms or a MOTION
 * preset; calm, 300 ms). The fill runs from `start` along the sweep, so a
 * negative sweep fills the same half ring from its other end (the right).
 * Its box is the arc's own bounds (180 × 90 by default).
 *
 * `label` is a part: false or left out (none), true (the value as a
 * percent), text or a node (that, in the center), or options
 * `{ at, text }`: `at` 'center' (the default: in the middle of the arc's
 * box), 'bottom' (under the arc, centered on its ends) or 'end' (beside
 * it, after it in reading order), `text` (the value as a percent by
 * default); a label outside is `theme.spacing.xs` from the arc. Its label
 * is `theme.fontSizes.sm` in the text color.
 *
 * It means a `progressbar` with its value; a text label is its
 * `aria-valuetext`.
 * @param {Record<string, any>} props
 */
export function Arc(props) {
  const ui = $ui();
  const size = () => Number(read(props.size) ?? ui.theme().sizes.box.arc);
  const thickness = () => sized(ui.theme().sizes.progress, read(props.thickness), 'xl');
  const sweep = () => turn(Number(read(props.sweep) ?? 180));
  const start = () => {
    const s = read(props.start);
    return s == null ? -sweep() / 2 : Number(s);
  };
  const value = () => Number(read(props.value) ?? 0);
  const shown = $follow(value, calm(props));
  const box = () => arcBox(size(), thickness(), start(), sweep());
  const figures = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const empty = read(props.trackColor);
    return arcFigures(
      size(),
      thickness(),
      shown(),
      start(),
      sweep(),
      empty == null ? track(theme, scheme) : colorOf(theme, scheme, empty),
      colorOf(theme, scheme, read(props.fillColor) ?? read(props.color)),
    );
  };
  const percent = () => `${Math.round(value())}%`;
  /** The label part: its place and what it shows, or null. @returns {{ at: 'center' | 'bottom' | 'end', shows: any } | null} */
  const part = () => {
    const l = props.label;
    if (l == null || l === false) return null;
    if (l === true) return { at: 'center', shows: percent };
    if (partOptions(l)) {
      const at = read(l.at);
      return { at: ARC_LABEL_AT.includes(at) ? at : 'center', shows: l.text ?? percent };
    }
    return { at: 'center', shows: l };
  };
  const at = () => part()?.at ?? 'center';
  /** The text that names the value, when the label is text of the caller's. */
  const valueText = () => {
    const l = props.label;
    const t = partOptions(l) ? l.text : l;
    return textual(t) ? read(t) : undefined;
  };
  /** @type {() => Record<string, any>} */
  const labelStyle = () => ({ fontSize: ui.theme().fontSizes.sm, color: pageColors(ui.theme(), ui.scheme()).text, textAlign: 'center' });
  /** The label in `place`, when it goes there. @param {'center' | 'outside'} place */
  const label = place => () => {
    const p = part();
    if (p === null || (p.at === 'center') !== (place === 'center')) return null;
    const content = textual(p.shows) ? <Label text={p.shows} style={labelStyle} /> : p.shows;
    if (place === 'outside') return <View {...(textual(p.shows) ? DECOR : null)} style={{ align: 'center', justify: 'center' }}>{content}</View>;
    return (
      <View {...(textual(p.shows) ? DECOR : null)} style={() => ({ position: 'absolute', top: 0, left: 0, width: box().width, height: box().height, align: 'center', justify: 'center' })}>
        {content}
      </View>
    );
  };
  const style = styled(props, theme => ({ direction: at() === 'end' ? 'row' : 'column', align: 'center', gap: theme.spacing.xs, shrink: 0 }));
  return (
    <View role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-valuetext={valueText} {...unlabeled(props)} style={style}>
      <View style={() => ({ width: box().width, height: box().height, shrink: 0 })}>
        <Shape shapes={figures} style={() => ({ position: 'absolute', top: 0, left: 0, width: box().width, height: box().height })} />
        {label('center')}
      </View>
      {label('outside')}
    </View>
  );
}
