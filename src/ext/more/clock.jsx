// AnalogClock: an analog clock drawn with Shape (face, ticks, hands) and Labels
// for the hours, moving on the Clock context's frames while it runs: its time
// is where it last started plus the milliseconds since, so a manual clock
// drives it in tests.

import { View, Label, Shape, For, read, $active, $signal, $read, $write, $untrack, $lookup, $memo, $watch, $batch, $owner, $cleanup } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { colorOf, pageColors } from '../../theme/resolve.js';
import { Clock } from '../../theme/motion.js';
import { pass } from '../../core/layout/layout.jsx';
import { DECOR } from '../../theme/meaning.js';

/** @typedef {Record<string, any>} Figure */

/** Milliseconds of a Date, a number or an ISO string. @param {any} v */
const msOf = v => (v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : Number(v));

/**
 * The hands' angles in degrees from 12, clockwise, at `ms`: the hour and
 * minute hands move smoothly, the second hand by whole seconds (`smooth`
 * false) or smoothly.
 * @param {number} ms @param {boolean} utc @param {boolean} smooth
 */
export function handAngles(ms, utc, smooth) {
  const d = new Date(ms);
  const h = utc ? d.getUTCHours() : d.getHours();
  const m = utc ? d.getUTCMinutes() : d.getMinutes();
  const s = utc ? d.getUTCSeconds() : d.getSeconds();
  const f = smooth ? (utc ? d.getUTCMilliseconds() : d.getMilliseconds()) / 1000 : 0;
  const seconds = s + f;
  const minutes = m + seconds / 60;
  return { hour: ((h % 12) + minutes / 60) * 30, minute: minutes * 6, second: seconds * 6 };
}

/** A point at `deg` from 12 and `r` from the center. @param {number} c @param {number} r @param {number} deg */
const polar = (c, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
};

/**
 * The face's own proportions (drawing geometry, not style), as shares of
 * its size (`tick`, `minorTick`, the numerals' `numeral` box, `numeralAt`
 * inset and `numeralSize`) or of its radius (each hand's `length` and `tail`).
 */
const FACE = Object.freeze({
  tick: 0.07,
  minorTick: 0.035,
  numeral: 0.14,
  numeralAt: 0.16,
  numeralSize: 0.075,
  hour: { length: 0.5, tail: 0.08 },
  minute: { length: 0.72, tail: 0.08 },
  second: { length: 0.8, tail: 0.16 },
});

/**
 * The figures of a clock face at the given angles.
 * @param {number} size @param {{ hour: number, minute: number, second: number }} at
 * @param {{ face: string, border: string, ticks: string, hour: string, minute: string, second: string, seconds: boolean }} look
 * @returns {Figure[]}
 */
export function clockFigures(size, at, look) {
  const c = size / 2;
  const border = Math.max(1, size / 60);
  /** @type {Figure[]} */
  const out = [
    { kind: 'oval', x: 0, y: 0, right: size, bottom: size, color: look.border },
    { kind: 'oval', x: border, y: border, right: size - border, bottom: size - border, color: look.face },
  ];
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const [x0, y0] = polar(c, c - border * 2, i * 6);
    const [x1, y1] = polar(c, c - border * 2 - size * (major ? FACE.tick : FACE.minorTick), i * 6);
    out.push({ kind: 'line', x: x0, y: y0, right: x1, bottom: y1, stroke: major ? Math.max(1.5, size / 80) : Math.max(1, size / 200), color: look.ticks });
  }
  const hand = (/** @type {number} */ deg, /** @type {number} */ length, /** @type {number} */ tail, /** @type {number} */ width, /** @type {string} */ color) => {
    const [x0, y0] = polar(c, -tail, deg);
    const [x1, y1] = polar(c, length, deg);
    out.push({ kind: 'line', x: x0, y: y0, right: x1, bottom: y1, stroke: width, color });
  };
  hand(at.hour, c * FACE.hour.length, c * FACE.hour.tail, Math.max(2, size / 30), look.hour);
  hand(at.minute, c * FACE.minute.length, c * FACE.minute.tail, Math.max(1.5, size / 45), look.minute);
  if (look.seconds) hand(at.second, c * FACE.second.length, c * FACE.second.tail, Math.max(1, size / 120), look.second);
  const dot = Math.max(3, size / 30);
  out.push({ kind: 'oval', x: c - dot, y: c - dot, right: c + dot, bottom: c + dot, color: look.seconds ? look.second : look.minute });
  return out;
}

/**
 * The time a clock shows, as its name: 'HH:MM:SS' (24 hours; 'HH:MM'
 * without seconds), local or UTC.
 * @param {number} ms @param {boolean} utc @param {boolean} seconds
 */
export function clockName(ms, utc, seconds) {
  const d = new Date(ms);
  const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const hm = `${two(utc ? d.getUTCHours() : d.getHours())}:${two(utc ? d.getUTCMinutes() : d.getMinutes())}`;
  return seconds ? `${hm}:${two(utc ? d.getUTCSeconds() : d.getSeconds())}` : hm;
}

