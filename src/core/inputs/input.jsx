// Text inputs: Input (the field), and in a Field (field.jsx) TextInput,
// Textarea, PasswordInput, NumberInput and PinInput. An input is a row (the
// start slot, the portable Edit, the end slot) whose border shows focus and
// error.
//
// The Edit is controlled (a bound `value`): an edit the component rejects
// shows the bound value again, and a value it rewrites (a mask, a number
// format) shows as written, the caret then placed after what was typed.

import { View, Edit, Action, Shape, $signal, $read, $write, $active, $after, $commit, $owner, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, sized, pageColors } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { heightOf, sizeOf, $value, fieldColors, clamp, chevronShape, eyeShape, marksOf, insetOf, disabledLook, stepOn, stepOf, placesOf } from './shared.js';
import { composing } from '../overlays/shared.jsx';
import { formatNumber } from '../data/display.jsx';
import { flag } from '../../theme/meaning.js';
import { Field, outerOf, fieldOf, invalidOf, $fieldName, $nameOf } from './field.jsx';
import { handOn } from '../ref.js';
import { labelsIn } from '../../theme/labels.js';

// ---------------------------------------------------------------------------
// The field

/**
 * The input itself (Input, outside a Field): `value` + `onChange` (the
 * new text) or `defaultValue`, `placeholder`, `variant` (outline, soft,
 * bare), `size` (xs to xl: 24 to 52 high), `radius`, `disabled`,
 * `readOnly`, `error` (a message: the invalid look), `invalid` (the look
 * without a message), `required` (`aria-required`), `start`, `end` (and `startWidth`, `endWidth`),
 * `onFocus`, `onBlur`, `onKey`, `onSubmit`.
 * @param {Record<string, any>} props
 */
export function Input(props) {
  const model = $value(props, '');
  return field(props, { text: () => String(model.get()), input: v => model.set(v) });
}

/**
 * @typedef {object} Model what a field shows and does with an edit
 * @property {() => string} text
 * @property {(value: string) => void} input
 * @property {number=} lines an Edit of several lines (Textarea)
 * @property {(() => number)=} rows the rows shown (Textarea's height)
 * @property {(() => { min: number, max: number } | null)=} grow rows grown with the wrapped text (Textarea's autosize), else null
 * @property {((typed: string, caret: number, shown: string) => number)=} caret where the caret goes when the text shown is not the text typed
 * @property {((e: any) => void)=} key
 * @property {((e: any) => void)=} blur
 * @property {((e: any) => void)=} focus
 * @property {any=} ref the Edit's ref
 * @property {(() => Record<string, any>)=} edit extra style on the Edit
 * @property {(() => boolean)=} secret the Edit shows bullets (PasswordInput)
 * @property {Record<string, any>=} meaning what the Edit means past a textbox (NumberInput's spinbutton and value)
 */

/**
 * The input row: the start and end slots and the Edit (disabled and
 * read-only are the Edit's own), bordered by focus and error; the
 * placeholder in the placeholder color, the error color on error. The Edit
 * is named by `aria-label` (the Field's label, from `fieldOf`) and says
 * `aria-required`.
 * @param {Record<string, any>} props @param {Model} model
 */
