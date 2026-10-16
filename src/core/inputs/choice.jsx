// Choices: Checkbox (with Checkbox.Group), Radio (Radio.Group), Switch
// (Switch.Group), Chip (Chip.Group) and SegmentedControl. Each control is a
// portable Action (a press surface with focus and keyboard activation on every
// renderer) holding its box, drawn with Views and Shapes, and its label.
// A group gives its value to the controls inside it through a context; the
// controls are laid out by the caller (Row, Stack).

import { View, Label, Action, Shape, Show, $context, $lookup, $signal, $read, $write, $watch, $active, $after, $untrack, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, sized, pageColors, colorOf, variantColors, shadowOf, fontBelow } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { Clock, motionOn, MOTION, durationOf } from '../../theme/motion.js';
import { $value, sizeOf, errorColor, checkShape, dashShape, markOn, noteLook, optionPadOf } from './shared.js';
import { Field, invalidOf, $nameOf, $fieldName } from './field.jsx';
import { chipGroupApi } from './chip-group.js';
import { DECOR, flag, named } from '../../theme/meaning.js';
import { activeOf } from '../overlays/shared.jsx';

/** A radio's dot: `theme.ratios.mark` of its box. @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {number} box */
const dotOf = (theme, box) => Math.round(box * theme.ratios.mark);
/**
 * A Checkbox's or Radio's box at a size step: the theme's `sizes.check`.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {string} size @returns {number}
 */
const boxOf = (theme, size) => /** @type {Record<string, number>} */ (theme.sizes.check)[size];
/**
 * A Switch's track from the same box as Checkbox and Radio: as high as
 * their box (so they line up in a form), twice that wide less 4, the
 * thumb 2 px inside its 1 px border.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {string} size
 */
const switchOf = (theme, size) => {
  const h = boxOf(theme, size);
  return { w: h * 2 - 4, h, thumb: h - 6 };
};
/** A Chip's height and font size (`theme.sizes.chip`; its side padding is a button's, `theme.control.pad`). @param {any} theme @param {string} size */
const chipOf = (theme, size) => {
  const [h, fz] = theme.sizes.chip[size] ?? theme.sizes.chip.sm;
  return { h, fz };
};

/** The Action a control presses: no fill, no border, its content from the start. */
const BARE = { background: 'transparent', border: 0, padding: 0, minHeight: 0, radius: 0, justify: 'start', textAlign: 'start', direction: 'row', gap: 0, align: 'start', cursor: 'pointer' };

/**
 * A control's label (decoration: the control carries it as its name),
 * description and error beside its box, wrapping within the room left.
 * @param {Record<string, any>} props @param {any} size @param {number} box
 */
function body(props, size, box) {
  const text = styled({}, (theme, scheme) => ({
    wrap: true,
    fontSize: sized(theme.fontSizes, size, 'sm'),
    lineHeight: theme.lineHeights.md,
    minHeight: box,
    color: read(props.disabled) ? pageColors(theme, scheme).disabledText : pageColors(theme, scheme).text,
  }));
  const small = (/** @type {boolean} */ error) =>
    styled({}, (theme, scheme) => ({
      ...noteLook(theme, sized(theme.fontSizes, size, 'sm')),
      wrap: true,
      margin: [theme.control.labelGap, 0, 0, 0],
      color: error ? errorColor(theme, scheme) : pageColors(theme, scheme).quiet,
    }));
  const shown = (/** @type {string} */ k) => () => {
    const v = read(props[k]);
    return v != null && v !== false && v !== '' && v !== true;
  };
  return (
    // The column beside the box shrinks to the room left, its texts wrapping in it.
    <View style={styled({}, theme => ({ direction: 'column', shrink: 1, minWidth: 0, padding: [0, 0, 0, read(props.labelAt) === 'start' ? 0 : theme.spacing.sm], justify: 'center' }))}>
      <Show when={shown('label')}>
        <View style={() => ({ minHeight: box, justify: 'center' })}>
          <Label {...DECOR} text={() => String(read(props.label))} style={text} />
        </View>
      </Show>
      <Show when={shown('description')}>
        <Label text={() => String(read(props.description))} style={small(false)} />
      </Show>
      <Show when={shown('error')}>
        <Label text={() => String(read(props.error))} style={small(true)} />
      </Show>
    </View>
  );
}

