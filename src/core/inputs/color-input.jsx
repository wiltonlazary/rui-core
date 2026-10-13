// ColorInput: a color's text in a field, with a sample of it at the start,
// an eye dropper at the end, and a ColorPicker in a panel under it.
//
// It keeps two things apart: the draft (the text in the field) and the
// value (a color's text, or '' for none). Typing edits the draft; the value
// follows only when the draft reads as a color or is emptied. A change is
// committed when it is finished (Enter, leaving the field, the end of a
// picker gesture, an eye dropper pick), and a typed color is then written
// in the field's format.

import { View, Shape, $active, $signal, $read, $write, $watch, $untrack, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { pageColors } from '../../theme/resolve.js';
import { DECOR, state } from '../../theme/meaning.js';
import { $eyedropper } from '../../hooks/input.js';
import { later } from '../../hooks/shared.js';
import { Panel, panelStyle } from '../overlays/popover.jsx';
import { $controlled, keyOf, partOf, handled } from '../overlays/shared.jsx';
import { Swatch } from '../data/badge.jsx';
import { IconButton } from '../buttons/icon-button.jsx';
import { Field, outerOf, fieldOf } from './field.jsx';
import { field } from './input.jsx';
import { $value, sizeOf } from './shared.js';
import { ColorPicker, parseColor, formatColor } from './color.jsx';

/** The eye dropper button's name unless its options give a `label`. */
const DROPPER_LABEL = 'Pick a color from the screen';

/** Whether a text is empty once trimmed. @param {string} t */
const blank = t => t.trim() === '';

/** Two texts naming the same color (or both none). @param {string} a @param {string} b */
function sameColor(a, b) {
  if (a.trim() === b.trim()) return true;
  const x = parseColor(a);
  const y = parseColor(b);
  return x !== null && y !== null && formatColor(x, 'hex', true) === formatColor(y, 'hex', true);
}

/**
 * A pipette: a tube from the lower left to a bulb at the upper right, a
 * collar where they meet, in a box of `s`.
 * @param {number} s @param {string} color
 */
function pipetteShape(s, color) {
  const stroke = Math.max(1, Math.round(s / 8));
  return [
    { kind: 'line', x: s * 0.16, y: s * 0.84, right: s * 0.56, bottom: s * 0.44, stroke, color },
    { kind: 'line', x: s * 0.44, y: s * 0.36, right: s * 0.64, bottom: s * 0.56, stroke, color },
    { kind: 'oval', x: s * 0.56, y: s * 0.12, right: s * 0.88, bottom: s * 0.44, color },
  ];
}

/**
 * A color field: `value` + `onChange(color)` or `defaultValue` (a color's
 * text `parseColor` reads, or '' for none), `onCommit(color)`, `format`
 * ('hex', 'rgb' or 'hsl'; 'hex'), `alpha` (false), `swatches`,
 * `swatchColumns` (8), `picker` (true), `preview` (true: a Swatch of the
 * value at the start, `theme.sizes.swatch` by size; an empty sample
 * without one), `eyedropper` (true: a button at the end where the platform
 * has one; false, a node for its icon, or the IconButton's options),
 * `revert` (true: leaving with a draft that is no color shows the value
 * again; false keeps it, invalid), `sticky` (true; false closes the panel
 * after a swatch press), `typing` (true; false: the text is read-only and
 * a press, Enter or Space opens the panel), `stretch` (the panel as wide
 * as the field), `open` + `onOpenChange(open)` or `defaultOpen`, `popover`
 * (the panel's placement and look, as Popover's; its `open`,
 * `defaultOpen` and `onOpenChange` serve when the field's are not given),
 * and the input's props (label, description, error, invalid, placeholder,
 * size, radius, variant, disabled, readOnly, required, asterisk, start,
 * end, fieldStyle, outerStyle, …).
 *
 * The value changes as a draft that reads as a color is typed (as typed)
 * or when the draft is emptied (''). Enter and leaving the field commit
 * (`onCommit`) when the value differs from the one it had when the field
 * took focus, first writing it in `format` (and `alpha`); a picker gesture's
 * end and an eye dropper pick commit too. A new `format` or `alpha` alone
 * leaves the value as it is.
 *
 * The panel opens on a press of the field and on ArrowDown, not on focus;
 * Escape, Tab and a press outside close it. It holds a ColorPicker when
 * `picker` is not false or `swatches` has colors, and there is no panel
 * otherwise; it never opens while disabled or read-only.
 * @param {Record<string, any>} props
 */
export function ColorInput(props) {
  const R = $active();
  const ui = $ui();
  const value = $value(props, '');
  const get = () => String(value.get() ?? '');
  const format = () => read(props.format) ?? 'hex';
  const alpha = () => read(props.alpha) === true;
  const disabled = () => read(props.disabled) === true;
  const readOnly = () => read(props.readOnly) === true;
  const locked = () => disabled() || readOnly();
  const size = () => sizeOf(read(props.size));

  // The draft: the text typed, or null to show the value.
  const draft = $signal(R, /** @type {string | null} */ (null));
  // A draft that is no color kept after leaving (`revert={false}`): the invalid look.
  const held = $signal(R, false);
  const focused = $signal(R, false);
  // The value when the field took focus (or at the last commit): a commit needs a change from it.
  let since = $untrack(R, get);

  const text = () => $read(draft) ?? get();
  const badDraft = () => {
    const d = $read(draft);
    return d !== null && !blank(d) && parseColor(d) === null;
  };

  // A value from outside replaces the draft, unless the field is focused and the draft names it already.
  $watch(R, get, v => {
    const d = $untrack(R, () => $read(draft));
    if (d === null) return;
    if ($untrack(R, () => $read(focused)) && sameColor(d, v)) return;
    $write(draft, null);
    $write(held, false);
  });

  /** Sets the value from a pick (the picker, the eye dropper): already in format. @param {string} next */
  const take = next => {
    $write(draft, null);
    $write(held, false);
    if (next !== get()) value.set(next);
  };
  /** Commits a finished pick. @param {string} next */
  const commitPick = next => {
    take(next);
    since = next;
    props.onCommit?.(next);
  };

  const input = (/** @type {string} */ typed) => {
    if (read(props.typing) === false) return;
    $write(draft, typed);
    if (blank(typed)) {
      $write(held, false);
      if (get() !== '') value.set('');
    } else if (parseColor(typed) !== null) {
      $write(held, false);
      if (typed !== get()) value.set(typed);
    }
  };

  /** Finishes a typed change (Enter, or leaving when `leaving`). @param {boolean} leaving */
  const settle = leaving => {
    if (badDraft()) {
      if (!leaving) return;
      if (read(props.revert) === false) $write(held, true);
      else $write(draft, null);
      return;
    }
    const v = get();
    if (v !== since && v !== '') {
      const c = parseColor(v);
      const written = c === null ? v : formatColor(c, format(), alpha());
      if (written !== v) value.set(written);
    }
    $write(draft, null);
    const now = get();
    if (now !== since) {
      since = now;
      props.onCommit?.(now);
    }
  };

  // The panel.
  const hasPanel = () => {
    const list = read(props.swatches);
    return read(props.picker) !== false || (Array.isArray(list) && list.length > 0);
  };
  const pop = /** @type {Record<string, any>} */ (read(props.popover) ?? {});
  const own = props.open !== undefined || props.defaultOpen !== undefined || props.onOpenChange !== undefined;
  const trio = own ? props : pop;
  const openState = $controlled(trio, 'open', 'defaultOpen', false, v => trio.onOpenChange?.(v));
  const isOpen = () => openState.get() === true && hasPanel() && !locked();
  const anchor = $signal(R, /** @type {any} */ (null));
  /** @type {Record<string, any>} */
  const root = { at: 'bottom-start', ...pop, width: () => read(pop.width) ?? (read(props.stretch) === true ? 'trigger' : undefined) };
  /** @type {import('../overlays/popover.jsx').PopoverStore} */
  const store = {
    isOpen,
    open() {
      if (hasPanel() && !locked() && !$untrack(R, openState.get)) openState.set(true);
    },
    close() {
      if ($untrack(R, openState.get)) openState.set(false);
    },
    toggle: () => ($untrack(R, isOpen) ? store.close() : store.open()),
    anchor: () => $read(anchor),
    setAnchor: node => $write(anchor, node),
    props: root,
    setTrigger: () => {},
    trigger: () => null,
    mode: 'click',
    hovers: false,
    enter: () => {},
    leave: () => {},
  };

  const key = (/** @type {any} */ e) => {
    const k = keyOf(e);
    const typing = read(props.typing) !== false;
    if (k === 'ArrowDown') {
      if (!$untrack(R, isOpen) && hasPanel() && !locked()) {
        e?.preventDefault?.();
        store.open();
      }
    } else if (k === 'Escape' || k === 'Tab') {
      if (k === 'Escape' && $untrack(R, store.isOpen)) handled(e);
      store.close();
    }
    else if (k === 'Enter') {
      if (typing) settle(false);
      else {
        e?.preventDefault?.();
        store.open();
      }
    } else if (k === ' ' && !typing) {
      e?.preventDefault?.();
      store.open();
    }
  };

  // The preview at the start: a Swatch of the value, or of nothing.
  const preview = () => {
    const c = parseColor(get());
    return c === null ? 'transparent' : formatColor(c, 'hex', true);
  };
  const start =
    props.start !== undefined ? props.start : read(props.preview) === false ? undefined : <Swatch {...DECOR} color={preview} size={() => ui.theme().sizes.swatch[size()]} />;

  // The eye dropper at the end.
  const dropper = $eyedropper(R);
  const pick = () => {
    if (locked()) return;
    void dropper.pick().then(hex => {
      if (hex == null) return;
      const c = parseColor(hex);
      if (c !== null) later(R, () => commitPick(formatColor(c, format(), alpha())));
    });
  };
  const dropperButton = () => {
    const o = partOf(read(props.eyedropper), true);
    if (o === null || !dropper.available) return undefined;
    const { node, ...options } = o;
    const glyph = () => ui.theme().sizes.glyph.md;
    const figure = node ?? <Shape style={() => ({ width: glyph(), height: glyph(), shrink: 0 })} shapes={() => pipetteShape(glyph(), pageColors(ui.theme(), ui.scheme()).quiet)} />;
    return (
      // Its pointerdown is its own: the field's opens the panel.
      <View onPointerDown={(/** @type {any} */ e) => e?.stopPropagation?.()}>
        <IconButton variant="ghost" size={size} {...options} label={options.label ?? DROPPER_LABEL} disabled={locked} onPress={pick}>
          {figure}
        </IconButton>
      </View>
    );
  };
  const end = props.end !== undefined ? props.end : dropperButton();

  const inner = fieldOf(props);
  const row = field(
    {
      ...inner,
      start,
      end,
      readOnly: () => readOnly() || read(props.typing) === false,
      invalid: () => read(props.invalid) === true || ($read(held) && badDraft()),
    },
    {
      text,
      input,
      key,
      focus: () => {
        $write(focused, true);
        since = get();
      },
      blur: () => {
        $write(focused, false);
        settle(true);
      },
      meaning: {
        'aria-haspopup': () => (hasPanel() ? 'dialog' : undefined),
        'aria-expanded': () => (hasPanel() ? state(isOpen)() : undefined),
      },
    },
  );

  // A press on the field (down, then up on it) opens the panel.
  let down = false;
  const panel = () =>
    hasPanel() ? (
      <Panel store={store} look={panelStyle(root, {})} role="dialog" onKey={(/** @type {any} */ e) => (keyOf(e) === 'Tab' ? store.close() : undefined)}>
        <ColorPicker
          value={() => (get() === '' ? null : get())}
          format={format}
          alpha={alpha}
          swatches={props.swatches}
          swatchColumns={props.swatchColumns}
          picker={props.picker}
          size={props.size}
          stretch={props.stretch}
          onChange={take}
          onCommit={commitPick}
          onSwatchPress={() => (read(props.sticky) === false ? store.close() : undefined)}
        />
      </Panel>
    ) : null;
  return (
    <Field {...outerOf(props)}>
      <View
        ref={store.setAnchor}
        onResize={() => store.follow?.()}
        onPointerDown={(/** @type {any} */ e) => {
          if (e != null && e === store.inside) return;
          down = (e?.button ?? 0) === 0;
        }}
        onPointerUp={(/** @type {any} */ e) => {
          if (e != null && e === store.inside) return;
          if (down) store.open();
          down = false;
        }}
        onPointerCancel={() => (down = false)}
      >
        {row}
      </View>
      {panel}
    </Field>
  );
}
