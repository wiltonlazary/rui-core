// Sortable: a list whose items are taken to another place by their handle,
// with the pointer (held by capture, the item following it and the others
// making room) or with the keys (lift, move, drop). The list is the
// caller's: one change is told at the drop.

import { View, Label, Action, Shape, For, read, $active, $signal, $memo, $read, $write, $untrack, $watch, $after, $context, $lookup, $owner, $cleanup } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { pageColors, shadowOf, sized } from '../../theme/resolve.js';
import { MOTION } from '../../theme/motion.js';
import { pass } from '../../core/layout/layout.jsx';
import { $controlled, keyOf, prevent, handled, activeOf, focus } from '../../core/overlays/shared.jsx';
import { $follow } from '../../core/misc/tween.js';
import { $list } from '../../hooks/collections.js';
import { handOn } from '../../core/ref.js';
import { dragger, pointOf, boxOf, clamp } from './shared.js';
import { DECOR, UNSEEN, flag, state, $uid } from '../../theme/meaning.js';
import { labelsIn } from '../../theme/labels.js';

/**
 * An item's row, as its list knows it.
 * @typedef {object} SortableRow
 * @property {() => number} index its place in the list now
 * @property {any} node its Sortable.Item
 * @property {any} handle its Sortable.Handle
 * @property {() => boolean} disabled it is not taken (its Sortable.Item's `disabled`)
 */

/**
 * A move under way: the place the item was taken from and the one it would
 * drop at, how far the pointer took it along the list (px), and whether the
 * keys hold it.
 * @typedef {{ from: number, to: number, delta: number, keys: boolean }} SortableMove
 */

/**
 * What a list gives its items and handles.
 * @typedef {object} SortableApi
 * @property {() => boolean} vertical
 * @property {() => boolean} disabled
 * @property {() => SortableMove | null} move the move under way (tracked)
 * @property {(row: SortableRow) => number} offset how far a row shows from its place, along the list, px (tracked)
 * @property {(row: SortableRow, e: any) => void} down a pointer pressed on a row's handle
 * @property {(e: any) => void} track the held pointer moved
 * @property {(e: any) => void} up the held pointer let go
 * @property {() => void} abort the move ends where it started, with no change told
 * @property {(e: any) => void} cancel the platform took the held pointer back
 * @property {(row: SortableRow, e: any) => void} key a key on a row's handle
 * @property {string} help the id of the text that says how the keys move an item
 */

const ListContext = $context(/** @type {SortableApi | null} */ (null));
const RowContext = $context(/** @type {SortableRow | null} */ (null));

/**
 * A list sorted by hand: `value` (its items, in order) + `onChange(items)`
 * or `defaultValue`, `by(item)` (what tells an item from the others: the
 * item itself by default, so items are distinct), and its children a
 * function `(item, index) => node` (accessors, as ren-core's For gives them)
 * that draws each item in a `Sortable.Item` holding a `Sortable.Handle`.
 * `onCommit(items, from, to)` hears each drop that moved an item: the list
 * in its new order, the item's place before and after (as `$list`'s
 * `move(from, to)` takes them); `onChange` hears that list too. Nothing is
 * told while an item is held, by a drop on its own place, or when the move
 * is given up. `orientation` ('vertical' or 'horizontal'), `disabled` (no
 * item is taken), `gap` (spacing xs) and the layout props.
 *
 * A handle pressed takes its item: it follows the pointer along the list
 * while the others make room, and drops where the pointer lets go. Let go
 * further from the list than the item is long, taken back by the platform,
 * or with Escape, the move is given up; so it is when the list changes
 * under it or turns `disabled`. Only a handle starts a move (its `touchAction` is 'none'), so
 * a touch elsewhere on the list still pans the page. On a focused handle,
 * Space or Enter lifts the item, the arrows along the list (Home, End) move
 * it, Space or Enter drops it, Escape or Tab gives it up; the focus stays on
 * the handle of the item moved. The page is not scrolled for a held item.
 *
 * It means a `list` of `listitem`s; a handle is a `button` named 'Reorder'
 * (its `label`), `aria-pressed` while it holds its item and described by
 * the keys' text; each lift, place, drop and give-up is said in a `status`.
 * @param {Record<string, any>} props
 */