export function field(props, model) {
  const root = $active();
  // Inside a Field: named by its label unless it has a name of its own.
  const fieldName = $fieldName(props);
  const focused = $signal($active(), false);
  const size = () => sizeOf(read(props.size));
  const disabled = () => read(props.disabled) === true;
  const ui = $ui();
  const border = () => (read(props.variant) === 'bare' ? 0 : 1);
  /** The field's height with `rows` rows of text (a one-line field and a line per row past the first). @param {number} rows */
  const rowsHigh = rows => {
    const s = size();
    const line = sized(ui.theme().fontSizes, s) * ui.theme().lineHeights.md;
    // Unrounded: the text's lines are fractional (a 1.5 leading), and the bounds must equal them.
    return rows * line + (heightOf(ui.theme(), s) - line);
  };
  /** @returns {number | undefined} */
  const height = () => {
    if (model.rows === undefined) return heightOf(ui.theme(), size());
    return model.grow?.() ? undefined : rowsHigh(model.rows());
  };
  const style = styled(props, (theme, scheme) => {
    const c = fieldColors(theme, scheme, read(props.variant), { error: invalidOf(read(props.error), read(props.invalid)), focused: $read(focused), disabled: disabled() });
    const h = height();
    return {
      direction: 'row',
      align: model.rows === undefined ? 'center' : 'start',
      ...(h === undefined ? null : { height: h, minHeight: h }),
      radius: radiusOf(theme, read(props.radius)),
      // The field draws the focus ring of its Edit, along its corners.
      ring: 'inner',
      border: border(),
      borderColor: c.border,
      background: c.background,
      color: c.color,
      fontSize: sized(theme.fontSizes, size()),
      ...(disabled() ? disabledLook(theme) : null),
    };
  });
  const pad = (/** @type {boolean} */ start) => () => {
    const has = start ? props.start !== undefined : props.end !== undefined;
    return has || read(props.variant) === 'bare' ? 0 : insetOf(ui.theme(), heightOf(ui.theme(), size()));
  };
  /** @returns {Record<string, any>} */
  const inner = () => {
    const theme = ui.theme();
    const s = size();
    const fz = sized(theme.fontSizes, s);
    const py = model.rows === undefined ? 0 : Math.round((theme.sizes.control[s] - fz * theme.lineHeights.md) / 2) - 1;
    const c = fieldColors(theme, ui.scheme(), read(props.variant), { error: invalidOf(read(props.error), read(props.invalid)), disabled: disabled() });
    const grow = model.grow?.() ?? null;
    const b = 2 * border();
    return {
      grow: 1,
      shrink: 1,
      width: 0,
      minWidth: 0,
      // A growing Edit is as high as its wrapped rows, between minRows and maxRows.
      ...(grow === null
        ? { minHeight: 0, height: '100%' }
        : { minHeight: rowsHigh(grow.min) - b, ...(Number.isFinite(grow.max) ? { maxHeight: rowsHigh(grow.max) - b } : null) }),
      border: 0,
      radius: 0,
      ring: false,
      background: 'transparent',
      color: c.color,
      placeholderColor: c.placeholder,
      fontSize: fz,
      lineHeight: theme.lineHeights.md,
      padding: [py, pad(false)(), py, pad(true)()],
      ...(disabled() ? { cursor: 'not-allowed' } : null),
      ...(model.edit?.() ?? null),
    };
  };
  const section = (/** @type {any} */ content, /** @type {any} */ width) => {
    const s = styled({}, (theme, scheme) => ({
      width: read(width) ?? theme.sizes.control[size()],
      height: '100%',
      shrink: 0,
      align: 'center',
      justify: 'center',
      color: pageColors(theme, scheme).quiet,
    }));
    return <View style={s}>{content}</View>;
  };
  const key = props.onKey;
  const ref = model.ref ?? props.ref;
  /** The Edit's element (its caret API); a worker's Handle has none. @type {any} */
  let node = null;
  /** The caret placement the last keystroke asks for, until this flush's `$commit` round queues it. @type {(() => void) | null} */
  let placing = null;
  /** Counts the keystrokes: a placement is for the latest only. */
  let strokes = 0;
  // A rewritten keystroke (a regrouped number, a mask) puts the caret at the end, and a rejected one is shown
  // again by ren-core's Edit after the handler's flush (a `$after` it queues once the handler returns). The
  // placement goes right after that: queued by a `$commit` hook (which runs before the round's `$after`
  // callbacks), it lands behind ren-core's, in the same flush, never waiting for a task elsewhere.
  if (model.caret !== undefined)
    $commit(root, $owner(root), () => {
      if (placing === null) return;
      const place = placing;
      placing = null;
      $after(root, place);
    });
  const input = (/** @type {{ value: string }} */ e) => {
    const typed = e.value;
    const at = node?.selectionStart;
    strokes++;
    model.input(typed);
    const place = model.caret;
    const edit = node;
    if (place === undefined || typeof at !== 'number' || typeof edit?.setSelectionRange !== 'function') return;
    const mine = strokes;
    placing = () => {
      // A newer keystroke, or another Edit, owns the caret now.
      if (strokes !== mine || node !== edit) return;
      const shown = model.text();
      if (shown === typed) return;
      const p = clamp(place(typed, at, shown), 0, shown.length);
      edit.setSelectionRange(p, p);
    };
  };
  return (
    <View style={style}>
      {props.start === undefined ? null : section(props.start, props.startWidth)}
      <Edit
        ref={(/** @type {any} */ n) => {
          node = n;
          handOn(ref, n);
        }}
        lines={model.lines}
        autosize={() => {
          const grow = model.grow?.() ?? null;
          return grow === null ? false : Number.isFinite(grow.max) ? grow.max : true;
        }}
        value={model.text}
        label={() => read(props.placeholder) ?? ''}
        {...nameOf(props)}
        {...fieldName}
        aria-required={flag(props.required)}
        {...model.meaning}
        invalid={() => invalidOf(read(props.error), read(props.invalid))}
        disabled={disabled}
        readOnly={() => read(props.readOnly) === true}
        secret={model.secret ?? false}
        onChange={input}
        onSubmit={props.onSubmit}
        onKey={(/** @type {any} */ e) => {
          // An input method's keys are its own: the field's commands (steps, Enter, a cell's Backspace) skip them.
          if (!composing(e)) model.key?.(e);
          key?.(e);
        }}
        onFocus={(/** @type {any} */ e) => {
          $write(focused, true);
          model.focus?.(e);
          props.onFocus?.(e);
        }}
        onBlur={(/** @type {any} */ e) => {
          $write(focused, false);
          model.blur?.(e);
          props.onBlur?.(e);
        }}
        style={inner}
      />
      {props.end === undefined ? null : section(props.end, props.endWidth)}
    </View>
  );
}

