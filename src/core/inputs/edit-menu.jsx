// The field menu: rui's own menu over a text field, where the field's
// `editMenu` prop (else the theme's `control.editMenu`) is 'app': Undo,
// Redo, Cut, Copy, Paste and Select all, opened by a right press, a
// finger's long press, Shift+F10 or the ContextMenu key, acting through the
// Edit's actions (ren-core's `editOf`). Where the Edit has none (a worker's
// Handle) the platform's own menu stays.

import { read, $active, $signal, $read, $write, $writable, $untrack, editOf } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { labelsIn } from '../../theme/labels.js';
import { PointMenu } from '../overlays/point-menu.jsx';
import { Menu } from '../overlays/menu.jsx';
import { $menuPress } from '../overlays/menu-press.js';
import { keyOf, prevent, handled } from '../overlays/shared.jsx';
import { boxOf } from '../misc/tween.js';
import { $clipboard } from '../../hooks/platform.js';
import { later } from '../../hooks/shared.js';
import { chordText } from '../../hooks/shortcuts.js';
import { Key } from '../data/badge.jsx';
import { handOn } from '../ref.js';

/** @typedef {NonNullable<ReturnType<typeof editOf>>} EditActions an Edit's actions (ren-core's) */
/** @typedef {{ start: number, end: number, direction: 'forward' | 'backward' | 'none' }} Selection */

/**
 * @typedef {object} EditMenu
 * @property {(own?: Record<string, any>) => Record<string, any>} bind the Edit's props: `own` with the menu's `ref`, `prevent`, pointer handlers and `onKey` composed in (own first)
 * @property {any} menu the menu's node, to render beside the Edit (a portal: it takes no room)
 */

/**
 * A text field's own menu. Active while the field's `editMenu` (else the
 * theme's `control.editMenu`) is 'app', the field (`props.disabled`) is not
 * disabled and its Edit has actions. Opened, it keeps the field's selection
 * and focus (a pointer's opening leaves the focus in the field); each item
 * puts that selection back and focuses the field before it acts: Undo and
 * Redo (none in a read-only field, or past the history's ends), Cut (none
 * in a secret or read-only field, nor without a selection), Copy (none in a
 * secret field, nor without a selection), Paste (none in a read-only field;
 * where the platform refuses the clipboard, the menu stays open with the
 * keys that paste in its place) and Select all, each with its keys. Closed
 * with no choice, the focus goes back to the field with its selection.
 * `props.readOnly` makes it read-only too.
 * @param {Record<string, any>} props the field's
 * @returns {EditMenu}
 */
