// Geometry for the charts, as the portable Shape's records: curves through
// points (linear, monotone, natural steps and bumps sampled into line
// segments, since a Shape path is straight segments), dashed lines as
// dashes, stacking, a curve split at zero (AreaChart's split), and arcs and
// wedges on a polar convention (degrees counter-clockwise from
// three o'clock).

/** @typedef {Record<string, any>} Figure */
/** @typedef {'linear' | 'monotone' | 'natural' | 'step' | 'stepBefore' | 'stepAfter' | 'bump'} Curve */

/** Segments a cubic span is sampled into. */
const SAMPLES = 8; // count: straight segments per cubic span

/**
 * The tangents of a monotone cubic through the points (Fritsch and
 * Carlson: no overshoot).
 * @param {ArrayLike<number>} xs @param {ArrayLike<number>} ys
 */
function tangents(xs, ys) {
  const n = xs.length;
  const d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    d[i] = dx === 0 ? 0 : (ys[i + 1] - ys[i]) / dx;
  }
  const m = new Float64Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return m;
}

/**
 * The second derivatives of the natural cubic spline through the points
 * (zero at both ends), by the tridiagonal (Thomas) solve.
 * @param {ArrayLike<number>} xs @param {ArrayLike<number>} ys
 */
function naturalMoments(xs, ys) {
  const n = xs.length;
  const M = new Float64Array(n);
  const c = new Float64Array(n);
  const d = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const h0 = xs[i] - xs[i - 1] || 1;
    const h1 = xs[i + 1] - xs[i] || 1;
    const a = h0;
    const b = 2 * (h0 + h1);
    const r = 6 * ((ys[i + 1] - ys[i]) / h1 - (ys[i] - ys[i - 1]) / h0);
    const w = b - a * c[i - 1];
    c[i] = h1 / w;
    d[i] = (r - a * d[i - 1]) / w;
  }
  for (let i = n - 2; i >= 1; i--) M[i] = d[i] - c[i] * M[i + 1];
  return M;
}

/**
 * The points of a curve through (xs, ys), as a flat x, y array.
 * @param {ArrayLike<number>} xs @param {ArrayLike<number>} ys @param {Curve | string} [type]
 * @returns {number[]}
 */
export function curvePoints(xs, ys, type = 'linear') {
  const n = xs.length;
  /** @type {number[]} */
  const out = [];
  if (n === 0) return out;
  out.push(xs[0], ys[0]);
  if (n === 1) return out;
  switch (type) {
    case 'step':
      for (let i = 1; i < n; i++) {
        const mid = (xs[i - 1] + xs[i]) / 2;
        out.push(mid, ys[i - 1], mid, ys[i], xs[i], ys[i]);
      }
      return out;
    case 'stepBefore':
      for (let i = 1; i < n; i++) out.push(xs[i - 1], ys[i], xs[i], ys[i]);
      return out;
    case 'stepAfter':
      for (let i = 1; i < n; i++) out.push(xs[i], ys[i - 1], xs[i], ys[i]);
      return out;
    case 'bump':
      for (let i = 1; i < n; i++) {
        const x0 = xs[i - 1];
        const x1 = xs[i];
        const mid = (x0 + x1) / 2;
        const y0 = ys[i - 1];
        const y1 = ys[i];
        for (let k = 1; k <= SAMPLES; k++) {
          const t = k / SAMPLES;
          const u = 1 - t;
          // A cubic with control points (mid, y0) and (mid, y1).
          const x = u * u * u * x0 + 3 * u * u * t * mid + 3 * u * t * t * mid + t * t * t * x1;
          const y = u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1;
          out.push(x, y);
        }
      }
      return out;
    case 'natural': {
      if (n === 2) {
        out.push(xs[1], ys[1]);
        return out;
      }
      const M = naturalMoments(xs, ys);
      for (let i = 0; i < n - 1; i++) {
        const h = xs[i + 1] - xs[i];
        for (let k = 1; k <= SAMPLES; k++) {
          const t = k / SAMPLES;
          const a = 1 - t;
          // The natural cubic spline between knots i and i + 1.
          const y = a * ys[i] + t * ys[i + 1] + ((a * a * a - a) * M[i] + (t * t * t - t) * M[i + 1]) * (h * h) / 6;
          out.push(xs[i] + h * t, y);
        }
      }
      return out;
    }
    case 'monotone': {
      if (n === 2) {
        out.push(xs[1], ys[1]);
        return out;
      }
      const m = tangents(xs, ys);
      for (let i = 0; i < n - 1; i++) {
        const h = xs[i + 1] - xs[i];
        for (let k = 1; k <= SAMPLES; k++) {
          const t = k / SAMPLES;
          const t2 = t * t;
          const t3 = t2 * t;
          const y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
          out.push(xs[i] + h * t, y);
        }
      }
      return out;
    }
    default:
      for (let i = 1; i < n; i++) out.push(xs[i], ys[i]);
      return out;
  }
}

