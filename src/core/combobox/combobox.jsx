// Combobox: the store, a trigger that takes the keys, and a panel (the
// overlays' Popover panel: in the portal layer or inline) with a list of
// options, a filter field, groups, a top and a bottom part, and a no-match line.
// Select and the rest are built from these parts.

import { View, Label, Action, Edit, Scroll, Shape, Show, For, read, $active, $signal, $memo, $read, $write, $context, $lookup, $owner, $cleanup, $untrack, $watch } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { fontBelow, pageColors, radiusOf, shadowOf, sized, variantColors } from '../../theme/resolve.js';
import { Panel } from '../overlays/popover.jsx';
import { keyOf, prevent, checkFigures, ActionRow, partOf, handled } from '../overlays/shared.jsx';
import { $combobox } from './store.js';
import { Opener, Clear, sizeOf } from './field.jsx';
import { optionPadOf } from '../inputs/shared.js';
import { grouped } from './data.js';
import { DECOR, flag, state, $uid } from '../../theme/meaning.js';

/**
 * @typedef {object} ComboboxValue
 * @property {import('./store.js').ComboboxHandle} store
 * @property {import('../overlays/popover.jsx').PopoverStore} pop
 * @property {Record<string, any>} root
 * @property {(value: string, option: any) => void} submit
 * @property {(e: any, button: boolean) => void} keys the trigger's keys
 */

/** The combobox around a part. */
export const ComboboxContext = $context(/** @type {ComboboxValue | null} */ (null));

/** The combobox in context. @returns {ComboboxValue} */
export function $comboboxContext() {
  const c = /** @type {ComboboxValue | null} */ ($lookup(ComboboxContext));
  if (c === null) throw new Error('RUI: Combobox parts go inside a Combobox');
  return c;
}

/**
 * A combobox: `store` ($combobox(), made here when not given),
 * `onPick(value, option)` (the option's data item), `size` ('sm'), `keys`
 * (true: the arrows, Enter and Escape work the options), and the panel's
 * placement and look as Popover's: `at` ('bottom'), `offset` (half of
 * spacing xs, 4: against its field), `width` ('trigger'), `portal` (true), `layer`, `shadow`,
 * `radius`, `arrow`, `motion` (quick: 110 ms, fade), `dismiss`
 * (`{ outside }`: a press outside closes it).
 * @param {Record<string, any>} props
 */
export function Combobox(props) {
  const store = props.store ?? $combobox();
  const R = $active();
  const anchor = $signal(R, /** @type {any} */ (null));
  const ui = $ui();
  // Against its field: half the smallest spacing step.
  /** @type {Record<string, any>} */
  const root = { at: 'bottom', offset: () => ui.theme().spacing.xs / 2, width: 'trigger', motion: { duration: 'quick', effect: 'fade' }, ...props };
  /** @type {import('../overlays/popover.jsx').PopoverStore} */
  const pop = {
    isOpen: store.isOpen,
    open: () => store.open(),
    close: () => store.close(),
    toggle: () => store.toggle(),
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
  /** @type {ComboboxValue} */
  const value = {
    store,
    pop,
    root,
    submit: (v, p) => props.onPick?.(v, p),
    keys(e, button) {
      if (read(root.keys) === false) return;
      const key = keyOf(e);
      const open = $untrack(R, store.isOpen);
      if (key === 'ArrowDown') {
        prevent(e);
        if (!open) store.open();
        else store.next();
      } else if (key === 'ArrowUp') {
        prevent(e);
        if (!open) store.open();
        else store.previous();
      } else if (key === 'Enter') {
        if (open && store.pick()) prevent(e);
        else if (button) {
          prevent(e);
          store.toggle();
        }
      } else if (key === ' ' && button) {
        prevent(e);
        store.toggle();
      } else if (key === 'Escape') {
        if (open) {
          handled(e);
          store.close();
        }
      } else if (key === 'Tab') {
        if (open) store.close();
      }
    },
  };
  return <ComboboxContext value={value}>{props.children}</ComboboxContext>;
}

/**
 * The trigger (Combobox.Trigger): a View around the field (or button)
 * that is the panel's anchor and takes its keys (ArrowDown and ArrowUp
 * open and move the active option, Enter chooses it, Escape and Tab
 * close); `kind` 'input' (default) or 'button' (Enter and Space toggle).
 * @param {Record<string, any>} props
 */
export function ComboboxTrigger(props) {
  const c = $comboboxContext();
  const button = () => read(props.kind) === 'button';
  return (
    <View ref={c.pop.setAnchor} style={() => ({ ...read(props.style) })} onResize={() => c.pop.follow?.()} onKey={(/** @type {any} */ e) => e !== c.pop.inside && c.keys(e, button())}>
      {props.children}
    </View>
  );
}

/**
 * The panel (Combobox.Panel): shown while the store is open, placed
 * against the trigger (the trigger's width by default), `control.panelPad`
 * inside its edge;
 * `shown` (true; false keeps it out of sight while open, as when nothing is
 * to be shown).
 * @param {Record<string, any>} props
 */
export function ComboboxPanel(props) {
  const c = $comboboxContext();
  const root = c.root;
  const look = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      background: page.body,
      color: page.text,
      border: 1,
      borderColor: pageColors(theme, scheme).rule,
      radius: radiusOf(theme, read(root.radius)),
      shadow: shadowOf(theme, read(root.shadow) ?? 'md'),
      // The panel draws its filter's focus ring, along its corners.
      ring: 'inner',
      padding: theme.control.panelPad,
      direction: 'column',
      fontSize: sized(theme.fontSizes, sizeOf(read(root.size))),
      ...(read(props.shown) === false ? { opacity: 0 } : null),
    };
  });
  return (
    <Panel store={c.pop} look={look}>
      <Show when={() => read(props.shown) !== false}>{props.children}</Show>
    </Panel>
  );
}