/**
 * An analog clock: `value` (a Date, ms or ISO string: shows that time,
 * following it when it changes; controlled, it does not run), or
 * `defaultValue` (the time its own clock starts from: now by default) with
 * `running` (true; turned false it stops where it is, turned true again it
 * goes on from there), and `onChange` (each time shown, in ms: each second, or each frame with `secondHand` 'smooth'); `size` (`sizes.box.clock`, 200),
 * `seconds` (true: the second hand), `secondHand` ('tick' or 'smooth'),
 * `numerals` (true: the hour numbers), `utc` (false: local time), `color` (the second
 * hand's; red), `hourHandColor`, `minuteHandColor`. Time runs on the Clock context
 * (`<Clock value={manualClock()}>` from rui-core in tests). It means an
 * `img` named by the time it shows ('10:09:30'); its numbers are
 * decoration.
 * @param {Record<string, any>} props
 */
export function AnalogClock(props) {
  const R = $active();
  const ui = $ui();
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  const origin = $untrack(R, () => msOf(read(props.defaultValue) ?? Date.now()));
  const smooth = () => read(props.secondHand) === 'smooth';
  /** Quantized: a new value only when what is drawn changes (a second, or a frame when smooth). */
  const shown = $signal(R, origin);
  // The time it runs from (`base`, where it stood as it last started) and the clock's time then (`since`).
  let base = origin;
  let since = clock.now();
  /** The time it last reached. */
  let reached = origin;
  const update = (/** @type {number} */ now) => {
    const t = base + (now - since);
    reached = t;
    const q = $untrack(R, smooth) ? t : t - (((t % 1000) + 1000) % 1000);
    if (q !== $untrack(R, () => $read(shown))) {
      $write(shown, q);
      props.onChange?.(q);
    }
  };
  update(since);
  const running = () => props.value === undefined && read(props.running) !== false;
  // Its frame loop, while it runs: stopped as `running` turns false, started again (from the time it
  // reached) as it turns true, and at first when it starts running.
  /** @type {(() => void) | null} */
  let cancel = null;
  /** Whether it went away: a frame after that (its own `onChange` may remove it mid-frame) schedules nothing. */
  let gone = false;
  const frame = (/** @type {number} */ now) => {
    cancel = null;
    if (gone || !$untrack(R, running)) return;
    $batch(R, () => update(now));
    if (!gone) cancel = clock.frame(frame); // timer: feature, the clock's frame loop
  };
  $watch(R, running, on => {
    if (!on) {
      cancel?.();
      cancel = null;
    } else if (cancel === null && !gone) {
      base = reached;
      since = clock.now();
      cancel = clock.frame(frame); // timer: feature, the clock's frame loop
    }
  });
  const owner = $owner(R);
  if (owner != null)
    $cleanup(/** @type {any} */ (owner), () => {
      gone = true;
      cancel?.();
      cancel = null;
    });
  const time = () => (props.value !== undefined ? msOf(read(props.value)) : /** @type {number} */ ($read(shown)));
  const size = () => Number(read(props.size) ?? ui.theme().sizes.box.clock);
  const figures = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const page = pageColors(theme, scheme);
    const at = handAngles(time(), read(props.utc) === true, smooth());
    return clockFigures(size(), at, {
      face: page.body,
      border: page.border,
      ticks: page.quiet,
      hour: colorOf(theme, scheme, read(props.hourHandColor) ?? page.text),
      minute: colorOf(theme, scheme, read(props.minuteHandColor) ?? page.text),
      second: colorOf(theme, scheme, read(props.color) ?? 'red'),
      seconds: read(props.seconds) !== false,
    });
  };
  const numbers = () => (read(props.numerals) === false ? [] : [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const numberStyle = (/** @type {() => number} */ n) =>
    styled({}, (theme, scheme) => {
      const s = size();
      const box = s * FACE.numeral;
      const [x, y] = polar(s / 2, s / 2 - s * FACE.numeralAt, (n() % 12) * 30);
      return { position: 'absolute', left: x - box / 2, top: y - box / 2, width: box, height: box, align: 'center', justify: 'center', fontSize: Math.max(8, Math.round(s * FACE.numeralSize)), color: pageColors(theme, scheme).text };
    });
  const style = styled(props, () => ({ width: size(), height: size(), shrink: 0 }));
  const name = $memo(R, () => clockName(time(), read(props.utc) === true, read(props.seconds) !== false));
  return (
    <View role="img" aria-label={() => $read(name)} {...pass(props)} style={style}>
      <Shape shapes={figures} style={() => ({ position: 'absolute', top: 0, left: 0, width: size(), height: size() })} />
      <For by="position" each={numbers}>
        {n => (
          <View {...DECOR} style={numberStyle(n)}>
            <Label text={() => String(n())} style={{ textAlign: 'center' }} />
          </View>
        )}
      </For>
    </View>
  );
}