/**
 * A field's name: its `aria-label` or `aria-labelledby` (the placeholder then
 * its `aria-placeholder`), or nothing (the placeholder names it).
 * @param {Record<string, any>} props
 * @returns {Record<string, any> | null}
 */
export const nameOf = props =>
  props['aria-label'] === undefined && props['aria-labelledby'] === undefined
    ? null
    : { 'aria-label': props['aria-label'], 'aria-labelledby': props['aria-labelledby'], 'aria-placeholder': () => read(props.placeholder) ?? undefined };

/**
 * A text field with a label, description and error.
 * @param {Record<string, any>} props
 */
export function TextInput(props) {
  return (
    <Field {...outerOf(props)}>
      <Input {...fieldOf(props)} />
    </Field>
  );
}

/**
 * Text on several lines: `rows` (fixed), or
 * `autosize` between `minRows` (1) and `maxRows`, grown with the wrapped
 * lines (the Edit's `autosize`).
 * @param {Record<string, any>} props
 */
export function Textarea(props) {
  const model = $value(props, '');
  const grow = () => (read(props.autosize) === true ? { min: read(props.minRows) ?? 1, max: read(props.maxRows) ?? Infinity } : null);
  const autosize = read(props.autosize) === true;
  return (
    <Field {...outerOf(props)}>
      {field(fieldOf(props), {
        text: () => String(model.get()),
        input: v => model.set(v),
        lines: Math.max(2, autosize ? (read(props.minRows) ?? 2) : (read(props.maxRows) ?? read(props.rows) ?? 64)),
        rows: () => read(props.rows) ?? read(props.minRows) ?? 3,
        grow,
      })}
    </Field>
  );
}

// ---------------------------------------------------------------------------
// PasswordInput