/** The options' column (Combobox.List), a `listbox`; `multiple` (it takes several picks: `aria-multiselectable`). @param {Record<string, any>} props */
export function ComboboxList(props) {
  return (
    <View role="listbox" aria-multiselectable={flag(props.multiple)} style={styled(props, () => ({ direction: 'column' }))}>
      {props.children}
    </View>
  );
}

/**
 * The look of an option row (a combobox option, a tree row): the
 * option padding of its size, the accent's soft tint where the keyboard
 * (or the path) is, the hover color under the pointer. A disabled row is
 * at `opacity.disabled`, takes no hover and keeps the plain pointer: it is
 * no press target (it says `aria-disabled`).
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {import('../../theme/theme.jsx').Scheme} scheme
 * @param {{ size: any, on: boolean, disabled: boolean }} row
 * @returns {Record<string, any>}
 */
export function optionLook(theme, scheme, row) {
  const page = pageColors(theme, scheme);
  const size = sizeOf(row.size);
  return {
    direction: 'row',
    align: 'center',
    justify: 'start',
    gap: theme.control.iconGap,
    minHeight: 0,
    padding: optionPadOf(theme, size),
    radius: theme.radius.sm,
    border: 0,
    background: row.on ? variantColors(theme, scheme, 'soft', theme.accent).background : 'transparent',
    color: page.text,
    fontSize: sized(theme.fontSizes, size),
    ...(row.disabled ? { opacity: theme.opacity.disabled, cursor: 'default' } : { cursor: 'pointer', hover: { background: page.hover } }),
  };
}

/** The size of the panel around a part (its combobox's `size`; sm outside one). @returns {any} */
const panelSize = () => /** @type {ComboboxValue | null} */ ($lookup(ComboboxContext))?.root.size;

/** A rule between the panel's options and a part above (`under` it) or below them, `control.panelPad` from the options. @param {'under' | 'over'} side */
const ruleOf = side =>
  styled({}, (theme, scheme) => ({
    height: 1,
    minHeight: 1,
    margin: side === 'under' ? [0, 0, theme.control.panelPad, 0] : [theme.control.panelPad, 0, 0, 0],
    background: pageColors(theme, scheme).rule,
  }));

/** A group's label: quiet, a type step below the panel's text, in the strong weight, at the options' padding. @param {any} size the panel's */
const groupLabelOf = size =>
  styled({}, (theme, scheme) => ({
    color: pageColors(theme, scheme).quiet,
    fontSize: fontBelow(theme, sized(theme.fontSizes, sizeOf(read(size)))),
    fontWeight: theme.weights.strong,
    padding: optionPadOf(theme, sizeOf(read(size))),
  }));

/**
 * An option: `value`, `option` (its data item, handed to `onPick`, or an
 * accessor of it; by default `{ value, label, disabled }`), `disabled`, `chosen` (it is the
 * value chosen: the check icon's state), `index` (its place in what is
 * shown, for the keyboard; without one, the order it is shown in),
 * `onPress`; its children
 * as its content. Where the keyboard is, it takes the accent's soft tint. It
 * means an `option`, `aria-selected` while `chosen` (or, without `chosen`,
 * while the keyboard is on it).
 * @param {Record<string, any>} props
 */
