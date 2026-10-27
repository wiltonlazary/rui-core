// <Notifications>: the store's shown notifications, stacked at their
// positions (fixed against the viewport) in the portal layer, each entering and leaving with a
// transition on the Clock, closing itself after `timeout` ms (paused
// while the pointer is over it), and the rest waiting beyond `limit`. A
// leaving one also collapses: it measures its own height as it starts to
// leave and its height runs from there to 0 with the transition, so the
// ones after it close the gap (where nothing is laid out to measure, a
// worker, it only fades).

import { View, Portal, For, Show, read, $active, $signal, $read, $write, $untrack, $watch } from 'ren-core';
import { styled } from '../../theme/style.js';
import { Notification } from '../../core/feedback/index.js';
import { $delay } from '../../core/overlays/shared.jsx';
import { $tween, boxOf, $nextFrame } from '../../core/misc/tween.js';
import { LAYERS } from '../../theme/layers.js';
import { MOTION, durationOf } from '../../theme/motion.js';
import { EFFECTS, transitionStyle } from '../../core/misc/collapse.jsx';
import { NOTIFICATION_PLACES, NotificationsContext, $notifications } from './store.js';
import { labelsIn } from '../../theme/labels.js';

/** @typedef {import('./store.js').NotificationsStore} NotificationsStore */
/** @typedef {import('./store.js').NotificationData} NotificationData */
/** @typedef {import('./store.js').NotificationPlace} NotificationPlace */

/** A notification on screen: shown, or leaving (its exit transition runs); `key` tells apart two rows of one id (one leaving, one back); `data` its latest while shown, its last once leaving. @typedef {{ id: string, key: number, leaving: boolean, data: NotificationData & { id: string } }} Row */

/**
 * How a notification moves in and out: by its stack's edge only, whatever
 * its side. At the top it sinks in from a short step above and at the
 * bottom it rises from a short step below (EFFECTS `sink` and `rise`: the
 * spacing's `xs` step), fading as it moves; it never slides across the
 * screen.
 * @param {string} position
 */
const effectOf = position => (position.startsWith('top') ? EFFECTS.sink : EFFECTS.rise);

/**
 * The notifications of a store in the portal layer: `store` (the nearest by default: `$notifications()`),
 * `at` ('top-end'; top-start, top-center, bottom-start, bottom-center,
 * bottom-end: an edge, then a side; start is the left in left-to-right text), `limit` (4 shown per place; the rest wait
 * their turn), `timeout` (5000 ms, or false; a notification's own wins),
 * `duration` (a MOTION preset or ms; 'base'), `width` (`sizes.box.toast`, 360), `layer`
 * (`LAYERS.toast`), `portal` (true); `children` go inside,
 * where `$notifications()` finds this store. Each notification is a
 * Notification with its data (`title`, `text`, `color`, `icon`,
 * `loading`, `closable`, `radius`, `style`); its
 * close button hides it, `onShow` runs once it is shown and `onHide` once
 * it is hidden. The look: each place's stack stands a `spacing.lg` step in
 * from its edge and side, its notifications a `spacing.sm` step apart and
 * narrowed to fit a viewport narrower than `width`; one
 * enters fading in as it sinks from a short step above (a top place) or
 * rises from one below (a bottom place), and leaves the same way back.
 * @param {Record<string, any>} props
 */
