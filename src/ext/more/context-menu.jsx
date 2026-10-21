// ContextMenu: a right press (pointer button 2) or a long press opens a Menu
// at the pointer (core's `$menuPress`). The canvases have no contextmenu
// event, so the pointer's button is the portable signal; on the DOM the
// browser's own menu is canceled (`prevent="contextmenu"`). A right press a
// field's own menu took (its default prevented) is that menu's.

import { View, read, $active, $signal, $read, $write } from 'ren-core';
import { Menu } from '../../core/overlays/menu.jsx';
import { $controlled } from '../../core/overlays/shared.jsx';
import { $menuPress } from '../../core/overlays/menu-press.js';
import { styled } from '../../theme/style.js';
import { pass } from '../../core/layout/layout.jsx';
import { boxOf } from './shared.js';
import { handOn } from '../../core/ref.js';
import { bordersOf } from '../../core/misc/tween.js';

/**
 * A region with a context menu: `children` (the region), `menu` (the
 * Menu.Item, Menu.Label and Menu.Divider to show), `open` +
 * `onOpenChange(open, point)` (the point in the region when it opens) or
 * `defaultOpen`, `longPress` (true: a held primary press opens it too;
 * 'touch': a finger's or a pen's only; false: none) after `hold` (a MOTION preset's name or ms; unset: twice `MOTION.calm`,
 * 600 ms, long enough that a slow tap does not open it; timed on the
 * Clock, canceled by a move past 10 px or a release), `disabled`, and Menu's props in `popover`
 * (`width`, `shadow`, `at` 'bottom-start', …).
 * @param {Record<string, any>} props
 */
export function ContextMenu(props) {
  const R = $active();
  const at = $signal(R, { x: 0, y: 0 });
  /** @type {any} */
  let region = null;
  /** @type {{ x: number, y: number } | undefined} */
  let opening;
  const state = $controlled(props, 'open', 'defaultOpen', false, value => props.onOpenChange?.(value, value ? opening : undefined));
  const open = (/** @type {{ x: number, y: number }} */ p) => {
    const box = boxOf(region);
    const point = { x: Math.round(p.x - box.x), y: Math.round(p.y - box.y) };
    $write(at, point);
    opening = point;
    state.set(true);
    opening = undefined;
  };
  const disabled = () => read(props.disabled) === true;
  const press = $menuPress({ open, disabled, longPress: () => read(props.longPress) ?? true, hold: () => read(props.hold) });
  const menu = read(props.popover) ?? {};
  const style = styled(props, () => ({ position: 'relative' }));
  return (
    <View
      {...pass(props)}
      ref={(/** @type {any} */ n) => {
        region = n;
        handOn(props.ref, n);
      }}
      prevent="contextmenu"
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      style={style}
    >
      {props.children}
      <Menu at="bottom-start" offset={2} {...menu} open={() => state.get() && !disabled()} onOpenChange={(/** @type {boolean} */ v) => state.set(v)}>
        {/* Placed inside its border (an absolute place starts at the padding's edge), at the point it reports. */}
        <Menu.Trigger style={() => ({ position: 'absolute', left: $read(at).x - bordersOf(style()).left, top: $read(at).y - bordersOf(style()).top, width: 1, height: 1 })}>
          <View style={{ width: 1, height: 1 }} />
        </Menu.Trigger>
        <Menu.Panel>{props.menu}</Menu.Panel>
      </Menu>
    </View>
  );
}