/**
 * A group of controls with its label, description and error around them
 * (Checkbox.Group, Radio.Group, Switch.Group; Chip.Group has no Field),
 * a `group` (a `radiogroup` for radios) named by its
 * label.
 * @param {any} Context @param {any} api @param {Record<string, any>} props @param {boolean} wrapped @param {string} [role]
 */
function group(Context, api, props, wrapped, role = 'group') {
  const inside = <Context value={api}>{props.children}</Context>;
  if (!wrapped) return inside;
  return (
    <Field __named role={role} {...$nameOf(props, props['aria-label'] ?? (props.label === undefined ? undefined : named(props.label)))} aria-required={flag(props.required)} aria-invalid={flag(() => invalidOf(read(props.error), read(props.invalid)))} label={props.label} description={props.description} error={props.error} asterisk={props.asterisk} size={props.size} style={props.style} m={props.m} mt={props.mt} mb={props.mb}>
      {inside}
    </Field>
  );
}

/**
 * @typedef {object} GroupApi what a group gives the controls inside it
 * @property {(value: string) => boolean} has
 * @property {(value: string) => void} toggle
 * @property {any} size
 * @property {any} disabled
 */

// ---------------------------------------------------------------------------
// Checkbox

const CheckboxContext = $context(/** @type {GroupApi | null} */ (null));

/**
 * A checkbox: `checked` + `onChange` (the new state)
 * or `defaultChecked`, `indeterminate`, `label`, `description`, `error`,
 * `size` (xs to xl: 14 to 30), `radius`, `color`, `checkColor` (black or
 * white by the theme's contrast rule on the fill, by default),
 * `labelAt` ('end' or 'start'), `disabled`, `value` (inside a
 * Checkbox.Group), `aria-label` (an accessible name, no visible label;
 * Radio's and Switch's too), `variant` ('solid' by default: a checked box
 * filled with `color`; or 'outline': the box keeps the field's ground and
 * its border and mark take `color`). The mark is `theme.ratios.icon` of
 * the box.
 * @param {Record<string, any>} props
 */
export function Checkbox(props) {
  const ctx = /** @type {GroupApi | null} */ ($lookup(CheckboxContext));
  const own = $value(props, false, 'checked', 'defaultChecked');
  const checked = () => (ctx !== null ? ctx.has(String(read(props.value))) : own.get() === true);
  const disabled = () => read(props.disabled) === true || (ctx !== null && read(ctx.disabled) === true);
  const size = () => sizeOf(read(props.size) ?? (ctx === null ? undefined : read(ctx.size)));
  const indeterminate = () => read(props.indeterminate) === true;
  const toggle = () => {
    if (disabled()) return;
    if (ctx !== null) ctx.toggle(String(read(props.value)));
    else own.set(!checked());
  };
  const ui = $ui();
  /** @returns {Record<string, any>} */
  const boxStyle = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const s = boxOf(theme, size());
    const page = pageColors(theme, scheme);
    const on = checked() || indeterminate();
    const color = colorOf(theme, scheme, read(props.color));
    const error = invalidOf(read(props.error), read(props.invalid));
    const outline = read(props.variant) === 'outline';
    return {
      width: s,
      height: s,
      shrink: 0,
      radius: radiusOf(theme, read(props.radius)),
      // The box draws the focus ring of the row it is pressed through.
      ring: 'outer',
      border: 1,
      align: 'center',
      justify: 'center',
      borderColor: error ? errorColor(theme, scheme) : on ? color : page.border,
      background: disabled() ? page.disabled : on && !outline ? color : page.field,
    };
  };
  const icon = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const s = boxOf(theme, size());
    const w = Math.round(s * theme.ratios.icon);
    const outline = read(props.variant) === 'outline';
    const color = disabled() ? pageColors(theme, scheme).disabledText : outline ? colorOf(theme, scheme, read(props.color)) : markOn(theme, scheme, read(props.checkColor), read(props.color));
    if (indeterminate()) return dashShape(w, w, color);
    return checked() ? checkShape(w, w, color) : [];
  };
  const side = read(props.labelAt) === 'start';
  return (
    <Action
      ref={props.ref}
      role="checkbox"
      aria-checked={() => (indeterminate() ? 'mixed' : checked() ? 'true' : 'false')}
      aria-disabled={flag(disabled)}
      aria-invalid={flag(() => invalidOf(read(props.error), read(props.invalid)))}
      label={props['aria-label'] ?? props.label}
      {...(props['aria-label'] ?? props.label) === undefined ? $fieldName(props) : null}
      selected={checked}
      onPress={toggle}
      style={styled(props, () => ({ ...BARE, ring: false, cursor: disabled() ? 'not-allowed' : 'pointer' }))}
    >
      {side ? body(props, size(), boxOf(ui.theme(), size())) : null}
      <View style={boxStyle}>
        <Shape style={() => ({ width: Math.round(boxOf(ui.theme(), size()) * ui.theme().ratios.icon), height: Math.round(boxOf(ui.theme(), size()) * ui.theme().ratios.icon) })} shapes={icon} />
      </View>
      {side ? null : body(props, size(), boxOf(ui.theme(), size()))}
    </Action>
  );
}

