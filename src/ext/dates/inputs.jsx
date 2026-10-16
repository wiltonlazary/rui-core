// The pickers in a field with a panel (DateSelect,
// MonthSelect, YearSelect, DateInput and DateTimeSelect), on
// rui-core's Popover (or its Modal, `popup="modal"`): the field
// shows the value formatted; a press (or Enter, Space, ArrowDown) opens the
// picker below it; a pick closes it (unless `sticky`), as do Escape and a
// press outside.

import { View, Action, Show, $active, $signal, $read, $write, $untrack, $after, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, pageColors, sized } from '../../theme/resolve.js';
import { Popover, Modal } from '../../core/overlays/index.js';
import { TextInput } from '../../core/inputs/index.js';
import { Field, FIELD_KEYS, outerOf, invalidOf, $fieldName } from '../../core/inputs/field.jsx';
import { heightOf } from '../../core/inputs/shared.js';
import { Button, CloseButton } from '../../core/buttons/index.js';
import { toDate, formatDate, parseDate, toSeconds, fromSeconds, startOfMonth } from './arith.js';
import { $dateValue, $settings } from './shared.jsx';
import { flag, state } from '../../theme/meaning.js';
import { DatePanel, MonthPanel, YearPanel } from './calendar.jsx';
import { TimeInput } from './time.jsx';
import { handled, composing } from '../../core/overlays/shared.jsx';
import { labelsIn } from '../../theme/labels.js';

/**
 * Props that belong to the field, not the picker in the panel: the Field's
 * (FIELD_KEYS but `size`, which the picker takes too) and the field box's.
 */
const FIELD = [...FIELD_KEYS.filter(k => k !== 'size'), 'required', 'invalid', 'fieldStyle', 'placeholder', 'format', 'separator', 'clearable', 'sticky', 'popover', 'popup', 'modal', 'readOnly', 'disabled', 'value', 'defaultValue', 'onChange', 'variant'];

/** The picker's props of an input's props. @param {Record<string, any>} props */
const pickerOf = props => {
  const out = { ...props };
  for (const k of FIELD) delete out[k];
  return out;
};

/**
 * A value's text: one date, several (', '), or a range's two joined by
 * `separator` (its spaces included).
 * @param {any} value @param {string} mode @param {string} format @param {string} separator @param {any} labels
 */
export function formatValue(value, mode, format, separator, labels) {
  const one = (/** @type {any} */ v) => (toDate(v) === null ? '' : formatDate(v, format, labels));
  if (mode === 'multiple') return /** @type {any[]} */ (value ?? []).map(one).filter(Boolean).join(', ');
  if (mode === 'range') {
    const [a, b] = /** @type {any[]} */ (value ?? [null, null]);
    if (toDate(a) === null) return '';
    return toDate(b) === null ? `${one(a)}${separator}` : `${one(a)}${separator}${one(b)}`;
  }
  return one(value);
}

/**
 * Keeps a press inside the panel from reaching the trigger around it: an
 * inline panel (portal false) is placed inside the trigger's
 * wrapper, whose pointer handlers would toggle it.
 * @param {any} e
 */
const stop = e => e?.stopPropagation?.();

/**
 * The field of a picker input: the value's text in a press trigger that
 * opens the panel, a clear button, the Field around them.
 * @param {Record<string, any>} props
 * @param {{ text: () => string, empty: () => boolean, clear: () => void, open: any, panel: () => any }} o
 */