export function $editMenu(props) {
  const R = $active();
  const ui = $ui();
  // The Edit's node, set by its ref: a ref may run inside a computation, which may write it.
  const node = $writable($signal(R, /** @type {any} */ (null)));
  const open = $signal(R, false);
  const at = $signal(R, { x: 0, y: 0 });
  const keyed = $signal(R, false);
  const can = $signal(R, { undo: false, redo: false, cut: false, copy: false, paste: false });
  const refused = $signal(R, false);
  const clipboard = $clipboard(R);
  /** The selection when it opened. @type {Selection} */
  let kept = { start: 0, end: 0, direction: 'none' };
  /** An item acted: it put the focus and the selection where they belong. */
  let acted = false;
  const edit = () => editOf($untrack(R, () => $read(node)));
  const active = () => {
    const own = read(props.editMenu);
    return (own !== undefined ? own : ui.theme().control.editMenu) === 'app' && read(props.disabled) !== true && editOf($read(node)) !== null;
  };
  /** @param {{ x: number, y: number }} point @param {boolean} keys */
  const show = (point, keys) => {
    const e = edit();
    if (e === null || e.disabled()) return;
    kept = e.selection();
    acted = false;
    const empty = kept.start === kept.end;
    const locked = e.readOnly() || $untrack(R, () => read(props.readOnly)) === true;
    const secret = e.secret();
    $write(can, { undo: !locked && e.canUndo(), redo: !locked && e.canRedo(), cut: !locked && !secret && !empty, copy: !secret && !empty, paste: !locked });
    $write(refused, false);
    $write(at, point);
    $write(keyed, keys);
    $write(open, true);
  };
  /** The field focused, its selection as it opened; null when it has no actions now. @param {Selection} [s] */
  const back = (s = kept) => {
    const e = edit();
    if (e === null) return null;
    e.focus();
    e.setSelection(s.start, s.end, s.direction);
    return e;
  };
  const close = () => {
    if (!$untrack(R, () => $read(open))) return;
    $write(open, false);
    if (!acted) back();
  };
  const press = $menuPress({
    open: show,
    disabled: () => !active(),
    longPress: () => 'touch',
    keyPoint: () => {
      const b = boxOf($untrack(R, () => $read(node)));
      return { x: b.x, y: b.y + b.height };
    },
  });
  /** An item's action, on the field as it was. @param {(e: EditActions, s: Selection) => void} run */
  const act = run => () => {
    acted = true;
    const s = kept;
    const e = back(s);
    if (e !== null) run(e, s);
  };
  /** The text selected when it opened. @param {EditActions} e @param {Selection} s */
  const slice = (e, s) => e.value().slice(s.start, s.end);
  const cut = act((e, s) => {
    void clipboard.copy(slice(e, s)).then(ok => {
      const now = edit();
      if (!ok || now === null) return;
      now.setSelection(s.start, s.end, s.direction);
      now.replace('');
    });
  });
  const paste = act(async (_, s) => {
    const text = await clipboard.paste();
    later(R, () => {
      if (text === null) return void $write(refused, true);
      const now = edit();
      $write(open, false);
      if (now === null) return;
      now.setSelection(s.start, s.end, s.direction);
      now.replace(text);
    });
  });
  const keys = {
    undo: chordText('primary+z'),
    redo: chordText('primary+shift+z'),
    cut: chordText('primary+x'),
    copy: chordText('primary+c'),
    paste: chordText('primary+v'),
    selectAll: chordText('primary+a'),
  };
  const shortcut = (/** @type {string} */ text) => <Key size="xs">{text}</Key>;
  /** @param {'undo' | 'redo' | 'cut' | 'copy' | 'selectAll'} name @param {() => void} run @param {() => boolean} on */
  const item = (name, run, on) => (
    <Menu.Item disabled={() => !on()} onPress={run} end={shortcut(keys[name])}>
      {() => labelsIn()[name]}
    </Menu.Item>
  );
  const menu = (
    <PointMenu open={() => $read(open)} onClose={close} at={() => $read(at)} keys={() => $read(keyed)}>
      {item('undo', act(e => void e.undo()), () => $read(can).undo)}
      {item('redo', act(e => void e.redo()), () => $read(can).redo)}
      <Menu.Divider />
      {item('cut', cut, () => $read(can).cut)}
      {item('copy', act((e, s) => void clipboard.copy(slice(e, s))), () => $read(can).copy)}
      {/* Sticky: the menu stays open while the clipboard is read, and where the platform refuses it. */}
      <Menu.Item sticky disabled={() => !$read(can).paste || $read(refused)} onPress={paste} end={() => ($read(refused) ? null : shortcut(keys.paste))}>
        {() => ($read(refused) ? labelsIn().pasteWithKeys(keys.paste) : labelsIn().paste)}
      </Menu.Item>
      <Menu.Divider />
      {item('selectAll', act(e => e.selectAll()), () => true)}
    </PointMenu>
  );
  return {
    bind(own = {}) {
      return {
        ...own,
        ref: (/** @type {any} */ n) => {
          $write(node, n);
          handOn(own.ref, n);
        },
        // The browser's own menu stays shut where rui's opens (and the DOM keeps the field's selection on a right press).
        prevent: () => (active() ? 'contextmenu' : (read(own.prevent) ?? false)),
        onPointerDown: (/** @type {any} */ e) => {
          own.onPointerDown?.(e);
          press.onPointerDown(e);
        },
        onPointerMove: (/** @type {any} */ e) => {
          own.onPointerMove?.(e);
          press.onPointerMove(e);
        },
        onPointerUp: (/** @type {any} */ e) => {
          own.onPointerUp?.(e);
          press.onPointerUp();
        },
        onPointerCancel: (/** @type {any} */ e) => {
          own.onPointerCancel?.(e);
          press.onPointerCancel();
        },
        onKey: (/** @type {any} */ e) => {
          // Opened by a pointer, the focus stays in the field: Escape there closes the menu first, not the field's
          // panel nor the dialog that holds the field.
          if (keyOf(e) === 'Escape' && $untrack(R, () => $read(open))) {
            prevent(e);
            handled(e);
            close();
            return;
          }
          own.onKey?.(e);
          press.onKey(e);
        },
      };
    },
    menu,
  };
}