/**
 * A password field that can show its text: `shown` + `onShownChange(shown)`
 * or `defaultShown` (false: hidden); `revealable` (true: the toggle at the
 * end, a square of the control's height times `theme.ratios.icon` with the
 * `radius.sm` corner, its eye the height times `theme.ratios.glyph`). The
 * toggle is a plain button named for what a press does: 'Show password'
 * while hidden, 'Hide password' while shown.
 * @param {Record<string, any>} props
 */
export function PasswordInput(props) {
  const model = $value(props, '');
  const shown = $value(props, false, 'shown', 'defaultShown', 'onShownChange');
  const ui = $ui();
  const toggle = () => {
    const s = heightOf(ui.theme(), read(props.size));
    const icon = Math.round(s * ui.theme().ratios.glyph);
    // Its box: an icon's share of the control (`ratios.icon`), the glyph centered in it.
    const box = Math.round(s * ui.theme().ratios.icon);
    return (
      <Action
        label={() => (shown.get() ? labelsIn().hidePassword : labelsIn().showPassword)}
        onPress={() => shown.set(!shown.get())}
        style={() => ({ background: 'transparent', padding: 0, border: 0, minHeight: 0, width: box, height: box, align: 'center', justify: 'center', radius: ui.theme().radius.sm, cursor: 'pointer', hover: { background: pageColors(ui.theme(), ui.scheme()).hover } })}
      >
        <Shape style={{ width: icon, height: icon }} shapes={() => eyeShape(icon, pageColors(ui.theme(), ui.scheme()).quiet, !shown.get())} />
      </Action>
    );
  };
  return (
    <Field {...outerOf(props)}>
      {field(
        { ...fieldOf(props), end: read(props.revealable) === false ? props.end : toggle() },
        {
          text: () => String(model.get()),
          input: v => model.set(v),
          secret: () => !shown.get(),
        },
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------------
// NumberInput

/** How many characters of `text` pass `counted`. @param {string} text @param {(ch: string) => boolean} counted */
const count = (text, counted) => {
  let n = 0;
  for (const ch of text) if (counted(ch)) n++;
  return n;
};

/**
 * The position just after the k-th character of `text` that passes
 * `counted`, from `start` (`start` itself when k is 0).
 * @param {string} text @param {number} k @param {(ch: string) => boolean} counted @param {number} start
 */
const after = (text, k, counted, start) => {
  if (k === 0) return start;
  let seen = 0;
  for (let i = start; i < text.length; i++) if (counted(text[i]) && ++seen === k) return i + 1;
  return text.length;
};

/**
 * A number field: `value` (a number, or '' when
 * empty) + `onChange`, `min`, `max`, `step` (1; one not above 0 is 1), `clamp` ('commit': into
 * `min`..`max` on blur and Enter; 'always': as typed; false: never),
 * `negative` (true; false: no sign, and a floor of 0 its steps, clamps and
 * `aria-valuemin` keep), `decimal` (true), `decimals`, `fixedDecimals`,
 * `prefix`, `suffix`, `locale` (a BCP 47 tag; the platform's by default),
 * `groupMark` (true: the locale's group mark; or the mark itself),
 * `decimalMark` (the locale's by default), `controls` (true: the step
 * buttons at the end); ArrowUp and ArrowDown step. It means a `spinbutton` with its value, `min` and
 * `max`.
 * @param {Record<string, any>} props
 */
export function NumberInput(props) {
  const model = $value(props, /** @type {number | string} */ (''));
  // The marks resolved: true takes the locale's group mark; the decimal mark is the locale's unless given.
  const o = () => {
    const marks = marksOf(read(props.locale));
    const group = read(props.groupMark);
    return {
      groupMark: group === true ? marks.group : typeof group === 'string' ? group : '',
      decimalMark: read(props.decimalMark) ?? marks.decimal,
      prefix: read(props.prefix),
      suffix: read(props.suffix),
      decimals: placesOf(read(props.decimals)),
      fixedDecimals: read(props.fixedDecimals) === true,
    };
  };
  // The text being typed ('1.' or '-' are not numbers yet); null shows the value.
  const draft = $signal($active(), /** @type {string | null} */ (null));
  const shown = () => $read(draft) ?? formatNumber(model.get(), o());
  // With negative false, nothing below 0: steps and clamps run against max(min, 0).
  const bounds = () => ({ min: read(props.negative) === false ? Math.max(read(props.min) ?? -Infinity, 0) : (read(props.min) ?? -Infinity), max: read(props.max) ?? Infinity });
  const clampTo = (/** @type {number} */ n) => {
    const { min, max } = bounds();
    return clamp(n, min, max);
  };
  const behavior = () => read(props.clamp) ?? 'commit';
  const commit = (/** @type {number | string} */ v) => {
    if (v !== model.get()) model.set(v);
  };
  const input = (/** @type {string} */ next) => {
    const f = o();
    let text = next;
    if (f.prefix) text = text.split(f.prefix).join('');
    if (f.suffix) text = text.split(f.suffix).join('');
    if (f.groupMark !== '') text = text.split(f.groupMark).join('');
    if (f.decimalMark !== '.') text = text.split(f.decimalMark).join('.');
    const negative = read(props.negative) !== false;
    const decimal = read(props.decimal) !== false && f.decimals !== 0;
    const pattern = new RegExp(`^${negative ? '-?' : ''}\\d*${decimal ? '(\\.\\d*)?' : ''}$`);
    // A rejected edit changes nothing: the controlled Edit shows the value again.
    if (!pattern.test(text)) return;
    if (decimal && f.decimals !== undefined && text.includes('.') && text.split('.')[1].length > f.decimals) return;
    if (text === '' || text === '-' || text.endsWith('.')) {
      $write(draft, text === '' ? null : next);
      if (text === '') commit('');
      return;
    }
    let n = Number(text);
    if (behavior() === 'always') {
      const c = clampTo(n);
      if (c !== n) n = c;
    }
    // A zero after the decimal mark ('2.0', '3.50') is the number already: it commits, and the text stays as
    // typed, unless the value committed is another (clamped), which then shows.
    $write(draft, text.includes('.') && text.endsWith('0') && n === Number(text) ? next : null);
    commit(n);
  };
  const increment = (/** @type {number} */ dir) => {
    if (read(props.disabled) || read(props.readOnly)) return;
    const step = stepOf(read(props.step));
    const current = model.get();
    const { min, max } = bounds();
    // Onto the grid of `step` from min (0 without one), in the direction of travel: 1.25 goes to 2 up, 1 down.
    const origin = Number.isFinite(min) ? min : 0;
    const n = current === '' ? (dir > 0 ? origin : Number.isFinite(max) ? max : 0) : clampTo(stepOn(Number(current), step, origin, dir, read(props.decimals) ?? 0));
    $write(draft, null);
    commit(n);
  };
  const ui = $ui();
  const controls = () => {
    const s = heightOf(ui.theme(), read(props.size));
    const w = Math.round(s * ui.theme().ratios.icon);
    const h = Math.floor((s - 4) / 2);
    const chevron = (/** @type {boolean} */ up) => (
      <Action
        label={() => (up ? labelsIn().increment : labelsIn().decrement)}
        onPress={() => increment(up ? 1 : -1)}
        style={() => ({
          background: 'transparent',
          border: 0,
          padding: 0,
          radius: 0,
          // A step is part of the field: the field rings it.
          ring: false,
          minHeight: 0,
          height: h,
          width: w,
          align: 'center',
          justify: 'center',
          cursor: 'pointer',
          hover: { background: pageColors(ui.theme(), ui.scheme()).hover },
        })}
      >
        <Shape style={{ width: Math.round(w * ui.theme().ratios.icon), height: Math.round(h * ui.theme().ratios.icon) }} shapes={() => chevronShape(Math.round(w * ui.theme().ratios.icon), Math.round(h * ui.theme().ratios.icon), pageColors(ui.theme(), ui.scheme()).text, up)} />
      </Action>
    );
    return (
      <View style={{ direction: 'column', justify: 'center' }}>
        {chevron(true)}
        {chevron(false)}
      </View>
    );
  };
  // Commits the value typed: into the bounds on blur and Enter ('commit').
  const settle = () => {
    const current = model.get();
    $write(draft, null);
    if (current !== '' && behavior() === 'commit') {
      const c = clampTo(Number(current));
      if (c !== current) commit(c);
    }
  };
  const end = props.end ?? (read(props.controls) === false ? undefined : controls());
  return (
    <Field {...outerOf(props)}>
      {field(
        { ...fieldOf(props), end, endWidth: props.endWidth ?? (() => Math.round(heightOf(ui.theme(), read(props.size)) * ui.theme().ratios.icon) + 4) },
        {
          text: shown,
          input,
          blur: settle,
          caret: (typed, at, now) => {
            // The caret stays after the same digits.
            const f = o();
            const counted = (/** @type {string} */ ch) => (ch >= '0' && ch <= '9') || ch === '-' || ch === f.decimalMark;
            const lead = (/** @type {string} */ t) => (f.prefix && t.startsWith(f.prefix) ? f.prefix.length : 0);
            return after(now, count(typed.slice(lead(typed), at), counted), counted, lead(now));
          },
          key: e => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault?.();
              increment(e.key === 'ArrowUp' ? 1 : -1);
            } else if (e.key === 'Enter') settle();
          },
          meaning: {
            role: 'spinbutton',
            'aria-valuenow': () => (model.get() === '' ? undefined : Number(model.get())),
            // The floor it keeps: min, or 0 with negative false.
            'aria-valuemin': () => (Number.isFinite(bounds().min) ? bounds().min : undefined),
            'aria-valuemax': () => read(props.max) ?? undefined,
          },
        },
      )}
    </Field>
  );
}

/** A part of a formatted amount that is the number itself (not its currency or the spaces around it). */
const NUMERIC = new Set(['integer', 'group', 'decimal', 'fraction', 'minusSign', 'plusSign', 'nan', 'infinity']);

/**
 * How `locale` writes `currency` around an amount, shown as `display` (Intl's `currencyDisplay`: 'symbol' R$,
 * 'narrowSymbol' $, 'code' BRL, 'name' reais brasileiros; 'none' nothing): the text before the number (`prefix`, its
 * space included: "R$ ") and after it (`suffix`: " €"), for `amount` (a name follows it: 1 real, 2 reais).
 * @param {string} currency @param {string | undefined} locale @param {'symbol' | 'narrowSymbol' | 'code' | 'name' | 'none'} display @param {number} [amount]
 * @returns {{ prefix: string, suffix: string }}
 */
export function currencyAffixes(currency, locale, display, amount = 2) {
  if (display === 'none') return { prefix: '', suffix: '' };
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: display }).formatToParts(Math.abs(amount));
  const first = parts.findIndex(p => NUMERIC.has(p.type));
  const last = parts.findLastIndex(p => NUMERIC.has(p.type));
  const text = (/** @type {Intl.NumberFormatPart[]} */ some) => some.map(p => p.value).join('');
  return { prefix: text(parts.slice(0, first)), suffix: text(parts.slice(last + 1)) };
}

