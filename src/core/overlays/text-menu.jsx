// The text menu: rui's own menu over static text, opened by a right press
// anywhere in the application root (ren-core's `$presses`, its portals too)
// while the theme's `control.textMenu` is 'text' or 'all'. The outermost Rui holds it.

import { Show, $active, $signal, $read, $write, $untrack, $presses, editOf, textAt, selectText, selectedText } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { PointMenu } from './point-menu.jsx';
import { Menu } from './menu.jsx';
import { activeOf, prevent } from './shared.jsx';
import { pointOf } from '../misc/tween.js';
import { $clipboard } from '../../hooks/platform.js';
import { labelsIn } from '../../theme/labels.js';

/**
 * The text menu: a right press no one took before it (its default not
 * prevented: a ContextMenu's region or a field's own menu took it) opens
 * it, never over a field (its own menu, the platform's or rui's). With text
 * selected (not a focused field's), it copies the selection; else, over a
 * text (ren-core's `textAt`: a Label's; a press target's too while the
 * theme's `control.textMenu` is 'all', a button's or a pressable row's), it copies
 * that text or selects it (ren-core's `selectText`: that text alone
 * selectable, all of it selected, until a press elsewhere or Escape; a drag
 * in it keeps a part, which Ctrl+C or the menu copies). Elsewhere nothing
 * opens. A finger's long press does not open it: `$presses` hears the
 * press, not the moves and the release that would cancel one.
 */
export function TextMenu() {
  const R = $active();
  const ui = $ui();
  const open = $signal(R, false);
  const at = $signal(R, { x: 0, y: 0 });
  const found = $signal(R, /** @type {{ text: string, node: any }} */ ({ text: '', node: null }));
  const clipboard = $clipboard(R);
  $presses((/** @type {any} */ e) => {
    if ((e?.button ?? 0) !== 2 || e?.defaultPrevented === true) return;
    const target = e?.target ?? null;
    if (editOf(target) !== null) return;
    // A focused field's selection is the field's, not the page's.
    const selection = editOf(activeOf(target)) !== null ? '' : selectedText(target);
    let hit = selection === '' ? textAt(e) : { text: selection, node: null, pressed: false };
    // Text a press target holds (a button's, a row's) only where the theme says 'all'.
    if (hit === null || (hit.pressed === true && ui.theme().control.textMenu !== 'all')) return;
    prevent(e);
    $write(found, hit);
    $write(at, pointOf(e));
    $write(open, true);
  });
  const now = () => $untrack(R, () => $read(found));
  return (
    <PointMenu open={() => $read(open)} onClose={() => $write(open, false)} at={() => $read(at)}>
      <Menu.Item onPress={() => void clipboard.copy(now().text)}>{() => labelsIn().copy}</Menu.Item>
      <Show when={() => $read(found).node !== null}>
        <Menu.Item onPress={() => void selectText(now().node)}>{() => labelsIn().selectText}</Menu.Item>
      </Show>
    </PointMenu>
  );
}
