// OverflowList: a row that keeps the items that fit in its width (on one
// line or a few) and folds the rest into one overflow item. It measures its
// pieces once laid out and settles the count on the next frame.

import { View, Label, read, $active, $signal, $read, $write, $memo, $watch, $untrack } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { pageColors, spacing } from '../../theme/resolve.js';
import { pass } from '../layout/layout.jsx';
import { $nextFrame, boxOf, insetsOf } from '../misc/tween.js';
import { handOn } from '../ref.js';

/** Half a pixel: a piece whose width rounds past the line by less than this still goes on it. */
const TOLERANCE = 0.5;

/**
 * The indices that show when `k` of `n` items show, folding at `fold`.
 * @param {number} i @param {number} k @param {number} n @param {string} fold
 */
const shows = (i, k, n, fold) => {
  if (k >= n) return true;
  if (fold === 'start') return i >= n - k;
  if (fold === 'middle') return i < Math.ceil(k / 2) || i >= n - Math.floor(k / 2);
  return i < k;
};

/**
 * Where the overflow item goes when `k` of `n` show: before the item of that
 * index (`n`: after them all).
 * @param {number} k @param {number} n @param {string} fold
 */
const slotOf = (k, n, fold) => (fold === 'start' ? 0 : fold === 'middle' ? Math.ceil(k / 2) : n);

/**
 * Whether `k` items fit: their widths and, when some fold, the overflow
 * item's (`more`), in the visual order, packed onto lines of `width` with
 * `gap` between, take at most `lines` lines.
 * @param {number} k @param {number} n @param {string} fold
 * @param {(i: number) => number} widthOf @param {number} more
 * @param {number} width @param {number} gap @param {number} lines
 */
function fits(k, n, fold, widthOf, more, width, gap, lines) {
  /** @type {number[]} */
  const pieces = [];
  const slot = slotOf(k, n, fold);
  for (let i = 0; i <= n; i++) {
    if (k < n && i === slot) pieces.push(more);
    if (i < n && shows(i, k, n, fold)) pieces.push(widthOf(i));
  }
  let used = 1;
  let x = 0;
  for (const w of pieces) {
    const at = x + (x > 0 ? gap : 0);
    if (at + w <= width + TOLERANCE || x === 0) x = at + w;
    else {
      used++;
      x = w;
    }
  }
  return used <= lines;
}

/**
 * The most items that show: every count from none up fits, at most `cap`.
 * @param {number} cap @param {(k: number) => boolean} fit
 */
function countOf(cap, fit) {
  let k = 0;
  while (k < cap && fit(k + 1)) k++;
  return k;
}

/**
 * A row of items that keeps as many as fit and folds the rest into one
 * overflow item: `data` (the items), `renderItem(item, index)`,
 * `renderMore(hidden)` (the overflow item, given the folded items in data
 * order; a quiet `+N` Label named `N more` by default), `lines` (1: how
 * many lines the items may take; more wraps the row), `limit` (the most
 * that show; none by default), `fold` (`end`: the last items fold; `start`:
 * the first fold; `middle`: the first and last stay) and `gap` (a spacing
 * step or px; `sm`). It settles once laid out and whenever `data`, its
 * width or those props change. A plain container: hidden items stay mounted
 * and hidden.
 * @param {Record<string, any>} props
 */