/**
 * Checkboxes sharing one value, the list of the checked ones' `value`s:
 * `value` + `onChange` or `defaultValue`,
 * `label`, `description`, `error`, `size`, `disabled`, `max` (the most
 * checked at once).
 * @param {Record<string, any>} props
 */
function CheckboxGroup(props) {
  const model = $value(props, /** @type {string[]} */ ([]));
  /** @type {GroupApi} */
  const api = {
    has: v => model.get().includes(v),
    toggle: v => {
      const list = model.get();
      if (list.includes(v)) model.set(list.filter(x => x !== v));
      else {
        const max = read(props.max);
        if (max !== undefined && list.length >= max) return;
        model.set([...list, v]);
      }
    },
    size: props.size,
    disabled: props.disabled,
  };
  return group(CheckboxContext, api, props, true);
}
Checkbox.Group = CheckboxGroup;

// ---------------------------------------------------------------------------
// Radio

const RadioContext = $context(/** @type {GroupApi | null} */ (null));

/**
 * A radio button: `checked` + `onChange` or
 * `defaultChecked`, `value` (inside a Radio.Group), `label`,
 * `description`, `error`, `size` (xs to xl: 14 to 30), `color`, `dotColor`
 * (black or white by the theme's contrast rule on the fill, by default),
 * `disabled`, `labelAt`, `variant` ('solid' by default: a checked ring
 * filled with `color`; or 'outline': the ring keeps the field's ground and
 * its border and dot take `color`). The dot is `theme.ratios.mark` of the
 * ring.
 * @param {Record<string, any>} props
 */