/**
 * A dash pattern from a `dash` ('6 3', '4', 3): pairs of
 * dash and gap lengths; empty for a solid line.
 * @param {string | number | readonly number[] | undefined | null} pattern
 * @returns {number[]}
 */
export function dashPattern(pattern) {
  if (pattern == null || pattern === '' || pattern === 0 || pattern === 'none') return [];
  const parts = typeof pattern === 'number' ? [pattern] : Array.isArray(pattern) ? pattern.map(Number) : String(pattern).trim().split(/[\s,]+/).map(Number);
  const list = parts.filter(v => Number.isFinite(v) && v >= 0);
  if (list.length === 0 || list.every(v => v === 0)) return [];
  return list.length % 2 === 1 ? [...list, ...list] : list;
}

/**
 * A straight line as Shape figures: one line when solid, its dashes
 * otherwise.
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {string} color @param {number} width @param {readonly number[]} dashes from `dashPattern`
 * @param {Figure[]} [out]
 */
export function dashedLine(x0, y0, x1, y1, color, width, dashes, out = []) {
  if (dashes.length === 0) {
    out.push({ kind: 'line', x: x0, y: y0, right: x1, bottom: y1, color, stroke: width });
    return out;
  }
  const length = Math.hypot(x1 - x0, y1 - y0);
  if (length === 0) return out;
  const ux = (x1 - x0) / length;
  const uy = (y1 - y0) / length;
  let at = 0;
  for (let k = 0; at < length; k++) {
    const dash = dashes[k % dashes.length];
    const gap = dashes[(k + 1) % dashes.length];
    k++;
    const end = Math.min(length, at + dash);
    if (end > at) out.push({ kind: 'line', x: x0 + ux * at, y: y0 + uy * at, right: x0 + ux * end, bottom: y0 + uy * end, color, stroke: width });
    if (dash + gap <= 0) break;
    at = end + gap;
  }
  return out;
}

/**
 * Runs of indexes with a value: one run over every present value when
 * `connect` (a chart's `bridge`), else a run between each gap.
 * @param {ArrayLike<number>} values @param {boolean} connect
 * @returns {number[][]}
 */
export function runs(values, connect) {
  /** @type {number[][]} */
  const out = [];
  /** @type {number[]} */
  let run = [];
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) run.push(i);
    else if (!connect && run.length > 0) {
      out.push(run);
      run = [];
    }
  }
  if (run.length > 0) out.push(run);
  return out;
}

/**
 * Stacks series row by row (`stack`: positives up from 0, negatives down,
 * a `sign` offset), or each row as percents of its total (`share`), the
 * charts' `kind` words.
 * @param {readonly Record<string, any>[]} rows @param {readonly string[]} keys @param {'stack' | 'share'} mode
 * @returns {{ lo: Float64Array, hi: Float64Array }[]} per key, per row (NaN where the row has no value)
 */
export function stackSeries(rows, keys, mode) {
  const n = rows.length;
  const out = keys.map(() => ({ lo: new Float64Array(n).fill(NaN), hi: new Float64Array(n).fill(NaN) }));
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    let total = 0;
    if (mode === 'share') for (const key of keys) total += Math.abs(numberOf(row[key]) || 0);
    let up = 0;
    let down = 0;
    for (let k = 0; k < keys.length; k++) {
      let v = numberOf(row[keys[k]]);
      if (!Number.isFinite(v)) continue;
      if (mode === 'share') v = total === 0 ? 0 : (v / total) * 100;
      if (v >= 0) {
        out[k].lo[i] = up;
        out[k].hi[i] = up += v;
      } else {
        out[k].lo[i] = down;
        out[k].hi[i] = down += v;
      }
    }
  }
  return out;
}