export function Sortable(props) {
  const R = $active();
  const state = $controlled(props, 'value', 'defaultValue', /** @type {any[]} */ ([]), v => props.onChange?.(v));
  const items = () => /** @type {any[]} */ (state.get() ?? []);
  const keyOfItem = (/** @type {any} */ item) => (typeof props.by === 'function' ? props.by(item) : item);
  const vertical = () => read(props.orientation) !== 'horizontal';
  const disabled = () => read(props.disabled) === true;
  /** The rows built, one per item shown. @type {Set<SortableRow>} */
  const rows = new Set();
  const move = $signal(R, /** @type {SortableMove | null} */ (null));
  const now = () => /** @type {SortableMove | null} */ ($untrack(R, () => $read(move)));
  const said = $signal(R, '');
  // The reorder is `$list`'s `move`: the list as it is, then the item taken to its place.
  const order = $list(R, /** @type {any[]} */ ([]));
  /** @type {any} */
  let root = null;
  /**
   * What a move measured as it started: each item's start and length along the list in order, the room the taken one
   * leaves, the list's own start (a scroll under the pointer moves it), the items' identities, the row taken and the
   * pointer held (none for the keys).
   * @type {{ boxes: { start: number, size: number }[], span: number, origin: number, keys: unknown[], row: SortableRow, held: { node: any, id: any } | null } | null}
   */
  let taken = null;
  /** Whether the pointer is where a release gives the move up. */
  let lost = false;
  let gone = false;
  /** A box along the list and across it. @param {{ x: number, y: number, width: number, height: number }} b */
  const along = b => (vertical() ? { start: b.y, size: b.height, cross: b.x, across: b.width } : { start: b.x, size: b.width, cross: b.y, across: b.height });
  /** How far the taken item sits from its place once at `to`. @param {number} from @param {number} to */
  const slot = (from, to) => {
    const b = /** @type {NonNullable<typeof taken>} */ (taken).boxes;
    return to > from ? b[to].start + b[to].size - (b[from].start + b[from].size) : to < from ? b[to].start - b[from].start : 0;
  };
  /** Says a line in the status. @param {string} text */
  const say = text => void $write(said, text);
  /** Lets the held pointer go. */
  const release = () => {
    const held = taken?.held;
    if (held == null) return;
    try {
      held.node?.releasePointerCapture?.(held.id);
    } catch {
      // The platform let it go already.
    }
  };
  /** Ends the move with nothing told. */
  const end = () => {
    release();
    taken = null;
    if (!gone && now() !== null) $write(move, null);
  };
  /** Takes a row's item: measures the list as it lies. @param {SortableRow} row @param {boolean} keys @param {{ node: any, id: any } | null} held */
  const take = (row, keys, held) => {
    if (disabled() || row.disabled() || now() !== null) return false;
    const list = $untrack(R, items);
    const ordered = [...rows].sort((a, b) => $untrack(R, a.index) - $untrack(R, b.index));
    const from = ordered.indexOf(row);
    if (from < 0 || ordered.length !== list.length) return false;
    const boxes = ordered.map(r => {
      const b = along(boxOf(r.node));
      return { start: b.start, size: b.size };
    });
    const n = boxes.length;
    // The room the item leaves: to the next one's start, or from the one before's end.
    const span = from < n - 1 ? boxes[from + 1].start - boxes[from].start : n > 1 ? boxes[from].start + boxes[from].size - (boxes[from - 1].start + boxes[from - 1].size) : 0;
    taken = { boxes, span, origin: along(boxOf(root)).start, keys: list.map(keyOfItem), row, held };
    $write(move, { from, to: from, delta: 0, keys });
    say(labelsIn().sortableTaken(from + 1, n));
    return true;
  };
  /** Gives the move up: every item back in its place, nothing told. */
  const giveUp = () => {
    if (now() === null) return;
    end();
    say(labelsIn().sortableCanceled);
  };
  /** Gives the move up from outside the pointer's own events (a key, the list changed, the handle's blur). */
  const abort = () => {
    pointer.cancel();
    giveUp();
  };
  /** Drops the item where it is: a place of its own tells nothing. */
  const drop = () => {
    const m = now();
    const t = taken;
    if (m === null || t === null) return;
    const n = t.boxes.length;
    const focused = m.keys || activeOf(t.row.handle) === t.row.handle;
    end();
    say(labelsIn().sortableDropped(m.to + 1, n));
    if (m.to === m.from) return;
    order.set($untrack(R, items));
    order.move(m.from, m.to);
    const next = /** @type {any[]} */ ($untrack(R, () => $read(order.value)));
    state.set(next);
    props.onCommit?.(next, m.from, m.to);
    // The rows moved: the handle of the item moved keeps the focus it had.
    if (focused) $after(R, () => focus(t.row.handle));
  };
  /** The held pointer at `e`: the item follows, and its place is the count of the others whose middle it passed. @param {any} e @param {number} dx @param {number} dy */
  const follow = (e, dx, dy) => {
    const m = now();
    const t = taken;
    if (m === null || t === null || m.keys) return;
    const box = along(boxOf(root));
    const p = pointOf(e);
    const at = vertical() ? { main: p.y, cross: p.x } : { main: p.x, cross: p.y };
    // Further from the list than the item is long, the move would be given up: the others show their places.
    const far = t.boxes[m.from].size;
    const outside = at.main < box.start - far || at.main > box.start + box.size + far || at.cross < box.cross - far || at.cross > box.cross + box.across + far;
    const delta = (vertical() ? dy : dx) + (t.origin - box.start);
    const center = t.boxes[m.from].start + t.boxes[m.from].size / 2 + delta;
    let to = 0;
    for (let j = 0; j < t.boxes.length; j++) if (j !== m.from && t.boxes[j].start + t.boxes[j].size / 2 < center) to++;
    if (outside) to = m.from;
    if (to !== m.to) say(labelsIn().sortablePlace(to + 1, t.boxes.length));
    $write(move, { from: m.from, to, delta, keys: false });
    lost = outside;
  };
  const pointer = dragger({
    onMove: (dx, dy, _s, e) => follow(e, dx, dy),
    // A press the platform took back gives the move up; a release drops, unless it is far from the list.
    onEnd: (_s, _moved, e) => (e === null || lost ? giveUp() : drop()),
  });
  // The list changed under a move (other items, or another order): the places measured are no longer its own.
  $watch(R, () => items().map(keyOfItem), keys => {
    if (taken === null) return;
    const before = taken.keys;
    if (keys.length !== before.length || keys.some((k, i) => !Object.is(k, before[i]))) abort();
  });
  // Disabled with an item held, the move is given up.
  $watch(R, disabled, off => void (off && abort()));
  /** Whether a pointer event is the held pointer's (another finger on another handle is not). @param {any} e */
  const mine = e => taken?.held == null || e?.pointerId == null || taken.held.id == null || e.pointerId === taken.held.id;
  const owner = $owner(R);
  if (owner != null)
    $cleanup(/** @type {any} */ (owner), () => {
      // It goes with an item held: the pointer is let go, and nothing more is written.
      gone = true;
      end();
    });
  const help = $uid('sortable');
  /** @type {SortableApi} */
  const api = {
    vertical,
    disabled,
    move: () => /** @type {SortableMove | null} */ ($read(move)),
    offset(row) {
      const m = /** @type {SortableMove | null} */ ($read(move));
      if (m === null || taken === null) return 0;
      const i = row.index();
      if (i === m.from) return m.keys ? slot(m.from, m.to) : m.delta;
      if (m.from < m.to && i > m.from && i <= m.to) return -taken.span;
      if (m.to < m.from && i >= m.to && i < m.from) return taken.span;
      return 0;
    },
    down(row, e) {
      if ((e?.button ?? 0) !== 0 || disabled() || row.disabled() || now() !== null) return;
      lost = false;
      if (!take(row, false, { node: e?.currentTarget ?? null, id: e?.pointerId })) return;
      pointer.down(e, null);
      // The handle pressed has the focus: Escape reaches it, and it keeps the focus after the drop.
      focus(row.handle);
    },
    track: e => void (mine(e) && pointer.move(e)),
    up: e => void (mine(e) && pointer.up(e)),
    abort,
    cancel: e => void (mine(e) && abort()),
    key(row, e) {
      const k = keyOf(e);
      const m = now();
      if (m === null) {
        if (k !== ' ' && k !== 'Enter') return;
        prevent(e);
        take(row, true, null);
        return;
      }
      if (taken === null || taken.row !== row) return;
      if (k === 'Escape') {
        // It ends the move and goes no further: a Modal around the list stays open.
        handled(e);
        abort();
        return;
      }
      if (!m.keys) return;
      const n = taken.boxes.length;
      const back = vertical() ? 'ArrowUp' : 'ArrowLeft';
      const forth = vertical() ? 'ArrowDown' : 'ArrowRight';
      if (k === back || k === forth || k === 'Home' || k === 'End') {
        prevent(e);
        const to = k === 'Home' ? 0 : k === 'End' ? n - 1 : clamp(m.to + (k === forth ? 1 : -1), 0, n - 1);
        if (to === m.to) return;
        $write(move, { ...m, to });
        say(labelsIn().sortablePlace(to + 1, n));
      } else if (k === ' ' || k === 'Enter') {
        prevent(e);
        drop();
      } else if (k === 'Tab') abort();
    },
    help,
  };
  const style = styled(props, theme => ({
    position: 'relative',
    direction: vertical() ? 'column' : 'row',
    gap: theme.spacing.xs,
    // No text is selected under an item on its way.
    ...($read(move) === null ? null : { select: 'none' }),
  }));
  const children = props.children;
  return (
    <ListContext value={api}>
      <View
        {...pass(props)}
        role={props.role ?? 'list'}
        ref={(/** @type {any} */ n) => {
          root = n;
          handOn(props.ref, n);
        }}
        style={style}
      >
        {typeof children !== 'function' ? (
          children
        ) : (
          <For each={items} by={keyOfItem}>
            {(/** @type {() => any} */ item, /** @type {any} */ index) => {
              /** @type {SortableRow} */
              const row = { index: typeof index === 'function' ? index : () => Number(read(index)), node: null, handle: null, disabled: () => false };
              rows.add(row);
              const own = $owner(R);
              if (own != null) $cleanup(/** @type {any} */ (own), () => void rows.delete(row));
              return <RowContext value={row}>{children(item, index)}</RowContext>;
            }}
          </For>
        )}
        <View role="status" style={UNSEEN}>
          <Label text={() => /** @type {string} */ ($read(said))} />
        </View>
        <View id={help} style={UNSEEN}>
          <Label text={() => labelsIn().sortableKeys} />
        </View>
      </View>
    </ListContext>
  );
}