export function Radio(props) {
  const ctx = /** @type {GroupApi | null} */ ($lookup(RadioContext));
  const own = $value(props, false, 'checked', 'defaultChecked');
  const checked = () => (ctx !== null ? ctx.has(String(read(props.value))) : own.get() === true);
  const disabled = () => read(props.disabled) === true || (ctx !== null && read(ctx.disabled) === true);
  const size = () => sizeOf(read(props.size) ?? (ctx === null ? undefined : read(ctx.size)));
  const press = () => {
    if (disabled()) return;
    if (ctx !== null) ctx.toggle(String(read(props.value)));
    else if (!checked()) own.set(true);
  };
  const ui = $ui();
  /** @returns {Record<string, any>} */
  const ring = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const s = boxOf(theme, size());
    const page = pageColors(theme, scheme);
    const color = colorOf(theme, scheme, read(props.color));
    const error = invalidOf(read(props.error), read(props.invalid));
    const outline = read(props.variant) === 'outline';
    return {
      width: s,
      height: s,
      shrink: 0,
      radius: s / 2,
      ring: 'outer',
      border: 1,
      align: 'center',
      justify: 'center',
      borderColor: error ? errorColor(theme, scheme) : checked() ? color : page.border,
      background: disabled() ? page.disabled : checked() && !outline ? color : page.field,
    };
  };
  /** @returns {Record<string, any>} */
  const dot = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const d = dotOf(theme, boxOf(theme, size()));
    const outline = read(props.variant) === 'outline';
    const color = disabled() ? pageColors(theme, scheme).disabledText : outline ? colorOf(theme, scheme, read(props.color)) : markOn(theme, scheme, read(props.dotColor), read(props.color));
    return { width: d, height: d, radius: d / 2, background: checked() ? color : 'transparent' };
  };
  const side = read(props.labelAt) === 'start';
  return (
    <Action ref={props.ref} role="radio" aria-checked={() => String(checked())} aria-disabled={flag(disabled)} aria-invalid={flag(() => invalidOf(read(props.error), read(props.invalid)))} label={props['aria-label'] ?? props.label} selected={checked} onPress={press} style={styled(props, () => ({ ...BARE, ring: false, cursor: disabled() ? 'not-allowed' : 'pointer' }))}>
      {side ? body(props, size(), boxOf(ui.theme(), size())) : null}
      <View style={ring}>
        <View style={dot} />
      </View>
      {side ? null : body(props, size(), boxOf(ui.theme(), size()))}
    </Action>
  );
}

/**
 * Radios sharing one value: `value` + `onChange`
 * or `defaultValue`, `label`, `description`, `error`, `size`,
 * `disabled`.
 * @param {Record<string, any>} props
 */
function RadioGroup(props) {
  const model = $value(props, /** @type {string | null} */ (null));
  /** @type {GroupApi} */
  const api = { has: v => model.get() === v, toggle: v => model.get() !== v && model.set(v), size: props.size, disabled: props.disabled };
  return group(RadioContext, api, props, true, 'radiogroup');
}
Radio.Group = RadioGroup;

// ---------------------------------------------------------------------------
// Switch

const SwitchContext = $context(/** @type {GroupApi | null} */ (null));

/**
 * A switch: `checked` + `onChange` or `defaultChecked`,
 * `label`, `description`, `error`, `labels` (`{ on, off }`: text in the
 * track), `thumb` (content in the thumb), `size` (xs to xl), `radius`
 * (round by default), `color`,
 * `labelAt`, `disabled`; `value` inside a
 * Switch.Group, `duration` (a MOTION preset's name or ms; `quick` by
 * default): the thumb slides on the Clock.
 * @param {Record<string, any>} props
 */