/** @param {any} v */
const numberOf = v => (v == null || v === '' ? NaN : Number(v));

/**
 * A polyline cut where it crosses `level` (a y in pixels): the pieces on
 * each side, each a flat x, y array with the crossing added to both.
 * @param {readonly number[]} points @param {number} level
 * @returns {{ above: number[][], below: number[][] }} above: y ≤ level (the screen's up)
 */
export function splitAt(points, level) {
  /** @type {number[][]} */
  const above = [];
  /** @type {number[][]} */
  const below = [];
  /** @type {number[]} */
  let piece = [];
  let side = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    const s = y < level ? 1 : y > level ? -1 : side;
    if (i > 0 && s !== side && side !== 0 && s !== 0) {
      const px = points[i - 2];
      const py = points[i - 1];
      const t = (level - py) / (y - py);
      const cx = px + (x - px) * t;
      piece.push(cx, level);
      (side > 0 ? above : below).push(piece);
      piece = [cx, level];
    }
    if (s !== 0) side = s;
    piece.push(x, y);
  }
  if (piece.length >= 4) (side >= 0 ? above : below).push(piece);
  return { above, below };
}

/**
 * A point on a circle: degrees counter-clockwise from three
 * o'clock.
 * @param {number} cx @param {number} cy @param {number} r @param {number} deg
 * @returns {[number, number]}
 */
export function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

/**
 * The points of an arc from `from` to `to` degrees (polar's convention).
 * @param {number} cx @param {number} cy @param {number} r @param {number} from @param {number} to
 * @returns {number[]}
 */
export function arcPoints(cx, cy, r, from, to) {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 4));
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const [x, y] = polar(cx, cy, r, from + ((to - from) * i) / steps);
    out.push(x, y);
  }
  return out;
}

/**
 * A pie wedge or a ring sector as a closed path's points: the outer arc
 * from `from` to `to`, then the inner arc back (the center for a pie).
 * @param {number} cx @param {number} cy @param {number} inner @param {number} outer @param {number} from @param {number} to
 * @returns {number[]}
 */
export function wedge(cx, cy, inner, outer, from, to) {
  const points = arcPoints(cx, cy, outer, from, to);
  if (inner <= 0) points.push(cx, cy);
  else {
    const back = arcPoints(cx, cy, inner, to, from);
    for (let i = 0; i < back.length; i++) points.push(back[i]);
  }
  return points;
}

/**
 * The angle (polar's convention, 0 to 360) and distance of a point from a
 * center: for hit testing wedges and rings.
 * @param {number} cx @param {number} cy @param {number} x @param {number} y
 */
export function angleOf(cx, cy, x, y) {
  let deg = (Math.atan2(cy - y, x - cx) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return { deg, r: Math.hypot(x - cx, y - cy) };
}

/**
 * Whether `deg` lies on the sweep from `from` to `to` (either direction).
 * @param {number} deg @param {number} from @param {number} to
 */
export function onSweep(deg, from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  if (hi - lo >= 360) return true;
  const d = (((deg - lo) % 360) + 360) % 360;
  return d <= hi - lo;
}

/**
 * A closed polygon shaded top to bottom: one Shape figure whose `fill`
 * (ren-core's Shape fill, a linear ramp turned 180°) takes opacity `from`
 * at the polygon box's top edge down to `to` at its bottom edge. Its
 * `color` is the top's, for a reader of the figure.
 * @param {readonly number[]} points @param {(opacity: number) => string} color
 * @param {number} from @param {number} to @param {Figure[]} [out]
 * @returns {Figure[]}
 */
export function gradientFill(points, color, from, to, out = []) {
  if (points.length < 6) return out;
  const top = color(from);
  out.push({ kind: 'path', closed: true, color: top, fill: { linear: 180, stops: [[0, top], [1, color(to)]] }, points: points.slice() });
  return out;
}
