// Field: a label, a description, a control and an error message, stacked.
// Its parts (Field.Label, Field.Description, Field.Error) stand alone too.
// Here too is how an input's props split between its Field and its control:
// one list, FIELD_KEYS, read by every field in rui.
//
// Two pairs are kept apart on purpose. `required` says a value is needed
// (the control's `aria-required`) and `asterisk` is the mark shown; `error`
// is a message and `invalid` is the state without one.

import { View, Label, Show, $context, $lookup, $active, $signal, $read, $write, $writable, $untrack, $owner, $cleanup, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { sized, pageColors } from '../../theme/resolve.js';
import { DECOR, marks, named, $uid } from '../../theme/meaning.js';
import { sizeOf, labelLook, noteLook, errorColor } from './shared.js';

/**
 * The props that belong to the Field around an input, not to its control:
 * the texts, the mark, the size, the Field's own ref and style, and the
 * layout props.
 */
export const FIELD_KEYS = Object.freeze(['label', 'description', 'error', 'asterisk', 'size', 'outerRef', 'outerStyle', 'style', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'w', 'maxWidth', 'minWidth', 'flex']);

const OUTER = new Set(FIELD_KEYS);

/** The Field's props the control needs as well: its size, its invalid look. */
const SHARED = ['size', 'error'];

/** The size the parts inside a Field take unless given their own. */
const FieldSize = $context(/** @type {any} */ ('sm'));

/**
 * A Field's naming, for the control inside it: `current()` is the id of the
 * label naming it (the Field's own `label` while it shows, else a Field.Label
 * in it, else the outer Field's), null where none does; `claim(id)` is how a
 * Field.Label in it offers its id (the first one there wins; a Field's own
 * label comes first), and the release it returns takes it back as the
 * Field.Label goes.
 * @typedef {{ current: () => string | null, claim: (id: string) => () => void }} Naming
 */

/** The naming of the nearest Field; null outside any. */
export const FieldName = $context(/** @type {Naming | null} */ (null));

/**
 * What names a control inside a Field: `aria-labelledby` the Field's label
 * (as it is now), unless the control has its own `aria-label` or
 * `aria-labelledby`. Call it while the control is built.
 * @param {Record<string, any>} props the control's
 * @returns {Record<string, any> | null}
 */
export function $fieldName(props) {
  const naming = $lookup(FieldName);
  if (naming === null || props['aria-label'] !== undefined || props['aria-labelledby'] !== undefined) return null;
  return { 'aria-labelledby': () => naming.current() ?? undefined };
}

/**
 * A control's name props: `aria-label` its own name when it has one (`own`,
 * read by the caller: its `aria-label`, its label), else its own
 * `aria-labelledby`, else the Field's label through `$fieldName`. Call it while the control is built.
 * @param {Record<string, any>} props the control's @param {any} own
 * @returns {Record<string, any>}
 */
export function $nameOf(props, own) {
  if (own !== undefined) return { 'aria-label': own };
  if (props['aria-labelledby'] !== undefined) return { 'aria-labelledby': props['aria-labelledby'] };
  return $fieldName(props) ?? {};
}

/** Something to show: text, a number or a node (not nothing, a boolean or ''). @param {unknown} v */
const shows = v => v != null && typeof v !== 'boolean' && v !== '';

/** A text a Label can show (a string, a number, or an accessor of one). @param {unknown} v */
const textual = v => typeof v === 'string' || typeof v === 'number' || typeof v === 'function';

/**
 * Whether a control shows the invalid look (and says `aria-invalid`):
 * `invalid` is true, or `error` is a message. `error={true}` is no message.
 * @param {unknown} error the error, read @param {unknown} invalid the flag, read
 * @returns {boolean}
 */
export const invalidOf = (error, invalid) => invalid === true || shows(error);

/**
 * The props for the Field around an input: FIELD_KEYS' texts, mark, size
 * and layout props; `outerRef` as its `ref`; `outerStyle` merged under
 * `style` as its `style`; and `__named` (the control carries the label as
 * its name, so the label shown is decoration).
 * @param {Record<string, any>} props
 * @returns {Record<string, any>}
 */
export function outerOf(props) {
  /** @type {Record<string, any>} */
  const out = { __named: true };
  for (const k of FIELD_KEYS) if (props[k] !== undefined && k !== 'outerRef' && k !== 'outerStyle' && k !== 'style') out[k] = props[k];
  if (props.outerRef !== undefined) out.ref = props.outerRef;
  const { outerStyle, style } = props;
  if (outerStyle !== undefined && style !== undefined) out.style = () => ({ ...read(outerStyle), ...read(style) });
  else if (outerStyle !== undefined || style !== undefined) out.style = style ?? outerStyle;
  return out;
}

/**
 * The props for the control inside a Field: every prop not in FIELD_KEYS,
 * and `size` and `error` as well; `aria-label` from the label's text unless
 * given (a node names nothing); `fieldStyle` as its `style`.
 * @param {Record<string, any>} props
 * @returns {Record<string, any>}
 */
export function fieldOf(props) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const k in props) if (!OUTER.has(k) && k !== 'fieldStyle') out[k] = props[k];
  for (const k of SHARED) if (props[k] !== undefined) out[k] = props[k];
  if (props.fieldStyle !== undefined) out.style = props.fieldStyle;
  if (out['aria-label'] === undefined && textual(props.label)) out['aria-label'] = named(props.label);
  return out;
}

