// Select, PlainSelect, Autocomplete and Picker: data (strings,
// { value, label }, groups) in a Combobox, a field (an Action to press, or
// an Edit to search) as its trigger.

import { View, Label, Action, Edit, read, $active, $signal, $memo, $read, $write, $untrack } from 'ren-core';
import { styled, pressLook } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { pageColors, sized } from '../../theme/resolve.js';
import { $controlled } from '../overlays/shared.jsx';
import { $combobox } from './store.js';
import { Combobox, ComboboxTrigger, ComboboxPanel, ComboboxFilter, OptionsList, $comboboxContext, $boxed } from './combobox.jsx';
import { FieldBox, Outer, Opener, Clear, editStyle, sizeOf, $focused, comboOf } from './field.jsx';
import { parseData, shown, grouped } from './data.js';
import { labelsIn } from '../../theme/labels.js';

/** @typedef {import('./data.js').Option} Option */

/** The keyboard index (the shown order) of `value` among `options`, -1 when not shown. @param {Option[]} options @param {string | null} value */
export function indexOf(options, value) {
  if (value == null) return -1;
  for (const run of grouped(options)) for (const e of run.options) if (e.option.value === value) return e.index;
  return -1;
}

/** The keyboard index of the first enabled option shown, -1 when none. @param {Option[]} options */
export function firstIndex(options) {
  for (const run of grouped(options)) for (const e of run.options) if (!e.option.disabled) return e.index;
  return -1;
}

/** The combobox props a component passes on (`popover`: the panel's placement and look, and its size). @param {Record<string, any>} props */
export const comboboxOf = props => ({ size: props.size, ...(read(props.popover) ?? {}) });

/** A field's name, the title of its lightbox: its label, else its aria-label, else its placeholder. @param {Record<string, any>} props */
export const titleOf = props => () => read(props.label) ?? read(props['aria-label']) ?? read(props.placeholder) ?? '';

/** Whether a lightbox lists more options than the theme's `control.typeahead`: it then shows its filter. @param {any} ui @param {any[]} options */
export const long = (ui, options) => options.length > (ui.theme().control.typeahead ?? 10);

/** The store options of a component's open props (`open`, `defaultOpen`, `onOpenChange`). @param {Record<string, any>} props @param {{ open?: () => void, close?: () => void }} on */
export const storeOf = (props, on) => ({
  open: props.open,
  defaultOpen: read(props.defaultOpen) === true,
  onOpenChange: (/** @type {boolean} */ open) => {
    if (open) on.open?.();
    else on.close?.();
    props.onOpenChange?.(open);
  },
});

/** The text style of a field's value (or placeholder, quiet). @param {Record<string, any>} props @param {() => boolean} empty */
export function valueStyle(props, empty) {
  return styled({}, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    // minWidth 0: a narrow field cuts a long value with its ellipsis rather than running under the chevron
    return { grow: 1, minWidth: 0, color: empty() ? page.placeholder : page.text, fontSize: sized(theme.fontSizes, sizeOf(read(props.size))) };
  });
}

/**
 * A select: `data` (strings, `{ value, label, disabled }`, or groups
 * `{ label, options }`), `value`/`onChange(value)` or `defaultValue`,
 * `onPick(value, option)` (the option's data item, as it is chosen), `placeholder`, `searchable` (an Edit filters the
 * options; `search`/`onSearchChange` or `defaultSearch`,
 * `match(option, search)` (the label holds the search, by default), `limit`
 * (the most options shown)), `clearable`, `deselectable` (true), `empty` (shown when
 * nothing matches), `panelHeight` (280: the most its list is high, as high as its options when fewer, scrolling down only, without bars), `check` (true),
 * `checkAt` ('end'), `renderOption(option, { picked })`, `disabled`, `readOnly`, `label`,
 * `description`, `error`, `required`, `size`, `radius`, `variant`,
 * `start`, `end`, `popover` (the panel's placement), `open`,
 * `defaultOpen`, `onOpenChange`, `lightbox` (true, false, or a breakpoint key
 * below which; the theme's `control.lightbox` by default): the options then
 * open in a centered lightbox titled by the label, the field pressed rather
 * than typed in, and a filter at its top while it lists more than
 * `control.typeahead` options (or the field is `searchable`).
 * @param {Record<string, any>} props
 */
