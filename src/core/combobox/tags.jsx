// Tag, Tag.Group, TagBox, MultiSelect and TagInput: values shown as tags
// in a field that grows, an Edit to search or type after them.

import { View, Label, Action, Edit, Shape, For, read, $active, $memo, $read, $untrack } from 'ren-core';
import { styled, pressLook } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { pageColors, radiusOf } from '../../theme/resolve.js';
import { $controlled, crossFigures, keyOf, prevent } from '../overlays/shared.jsx';
import { $combobox } from './store.js';
import { Combobox, ComboboxTrigger, ComboboxPanel, ComboboxFilter, OptionsList, $boxed } from './combobox.jsx';
import { Button } from '../buttons/button.jsx';
import { FieldBox, Outer, Opener, Clear, editStyle, $focused, comboOf, boxPress, editPress } from './field.jsx';
import { marks, named } from '../../theme/meaning.js';
import { parseData, shown } from './data.js';
import { firstIndex, comboboxOf, storeOf, titleOf, long } from './select.jsx';
import { labelsIn } from '../../theme/labels.js';

/** A tag's remove button: a circle 2 px inside the tag's height on every side. @param {number} h */
const removeSide = h => h - 4;

/**
 * A tag: its children as text, `size` ('xs'; its height and font size the
 * theme's `sizes.tag`), `radius` ('sm'),
 * `removable` (a remove button) with `onRemove`, `disabled`, `bg`.
 * Its side padding is `theme.ratios.pad` of its font size; a removable
 * tag ends in its remove button instead, inset as far from the end as
 * from the top and bottom.
 * @param {Record<string, any>} props
 */
export function Tag(props) {
  const ui = $ui();
  const dims = () => {
    const steps = /** @type {Record<string, readonly [number, number]>} */ (ui.theme().sizes.tag);
    return steps[read(props.size) ?? 'xs'] ?? steps.xs;
  };
  const style = styled(props, (theme, scheme) => {
    const [h, fz] = dims();
    const side = Math.round(fz * theme.ratios.pad);
    return {
      direction: 'row',
      align: 'center',
      gap: 2,
      height: h,
      minHeight: h,
      padding: [0, read(props.removable) && !read(props.disabled) ? (h - removeSide(h)) / 2 : side, 0, side],
      radius: radiusOf(theme, read(props.radius) ?? 'sm'),
      background: pageColors(theme, scheme).sunken,
      color: pageColors(theme, scheme).text,
      fontSize: fz,
      shrink: 0,
      ...(read(props.disabled) ? { opacity: theme.opacity.disabled } : null),
    };
  });
  const remove = styled({}, (theme, scheme) => {
    const [h] = dims();
    return {
      width: removeSide(h),
      height: removeSide(h),
      minHeight: removeSide(h),
      padding: 0,
      border: 0,
      radius: radiusOf(theme, 'xl'),
      background: 'transparent',
      align: 'center',
      justify: 'center',
      ...pressLook(theme),
      hover: { background: pageColors(theme, scheme).hover },
    };
  });
  const ink = () => pageColors(ui.theme(), ui.scheme()).text;
  return (
    <View ref={props.ref} style={style}>
      <Label text={props.children} />
      {/* Followed: a tag locked later loses its button. */}
      {() =>
        read(props.removable) && !read(props.disabled) ? (
          <Action
            label={() => labelsIn().remove(String(read(props.children)))}
            onPointerDown={(/** @type {any} */ e) => e?.stopPropagation?.()}
            onPress={() => props.onRemove?.()}
            style={remove}
          >
            <Shape shapes={() => crossFigures(dims()[1], ink())} style={() => ({ width: dims()[1], height: dims()[1], shrink: 0 })} />
          </Action>
        ) : null
      }
    </View>
  );
}

/** Tags in a row that wraps (Tag.Group), half a label gap apart (as in a TagBox). @param {Record<string, any>} props */
function TagGroup(props) {
  const style = styled(props, theme => ({ direction: 'row', wrap: true, gap: theme.control.labelGap / 2, align: 'center' }));
  return <View style={style}>{props.children}</View>;
}

Tag.Group = TagGroup;