function field(props, o) {
  const disabled = () => read(props.disabled) === true || read(props.readOnly) === true;
  const size = () => (typeof read(props.size) === 'string' ? read(props.size) : 'sm');
  const height = (/** @type {import('../../theme/theme.jsx').RuiThemeValue} */ theme) => heightOf(theme, size());
  const box = styled({ style: props.fieldStyle }, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const soft = read(props.variant) === 'soft';
    return {
      direction: 'row',
      align: 'center',
      height: height(theme),
      minHeight: height(theme),
      border: 1,
      borderColor: invalidOf(read(props.error), read(props.invalid)) ? theme.colors.red[theme.accentShade[scheme]] : soft ? 'transparent' : page.border,
      radius: radiusOf(theme, read(props.radius)),
      // The field draws its press target's focus ring, along its corners.
      ring: 'inner',
      background: read(props.disabled) === true ? page.disabled : soft ? page.sunken : page.field,
      ...(read(props.disabled) === true ? { opacity: theme.opacity.disabled } : null),
    };
  });
  const shown = () => o.text() || (read(props.placeholder) ?? '');
  const text = styled({}, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      grow: 1,
      height: '100%',
      minHeight: 0,
      // The text inset from the start by the field's inset ratio of its height.
      padding: [0, theme.spacing.xs, 0, Math.round(height(theme) * theme.ratios.inset)],
      border: 0,
      radius: 0,
      ring: false,
      background: 'transparent',
      // Its text a row: at the start, in the middle of the field's height.
      direction: 'row',
      justify: 'start',
      align: 'center',
      textAlign: 'start',
      fontSize: sized(theme.fontSizes, size()),
      color: o.text() === '' ? page.placeholder : page.text,
      cursor: disabled() ? 'not-allowed' : 'pointer',
    };
  });
  const popover = () => ({ at: 'bottom-start', shadow: 'md', ...read(props.popover) });
  const modal = () => read(props.popup) === 'modal';
  const label = () => read(props.label) ?? read(props.placeholder) ?? shown();
  // Without a label of its own, inside a Field: the Field's label names it.
  const outerName = props.label === undefined && props['aria-label'] === undefined ? $fieldName(props) : null;
  // In a Modal (popup="modal"): a dialog titled by the field's label, with
  // its close button, its box hugging the picker.
  const inModal = () => (
    <>
      <Action
        text={shown}
        label={label}
        {...outerName}
        aria-disabled={flag(() => read(props.disabled) === true)}
        aria-haspopup="dialog"
        aria-expanded={state(() => $read(o.open) && !disabled())}
        aria-required={flag(props.required)}
        aria-invalid={flag(() => invalidOf(read(props.error), read(props.invalid)))}
        style={text}
        onPress={() => {
          if (!disabled()) $write(o.open, true);
        }}
        onKey={(/** @type {any} */ e) => {
          if (e.key !== 'ArrowDown' || disabled()) return;
          e.preventDefault?.();
          $write(o.open, true);
        }}
      />
      <Modal title={label} style={{ width: 'auto' }} {...read(props.modal)} open={() => $read(o.open) && !disabled()} onOpenChange={(/** @type {boolean} */ v) => $write(o.open, v)}>
        {o.panel()}
      </Modal>
    </>
  );
  return (
    <Field {...outerOf(props)}>
      <View style={box}>
        <Show when={() => !modal()} fallback={inModal()}>
        <Popover
          {...popover()}
          open={() => $read(o.open) && !disabled()}
          onOpenChange={(/** @type {boolean} */ v) => $write(o.open, v)}
        >
          <Popover.Trigger style={{ grow: 1, self: 'stretch', align: 'stretch' }}>
            <Action
              text={shown}
              label={label}
              {...outerName}
              aria-disabled={flag(() => read(props.disabled) === true)}
              aria-haspopup="dialog"
              aria-expanded={state(() => $read(o.open) && !disabled())}
              aria-required={flag(props.required)}
              aria-invalid={flag(() => invalidOf(read(props.error), read(props.invalid)))}
              style={text}
            />
          </Popover.Trigger>
          <Popover.Panel>
            <View onPointerDown={stop} onPointerUp={stop}>{o.panel()}</View>
          </Popover.Panel>
        </Popover>
        </Show>
        <Show when={() => read(props.clearable) === true && !o.empty() && !disabled()}>
          <CloseButton size="sm" label={() => labelsIn().clear} onPress={o.clear} mr="xs" />
        </Show>
      </View>
    </Field>
  );
}

/**
 * A picker in a field (DateSelect, MonthSelect, YearSelect).
 * @param {Record<string, any>} props @param {any} Picker @param {string} format
 */
function pickerInput(props, Picker, format) {
  const R = $active();
  const settings = $settings(props);
  const mode = /** @type {string} */ ($untrack(R, () => read(props.mode)) ?? 'single');
  const fallback = mode === 'multiple' ? [] : mode === 'range' ? [null, null] : null;
  const value = $dateValue(props, 'value', 'defaultValue', /** @type {any} */ (fallback), 'onChange');
  const open = $signal(R, false);
  const text = () => formatValue(value.get(), mode, read(props.format) ?? format, read(props.separator) ?? ' → ', settings.labels());
  const empty = () => {
    const v = value.get();
    return mode === 'multiple' ? (v ?? []).length === 0 : mode === 'range' ? toDate(v?.[0]) === null : toDate(v) === null;
  };
  const change = (/** @type {any} */ v) => {
    value.set(v);
    const done = mode === 'single' || (mode === 'range' && toDate(v?.[0]) !== null && toDate(v?.[1]) !== null);
    if (done && read(props.sticky) !== true) $write(open, false);
  };
  return field(props, {
    text,
    empty,
    open,
    clear: () => value.set(fallback),
    panel: () => <Picker {...pickerOf(props)} mode={mode} value={value.get} onChange={change} />,
  });
}