export function Notifications(props) {
  const R = $active();
  /** @type {NotificationsStore} */
  const store = props.store ?? $notifications(R);
  store.limit = () => Number(read(props.limit) ?? 4);
  store.at = () => /** @type {NotificationPlace} */ (read(props.at) ?? 'top-end');
  const duration = () => durationOf(read(props.duration), MOTION.base);
  // What is on screen: the shown ones, and those leaving until their transition ends.
  let keys = 0;
  const rows = $signal(R, /** @type {Row[]} */ ($untrack(R, store.shown).map(n => ({ id: n.id, key: keys++, leaving: false, data: n }))));
  $watch(R, store.shown, list => {
    const byId = new Map(list.map(n => [n.id, n]));
    const current = /** @type {Row[]} */ ($untrack(R, () => $read(rows)));
    // A leaving row is not known: its id shown again gets a new row while the old one finishes.
    const known = new Set(current.filter(r => !r.leaving).map(r => r.id));
    let changed = false;
    const next = current.map(r => {
      if (r.leaving) return r;
      const data = byId.get(r.id);
      if (data === r.data) return r;
      changed = true;
      // Still shown: its latest data; gone from the store: it leaves with its last.
      return data === undefined ? { ...r, leaving: true } : { ...r, data };
    });
    for (const n of list) {
      if (known.has(n.id)) continue;
      changed = true;
      next.push({ id: n.id, key: keys++, leaving: false, data: n });
    }
    if (changed) $write(rows, next);
  });
  /** @param {number} key */
  const gone = key => $write(rows, /** @type {Row[]} */ ($untrack(R, () => $read(rows))).filter(r => r.key !== key));
  /** @param {NotificationData} data */
  const placeOf = data => data.at ?? store.at();
  const stack = (/** @type {NotificationPlace} */ position) => {
    const [edge, side] = position.split('-');
    // Fixed at its edge of the viewport, a `spacing.lg` step in from the
    // edge and the side; across the viewport (a `spacing.lg` step in from
    // both sides at a side), so a notification narrows to fit it, and the
    // pointer passes through where none is. The notifications a
    // `spacing.sm` step apart, the newest last (at a bottom position,
    // nearest the edge), in the store's order.
    const style = styled({}, theme => ({
      position: 'fixed',
      [edge]: theme.spacing.lg,
      ...(side === 'center' ? { left: 0, right: 0, align: 'center' } : { left: theme.spacing.lg, right: theme.spacing.lg, align: side }),
      direction: 'column',
      gap: theme.spacing.sm,
      zIndex: read(props.layer) ?? LAYERS.toast,
      pointerEvents: 'none',
    }));
    const mine = () => /** @type {Row[]} */ ($read(rows)).filter(r => placeOf(r.data) === position);
    return (
      <Show when={() => mine().length > 0}>
        <View role="region" aria-label={() => labelsIn().notifications} style={style}>
          <For each={mine} by={(/** @type {Row} */ r) => r.key}>
            {(/** @type {() => Row} */ row) => {
              return <Item row={row} data={() => row().data} store={store} props={props} position={position} duration={duration} gone={gone} />;
            }}
          </For>
        </View>
      </Show>
    );
  };
  const layer = <>{NOTIFICATION_PLACES.map(stack)}</>;
  return (
    <NotificationsContext value={store}>
      {read(props.portal) === false ? <View style={{ position: 'absolute', inset: 0 }}>{layer}</View> : <Portal>{layer}</Portal>}
      {props.children}
    </NotificationsContext>
  );
}

/**
 * One notification on screen: in with a transition, out when it leaves the
 * store, and closed by its timer.
 * @param {{ row: () => Row, data: () => NotificationData & { id: string }, store: NotificationsStore, props: Record<string, any>, position: string, duration: () => number, gone: (key: number) => void }} p
 */
function Item(p) {
  const R = $active();
  const id = $untrack(R, p.row).id;
  const t = $tween(0);
  /** Its height as it started to leave (0: not measured). */
  const from = $signal(R, 0);
  /** @type {any} */
  let node = null;
  t.to(1, $untrack(R, p.duration));
  const timer = $delay();
  const next = $nextFrame();
  next(() => {
    const d = p.data();
    d.onShow?.(d);
  });
  /** The ms it stays, or 0 to stay until closed. */
  const stays = () => {
    const own = p.data().timeout;
    const all = read(p.props.timeout);
    const ms = own !== undefined ? own : all !== undefined ? all : 5000;
    return typeof ms === 'number' && ms > 0 ? ms : 0;
  };
  const arm = () => {
    const ms = $untrack(R, stays);
    if (ms > 0 && !$untrack(R, p.row).leaving) timer.run(ms, () => p.store.hide(id));
    else timer.cancel();
  };
  $watch(R, stays, arm);
  $watch(
    R,
    () => p.row().leaving,
    leaving => {
      if (!leaving) return;
      timer.cancel();
      $write(from, boxOf(node).height);
      t.to(0, $untrack(R, p.duration), () => p.gone($untrack(R, p.row).key));
    },
  );
  const wrap = styled({}, theme => {
    const h = $read(from);
    const q = $read(t.value);
    return {
      position: 'relative',
      width: read(p.props.width) ?? theme.sizes.box.toast,
      maxWidth: '100%',
      pointerEvents: 'auto',
      // Leaving: its height, measured as it started to leave, runs down to 0 with the transition.
      ...(p.row().leaving && h > 0 ? { height: Math.max(0, h * q), minHeight: 0, overflow: 'hidden', shrink: 0 } : null),
      ...transitionStyle(q, effectOf(p.position), theme),
    };
  });
  const d = p.data;
  return (
    <View ref={(/** @type {any} */ n) => (node = n)} style={wrap} onPointerEnter={() => timer.cancel()} onPointerLeave={arm}>
      <Notification
        title={() => d().title}
        color={() => d().color}
        icon={() => d().icon}
        loading={() => d().loading === true}
        closable={() => d().closable}
        radius={() => d().radius}
        style={() => read(d().style) ?? {}}
        onClose={() => p.store.hide(id)}
      >
        {() => d().text}
      </Notification>
    </View>
  );
}