export function Select(props) {
  const R = $active();
  const ui = $ui();
  const boxed = $boxed(props);
  const data = $memo(R, () => parseData(read(props.data)));
  const find = (/** @type {string | null} */ v) => /** @type {Option[]} */ ($read(data)).find(o => o.value === v) ?? null;
  const value = $controlled(props, 'value', 'defaultValue', /** @type {string | null} */ (null), v => props.onChange?.(v));
  const labelOf = (/** @type {string | null} */ v) => find(v)?.label ?? '';
  const searchable = () => read(props.searchable) === true;
  // typed in the field; in a lightbox, in its filter (a long list, or a searchable field)
  const inField = () => searchable() && !boxed.on();
  const filtered = () => boxed.on() && (searchable() || long(ui, $read(data)));
  const typed = $signal(R, false);
  const search = $controlled(props, 'search', 'defaultSearch', '', v => props.onSearchChange?.(v));
  const narrowing = () => inField() || filtered();
  const options = () => shown($read(data), narrowing() && $read(typed) ? search.get() : '', narrowing() ? props.match : undefined, read(props.limit));
  const store = $combobox(
    storeOf(props, {
      open: () => store.activate(indexOf($untrack(R, options), $untrack(R, value.get))),
      close: () => {
        $write(typed, false);
        if ($untrack(R, inField)) search.set(labelOf($untrack(R, value.get)));
        else if ($untrack(R, filtered)) search.set('');
      },
    }),
  );
  const locked = () => read(props.disabled) === true || read(props.readOnly) === true;
  const choose = (/** @type {string} */ v, /** @type {any} */ option) => {
    if (locked()) return;
    props.onPick?.(v, option);
    const current = $untrack(R, value.get);
    const next = current === v && read(props.deselectable) !== false ? null : v;
    if (next !== current) value.set(next);
    if (inField()) search.set(labelOf(next));
    else if (filtered()) search.set('');
    $write(typed, false);
    store.close();
    store.focus();
  };
  const clear = () => {
    value.set(null);
    search.set('');
    $write(typed, false);
    store.close();
  };
  const focused = $focused();
  const right = () => {
    if (props.end !== undefined) return props.end;
    return read(props.clearable) === true && value.get() != null && !locked() ? <Clear onPress={clear} /> : <Opener />;
  };
  const shownText = () => ($read(typed) ? search.get() : labelOf(value.get()));
  const typing = () => (
    <Edit
      ref={store.setTrigger}
      // its press is its own (the caret goes where it is pressed); it opens the panel
      onPointerDown={(/** @type {any} */ e) => {
        e?.stopPropagation?.();
        if (!locked()) store.open();
      }}
      value={shownText}
      label={() => read(props.placeholder) ?? ''}
      {...comboOf(props, store)}
      onChange={(/** @type {{ value: string }} */ e) => {
        if (locked()) return;
        search.set(e.value);
        $write(typed, true);
        store.open();
        store.activate(firstIndex($untrack(R, options)));
      }}
      onFocus={focused.onFocus}
      onBlur={focused.onBlur}
      style={editStyle(props)}
    />
  );
  const pressing = () => (
    <Action
      ref={store.setTrigger}
      label={() => read(props['aria-label']) ?? labelOf(value.get()) ?? read(props.placeholder) ?? ''}
      {...comboOf(props, store)}
      onPress={() => !locked() && store.toggle()}
      // its pointerdown is its own: the box's opens the panel, whose backdrop would take the press it toggles with
      onPointerDown={(/** @type {any} */ e) => e.stopPropagation()}
      onFocus={focused.onFocus}
      onBlur={focused.onBlur}
      style={() => ({ grow: 1, shrink: 1, width: 0, minWidth: 0, height: '100%', minHeight: 0, padding: 0, border: 0, ring: false, background: 'transparent', justify: 'start', align: 'center', direction: 'row', textAlign: 'start', ...pressLook(ui.theme(), locked()) })}
    >
      <Label text={() => labelOf(value.get()) || (read(props.placeholder) ?? '')} ellipsis style={valueStyle(props, () => value.get() == null)} />
    </Action>
  );
  // in a lightbox the field is pressed, never typed in: its filter takes the typing
  const trigger = () => (inField() ? typing() : pressing());
  return (
    <Outer {...props}>
      <Combobox store={store} onPick={choose} {...comboboxOf(props)} boxed={boxed.on} title={titleOf(props)} keys={() => !locked() && read(props.keys) !== false}>
        <ComboboxTrigger kind={() => (inField() ? 'input' : 'button')}>
          <FieldBox
            size={props.size}
            radius={props.radius}
            error={props.error}
            invalid={props.invalid}
            disabled={props.disabled}
            variant={props.variant}
            start={props.start}
            end={right}
            focused={focused.get}
            pressed={() => !inField()}
            // The whole box opens it, its padding and chevron too, the focus on the field (the press prevented, as a DOM
            // mousedown: no focus moves away); the field's own press is its own.
            onPointerDown={(/** @type {any} */ e) => {
              if (locked()) return;
              e?.preventDefault?.();
              store.focus();
              store.open();
            }}
          >
            {trigger}
          </FieldBox>
        </ComboboxTrigger>
        <ComboboxPanel
          shown={() => options().length > 0 || props.empty !== undefined}
          filter={() =>
            filtered() ? (
              <ComboboxFilter
                value={search.get}
                placeholder={() => read(props.searchPlaceholder) ?? labelsIn().search}
                onChange={(/** @type {{ value: string }} */ e) => {
                  search.set(e.value);
                  $write(typed, true);
                  store.activate(firstIndex($untrack(R, options)));
                }}
              />
            ) : null
          }
        >
          <OptionsList
            options={options}
            checked={v => value.get() === v}
            check={props.check}
            checkAt={props.checkAt}
            renderOption={props.renderOption}
            panelHeight={() => (boxed.on() ? boxed.height() : read(props.panelHeight))}
            empty={props.empty}
          />
        </ComboboxPanel>
      </Combobox>
    </Outer>
  );
}

