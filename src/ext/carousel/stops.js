// A carousel's geometry, as plain numbers: where each stop puts the strip,
// which stop each slide belongs to, the loop's period and where each slide
// goes so a loop has no end. Offsets are in one unit throughout: fractions
// of the frame when slide sizes are percents (the strip moves by percents),
// pixels otherwise. Offset 0 puts the first slide at the frame's start.

/**
 * @typedef {object} Stops
 * @property {number[]} stops the strip's offset at each stop
 * @property {number[]} ofSlide the stop of each slide
 * @property {number} step one slide's length, its gap included
 * @property {number} frame the frame's length (the viewport's and one gap)
 * @property {number} period all the slides' length: a loop repeats after it
 * @property {boolean} loop whether it loops (asked, and enough slides to fill the frame and one more)
 * @property {boolean} percent whether the unit is the frame (percents) or px
 * @property {number} count the slides
 */

/**
 * A slide size as a number and its unit: a percent string, px (a number
 * or a '300px' string), or an object of breakpoints not resolved, whose
 * `base` counts (Carousel resolves one at the root's viewport first).
 * @param {any} size
 * @returns {{ value: number, percent: boolean }}
 */
export function sizeOf(size) {
  let s = size;
  if (s !== null && typeof s === 'object') s = s.base ?? Object.values(s)[0];
  if (typeof s === 'number') return { value: s, percent: false };
  const t = String(s ?? '100%').trim();
  if (t.endsWith('%')) return { value: parseFloat(t) || 100, percent: true };
  return { value: parseFloat(t) || 0, percent: false };
}

/** An index wrapped into 0..n-1. @param {number} i @param {number} n */
export const wrap = (i, n) => ((i % n) + n) % n;

/**
 * The stops of a carousel: where the strip rests, one per group of `group`
 * slides placed by `align`. Without a loop, `ends` says what the strip does
 * past its ends: 'open' (the default) leaves the stops where `align` puts
 * them; 'fill' keeps the frame filled (each stop within the content) and
 * makes the stops that land together one.
 * @param {{ count: number, step: number, frame: number, align: 'start' | 'center' | 'end' | number | string, loop: boolean, ends: 'open' | 'fill', group: number, percent: boolean }} o
 * @returns {Stops}
 */
export function stopsOf(o) {
  const n = o.count;
  const step = o.step;
  const frame = o.frame;
  const group = Math.max(1, Math.floor(o.group));
  const period = n * step;
  const loop = o.loop && n > 1 && step > 0 && period >= frame + step - 1e-9;
  /** Where a group of `width` sits in the frame by the alignment. @param {number} width */
  const shift = width => {
    const a = o.align;
    if (typeof a === 'number') return frame * a;
    if (a === 'start') return 0;
    if (a === 'end') return frame - width;
    return (frame - width) / 2;
  };
  /** @type {number[]} */
  const raw = [];
  for (let g = 0; g * group < n; g++) raw.push(g * group * step - shift(Math.min(group, n - g * group) * step));
  let stops = raw;
  let ofGroup = raw.map((_, i) => i);
  if (!loop && o.ends === 'fill') {
    const max = Math.max(0, period - frame);
    // Each stop within the content; stops that land on one offset are one.
    stops = [];
    ofGroup = raw.map(r => {
      const v = Math.max(0, Math.min(max, r));
      if (stops.length === 0 || Math.abs(stops[stops.length - 1] - v) > 1e-9) stops.push(v);
      return stops.length - 1;
    });
  }
  const ofSlide = Array.from({ length: n }, (_, i) => ofGroup[Math.floor(i / group)]);
  return { stops, ofSlide, step, frame, period, loop, percent: o.percent, count: n };
}

/**
 * The stop nearest an offset (in a loop, nearest any of its copies).
 * @param {Stops} geo @param {number} offset
 */
export function nearest(geo, offset) {
  let best = 0;
  let distance = Infinity;
  for (let i = 0; i < geo.stops.length; i++) {
    let d = offset - geo.stops[i];
    if (geo.loop) d -= Math.round(d / geo.period) * geo.period;
    if (Math.abs(d) < distance - 1e-9) {
      distance = Math.abs(d);
      best = i;
    }
  }
  return best;
}

/**
 * How far a looping slide moves (whole periods) so that, with the strip at
 * `offset` (within one period), it lies in the period centered on the
 * frame: the slides leaving one side come back on the other.
 * @param {Stops} geo @param {number} index @param {number} offset
 */
export function shiftOf(geo, index, offset) {
  if (!geo.loop) return 0;
  const x = index * geo.step - offset;
  const lo = (geo.frame - geo.period) / 2;
  // `+ 0` turns -0 into 0.
  return Math.ceil((lo - x) / geo.period - 1e-9) * geo.period + 0;
}