/** A part's size: its own, else its Field's. @param {Record<string, any>} props */
function $sizeOf(props) {
  const inherited = $lookup(FieldSize);
  return () => sizeOf(props.size !== undefined ? read(props.size) : read(inherited));
}

/** A part's text at its font size, or the node given. @param {any} content @param {() => Record<string, any>} style */
const partOf = (content, style) => (textual(content) ? <Label text={() => String(read(content) ?? '')} style={style} /> : content);

/**
 * A field's label (Field.Label): its children the text, `asterisk` the
 * mark after it (true: `*`; a string or node: that; false or absent:
 * none; the mark is decoration), `size`, `style`, and meaning props.
 * @param {Record<string, any>} props
 */
function FieldLabel(props) {
  const size = $sizeOf(props);
  // In a Field, a label that names (not a decoration) offers its id: its own, else a new one.
  const naming = $lookup(FieldName);
  const names = naming !== null && props.__id === undefined && props.__quiet !== true && props['aria-hidden'] === undefined;
  const id = props.__id ?? props.id ?? (names ? $uid('field') : undefined);
  if (names && id !== undefined) {
    const release = naming.claim(id);
    const owner = $owner($active());
    if (owner != null) $cleanup(/** @type {any} */ (owner), release);
  }
  const font = (/** @type {any} */ theme) => sized(theme.fontSizes, size(), 'sm');
  const row = styled(props, theme => ({ direction: 'row', align: 'center', gap: theme.control.labelGap / 2 }));
  const look = styled({}, theme => ({ ...labelLook(theme, font(theme)), lineHeight: theme.lineHeights.md }));
  const markLook = styled({}, (theme, scheme) => ({ ...labelLook(theme, font(theme)), lineHeight: theme.lineHeights.md, color: errorColor(theme, scheme) }));
  const given = props.asterisk;
  /** The mark's text: `*` for true, a string or number as given, else none. */
  const text = () => {
    const a = read(given);
    return a === true ? '*' : typeof a === 'string' || typeof a === 'number' ? String(a) : '';
  };
  const mark = given != null && typeof given === 'object' ? (
    <View {...DECOR} style={markLook}>
      {given}
    </View>
  ) : (
    <Show when={() => text() !== ''}>
      <Label {...DECOR} text={text} style={markLook} />
    </Show>
  );
  return (
    <View ref={props.ref} id={id} {...marks(props)} style={row}>
      {partOf(props.children, look)}
      {mark}
    </View>
  );
}