export function Switch(props) {
  const ctx = /** @type {GroupApi | null} */ ($lookup(SwitchContext));
  const own = $value(props, false, 'checked', 'defaultChecked');
  const checked = () => (ctx !== null ? ctx.has(String(read(props.value))) : own.get() === true);
  const disabled = () => read(props.disabled) === true || (ctx !== null && read(ctx.disabled) === true);
  const size = () => sizeOf(read(props.size) ?? (ctx === null ? undefined : read(ctx.size)));
  // The root and clock the slide runs on, taken now: the slide starts from a Watch, which a write outside any
  // handler (a timer) applies with no view being built.
  const R = $active();
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  // The thumb's place, 0 (off) to 1 (on), moving toward the state.
  const at = $signal(R, 0);
  let moving = false;
  let first = true;
  const slide = () => {
    const goal = checked() ? 1 : 0;
    if (first) {
      first = false;
      $write(at, goal);
      return;
    }
    if (moving) return;
    moving = true;
    // The time already stepped: each frame moves by the time since the last, so the slide takes its duration at any frame rate.
    let past = 0;
    motionOn(R, clock, (_, elapsed) => {
      const goal = checked() ? 1 : 0;
      const now = $read(at);
      const step = Math.max(0, elapsed - past) / durationOf(read(props.duration), MOTION.quick);
      past = Math.max(past, elapsed);
      const next = goal > now ? Math.min(goal, now + step) : Math.max(goal, now - step);
      $write(at, next);
      if (next === goal) moving = false;
      return next !== goal;
    });
  };
  $watch(R, checked, slide);
  const toggle = () => {
    if (disabled()) return;
    if (ctx !== null) ctx.toggle(String(read(props.value)));
    else own.set(!checked());
  };
  const ui = $ui();
  /** @returns {Record<string, any>} */
  const track = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const m = switchOf(theme, size());
    const page = pageColors(theme, scheme);
    const color = colorOf(theme, scheme, read(props.color));
    const error = invalidOf(read(props.error), read(props.invalid));
    const radius = read(props.radius) === undefined ? m.h : radiusOf(theme, read(props.radius));
    return {
      width: m.w,
      height: m.h,
      shrink: 0,
      radius,
      ring: 'outer',
      border: 1,
      borderColor: error ? errorColor(theme, scheme) : checked() ? color : page.rule,
      background: disabled() ? page.disabled : checked() ? color : page.track,
      direction: 'row',
      align: 'center',
      overflow: 'hidden',
    };
  };
  /** @returns {Record<string, any>} */
  const thumb = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const m = switchOf(theme, size());
    const inset = (m.h - 2 - m.thumb) / 2;
    const travel = m.w - 2 - m.thumb - inset * 2;
    const radius = read(props.radius) === undefined ? m.thumb : Math.max(0, radiusOf(theme, read(props.radius)) - inset);
    return {
      position: 'absolute',
      top: inset,
      left: inset + travel * $read(at),
      width: m.thumb,
      height: m.thumb,
      radius,
      align: 'center',
      justify: 'center',
      background: disabled() ? pageColors(theme, scheme).disabledText : theme.white,
      // A hairline sets the white thumb off a light, empty track; the
      // filled track (or a dark page) frames it without one.
      border: scheme === 'dark' || checked() ? 0 : 1,
      borderColor: pageColors(theme, scheme).rule,
    };
  };
  /** @returns {Record<string, any>} */
  const trackLabel = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const m = switchOf(theme, size());
    const inset = (m.h - 2 - m.thumb) / 2;
    const room = m.w - 2 - m.thumb - inset * 2;
    return {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: room + inset,
      ...(checked() ? { left: inset } : { right: inset }),
      justify: 'center',
      align: 'center',
      // The on/off text: two type steps below the control's.
      fontSize: fontBelow(theme, sized(theme.fontSizes, size(), 'sm'), 2 * theme.control.textStep),
      fontWeight: theme.weights.bold,
      color: checked() ? theme.white : pageColors(theme, scheme).quiet,
    };
  };
  const trackText = () => {
    const labels = read(props.labels);
    const v = checked() ? labels?.on : labels?.off;
    return v == null ? '' : String(v);
  };
  const side = read(props.labelAt) === 'start';
  return (
    <Action
      ref={props.ref}
      role="switch"
      aria-checked={() => String(checked())}
      aria-disabled={flag(disabled)}
      aria-invalid={flag(() => invalidOf(read(props.error), read(props.invalid)))}
      label={props['aria-label'] ?? props.label}
      {...(props['aria-label'] ?? props.label) === undefined ? $fieldName(props) : null}
      selected={checked}
      onPress={toggle}
      style={styled(props, () => ({ ...BARE, ring: false, cursor: disabled() ? 'not-allowed' : 'pointer' }))}
    >
      {side ? body(props, size(), boxOf(ui.theme(), size())) : null}
      <View style={track}>
        <Show when={() => trackText() !== ''}>
          <View {...DECOR} style={trackLabel}>
            <Label text={trackText} />
          </View>
        </Show>
        <View style={thumb}>{props.thumb}</View>
      </View>
      {side ? null : body(props, size(), boxOf(ui.theme(), size()))}
    </Action>
  );
}

/**
 * Switches sharing one value, the list of the checked ones' `value`s.
 * @param {Record<string, any>} props
 */
function SwitchGroup(props) {
  const model = $value(props, /** @type {string[]} */ ([]));
  /** @type {GroupApi} */
  const api = {
    has: v => model.get().includes(v),
    toggle: v => model.set(model.get().includes(v) ? model.get().filter(x => x !== v) : [...model.get(), v]),
    size: props.size,
    disabled: props.disabled,
  };
  return group(SwitchContext, api, props, true);
}
Switch.Group = SwitchGroup;