export function ComboboxOption(props) {
  const c = $comboboxContext();
  const R = $active();
  const disabled = () => read(props.disabled) === true;
  const choose = () => {
    if ($untrack(R, disabled)) return;
    props.onPress?.();
    const value = String($untrack(R, () => read(props.value)));
    const option = $untrack(R, () => read(props.option)) ?? { value, label: $untrack(R, () => read(props.label)) ?? value, disabled: false };
    c.submit(value, option);
  };
  /** @type {import('./store.js').OptionRecord} */
  const record = {
    value: () => String(read(props.value)),
    disabled,
    order: props.index === undefined ? undefined : () => Number(read(props.index)),
    press: choose,
    node: null,
    id: $uid('option'),
  };
  const remove = c.store.register(record);
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), remove);
  const selected = () => {
    const at = c.store.active();
    return at >= 0 && c.store.positionOf(record) === at;
  };
  // Shown active, it is the field's active descendant; leaving, or gone, it lets go.
  $watch(R, selected, on => (on ? c.store.markActive(/** @type {string} */ (record.id)) : undefined));
  // Where the keyboard is: the accent's soft tint.
  const style = styled(props, (theme, scheme) => optionLook(theme, scheme, { size: read(c.root.size), on: selected(), disabled: disabled() }));
  const ui = $ui();
  const text = typeof props.children === 'string' || typeof props.children === 'number' || typeof props.children === 'function';
  return (
    <Action
      ref={(/** @type {any} */ n) => (record.node = n)}
      id={record.id}
      role="option"
      aria-selected={state(props.chosen === undefined ? selected : props.chosen)}
      aria-disabled={flag(disabled)}
      label={props.label}
      onPress={choose}
      style={style}
    >
      <ActionRow gap={() => ui.theme().control.iconGap}>{text ? <Label text={props.children} style={{ grow: 1 }} /> : props.children}</ActionRow>
    </Action>
  );
}

/**
 * The filter (Combobox.Filter): a field at the top of the panel that
 * narrows the options, a rule under it: `value`,
 * `onChange` (the event: `{ value }`), `placeholder`; as high as a field of
 * the panel's size, its text where the options' text is. It takes the
 * trigger's keys, and is where the store's `focusFilter()` puts the focus.
 * @param {Record<string, any>} props
 */
export function ComboboxFilter(props) {
  const c = $comboboxContext();
  const style = styled(props, (theme, scheme) => {
    const size = sizeOf(read(c.root.size));
    return {
      minHeight: 0,
      height: theme.sizes.control[size],
      padding: [0, optionPadOf(theme, size)[1]],
      border: 0,
      radius: 0,
      ring: false,
      background: 'transparent',
      color: pageColors(theme, scheme).text,
      fontSize: sized(theme.fontSizes, size),
    };
  });
  const line = ruleOf('under');
  return (
    <>
      <Edit
        ref={(/** @type {any} */ n) => c.store.setFilter(n)}
        value={props.value}
        label={() => read(props.placeholder) ?? ''}
        onChange={props.onChange}
        onKey={(/** @type {any} */ e) => {
          props.onKey?.(e);
          c.keys(e, false);
        }}
        style={style}
      />
      <View {...DECOR} style={line} />
    </>
  );
}

/** The no-match line (Combobox.NoMatch), when nothing is to be shown: quiet, at the panel's text size, where an option's text would be. @param {Record<string, any>} props */
export function ComboboxNoMatch(props) {
  const at = panelSize();
  const style = styled(props, (theme, scheme) => {
    const size = sizeOf(read(at));
    return { color: pageColors(theme, scheme).quiet, textAlign: 'start', padding: optionPadOf(theme, size), fontSize: sized(theme.fontSizes, size) };
  });
  return typeof props.children === 'string' || typeof props.children === 'function' ? <Label text={props.children} style={style} /> : <View style={style}>{props.children}</View>;
}

/** Options under a `label`, a `group` named by it. @param {Record<string, any>} props */
export function ComboboxGroup(props) {
  const label = groupLabelOf(panelSize());
  return (
    <View role="group" aria-label={typeof props.label === 'object' ? undefined : props.label} style={styled(props, () => ({ direction: 'column' }))}>
      {props.label === undefined ? null : typeof props.label === 'object' ? props.label : <Label {...DECOR} text={props.label} style={label} />}
      {props.children}
    </View>
  );
}

/** The top part (Combobox.Top): content above the options at the options' padding, a rule under it. @param {Record<string, any>} props */
export function ComboboxTop(props) {
  const at = panelSize();
  const style = styled(props, theme => ({ padding: optionPadOf(theme, sizeOf(read(at))), direction: 'column' }));
  return (
    <>
      <View style={style}>{props.children}</View>
      <View style={ruleOf('under')} />
    </>
  );
}

/** The bottom part (Combobox.Bottom): content below the options at the options' padding, a rule over it. @param {Record<string, any>} props */
export function ComboboxBottom(props) {
  const at = panelSize();
  const style = styled(props, theme => ({ padding: optionPadOf(theme, sizeOf(read(at))), direction: 'column' }));
  return (
    <>
      <View style={ruleOf('over')} />
      <View style={style}>{props.children}</View>
    </>
  );
}