export function OverflowList(props) {
  const R = $active();
  const ui = $ui();
  const data = $memo(R, () => /** @type {any[]} */ (read(props.data) ?? []));
  const lines = () => Math.max(1, Number(read(props.lines) ?? 1) || 1);
  const fold = () => {
    const f = read(props.fold);
    return f === 'start' || f === 'middle' ? f : 'end';
  };
  const cap = () => {
    const n = $read(data).length;
    const limit = read(props.limit);
    return limit == null ? n : Math.max(0, Math.min(n, Math.floor(Number(limit)) || 0));
  };
  // Memos, so a frame's settle reads the theme where the list is (a lookup needs its owner).
  const gapMemo = $memo(R, () => spacing(ui.theme(), read(props.gap), 'sm'));
  const gap = () => $read(gapMemo);
  // The settled count; null before it settles (every item up to the cap shows).
  const settled = $signal(R, /** @type {number | null} */ (null));
  const count = $memo(R, () => {
    const k = $read(settled);
    return k === null ? cap() : Math.min(k, cap());
  });
  const hidden = $memo(R, () => {
    const list = $read(data);
    const k = $read(count);
    return list.filter((_, i) => !shows(i, k, list.length, fold()));
  });
  const slot = $memo(R, () => {
    const n = $read(data).length;
    const k = $read(count);
    return k < n ? slotOf(k, n, fold()) : -1;
  });

  /** @type {any} */
  let outer = null;
  /** @type {any} */
  let moreNode = null;
  /** @type {any[]} */
  let nodes = [];
  // Item widths by index, kept while an item hides; forgotten with the data.
  /** @type {Map<number, number>} */
  const widths = new Map();
  // The widest the overflow item has been since the data changed.
  let reserve = 0;
  let lastWidth = -1;
  const next = $nextFrame();

  const styleMemo = $memo(R, styled(props, () => ({ direction: 'row', align: 'center', overflow: 'hidden', wrap: lines() > 1, gap: gap() })));
  const style = () => $read(styleMemo);
  const contentWidth = () => {
    const inset = insetsOf($untrack(R, style));
    return boxOf(outer).width - inset.left - inset.right;
  };

  /** The count for the widths known. @param {number} width */
  const compute = width => {
    const n = $untrack(R, () => $read(data).length);
    const f = $untrack(R, fold);
    const g = $untrack(R, gap);
    const l = $untrack(R, lines);
    const widthOf = (/** @type {number} */ i) => widths.get(i) ?? 0;
    return countOf($untrack(R, cap), k => fits(k, n, f, widthOf, reserve, width, g, l));
  };

  /** Grows the overflow item's reserve to its width now; true when it grew. */
  const measureMore = () => {
    if (moreNode == null || $untrack(R, () => $read(slot)) < 0) return false;
    const w = boxOf(moreNode).width;
    if (w <= reserve) return false;
    reserve = w;
    return true;
  };

  // After the overflow item shows: its width, and a lower count if it grew.
  const check = () => {
    if (!measureMore()) return;
    const width = contentWidth();
    if (width <= 0) return;
    $write(settled, Math.min(compute(width), $untrack(R, () => $read(count))));
    next(check);
  };

  const settle = () => {
    const width = contentWidth();
    lastWidth = boxOf(outer).width;
    if (width <= 0) {
      $write(settled, null);
      return;
    }
    const list = $untrack(R, () => $read(data));
    const k = $untrack(R, () => $read(count));
    const f = $untrack(R, fold);
    for (let i = 0; i < list.length; i++) if (shows(i, k, list.length, f) && nodes[i] != null) widths.set(i, boxOf(nodes[i]).width);
    measureMore();
    $write(settled, compute(width));
    next(check);
  };

  // Shows every item up to the cap to measure them first when some width is unknown.
  const resettle = () => {
    const n = $untrack(R, () => $read(data).length);
    const c = $untrack(R, cap);
    const f = $untrack(R, fold);
    for (let i = 0; i < n; i++) if (shows(i, c, n, f) && !widths.has(i)) $write(settled, null);
    next(settle);
  };

  next(settle);
  let first = true;
  $watch(R, () => $read(data), () => {
    if (first) return void (first = false);
    widths.clear();
    reserve = 0;
    $write(settled, null);
    next(settle);
  });
  let firstProps = true;
  $watch(R, () => `${cap()}|${fold()}|${lines()}|${gap()}`, () => {
    if (firstProps) return void (firstProps = false);
    resettle();
  });

  const onResize = (/** @type {{ width: number }} */ box) => {
    if (box.width === lastWidth) return;
    lastWidth = box.width;
    next(settle);
  };

  const quiet = styled({}, (theme, scheme) => ({ color: pageColors(theme, scheme).quiet }));
  const more = () => {
    if (props.renderMore != null) return props.renderMore($read(hidden));
    const n = $read(hidden).length;
    return <Label aria-label={`${n} more`} text={`+${n}`} style={quiet} />;
  };
  const piece = { shrink: 0 };
  const moreView = () => (
    <View ref={(/** @type {any} */ n) => (moreNode = n)} style={piece}>
      {more}
    </View>
  );
  const ref = (/** @type {any} */ n) => {
    outer = n;
    handOn(props.ref, n);
  };

  return (
    <View {...pass(props)} ref={ref} onResize={onResize} style={style}>
      {() => {
        const list = $read(data);
        nodes = new Array(list.length).fill(null);
        const out = [];
        for (let i = 0; i <= list.length; i++) {
          const at = i;
          out.push(() => ($read(slot) === at ? moreView() : null));
          if (i === list.length) break;
          out.push(
            <View ref={(/** @type {any} */ n) => (nodes[at] = n)} hidden={() => !shows(at, $read(count), list.length, fold())} style={piece}>
              {props.renderItem?.(list[at], at)}
            </View>,
          );
        }
        return out;
      }}
    </View>
  );
}