/**
 * A field that holds tags, its children (Tags), and its own text entry
 * after them: `search`/`onSearchChange` or `defaultSearch` (the text
 * typed), `placeholder`, `onKey`; the field's props (`size`, `radius`,
 * `error`, `disabled`, `variant`, `start`, `end`) and the Field's
 * (`label`, `description`, `error`, `asterisk`). The entry is named by
 * the label.
 * @param {Record<string, any>} props
 */
export function TagBox(props) {
  const search = $controlled(props, 'search', 'defaultSearch', '', v => props.onSearchChange?.(v));
  const focused = $focused();
  const label = props['aria-label'] ?? (props.label === undefined ? undefined : named(props.label));
  return (
    <Outer {...props}>
      <FieldBox size={props.size} radius={props.radius} error={props.error} invalid={props.invalid} disabled={props.disabled} variant={props.variant} start={props.start} end={props.end} focused={focused.get} multiline onPointerDown={props.onPointerDown}>
        {props.children}
        <TagEntry
          aria-label={label}
          size={props.size}
          value={search.get}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onChange={(/** @type {{ value: string }} */ e) => read(props.disabled) !== true && search.set(e.value)}
          onKey={(/** @type {any} */ e) => read(props.disabled) !== true && props.onKey?.(e)}
          onFocus={focused.onFocus}
          onBlur={focused.onBlur}
        />
      </FieldBox>
    </Outer>
  );
}

/** The text entry after the tags: an Edit (`value`, `onChange`, `placeholder`, `onKey`, `disabled`; a `role` and `aria-*` props pass on). @param {Record<string, any>} props */
function TagEntry(props) {
  const disabled = () => read(props.disabled) === true;
  return (
    <Edit
      ref={props.ref}
      value={props.value}
      label={() => read(props.placeholder) ?? ''}
      aria-disabled={() => (disabled() ? true : undefined)}
      {...marks(props)}
      disabled={disabled}
      onChange={props.onChange}
      onPointerDown={props.onPointerDown}
      onKey={props.onKey}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      style={editStyle({ size: props.size, multiline: true })}
    />
  );
}

/**
 * The tags of values, each with a remove button.
 * @param {() => string[]} values @param {(value: string) => string} labelOf @param {(value: string) => void} remove @param {Record<string, any>} props
 */
function tags(values, labelOf, remove, props) {
  const locked = () => read(props.disabled) === true || read(props.readOnly) === true;
  return (
    <For each={values} by="position">
      {(/** @type {() => string} */ v) => (
        <Tag size={props.size === 'xs' || props.size === 'sm' || props.size == null ? 'sm' : props.size} removable={() => !locked()} onRemove={() => remove(v())}>
          {() => labelOf(v())}
        </Tag>
      )}
    </For>
  );
}

/**
 * Many values from data: `data`, `value`/
 * `onChange(values)` or `defaultValue`, `onPick(value, option)` (an option
 * chosen or unchosen), `searchable` (the search field is
 * always there; `searchable` false only stops filtering), `search`/
 * `onSearchChange` or `defaultSearch`, `match(option, search)`, `max` (the most
 * values), `picked` (true: the picked options stay in the list),
 * `clearable`, `empty`, `panelHeight` (280), `check` (true), `checkAt`,
 * `renderOption(option, { picked })`, `placeholder` (while empty), `disabled`, `readOnly`, and
 * the field's and Field's props. Backspace in the empty search removes
 * the last value; the panel stays open as values are picked. `lightbox`
 * (as Select's): the options open in a centered lightbox, picked and
 * unpicked until its Done, its filter at the top while it lists more than
 * `control.typeahead` options.
 * @param {Record<string, any>} props
 */