/**
 * A plain select: `data`, `value`/`onChange` or `defaultValue` (the
 * first option by default), no search, no clearing, no deselecting, no
 * check, a chevron. It is a Select in that role on every renderer, its
 * panel drawn like Select's, so all renderers match.
 * @param {Record<string, any>} props
 */
export function PlainSelect(props) {
  const first = parseData(read(props.data)).find(o => !o.disabled)?.value ?? null;
  return <Select {...props} defaultValue={props.defaultValue ?? first} searchable={false} clearable={false} deselectable={false} check={false} />;
}

/**
 * Free text with suggestions: `value`/`onChange`
 * (the text) or `defaultValue`, `data` (suggestions; a choice fills the
 * text with its label), `onPick(value, option)` (a suggestion chosen), `match(option, search)`, `limit` (the
 * most suggestions shown), `placeholder`, `panelHeight`,
 * `renderOption(option, { picked })`, `clearable`, and the
 * field's and panel's props. The panel shows while suggestions match.
 * @param {Record<string, any>} props
 */
export function Autocomplete(props) {
  const R = $active();
  const data = $memo(R, () => parseData(read(props.data)));
  const value = $controlled(props, 'value', 'defaultValue', '', v => props.onChange?.(v));
  const options = () => shown($read(data), value.get(), props.match, read(props.limit));
  const store = $combobox(storeOf(props, {}));
  const choose = (/** @type {string} */ v, /** @type {any} */ option) => {
    if (locked()) return;
    props.onPick?.(v, option);
    // The field holds text: the option's label (its value where it has none).
    value.set(option?.label ?? v);
    store.close();
    store.focus();
  };
  const focused = $focused();
  // Disabled or read-only: no typing, no opening, no clearing (as Select).
  const locked = () => read(props.disabled) === true || read(props.readOnly) === true;
  const right = () => (props.end !== undefined ? props.end : read(props.clearable) === true && value.get() !== '' && !locked() ? <Clear onPress={() => value.set('')} /> : undefined);
  return (
    <Outer {...props}>
      <Combobox store={store} onPick={choose} {...comboboxOf(props)} keys={() => !locked() && read(props.keys) !== false}>
        <ComboboxTrigger>
          <FieldBox size={props.size} radius={props.radius} error={props.error} invalid={props.invalid} disabled={props.disabled} variant={props.variant} start={props.start} end={right} focused={focused.get} onPointerDown={() => !locked() && store.open()}>
            <Edit
              ref={store.setTrigger}
              value={value.get}
              label={() => read(props.placeholder) ?? ''}
              {...comboOf(props, store)}
              disabled={() => read(props.disabled) === true}
              readOnly={() => read(props.readOnly) === true}
              onChange={(/** @type {{ value: string }} */ e) => {
                if (locked()) return;
                value.set(e.value);
                store.open();
                store.reset();
              }}
              onFocus={focused.onFocus}
              onBlur={focused.onBlur}
              style={editStyle(props)}
            />
          </FieldBox>
        </ComboboxTrigger>
        <ComboboxPanel shown={() => options().length > 0}>
          <OptionsList options={options} checked={() => false} check={false} renderOption={props.renderOption} panelHeight={props.panelHeight} />
        </ComboboxPanel>
      </Combobox>
    </Outer>
  );
}

