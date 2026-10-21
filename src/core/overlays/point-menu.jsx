// PointMenu: a Menu opened at a point of the surface, not against a
// trigger of its own: a field's menu and the text menu open there. A layer
// over the viewport, which the pointer passes through, holds a 1 × 1
// trigger at the point (as ContextMenu places its own in its region); the
// layer is built at the first opening, so a field that never opens its menu
// holds none.

import { View, Show, read, $active, $signal, $read, $write, $writable, $watch, $keys, $untrack } from 'ren-core';
import { Menu, $menu } from './menu.jsx';
import { Layer, focus, keyOf, handled } from './shared.jsx';
import { boxOf, $nextFrame } from '../misc/tween.js';
import { LAYERS } from '../../theme/layers.js';

/**
 * A menu at a point: `open` (a value or an accessor), `onClose()` (Escape,
 * a press outside, a choice), `at` (the point in the surface's space, as a
 * pointer event's `clientX`/`clientY`: an accessor), `keys` (an accessor:
 * the keys opened it, so the focus goes to its first item; a pointer's
 * opening leaves the focus where it is), and the items as children
 * (Menu.Item, Menu.Divider, …). Its panel opens at 'bottom-start' of the
 * point; the focus is not given back on close (the opener does that).
 * @param {{ open: any, onClose?: () => void, at: () => { x: number, y: number }, keys?: () => boolean, children?: any }} props
 */
export function PointMenu(props) {
  let built = false;
  // Built at the first opening, then kept (its closing motion runs, the next opening is at once).
  const mounted = () => (built ||= read(props.open) === true);
  return <Show when={mounted}>{() => <Opened {...props} />}</Show>;
}

/** The layer, the menu and its trigger at the point. @param {Record<string, any>} props */
function Opened(props) {
  const R = $active();
  const layer = $writable($signal(R, /** @type {any} */ (null)));
  const open = () => read(props.open) === true;
  // Escape closes it wherever the focus is (a pointer's opening leaves it in the field or on the page).
  $keys((/** @type {any} */ e) => {
    if (keyOf(e) !== 'Escape' || !$untrack(R, open)) return;
    handled(e);
    props.onClose?.();
  });
  const place = () => {
    const p = read(props.at) ?? { x: 0, y: 0 };
    // The point less the layer's own place (on the DOM, the page's scroll moves the body the layer covers).
    const box = boxOf($read(layer));
    return { position: 'absolute', left: Math.round(p.x - box.x), top: Math.round(p.y - box.y), width: 1, height: 1 };
  };
  return (
    <Layer layer={LAYERS.float} style={{ pointerEvents: 'none' }} ref={(/** @type {any} */ n) => $write(layer, n)}>
      <Menu at="bottom-start" offset={2} refocus={false} open={open} onOpenChange={(/** @type {boolean} */ v) => (v ? undefined : props.onClose?.())}>
        <Menu.Trigger style={place}>
          <View style={{ width: 1, height: 1 }} />
        </Menu.Trigger>
        <Menu.Panel>{props.children}</Menu.Panel>
        <Keyed open={open} keys={props.keys} />
      </Menu>
    </Layer>
  );
}

/** Opened by the keys, the focus goes to the first item once it is laid out (as Menu's own keyboard opening). @param {{ open: () => boolean, keys?: () => boolean }} props */
function Keyed(props) {
  const R = $active();
  const store = $menu();
  const later = $nextFrame();
  $watch(R, props.open, open => {
    if (open && $untrack(R, () => props.keys?.() === true)) later(() => focus(store.first?.() ?? null));
  });
  return null;
}
