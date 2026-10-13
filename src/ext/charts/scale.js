// Scales and ticks for the charts: a linear scale, a band scale (bars) and a
// point scale (lines and areas: the first category on the left edge),
// nice tick steps (1, 2, 2.5, 5 times a power of ten), and the default
// value formatter.

/**
 * A linear map from a domain to a range; an empty domain maps to the
 * range's middle.
 * @param {number} d0 @param {number} d1 @param {number} r0 @param {number} r1
 * @returns {(value: number) => number}
 */
export function linearScale(d0, d1, r0, r1) {
  const span = d1 - d0;
  if (span === 0 || !Number.isFinite(span)) {
    const mid = (r0 + r1) / 2;
    return () => mid;
  }
  const k = (r1 - r0) / span;
  return value => r0 + (value - d0) * k;
}

/**
 * @typedef {object} Band
 * @property {number} step the space of one category
 * @property {(index: number) => number} start where a category's space starts
 * @property {(index: number) => number} center its middle
 * @property {(at: number) => number} index the category at a position (clamped)
 */

/**
 * `count` categories sharing `from` to `to` in equal steps (bars).
 * @param {number} count @param {number} from @param {number} to
 * @returns {Band}
 */
export function bandScale(count, from, to) {
  const n = Math.max(1, count);
  const step = (to - from) / n;
  return {
    step,
    start: i => from + i * step,
    center: i => from + (i + 0.5) * step,
    index: at => Math.max(0, Math.min(n - 1, Math.floor((at - from) / (step || 1)))),
  };
}

/**
 * `count` categories as points from `from` to `to`, the first and last on
 * the ends (lines and areas); one category sits in the middle.
 * @param {number} count @param {number} from @param {number} to
 * @returns {Band}
 */
export function pointScale(count, from, to) {
  const n = Math.max(1, count);
  const step = n === 1 ? to - from : (to - from) / (n - 1);
  const center = n === 1 ? () => (from + to) / 2 : (/** @type {number} */ i) => from + i * step;
  return {
    step,
    start: i => center(i) - step / 2,
    center,
    index: at => (n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((at - from) / (step || 1))))),
  };
}

/**
 * A nice step near `raw`: 1, 2, 2.5, 5 or 10 times a power of ten.
 * @param {number} raw
 */
export function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const e = 10 ** Math.floor(Math.log10(raw));
  const f = raw / e;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  const step = nice * e;
  // Under the smallest normal number the power of ten is 0 (a step of 0): the step as it is.
  return step > 0 && Number.isFinite(step) ? step : raw;
}

/**
 * The step `count` even parts of `min` to `max` take, finite however wide
 * the range (each end divided first: max - min may pass the largest number).
 * @param {number} min @param {number} max @param {number} parts
 */
const partOf = (min, max, parts) => {
  const step = (max - min) / parts;
  return Number.isFinite(step) ? step : max / parts - min / parts;
};

/**
 * Drops floating-point noise from a tick (0.30000000000000004 to 0.3),
 * rounding to a hundredth of the step's power of ten, at any scale (1e-17
 * steps as 1e25 ones); a value under that is 0.
 * @param {number} v @param {number} step
 */
const clean = (v, step) => {
  if (v === 0 || !Number.isFinite(v) || !(step > 0) || !Number.isFinite(step)) return v + 0;
  const digits = Math.floor(Math.log10(Math.abs(v))) - Math.floor(Math.log10(step)) + 3;
  if (digits < 1) return 0;
  const near = Number(v.toPrecision(Math.min(21, digits))) + 0;
  // Rounded past the largest number: the value as it is.
  return Number.isFinite(near) ? near : v;
};

/**
 * Nice ticks around `min` to `max`: the domain widened to whole steps and
 * about `count` ticks on it.
 * @param {number} min @param {number} max @param {number} [count]
 * @returns {{ min: number, max: number, ticks: number[] }}
 */
export function niceTicks(min, max, count = 5) {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 0;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    if (lo === 0) hi = 1;
    else if (lo > 0) lo = 0;
    else hi = 0;
  }
  const part = partOf(lo, hi, Math.max(1, count - 1));
  // A part under the smallest number is 0: the whole range is then the step.
  const step = niceStep(part > 0 ? part : hi - lo);
  const from = Math.floor(lo / step + 1e-9) * step;
  const to = Math.ceil(hi / step - 1e-9) * step;
  // A whole step past the largest number: the data's own ends, divided evenly.
  if (!Number.isFinite(from) || !Number.isFinite(to)) return ticksWithin(lo, hi, count);
  /** @type {number[]} */
  const ticks = [];
  for (let i = 0, v = from; v <= to + step * 1e-9 && i < 1000; i++, v = from + i * step) ticks.push(clean(v, step));
  return { min: clean(from, step), max: clean(to, step), ticks };
}

/**
 * Ticks inside a fixed domain (a given `domain`): the domain stays and
 * `count` ticks divide it evenly, both ends included.
 * @param {number} min @param {number} max @param {number} [count]
 */
export function ticksWithin(min, max, count = 5) {
  const n = Math.max(2, count);
  const step = partOf(min, max, n - 1);
  if (!(step > 0)) return { min, max, ticks: [min] };
  /** @type {number[]} */
  const ticks = [];
  for (let i = 0; i < n; i++) {
    const v = min + i * step;
    // Past the largest number on the way (a range wider than it): halved, the sum stays in range.
    ticks.push(clean(Number.isFinite(v) ? v : (min / 2 + i * (step / 2)) * 2, step));
  }
  return { min, max, ticks };
}

/**
 * The value axis of a chart: the data's extent (with 0 by default), a
 * `domain` ([min, max]; numbers fix an end, 'auto', 'dataMin' and
 * 'dataMax' follow the data) and nice ticks.
 * @param {number} dataMin @param {number} dataMax @param {readonly any[] | undefined | null} domain @param {number} [count] @param {boolean} [withZero]
 */
export function valueAxis(dataMin, dataMax, domain, count = 5, withZero = true) {
  let lo = Number.isFinite(dataMin) ? dataMin : 0;
  let hi = Number.isFinite(dataMax) ? dataMax : 0;
  if (withZero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  const d0 = domain?.[0];
  const d1 = domain?.[1];
  const fixed0 = typeof d0 === 'number';
  const fixed1 = typeof d1 === 'number';
  if (d0 === 'dataMin') lo = dataMin;
  if (d1 === 'dataMax') hi = dataMax;
  if (fixed0 && fixed1) return ticksWithin(d0, d1, count);
  const nice = niceTicks(fixed0 ? d0 : lo, fixed1 ? d1 : hi, count);
  if (!fixed0 && !fixed1) return nice;
  const min = fixed0 ? d0 : nice.min;
  const max = fixed1 ? d1 : nice.max;
  return ticksWithin(min, max, count);
}

/** The default value format: the number as it is. @param {any} value */
export const plain = value => (value == null ? '' : String(value));

/**
 * A number from a data field; NaN for a missing one.
 * @param {any} v
 */
export const num = v => (v == null || v === '' ? NaN : Number(v));