/**
 * An item of a Sortable (Sortable.Item): what the list's children draw for
 * each item, around its content and its `Sortable.Handle`. `disabled`: it
 * is not taken (the others still pass it). Taken, it shows over the others
 * with the theme's `md` shadow. It means a `listitem`.
 * @param {Record<string, any>} props
 */
function SortableItem(props) {
  const R = $active();
  const api = /** @type {SortableApi | null} */ ($lookup(ListContext));
  const row = /** @type {SortableRow | null} */ ($lookup(RowContext));
  if (api === null || row === null)
    return (
      <View {...pass(props)} role={props.role ?? 'listitem'} style={styled(props)}>
        {props.children}
      </View>
    );
  row.disabled = () => read(props.disabled) === true;
  // Its own move, or none: the other items read only how far they stand aside.
  const mine = $memo(R, () => {
    const m = api.move();
    return m !== null && m.from === row.index() ? m : null;
  });
  // The others ease aside, and a lifted item to its place; the pointer's own item follows it at once, and every item
  // is in its place at once as the move ends (the list is in its new order then).
  const eased = $follow(
    () => {
      const m = /** @type {SortableMove | null} */ ($read(mine));
      return m !== null && !m.keys ? 0 : api.offset(row);
    },
    () => (api.move() === null ? 0 : MOTION.quick),
  );
  const style = styled(props, theme => {
    const m = /** @type {SortableMove | null} */ ($read(mine));
    const by = m !== null && !m.keys ? m.delta : eased();
    return {
      position: 'relative',
      shrink: 0,
      ...(by === 0 ? null : { translate: /** @type {[number, number]} */ (api.vertical() ? [0, by] : [by, 0]) }),
      ...(m === null ? null : { zIndex: 1, shadow: shadowOf(theme, 'md') }),
    };
  });
  return (
    <View
      {...pass(props)}
      role={props.role ?? 'listitem'}
      ref={(/** @type {any} */ n) => {
        row.node = n;
        handOn(props.ref, n);
      }}
      style={style}
    >
      {props.children}
    </View>
  );
}