/** How many decimals `currency` takes (2 for BRL, 0 for JPY). @param {string} currency */
export const currencyDecimals = currency => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;

/**
 * A field for an amount of money: NumberInput with `currency` (an ISO code) shown as `display` ('symbol' by default,
 * 'narrowSymbol', 'code', 'name' or 'none') on the side and with the spacing `locale` writes money with (R$ 12,50;
 * 12,50 €), the currency's decimals unless `decimals` is given, and NumberInput's other props.
 * @param {Record<string, any>} props
 */
export function CurrencyInput(props) {
  // a currency's name follows the amount (1 real, 2 reais): the typed one, else a plural
  const amount = () => {
    const v = read(props.value);
    return typeof v === 'number' && Number.isFinite(v) ? v : 2;
  };
  const affixes = () => currencyAffixes(read(props.currency), read(props.locale), read(props.display) ?? 'symbol', amount());
  return <NumberInput decimals={() => currencyDecimals(read(props.currency))} {...props} prefix={() => affixes().prefix} suffix={() => affixes().suffix} />;
}

// ---------------------------------------------------------------------------
// PinInput

/**
 * One character per cell: `length` (6), `accept` ('digits', 'letters',
 * 'any' letter or digit, or a RegExp a character must match; 'digits' by
 * default), `secret` (bullets), `placeholder` ('·'), `gap` ('xs'), `size`,
 * `onComplete`; typing moves to the
 * next cell, Backspace in an empty cell to the previous one, and pasted text
 * fills the cells from the one it lands in. A `group` (named by
 * `aria-label`) of textboxes, each named by its place ('2 of 6').
 * @param {Record<string, any>} props
 */