export function MultiSelect(props) {
  const R = $active();
  const ui = $ui();
  const boxed = $boxed(props);
  const data = $memo(R, () => parseData(read(props.data)));
  const labelOf = (/** @type {string} */ v) => /** @type {import('./data.js').Option[]} */ ($read(data)).find(o => o.value === v)?.label ?? v;
  const value = $controlled(props, 'value', 'defaultValue', /** @type {string[]} */ ([]), v => props.onChange?.(v));
  const search = $controlled(props, 'search', 'defaultSearch', '', v => props.onSearchChange?.(v));
  const options = () => {
    const picked = value.get();
    const all = /** @type {import('./data.js').Option[]} */ ($read(data));
    const pool = read(props.picked) === false ? all.filter(o => !picked.includes(o.value)) : all;
    return shown(pool, read(props.searchable) === false ? '' : search.get(), props.match);
  };
  const store = $combobox(storeOf(props, { close: () => search.set('') }));
  const locked = () => read(props.disabled) === true || read(props.readOnly) === true;
  const full = () => {
    const max = read(props.max);
    return max != null && value.get().length >= max;
  };
  const remove = (/** @type {string} */ v) => !locked() && value.set($untrack(R, value.get).filter(x => x !== v));
  const choose = (/** @type {string} */ v, /** @type {any} */ option) => {
    if (locked()) return;
    const list = $untrack(R, value.get);
    // A pick max refuses is no pick: onPick hears only a change.
    if (list.includes(v)) {
      props.onPick?.(v, option);
      remove(v);
    } else if (!$untrack(R, full)) {
      props.onPick?.(v, option);
      value.set([...list, v]);
    }
    search.set('');
    if (boxed.on()) store.focusFilter();
    else store.focus();
  };
  const focused = $focused();
  const right = () => (props.end !== undefined ? props.end : read(props.clearable) === true && value.get().length > 0 && !locked() ? <Clear onPress={() => value.set([])} /> : <Opener />);
  // in a lightbox: a filter while the list is long and searching is on
  const filtered = () => boxed.on() && read(props.searchable) !== false && long(ui, $read(data));
  return (
    <Outer {...props}>
      <Combobox store={store} onPick={choose} {...comboboxOf(props)} boxed={boxed.on} title={titleOf(props)} keys={() => !locked() && read(props.keys) !== false}>
        <ComboboxTrigger>
          <FieldBox size={props.size} radius={props.radius} error={props.error} invalid={props.invalid} disabled={props.disabled} variant={props.variant} start={props.start} end={right} focused={focused.get} multiline onPointerDown={boxPress(store, locked)}>
            {tags(value.get, labelOf, remove, props)}
            <TagEntry
              ref={store.setTrigger}
              onPointerDown={editPress(store, locked)}
              {...comboOf(props, store)}
              size={props.size}
              disabled={props.disabled}
              value={search.get}
              placeholder={() => (value.get().length === 0 ? read(props.placeholder) : '')}
              onChange={(/** @type {{ value: string }} */ e) => {
                if (locked()) return;
                search.set(e.value);
                store.open();
                store.activate(firstIndex($untrack(R, options)));
              }}
              onKey={(/** @type {any} */ e) => {
                if (keyOf(e) === 'Backspace' && $untrack(R, search.get) === '' && $untrack(R, value.get).length > 0 && !locked()) {
                  const list = $untrack(R, value.get);
                  remove(list[list.length - 1]);
                }
              }}
              onFocus={focused.onFocus}
              onBlur={focused.onBlur}
            />
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
                  store.activate(firstIndex($untrack(R, options)));
                }}
              />
            ) : null
          }
          footer={
            <Button style={{ alignSelf: 'end' }} onPress={() => store.close()}>
              {() => labelsIn().done}
            </Button>
          }
        >
          <OptionsList
            options={options}
            multiple
            checked={v => value.get().includes(v)}
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
 * Free tags: `value`/`onChange(tags)` or
 * `defaultValue`, `data` (suggestions), `onPick(value, option)` (a
 * suggestion chosen and taken), `match(option, search)` (which suggestions show),
 * `separators` ([',', ';']: typing one ends a tag),
 * Enter adds the typed tag (or the active suggestion), `max` (the most
 * tags), `duplicates` (false), `onRepeat(tag)` (a tag refused as already
 * there), `clearable`, `search`/`onSearchChange` or `defaultSearch`,
 * `placeholder`, and
 * the field's and Field's props. Backspace in the empty entry removes
 * the last tag.
 * @param {Record<string, any>} props
 */