// ---------------------------------------------------------------------------
// Chip

const ChipContext = $context(/** @type {GroupApi | null} */ (null));

/**
 * A chip: `checked` + `onChange` or `defaultChecked`,
 * `variant` (solid, outline, soft), `size` (xs to xl), `radius` (the
 * theme's corner),
 * `color`, `icon` (a check by default, `theme.ratios.glyph` of the chip's
 * height), `disabled`, `value` inside a
 * Chip.Group; the text is its children. It means a `checkbox`. Its side
 * padding is `theme.control.pad` at its size, `theme.control.densePad`
 * while checked (the check takes the room).
 * @param {Record<string, any>} props
 */
export function Chip(props) {
  const ctx = /** @type {GroupApi | null} */ ($lookup(ChipContext));
  const own = $value(props, false, 'checked', 'defaultChecked');
  const checked = () => (ctx !== null ? ctx.has(String(read(props.value))) : own.get() === true);
  const disabled = () => read(props.disabled) === true || (ctx !== null && read(ctx.disabled) === true);
  const size = () => sizeOf(read(props.size) ?? (ctx === null ? undefined : read(ctx.size)));
  const toggle = () => {
    if (disabled()) return;
    if (ctx !== null) ctx.toggle(String(read(props.value)));
    else own.set(!checked());
  };
  const ui = $ui();
  /** The chip's colors: its variant's, checked or not. */
  const colors = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const page = pageColors(theme, scheme);
    const variant = read(props.variant) ?? 'solid';
    if (disabled()) return { background: page.disabled, color: page.disabledText, border: page.disabled };
    if (!checked()) {
      if (variant === 'outline') return { background: page.field, color: page.text, border: page.border, hover: page.hover };
      return { background: page.sunken, color: page.text, border: 'transparent', hover: page.hover };
    }
    const v = variantColors(theme, scheme, variant === 'outline' ? 'outline' : variant === 'soft' ? 'soft' : 'solid', read(props.color));
    return { background: variant === 'outline' ? page.field : v.background, color: v.color, border: v.border === 'transparent' ? v.background : v.border, hover: v.hover };
  };
  const style = styled(props, theme => {
    const m = chipOf(theme, size());
    const c = colors();
    const key = /** @type {'sm'} */ (size());
    return {
      ...BARE,
      align: 'center',
      height: m.h,
      radius: radiusOf(theme, read(props.radius)),
      padding: [0, (checked() ? theme.control.densePad : theme.control.pad)[key]],
      gap: theme.control.iconGap,
      fontSize: m.fz,
      border: 1,
      borderColor: c.border,
      background: c.background,
      color: c.color,
      cursor: disabled() ? 'not-allowed' : 'pointer',
      ...(c.hover === undefined ? null : { hover: { background: c.hover } }),
    };
  });
  const icon = () => {
    const w = Math.round(chipOf(ui.theme(), size()).h * ui.theme().ratios.glyph);
    return checkShape(w, w, colors().color);
  };
  return (
    <Action ref={props.ref} role="checkbox" aria-checked={() => String(checked())} aria-disabled={flag(disabled)} label={props['aria-label'] ?? props.label} selected={checked} onPress={toggle} style={style}>
      <Show when={checked}>
        {props.icon ?? <Shape style={() => ({ width: Math.round(chipOf(ui.theme(), size()).h * ui.theme().ratios.glyph), height: Math.round(chipOf(ui.theme(), size()).h * ui.theme().ratios.glyph) })} shapes={icon} />}
      </Show>
      <Label text={props.children} />
    </Action>
  );
}

/**
 * Chips sharing one value: `value` + `onChange` or `defaultValue`.
 * `multiple` makes the value a list (`[]` by default, in press order;
 * `max` caps it); else one value (null by default), and a press on the
 * chosen chip clears it unless `toggle` is false. `size`, `disabled`.
 * No Field around it.
 * @param {Record<string, any>} props
 */
function ChipGroup(props) {
  return group(ChipContext, chipGroupApi(props), props, false);
}
Chip.Group = ChipGroup;