export function PinInput(props) {
  const model = $value(props, '');
  const ui = $ui();
  const length = read(props.length) ?? 6;
  /** @type {any[]} */
  const refs = [];
  const pattern = () => {
    const accept = read(props.accept) ?? 'digits';
    return accept instanceof RegExp ? accept : accept === 'letters' ? /^[a-zA-Z]$/ : accept === 'any' ? /^[a-zA-Z0-9]$/ : /^[0-9]$/;
  };
  const chars = () => {
    const v = String(model.get());
    return Array.from({ length }, (_, i) => v[i] ?? '');
  };
  const write = (/** @type {string[]} */ cells) => {
    // The value is every filled cell joined in order (an empty one adds nothing).
    const v = cells.join('');
    model.set(v);
    if (v.length === length && cells.every(c => c !== '')) props.onComplete?.(v);
  };
  const cell = (/** @type {number} */ i) => {
    const input = (/** @type {string} */ next) => {
      const cells = chars();
      const shown = cells[i];
      const typed = next.startsWith(shown) && shown !== '' ? next.slice(shown.length) : next.endsWith(shown) && shown !== '' ? next.slice(0, next.length - shown.length) : next;
      if (next === '') {
        cells[i] = '';
        write(cells);
        return;
      }
      const ok = [...typed].filter(ch => pattern().test(ch));
      // Nothing accepted: the controlled Edit shows the cell again.
      if (ok.length === 0) return;
      let at = i;
      for (const ch of ok) {
        if (at >= length) break;
        cells[at++] = ch;
      }
      write(cells);
      refs[Math.min(length - 1, at)]?.focus?.();
    };
    const h = () => heightOf(ui.theme(), read(props.size));
    return field(
      {
        size: props.size,
        radius: props.radius,
        variant: props.variant,
        error: props.error,
        invalid: props.invalid,
        disabled: props.disabled,
        readOnly: props.readOnly,
        placeholder: () => read(props.placeholder) ?? '·',
        // Each cell named by its place; the group keeps the name it is given.
        'aria-label': `${i + 1} of ${length}`,
        style: () => ({ width: h(), minWidth: h() }),
        onFocus: props.onFocus,
        onBlur: props.onBlur,
      },
      {
        text: () => chars()[i],
        secret: () => read(props.secret) === true,
        input,
        ref: (/** @type {any} */ n) => (refs[i] = n),
        edit: () => ({ padding: 0, textAlign: 'center' }),
        key: e => {
          if (e.key === 'Backspace' && chars()[i] === '' && i > 0) {
            const cells = chars();
            cells[i - 1] = '';
            write(cells);
            refs[i - 1]?.focus?.();
            e.preventDefault?.();
          }
        },
      },
    );
  };
  const style = styled(props, theme => ({ direction: 'row', gap: sized(theme.spacing, read(props.gap) ?? 'xs') }));
  return (
    <View ref={props.ref} role="group" {...$nameOf(props, props['aria-label'])} style={style}>
      {Array.from({ length }, (_, i) => cell(i))}
    </View>
  );
}

