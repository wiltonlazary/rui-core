// The field box the combobox inputs draw (the Input look: a bordered box
// at the input heights, the start and end slots at its sides) and Outer,
// the inputs' Field (label, description, field and error), on the one
// Field and prop split of inputs/field.jsx.

import { View, Shape, Action, read, $active, $signal, $read, $write } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { pageColors, radiusOf, sized, colorOf } from '../../theme/resolve.js';
import { chevronFigures, crossFigures } from '../overlays/shared.jsx';
import { flag, named, state } from '../../theme/meaning.js';
import { insetOf, disabledLook, sizeOf } from '../inputs/shared.js';
import { Field, outerOf, invalidOf, $nameOf } from '../inputs/field.jsx';
import { labelsIn } from '../../theme/labels.js';

export { sizeOf };

/** The border color of a field: the error's red, the focus's accent, else the page's. @param {any} theme @param {'light' | 'dark'} scheme @param {{ error: boolean, focused: boolean }} state */
function borderOf(theme, scheme, state) {
  if (state.error) return colorOf(theme, scheme, 'red');
  if (state.focused) return colorOf(theme, scheme, theme.accent);
  return pageColors(theme, scheme).border;
}

/**
 * The field box: `size`, `radius`, `error` and `invalid` (the invalid
 * look, as `invalidOf`), `disabled`, `variant`
 * ('outline', 'soft', 'bare'), `start`, `end`, `focused` (an accessor),
 * `onPointerDown`, `onKey`; children in between. `multiline` lets it grow
 * (tags).
 * @param {Record<string, any>} props
 */
export function FieldBox(props) {
  const size = () => sizeOf(read(props.size));
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const h = theme.sizes.control[size()];
    const variant = read(props.variant) ?? 'outline';
    const error = invalidOf(read(props.error), read(props.invalid));
    return {
      direction: 'row',
      align: 'center',
      ...(read(props.multiline) ? { minHeight: h, wrap: true } : { height: h, minHeight: h }),
      radius: radiusOf(theme, read(props.radius)),
      border: variant === 'bare' ? 0 : 1,
      borderColor: variant === 'soft' && !error ? 'transparent' : borderOf(theme, scheme, { error, focused: props.focused?.() === true }),
      background: variant === 'soft' ? page.sunken : variant === 'bare' ? 'transparent' : page.field,
      color: error ? colorOf(theme, scheme, 'red') : page.text,
      fontSize: sized(theme.fontSizes, size()),
      ...(read(props.disabled) ? { ...disabledLook(theme), background: page.disabled } : null),
    };
  });
  const section = (/** @type {any} */ content) => {
    const s = styled({}, (theme, scheme) => ({
      width: theme.sizes.control[size()],
      height: '100%',
      shrink: 0,
      align: 'center',
      justify: 'center',
      color: pageColors(theme, scheme).quiet,
    }));
    return <View style={s}>{content}</View>;
  };
  const inner = styled({}, theme => {
    const h = theme.sizes.control[size()];
    const pad = insetOf(theme, h);
    // Tags wrap `control.labelGap / 2` apart, the same inside the field's edge.
    const gap = read(props.multiline) ? theme.control.labelGap / 2 : 0;
    return {
      grow: 1,
      shrink: 1,
      width: 0,
      minWidth: 0,
      direction: 'row',
      align: 'center',
      wrap: read(props.multiline) === true,
      gap,
      padding: [gap, props.end === undefined ? pad : 0, gap, props.start === undefined ? pad : 0],
      ...(read(props.multiline) ? { minHeight: h - 2 } : { height: '100%' }),
    };
  });
  return (
    <View ref={props.ref} style={style} onPointerDown={props.onPointerDown} onPointerUp={props.onPointerUp} onKey={props.onKey}>
      {props.start === undefined ? null : section(props.start)}
      <View style={inner}>{props.children}</View>
      {props.end === undefined ? null : section(props.end)}
    </View>
  );
}

/**
 * The style of an Edit inside a FieldBox: no box of its own, the field's
 * text. Among tags (`multiline`) it fills the wrapped row's room (the
 * control's height less its border and the row's `control.labelGap`
 * padding) and keeps at least two control heights to type in.
 * @param {Record<string, any>} props
 */