// ---------------------------------------------------------------------------
// SegmentedControl

/**
 * A segment's label, centered on one line, ending with an ellipsis where it does not fit its equal share (a
 * row View: a DOM button is no flex container). The row stretches across the segment, which centers what it
 * holds (a centered box is as wide as its text, past its share), and the Label may shrink below its text.
 * @param {{ text: string }} props
 */
function Cut(props) {
  return (
    <View style={{ direction: 'row', justify: 'center', align: 'center', grow: 1, self: 'stretch', minWidth: 0 }}>
      <Label text={props.text} ellipsis style={{ minWidth: 0 }} />
    </View>
  );
}

/**
 * One of several segments: `data` (strings or
 * `{ value, label, disabled }`), `value` + `onChange` or `defaultValue`
 * (the first by default), `stretch`, `orientation` ('horizontal' or
 * 'vertical'), `size`, `radius`, `color` (the indicator's; the raised
 * surface by default), `disabled`, `readOnly`, `duration` (a MOTION
 * preset's name or ms; `base` by default). The
 * indicator slides between segments on the Clock. Segments share the width
 * equally (a grid), so the indicator is placed by percentages; a label
 * longer than its share ends with an ellipsis. It means a
 * `radiogroup` of `radio`s, each an Action, one Tab stop (a roving
 * `tabIndex`: the checked segment, the first with no value): the arrows
 * check the next or previous enabled segment, wrapping, and Home and End
 * the first and last. The focus follows the checked segment: after a
 * press, and after a change of `value` while the focus was on it.
 * @param {Record<string, any>} props
 */