/** A grip: two columns of three dots in a box of `s`. @param {number} s @param {string} color */
function gripFigures(s, color) {
  const r = s / 12; // geometry: a dot's radius, six of them across a sixth of the box each way
  /** @type {Record<string, any>[]} */
  const out = [];
  for (const x of [s * 0.35, s * 0.65]) for (const y of [s * 0.22, s * 0.5, s * 0.78]) out.push({ kind: 'oval', x: x - r, y: y - r, right: x + r, bottom: y + r, color }); // geometry: the dots' centers in the box
  return out;
}

/**
 * The handle of a Sortable's item (Sortable.Handle), inside its
 * `Sortable.Item`: pressed and dragged, or lifted with Space or Enter, it
 * takes the item along the list. `label` ('Reorder'), `size` (xs to xl, the
 * theme's `sizes.icon`; md), its children in place of the grip. A `button`,
 * `aria-pressed` while it holds its item, `aria-disabled` while its list or
 * item is.
 * @param {Record<string, any>} props
 */
function SortableHandle(props) {
  const ui = $ui();
  const api = /** @type {SortableApi | null} */ ($lookup(ListContext));
  const row = /** @type {SortableRow | null} */ ($lookup(RowContext));
  const live = api !== null && row !== null;
  const off = () => !live || api.disabled() || row.disabled();
  const held = () => {
    const m = live ? api.move() : null;
    return m !== null && m.from === row?.index();
  };
  const side = () => sized(ui.theme().sizes.icon, read(props.size), 'md');
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      width: side(),
      height: side(),
      minHeight: side(),
      shrink: 0,
      padding: 0,
      border: 0,
      radius: theme.radius.sm,
      background: 'transparent',
      align: 'center',
      justify: 'center',
      ...(off() ? { opacity: theme.opacity.disabled, cursor: 'default' } : { cursor: held() ? 'grabbing' : 'grab', touchAction: 'none', hover: { background: page.hover } }),
    };
  });
  const glyph = () => Math.round(side() * ui.theme().ratios.icon);
  return (
    <Action
      {...pass(props)}
      ref={(/** @type {any} */ n) => {
        if (row !== null) row.handle = n;
        handOn(props.ref, n);
      }}
      label={() => read(props.label) ?? labelsIn().reorder}
      aria-pressed={state(held)}
      aria-disabled={flag(off)}
      aria-describedby={live ? api.help : undefined}
      onPointerDown={(/** @type {any} */ e) => live && api.down(row, e)}
      onPointerMove={(/** @type {any} */ e) => live && api.track(e)}
      onPointerUp={(/** @type {any} */ e) => live && api.up(e)}
      onPointerCancel={(/** @type {any} */ e) => live && api.cancel(e)}
      onKey={(/** @type {any} */ e) => {
        if (live && !off()) api.key(row, e);
        props.onKey?.(e);
      }}
      // The focus gone from a lifted item's handle gives the move up.
      onBlur={() => live && held() && api.move()?.keys === true && api.abort()}
      style={style}
    >
      {props.children ?? <Shape {...DECOR} shapes={() => gripFigures(glyph(), pageColors(ui.theme(), ui.scheme()).quiet)} style={() => ({ width: glyph(), height: glyph(), shrink: 0 })} />}
    </Action>
  );
}

Sortable.Item = SortableItem;
Sortable.Handle = SortableHandle;