/**
 * Options on a trigger of the caller's own, a
 * button for instance: `Picker.Trigger` around it; `data`,
 * `value`/`onChange` or `defaultValue`, `onPick(value, option)`,
 * `multiple` (values: an array; the panel stays open), `searchable` (a search field in the panel;
 * `search`/`onSearchChange` or `defaultSearch`, `match(option, search)`,
 * `empty`, `searchPlaceholder`), `limit` (the most options shown; `max`
 * in the multiple-choice fields caps the picks instead),
 * `deselectable` (true), `check` (true), `checkAt`, `panelHeight`,
 * `renderOption(option, { picked })`, `width` (`sizes.box.select`, 200), `at`
 * ('bottom-start'), and the panel's props (`popover`, `open`,
 * `defaultOpen`, `onOpenChange`).
 * @param {Record<string, any>} props
 */
export function Picker(props) {
  const R = $active();
  const ui = $ui();
  const data = $memo(R, () => parseData(read(props.data)));
  const multiple = () => read(props.multiple) === true;
  const value = $controlled(props, 'value', 'defaultValue', /** @type {any} */ (null), v => props.onChange?.(v));
  const search = $controlled(props, 'search', 'defaultSearch', '', v => props.onSearchChange?.(v));
  const options = () => shown($read(data), read(props.searchable) ? search.get() : '', props.match, read(props.limit));
  const store = $combobox(storeOf(props, { close: () => search.set('') }));
  const has = (/** @type {string} */ v) => (multiple() ? (value.get() ?? []).includes(v) : value.get() === v);
  const choose = (/** @type {string} */ v, /** @type {any} */ option) => {
    props.onPick?.(v, option);
    if (multiple()) {
      const list = /** @type {string[]} */ ($untrack(R, value.get) ?? []);
      value.set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
      return;
    }
    const current = $untrack(R, value.get);
    value.set(current === v && read(props.deselectable) !== false ? null : v);
    store.close();
  };
  return (
    <Combobox store={store} onPick={choose} width={props.width ?? ui.theme().sizes.box.select} at={props.at ?? 'bottom-start'} {...comboboxOf(props)}>
      {props.children}
      <ComboboxPanel>
        {read(props.searchable) ? (
          <ComboboxFilter
            value={search.get}
            placeholder={() => read(props.searchPlaceholder) ?? labelsIn().search}
            onChange={(/** @type {{ value: string }} */ e) => {
              search.set(e.value);
              store.activate(firstIndex($untrack(R, options)));
            }}
          />
        ) : null}
        <OptionsList
          options={options}
          multiple={multiple}
          checked={has}
          check={props.check}
          checkAt={props.checkAt}
          renderOption={props.renderOption}
          panelHeight={props.panelHeight}
          empty={props.empty}
        />
      </ComboboxPanel>
    </Combobox>
  );
}

/**
 * Picker's trigger (Picker.Trigger): a press on it (pointer down, then up)
 * or Enter, Space or ArrowDown opens the options; the arrows, Enter and
 * Escape work the options.
 * @param {Record<string, any>} props
 */
function PickerTrigger(props) {
  const c = $comboboxContext();
  let down = false;
  return (
    <View
      ref={c.pop.setAnchor}
      style={{ self: 'start', align: 'start' }}
      onPointerDown={(/** @type {any} */ e) => {
        if (e === c.pop.inside) return;
        down = (e?.button ?? 0) === 0;
        c.store.setTrigger(e?.target ?? null);
      }}
      onPointerUp={(/** @type {any} */ e) => {
        if (down && e !== c.pop.inside) c.store.toggle();
        down = false;
      }}
      onPointerCancel={() => (down = false)}
      onKey={(/** @type {any} */ e) => {
        if (e === c.pop.inside) return;
        c.store.setTrigger(e?.target ?? null);
        c.keys(e, true);
      }}
    >
      {props.children}
    </View>
  );
}

Picker.Trigger = PickerTrigger;