export function SegmentedControl(props) {
  const items = () =>
    (read(props.data) ?? []).map((/** @type {any} */ d) => (typeof d === 'string' ? { value: d, label: d, disabled: false } : { value: String(d.value), label: d.label ?? String(d.value), disabled: d.disabled === true }));
  const model = $value(props, /** @type {string | null} */ (null));
  const current = () => model.get() ?? items()[0]?.value ?? null;
  const index = () => Math.max(0, items().findIndex((/** @type {any} */ d) => d.value === current()));
  const vertical = () => read(props.orientation) === 'vertical';
  // The root and clock the slide runs on, taken now (the slide starts from a Watch, as Switch's does).
  const R = $active();
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  // The indicator's place in segments, moving toward the current index.
  const at = $signal(R, 0);
  let first = true;
  let moving = false;
  const slide = () => {
    if (first) {
      first = false;
      $write(at, index());
      return;
    }
    if (moving) return;
    moving = true;
    const from = $read(at);
    let start = -1;
    motionOn(R, clock, now => {
      if (start < 0) start = now - 16;
      const duration = durationOf(read(props.duration), MOTION.base);
      const goal = index();
      const t = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      $write(at, t >= 1 ? goal : from + (goal - from) * eased);
      if (t >= 1) moving = false;
      return t < 1;
    });
  };
  $watch(R, index, slide);
  const select = (/** @type {{ value: string, disabled: boolean }} */ d) => {
    if (d.disabled || read(props.disabled) || read(props.readOnly) || d.value === current()) return false;
    model.set(d.value);
    return true;
  };
  /** Each segment's Action, by its index. @type {any[]} */
  const nodes = [];
  /** Once the flush is done, the segment now checked (the group's one Tab stop) takes the focus. */
  const refocus = () => $after(R, () => nodes[$untrack(R, index)]?.focus?.());
  // A radio group's keys: the arrows check the next or previous enabled segment (wrapping), Home and End the
  // first and last; the focus follows to the segment then checked.
  const onKey = (/** @type {{ key: string, preventDefault?: () => void }} */ e) => {
    const forth = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!forth && !back && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault?.();
    if (read(props.disabled) || read(props.readOnly)) return;
    const list = items();
    const n = list.length;
    const at = index();
    let to = -1;
    for (let k = 1; k <= n && to < 0; k++) {
      const j = e.key === 'Home' ? k - 1 : e.key === 'End' ? n - k : forth ? (at + k) % n : (at - k + n) % n;
      if (!list[j].disabled) to = j;
    }
    if (to < 0 || to === at) return;
    select(list[to]);
    refocus();
  };
  // A controlled value changed from outside while a segment has the focus: the focus follows to the segment
  // then checked.
  $watch(
    R,
    () => {
      index();
      return { had: nodes.some(n => n != null && activeOf(n) === n) };
    },
    seen => {
      if (seen.had) refocus();
    },
  );
  const ui = $ui();
  const root = styled(props, (theme, scheme) => ({
    direction: 'column',
    // The indicator rides half a panel pad inside the track.
    padding: theme.control.panelPad / 2,
    radius: radiusOf(theme, read(props.radius)),
    background: pageColors(theme, scheme).sunken,
    ...(read(props.stretch) || vertical() ? { self: 'stretch' } : { self: 'start' }),
    ...(read(props.disabled) ? { opacity: theme.opacity.disabled } : null),
  }));
  /** @returns {Record<string, any>} */
  const indicator = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const n = Math.max(1, items().length);
    const share = 100 / n;
    const place = `${share * $read(at)}%`;
    const color = read(props.color);
    return {
      position: 'absolute',
      ...(vertical() ? { left: 0, right: 0, top: place, height: `${share}%` } : { top: 0, bottom: 0, left: place, width: `${share}%` }),
      radius: radiusOf(theme, read(props.radius)),
      background: color != null ? colorOf(theme, scheme, color) : pageColors(theme, scheme).raised,
      shadow: color != null ? undefined : shadowOf(theme, 'xs'),
    };
  };
  /** @returns {Record<string, any>} */
  const grid = () => {
    const n = Math.max(1, items().length);
    // minmax(0, 1fr): the tracks stay equal and inside the control however long a label, which its ellipsis cuts.
    return { display: 'grid', ...(vertical() ? { rows: `repeat(${n}, minmax(0, 1fr))`, columns: 'minmax(0, 1fr)' } : { columns: `repeat(${n}, minmax(0, 1fr))` }), grow: 1, minWidth: 0 };
  };
  const segment = (/** @type {any} */ d, /** @type {number} */ i) => {
    /** @returns {Record<string, any>} */
    const style = () => {
      const theme = ui.theme();
      const scheme = ui.scheme();
      const [py, px] = optionPadOf(theme, sizeOf(read(props.size)));
      const active = index() === i;
      const colored = read(props.color) != null;
      const page = pageColors(theme, scheme);
      const text = d.disabled ? page.disabledText : active ? (colored ? theme.white : page.text) : page.quiet;
      return {
        background: 'transparent',
        border: 0,
        minHeight: 0,
        minWidth: 0,
        radius: radiusOf(theme, read(props.radius)),
        padding: [py, px],
        fontSize: sized(theme.fontSizes, sizeOf(read(props.size))),
        fontWeight: theme.weights.strong,
        color: text,
        justify: 'center',
        align: 'center',
        cursor: d.disabled ? 'not-allowed' : 'pointer',
        ...(active || d.disabled ? null : { hover: { color: page.text } }),
      };
    };
    const off = flag(() => d.disabled || read(props.disabled));
    const checked = () => index() === i;
    // One Tab stop: the checked segment is in the Tab order; the arrows reach the others.
    return (
      <Action
        ref={(/** @type {any} */ n) => (nodes[i] = n)}
        role="radio"
        aria-checked={() => (checked() ? 'true' : 'false')}
        aria-disabled={off}
        selected={checked}
        tabIndex={() => (checked() ? 0 : -1)}
        onPress={() => {
          // The segment it checks takes the focus, as a radio does, so the arrows go on from there.
          if (select(d)) refocus();
        }}
        onKey={onKey}
        style={style}
      >
        <Cut text={d.label} />
      </Action>
    );
  };
  return (
    <View ref={props.ref} role="radiogroup" {...$nameOf(props, props['aria-label'])} style={root}>
      <View style={() => ({ direction: vertical() ? 'column' : 'row', grow: 1 })}>
        <View {...DECOR} style={indicator} />
        <View style={grid}>{() => ((nodes.length = 0), items().map(segment))}</View>
      </View>
    </View>
  );
}
