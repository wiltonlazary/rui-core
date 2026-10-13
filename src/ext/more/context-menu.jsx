// ContextMenu: a right press (pointer button 2) or a long press opens a Menu
// at the pointer. The canvases have no contextmenu event, so the pointer's
// button is the portable signal; on the DOM the browser's own menu is
// canceled (`prevent="contextmenu"`).

import { View, read, $active, $signal, $read, $write, $untrack } from 'ren-core';
import { Menu } from '../../core/overlays/menu.jsx';
import { $delay, $controlled } from '../../core/overlays/shared.jsx';
import { styled } from '../../theme/style.js';
import { MOTION, durationOf } from '../../theme/motion.js';
import { pass } from '../../core/layout/layout.jsx';
import { pointOf, boxOf } from './shared.js';
import { handOn } from '../../core/ref.js';
import { bordersOf } from '../../core/misc/tween.js';

/**
 * A region with a context menu: `children` (the region), `menu` (the
 * Menu.Item, Menu.Label and Menu.Divider to show), `open` +
 * `onOpenChange(open, point)` (the point in the region when it opens) or
 * `defaultOpen`, `longPress` (true: a held primary press opens it too)
 * after `hold` (a MOTION preset's name or ms; unset: twice `MOTION.calm`,
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
  const timer = $delay();
  /** @type {{ x: number, y: number } | null} */
  let pressed = null;
  const open = (/** @type {any} */ e) => {
    const p = pointOf(e);
    const box = boxOf(region);
    const point = { x: Math.round(p.x - box.x), y: Math.round(p.y - box.y) };
    $write(at, point);
    opening = point;
    state.set(true);
    opening = undefined;
  };
  const disabled = () => read(props.disabled) === true;
  const onPointerDown = (/** @type {any} */ e) => {
    if ($untrack(R, disabled)) return;
    const button = e?.button ?? 0;
    if (button === 2) {
      e?.preventDefault?.();
      timer.cancel();
      open(e);
      return;
    }
    if (button !== 0 || read(props.longPress) === false) return;
    const p = pointOf(e);
    pressed = p;
    const event = { clientX: p.x, clientY: p.y };
    timer.run(durationOf(read(props.hold), MOTION.calm * 2), () => {
      pressed = null;
      open(event);
    });
  };
  const onPointerMove = (/** @type {any} */ e) => {
    if (pressed === null) return;
    const p = pointOf(e);
    if (Math.abs(p.x - pressed.x) > 10 || Math.abs(p.y - pressed.y) > 10) {
      pressed = null;
      timer.cancel();
    }
  };
  const onPointerUp = () => {
    pressed = null;
    timer.cancel();
  };
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