export function editStyle(props) {
  return styled({}, (theme, scheme) => {
    const s = sizeOf(read(props.size));
    return {
      grow: 1,
      shrink: 1,
      width: read(props.multiline) ? undefined : 0,
      minWidth: read(props.multiline) ? theme.sizes.control[s] * 2 : 0,
      minHeight: 0,
      height: read(props.multiline) ? theme.sizes.control[s] - 2 - theme.control.labelGap : '100%',
      border: 0,
      radius: 0,
      padding: 0,
      background: 'transparent',
      color: pageColors(theme, scheme).text,
      fontSize: sized(theme.fontSizes, s),
    };
  });
}

/**
 * What a combobox's trigger means: a `combobox` named by its field's label
 * (`aria-label`; inside a Field without one, the Field's label),
 * `aria-disabled` (`disabled`), `aria-activedescendant` (the option the
 * keyboard is on, while open), `aria-expanded` while its panel is open,
 * `aria-required` (`required`), `aria-invalid` (`error` or `invalid`).
 * @param {Record<string, any>} props the input's @param {{ isOpen: () => boolean, activeId?: () => string | undefined }} store
 * @returns {Record<string, any>}
 */
export function comboOf(props, store) {
  const label = props['aria-label'] ?? (props.label === undefined ? undefined : named(props.label));
  return { role: 'combobox', 'aria-expanded': state(store.isOpen), 'aria-activedescendant': () => (store.isOpen() ? store.activeId?.() : undefined), 'aria-disabled': flag(props.disabled), 'aria-required': flag(props.required), 'aria-invalid': flag(() => invalidOf(read(props.error), read(props.invalid))), ...$nameOf(props, label) };
}

/**
 * The Field around a combobox input: the input's Field props
 * (`outerOf`: `label`, `description`, `error`, `asterisk`, `size`, the
 * layout props, `style`, `outerStyle`, `outerRef`); the input carries the
 * label as its name.
 * @param {Record<string, any>} props the input's
 */
export function Outer(props) {
  return <Field {...outerOf(props)}>{props.children}</Field>;
}

/** The opener (Combobox.Opener): a chevron in a field's end slot, telling the field opens a panel; `size` (px) and `color` (the page's quiet text by default). @param {{ size?: any, color?: any }} props */
export function Opener(props) {
  const ui = $ui();
  const px = () => Number(read(props.size) ?? ui.theme().sizes.glyph.md);
  // Its `color` when given (a theme name or a CSS color), else the page's quiet text.
  const ink = () => (read(props.color) == null ? pageColors(ui.theme(), ui.scheme()).quiet : colorOf(ui.theme(), ui.scheme(), read(props.color)));
  return <Shape shapes={() => chevronFigures(px(), ink())} style={() => ({ width: px(), height: px(), shrink: 0 })} />;
}

/**
 * A small clear button (an X) for a field's end slot: a square of
 * `theme.sizes.icon.xs` (a CloseButton's side at xs), its cross `size`
 * (px or a `theme.sizes.closeIcon` step; sm, 14, by default).
 * @param {{ onPress: () => void, size?: any, label?: any }} props
 */
export function Clear(props) {
  const ui = $ui();
  const px = () => sized(ui.theme().sizes.closeIcon, read(props.size), 'sm');
  const style = styled({}, (theme, scheme) => ({
    width: theme.sizes.icon.xs,
    height: theme.sizes.icon.xs,
    minHeight: theme.sizes.icon.xs,
    padding: 0,
    border: 0,
    radius: theme.radius.sm,
    background: 'transparent',
    align: 'center',
    justify: 'center',
    cursor: 'pointer',
    hover: { background: pageColors(theme, scheme).hover },
  }));
  return (
    // Its pointerdown is its own (a clear button keeps its pointerdown): the field's opens the panel, whose backdrop would take the press.
    <Action label={() => read(props.label) ?? labelsIn().clear} onPointerDown={(/** @type {any} */ e) => e.stopPropagation()} onPress={props.onPress} style={style}>
      <Shape shapes={() => crossFigures(px(), pageColors(ui.theme(), ui.scheme()).quiet)} style={() => ({ width: px(), height: px(), shrink: 0 })} />
    </Action>
  );
}

/** Whether a field has the focus, for its border: the accessor and the handlers to put on its Edit or Action. */
export function $focused() {
  const on = $signal($active(), false);
  return {
    get: () => /** @type {boolean} */ ($read(on)),
    onFocus: () => $write(on, true),
    onBlur: () => $write(on, false),
  };
}