/**
 * A field's description (Field.Description): its children the text,
 * quiet and wrapping, a note's size below the label; `size`, `style`.
 * @param {Record<string, any>} props
 */
function FieldDescription(props) {
  const size = $sizeOf(props);
  const look = styled(props, (theme, scheme) => ({ ...noteLook(theme, sized(theme.fontSizes, size(), 'sm')), color: pageColors(theme, scheme).quiet, wrap: true }));
  return partOf(props.children, look);
}

/**
 * A field's error message (Field.Error): its children the text, in the
 * error color, wrapping; `size`, `style`.
 * @param {Record<string, any>} props
 */
function FieldError(props) {
  const size = $sizeOf(props);
  const look = styled(props, (theme, scheme) => ({ ...noteLook(theme, sized(theme.fontSizes, size(), 'sm')), color: errorColor(theme, scheme), wrap: true }));
  return partOf(props.children, look);
}

/**
 * A control with its label, description and error message in a column,
 * `control.labelGap` apart: `label`, `description`, `error` (a message;
 * `null`, `false`, `true` and `''` show none), `asterisk` (the mark after
 * the label), `size` ('sm'; its parts take it), `ref`, `style`, the style
 * props, and meaning props (a group's role and `aria-*`) on its root.
 * With `__named` the control carries the label as its name, so a text
 * label shown is decoration, and the outer Field's name passes through;
 * otherwise its label (`label` while it shows, else the first Field.Label
 * inside it, its own `id` kept) names the control inside it
 * (`aria-labelledby`), else the outer Field's does, unless that control has
 * its own `aria-label`. Every rui control takes it: the inputs, the combobox
 * fields, FileInput, the date fields, the sliders, Rating, the choices and
 * their groups.
 * @param {Record<string, any>} props
 */
export function Field(props) {
  const style = styled(props, theme => ({ direction: 'column', gap: theme.control.labelGap }));
  const hidden = props.__named === true && textual(props.label) ? DECOR : null;
  const size = () => sizeOf(read(props.size));
  const outer = $lookup(FieldName);
  // A Field around its own input's control names nothing of its own: the control carries its label, or the outer Field's.
  // Any other names its control by its label while it shows, else a Field.Label in it, else as the outer Field does.
  /** @type {Naming | null} */
  let name = outer;
  /** The id of this Field's own label, made only when it has one. @type {string | null} */
  let own = null;
  if (props.__named !== true) {
    const R = $active();
    // The ids the Field.Labels in it offer, in the order they came; a label is built, and goes,
    // where a computation runs, so computations may write them.
    const claimed = $writable($signal(R, /** @type {string[]} */ ([])));
    const ids = () => /** @type {string[]} */ ($read(claimed));
    name = {
      current: () => (own !== null && shows(read(props.label)) ? own : (ids()[0] ?? outer?.current() ?? null)),
      claim: id => {
        $write(claimed, [...$untrack(R, ids), id]);
        return () => $write(claimed, $untrack(R, ids).filter(x => x !== id));
      },
    };
    if (props.label !== undefined) own = $uid('field');
  }
  return (
    <View ref={props.ref} {...marks(props)} style={style}>
      <FieldSize value={size}>
      <FieldName value={name}>
        <Show when={() => shows(read(props.label))}>
          <FieldLabel {...hidden} __id={own ?? undefined} __quiet={props.__named === true} asterisk={props.asterisk}>
            {props.label}
          </FieldLabel>
        </Show>
        <Show when={() => shows(read(props.description))}>
          <FieldDescription>{props.description}</FieldDescription>
        </Show>
        {props.children}
        <Show when={() => shows(read(props.error))}>
          <FieldError>{props.error}</FieldError>
        </Show>
      </FieldName>
      </FieldSize>
    </View>
  );
}

Field.Label = FieldLabel;
Field.Description = FieldDescription;
Field.Error = FieldError;