/** The check an option shows when it is the value. @param {{ size?: number, shown: () => boolean }} props */
export function OptionCheck(props) {
  const ui = $ui();
  const px = () => props.size ?? ui.theme().sizes.glyph.xs;
  return <Shape shapes={() => (props.shown() ? checkFigures(px(), pageColors(ui.theme(), ui.scheme()).text) : [])} style={() => ({ width: px(), height: px(), shrink: 0 })} />;
}

/**
 * The options of parsed data in the panel: groups, each option with its
 * check (`check`: true, false, or your own icon; `checkAt` 'end', the
 * default, after the label, or 'start'), `renderOption(option, { picked })`, in a Scroll `panelHeight`
 * high, and `empty` when none is shown.
 * @param {{ options: () => import('./data.js').Option[], checked: (value: string) => boolean, multiple?: any, check?: any, checkAt?: any, renderOption?: any, panelHeight?: any, empty?: any, hide?: (value: string) => boolean }} props
 */
export function OptionsList(props) {
  const ui = $ui();
  const runs = () => grouped(props.options());
  const part = partOf(read(props.check));
  const check = () => part !== null;
  const right = () => read(props.checkAt) !== 'start';
  /** The check of an option: the built-in one, or the caller's own shown while it is checked. @param {() => boolean} checked */
  const mark = checked => (part?.node === undefined ? <OptionCheck shown={checked} /> : <Show when={checked}>{part.node}</Show>);
  const groupLabel = groupLabelOf(panelSize());
  const option = (/** @type {() => { option: import('./data.js').Option, index: number }} */ entry) => {
    const R = $active();
    // The row is keyed by value; its data item (label, disabled) follows the data.
    const item = $memo(R, () => entry().option);
    const o = () => /** @type {import('./data.js').Option} */ ($read(item));
    const value = $untrack(R, o).value;
    const checked = () => props.checked(value);
    const content =
      props.renderOption !== undefined
        ? () => {
            const now = o();
            return $untrack(R, () => props.renderOption(now, { picked: checked() }));
          }
        : <Label text={() => o().label} style={{ grow: 1 }} />;
    return (
      <ComboboxOption value={value} option={o} index={() => entry().index} disabled={() => o().disabled} chosen={checked}>
        {check() && !right() ? mark(checked) : null}
        {content}
        {check() && right() ? mark(checked) : null}
      </ComboboxOption>
    );
  };
  const max = () => read(props.panelHeight) ?? ui.theme().sizes.box.panel;
  return (
    <Show when={() => props.options().length > 0} fallback={props.empty === undefined ? null : <ComboboxNoMatch>{props.empty}</ComboboxNoMatch>}>
      <Scroll style={() => ({ maxHeight: max(), direction: 'column' })}>
        <ComboboxList multiple={props.multiple}>
          <For each={runs} by={(/** @type {any} */ run) => run.group ?? ''}>
            {(/** @type {any} */ run) => (
              <View role={() => (run().group ? 'group' : 'presentation')} aria-label={() => run().group || undefined} style={{ direction: 'column' }}>
                {() => (run().group ? <Label {...DECOR} text={run().group} style={groupLabel} /> : null)}
                <For each={() => run().options} by={(/** @type {any} */ e) => e.option.value}>
                  {(/** @type {any} */ entry) => option(entry)}
                </For>
              </View>
            )}
          </For>
        </ComboboxList>
      </Scroll>
    </Show>
  );
}

/**
 * The value a combobox writes into a form (Combobox.Value).
 * There is no DOM form here: it renders nothing and hands the value, as
 * a form field would carry it (an array joined by `separator`, ', ' by
 * default: a comma and a space; null as ''), to `form` (a `$form`, at the path `name`) and to
 * `onChange(text)`, at once and whenever `value` changes.
 * @param {{ value?: any, separator?: any, name?: string, form?: { set: (path: string, value: any) => void }, onChange?: (text: string) => void }} props
 */
export function ComboboxValue(props) {
  const R = $active();
  const text = () => {
    const v = read(props.value);
    return Array.isArray(v) ? v.join(read(props.separator) ?? ', ') : v == null ? '' : String(v);
  };
  $watch(R, text, t => {
    if (props.form !== undefined && props.name !== undefined) props.form.set(props.name, t);
    props.onChange?.(t);
  });
  return null;
}

Combobox.Trigger = ComboboxTrigger;
Combobox.Panel = ComboboxPanel;
Combobox.List = ComboboxList;
Combobox.Option = ComboboxOption;
Combobox.Filter = ComboboxFilter;
Combobox.NoMatch = ComboboxNoMatch;
Combobox.Group = ComboboxGroup;
Combobox.Top = ComboboxTop;
Combobox.Bottom = ComboboxBottom;
Combobox.Opener = Opener;
Combobox.Clear = Clear;
Combobox.Value = ComboboxValue;