/**
 * DatePanel in a field: DatePanel's props,
 * and `format` ('D MMM YYYY'), `separator` (' → '), `placeholder`,
 * `clearable`, `sticky` (a pick keeps the panel open), `popover`, `popup`
 * ('popover', or 'modal': the picker in a Modal, `modal`), and the Field's
 * `label`, `description`, `error`, `size`, `radius`, `variant`, `disabled`.
 * @param {Record<string, any>} props
 */
export function DateSelect(props) {
  return pickerInput(props, DatePanel, 'D MMM YYYY');
}

/** MonthPanel in a field: `format` ('MMM YYYY', the month's short name and the year) and DateSelect's field props. @param {Record<string, any>} props */
export function MonthSelect(props) {
  return pickerInput(props, MonthPanel, 'MMM YYYY');
}

/** YearPanel in a field: `format` ('YYYY', the year's four digits: the one plain way to write a year) and DateSelect's field props. @param {Record<string, any>} props */
export function YearSelect(props) {
  return pickerInput(props, YearPanel, 'YYYY');
}

// ---------------------------------------------------------------------------
// DateInput

/**
 * A date typed, with a calendar below: `value`/
 * `defaultValue`/`onChange` ('YYYY-MM-DD' or null), `format` ('D MMM
 * YYYY'), `parse(text)` (format's reading, then 'YYYY-MM-DD'),
 * `min`, `max`, `clearable`, `deselectable`, `revert` (true:
 * the text goes back to the value on blur), `popover`, Calendar's props,
 * and TextInput's. Focus opens the calendar; a pick closes it, as do
 * Escape and a press outside.
 * @param {Record<string, any>} props
 */