export function TagInput(props) {
  const R = $active();
  const data = $memo(R, () => parseData(read(props.data)));
  const value = $controlled(props, 'value', 'defaultValue', /** @type {string[]} */ ([]), v => props.onChange?.(v));
  const search = $controlled(props, 'search', 'defaultSearch', '', v => props.onSearchChange?.(v));
  const dupes = () => read(props.duplicates) === true;
  const options = () => {
    const tags = value.get();
    const all = /** @type {import('./data.js').Option[]} */ ($read(data));
    return shown(dupes() ? all : all.filter(o => !tags.includes(o.value)), search.get(), props.match);
  };
  const store = $combobox(storeOf(props, {}));
  const locked = () => read(props.disabled) === true || read(props.readOnly) === true;
  /**
   * Adds tags, as far as the rules allow; `taken` runs just before a change.
   * @param {string[]} texts @param {() => void} [taken]
   */
  const add = (texts, taken) => {
    const list = [...$untrack(R, value.get)];
    const max = read(props.max);
    for (const raw of texts) {
      const t = raw.trim();
      if (t === '') continue;
      if (!dupes() && list.includes(t)) {
        props.onRepeat?.(t);
        continue;
      }
      if (max != null && list.length >= max) break;
      list.push(t);
    }
    if (list.length !== $untrack(R, value.get).length) {
      taken?.();
      value.set(list);
    }
  };
  const splits = () => /** @type {string[]} */ (read(props.separators) ?? [',', ';']);
  const change = (/** @type {string} */ text) => {
    const chars = splits();
    if (chars.some(ch => text.includes(ch))) {
      const parts = text.split(new RegExp(`[${chars.map(ch => ch.replace(/[-\\\]^]/g, '\\$&')).join('')}]`));
      const rest = /** @type {string} */ (parts.pop());
      add(parts);
      search.set(rest);
    } else search.set(text);
    store.open();
    store.reset();
  };
  const choose = (/** @type {string} */ v, /** @type {any} */ option) => {
    if (locked()) return;
    // A pick max refuses is no pick: onPick hears only a change.
    add([v], () => props.onPick?.(v, option));
    search.set('');
    store.close();
    store.focus();
  };
  const remove = (/** @type {string} */ v) => {
    if (locked()) return;
    const list = [...$untrack(R, value.get)];
    const at = list.lastIndexOf(v);
    if (at >= 0) list.splice(at, 1);
    value.set(list);
  };
  const focused = $focused();
  const right = () => (props.end !== undefined ? props.end : read(props.clearable) === true && value.get().length > 0 && !locked() ? <Clear onPress={() => value.set([])} /> : undefined);
  return (
    <Outer {...props}>
      <Combobox store={store} onPick={choose} {...comboboxOf(props)} keys={() => !locked() && read(props.keys) !== false}>
        <ComboboxTrigger>
          <FieldBox size={props.size} radius={props.radius} error={props.error} invalid={props.invalid} disabled={props.disabled} variant={props.variant} start={props.start} end={right} focused={focused.get} multiline>
            {tags(value.get, v => v, remove, props)}
            <TagEntry
              ref={store.setTrigger}
              {...comboOf(props, store)}
              size={props.size}
              disabled={props.disabled}
              value={search.get}
              placeholder={() => (value.get().length === 0 ? read(props.placeholder) : '')}
              onChange={(/** @type {{ value: string }} */ e) => !locked() && change(e.value)}
              onKey={(/** @type {any} */ e) => {
                const key = keyOf(e);
                if (locked()) return;
                if (key === 'Enter' && !($untrack(R, store.isOpen) && $untrack(R, store.active) >= 0)) {
                  prevent(e);
                  add([$untrack(R, search.get)]);
                  search.set('');
                  store.close();
                } else if (key === 'Backspace' && $untrack(R, search.get) === '' && $untrack(R, value.get).length > 0) {
                  const list = $untrack(R, value.get);
                  value.set(list.slice(0, -1));
                }
              }}
              onFocus={focused.onFocus}
              onBlur={focused.onBlur}
            />
          </FieldBox>
        </ComboboxTrigger>
        <ComboboxPanel shown={() => options().length > 0}>
          <OptionsList options={options} multiple checked={() => false} check={false} panelHeight={props.panelHeight} renderOption={props.renderOption} />
        </ComboboxPanel>
      </Combobox>
    </Outer>
  );
}