export function DateInput(props) {
  const R = $active();
  const settings = $settings(props);
  const value = $dateValue(props, 'value', 'defaultValue', /** @type {string | null} */ (null), 'onChange');
  const open = $signal(R, false);
  const format = () => read(props.format) ?? 'D MMM YYYY';
  const formatted = () => (toDate(value.get()) === null ? '' : formatDate(/** @type {string} */ (value.get()), format(), settings.labels()));
  const draft = $signal(R, /** @type {string | null} */ (null));
  const month = $signal(R, /** @type {string | null} */ ($untrack(R, () => toDate(value.get()))));
  const text = () => $read(draft) ?? formatted();
  const inside = (/** @type {string} */ d) => {
    const lo = toDate(read(props.min));
    const hi = toDate(read(props.max));
    return !((lo !== null && d < lo) || (hi !== null && d > hi)) && props.exclude?.(d) !== true;
  };
  const parse = (/** @type {string} */ t) => {
    const custom = props.parse?.(t);
    if (custom !== undefined) return toDate(custom);
    return parseDate(t, format(), settings.labels()) ?? (/^\d{4}-\d{2}-\d{2}$/.test(t.trim()) ? toDate(t.trim()) : null);
  };
  const input = (/** @type {string} */ t) => {
    $write(draft, t);
    if (t.trim() === '') {
      if (value.get() !== null) value.set(null);
      return;
    }
    const d = parse(t);
    if (d !== null && inside(d)) {
      if (d !== value.get()) value.set(d);
      $write(month, startOfMonth(d));
    }
  };
  const blur = () => {
    if (read(props.revert) !== false) $write(draft, null);
  };
  /** A day was just picked: the focus the closing panel gives back to the field opens nothing. */
  let picked = false;
  const pick = (/** @type {string | null} */ d) => {
    value.set(d);
    $write(draft, null);
    $write(open, false);
    picked = true;
    $after(R, () => (picked = false));
  };
  const disabled = () => read(props.disabled) === true || read(props.readOnly) === true;
  const rest = { ...props };
  for (const k of ['value', 'defaultValue', 'onChange', 'format', 'parse', 'popover', 'revert']) delete rest[k];
  const picker = pickerOf(props);
  for (const k of ['parse', 'revert', 'size']) delete picker[k];
  return (
    <Popover
      at="bottom-start"
      shadow="md"
      {...read(props.popover)}
      open={() => $read(open) && !disabled()}
      onOpenChange={(/** @type {boolean} */ v) => $write(open, v)}
    >
      <Popover.Trigger>
        {(/** @type {any} */ _trigger) => (
          <TextInput
            {...rest}
            value={text}
            onChange={input}
            onFocus={(/** @type {any} */ e) => {
              if (!picked) $write(open, true);
              props.onFocus?.(e);
            }}
            onBlur={(/** @type {any} */ e) => {
              blur();
              props.onBlur?.(e);
            }}
            onKey={(/** @type {any} */ e) => {
              if (composing(e)) return void props.onKey?.(e);
              if (e.key === 'Escape') {
                if ($untrack(R, () => $read(open))) handled(e);
                $write(open, false);
              }
              else if (e.key === 'ArrowDown') $write(open, true);
              props.onKey?.(e);
            }}
            end={
              read(props.clearable) === true ? (
                <Show when={() => toDate(value.get()) !== null && !disabled()}>
                  <CloseButton size="sm" label={() => labelsIn().clear} onPress={() => pick(null)} />
                </Show>
              ) : props.end
            }
          />
        )}
      </Popover.Trigger>
      <Popover.Panel>
        {() => (
          <DatePanel
            {...picker}
            value={value.get}
            onChange={pick}
            deselectable={read(props.deselectable) === true}
            period={() => $read(month) ?? toDate(value.get()) ?? settings.today()}
            onPeriodChange={(/** @type {string} */ d) => $write(month, d)}
          />
        )}
      </Popover.Panel>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// DateTimeSelect

/**
 * A date and a time: `value`/`defaultValue`/
 * `onChange` ('YYYY-MM-DD HH:mm:ss' or null), `format` ('YYYY-MM-DD
 * HH:mm', with seconds 'YYYY-MM-DD HH:mm:ss'), `seconds`, DatePanel's
 * props and the field's (`popup` 'modal' too). Its panel is the calendar
 * with a time row under it: the time field (`timeInput`: TimeInput's props)
 * and a "Done" text button that closes the panel (`done`: its Button props).
 * A picked day keeps the time (midnight at first).
 * @param {Record<string, any>} props
 */
export function DateTimeSelect(props) {
  const R = $active();
  const settings = $settings(props);
  const value = $dateValue(props, 'value', 'defaultValue', /** @type {string | null} */ (null), 'onChange');
  const open = $signal(R, false);
  const seconds = () => read(props.seconds) === true;
  const date = () => toDate(value.get());
  const time = () => {
    const v = value.get();
    const t = v == null ? null : toSeconds(String(v).slice(11));
    return t === null ? '00:00:00' : fromSeconds(t);
  };
  const text = () => (date() === null ? '' : formatDate(`${date()} ${time()}`, read(props.format) ?? (seconds() ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD HH:mm'), settings.labels()));
  const setDate = (/** @type {string | null} */ d) => value.set(d === null ? null : `${d} ${time()}`);
  const setTime = (/** @type {string} */ t) => {
    const s = toSeconds(t);
    const d = date() ?? settings.today();
    if (s !== null) value.set(`${d} ${fromSeconds(s)}`);
  };
  const picker = pickerOf(props);
  for (const k of ['seconds', 'timeInput', 'done']) delete picker[k];
  // The calendar, then the time row a spacing step under it.
  const panel = styled({}, theme => ({ direction: 'column', gap: theme.spacing.xs }));
  const row = styled({}, theme => ({ direction: 'row', gap: theme.spacing.xs, align: 'center' }));
  return field(props, {
    text,
    empty: () => date() === null,
    open,
    clear: () => value.set(null),
    panel: () => (
      <View style={panel}>
        <DatePanel {...picker} value={date} onChange={setDate} />
        <View style={row}>
          <TimeInput
            {...read(props.timeInput)}
            seconds={seconds}
            value={() => fromSeconds(toSeconds(time()) ?? 0, seconds())}
            onChange={setTime}
            flex={1}
          />
          <Button
            variant="ghost"
            size="sm"
            {...read(props.done)}
            onPress={() => {
              read(props.done)?.onPress?.();
              $write(open, false);
            }}
          >
            {read(props.done)?.children ?? (() => labelsIn().done)}
          </Button>
        </View>
      </View>
    ),
  });
}
