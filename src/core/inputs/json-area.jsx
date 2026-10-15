// JsonArea: a Textarea whose text is JSON (or whatever `parse` reads).
// The text is checked when the field is left; while it is known not to
// parse, each edit checks it again, so the message goes as soon as it is
// fixed. Empty text is no value, never an error.

import { $signal, $read, $write, $active, read } from 'ren-core';
import { Textarea } from './input.jsx';
import { $value } from './shared.js';
import { invalidOf } from './field.jsx';
import { labelsIn } from '../../theme/labels.js';

/** JsonArea's own props, kept from the Textarea inside it. */
const OWN = new Set(['value', 'defaultValue', 'onChange', 'onBlur', 'parse', 'print', 'indent', 'pretty', 'parseError', 'onParse', 'error', 'invalid', 'rows']);

/** Text that holds no value: empty or only whitespace. @param {string} text */
const blank = text => text.trim() === '';

/**
 * A Textarea for JSON text: `value` + `onChange` (the text) or
 * `defaultValue`; `parse(text)` (JSON.parse; a throw means not valid);
 * `print(value)` (JSON with `indent`, 2 spaces by default, or a string such
 * as '\t'); `pretty` (false: when true, leaving valid text rewrites it as
 * `print(parse(text))`); `parseError` (the message while the text does not
 * parse, 'Not valid JSON'; false shows none, the invalid look stays);
 * `onParse(value)` (each time valid, non-empty text is left, after any
 * tidy); `rows` (4) and Textarea's other props. A given `error` wins over
 * the parse message. Whitespace-only text becomes '' when left.
 * @param {Record<string, any>} props
 */
export function JsonArea(props) {
  const model = $value(props, '');
  // Whether the text is known not to parse (set on leaving, cleared by an edit that fixes it).
  const bad = $signal($active(), false);
  const text = () => String(model.get());
  /** @param {string} t @returns {{ ok: true, value: unknown } | { ok: false }} */
  const check = t => {
    try {
      // A function prop, not an accessor: taken as given, never read.
      const parse = props.parse ?? JSON.parse;
      return { ok: true, value: parse(t) };
    } catch {
      return { ok: false };
    }
  };
  /** @param {unknown} value */
  const print = value => {
    const own = props.print;
    return own ? own(value) : JSON.stringify(value, null, read(props.indent) ?? 2);
  };
  const edit = (/** @type {string} */ t) => {
    model.set(t);
    if ($read(bad) && (blank(t) || check(t).ok)) $write(bad, false);
  };
  const leave = (/** @type {any} */ e) => {
    const t = text();
    if (blank(t)) {
      $write(bad, false);
      if (t !== '') model.set('');
    } else {
      const got = check(t);
      $write(bad, !got.ok);
      if (got.ok) {
        if (read(props.pretty) === true) {
          const tidy = print(got.value);
          if (tidy !== t) model.set(tidy);
        }
        props.onParse?.(got.value);
      }
    }
    props.onBlur?.(e);
  };
  /** The message shown: a given error, else the parse message while the text does not parse. */
  const message = () => {
    const given = read(props.error);
    if (invalidOf(given, false)) return given;
    if (!$read(bad)) return undefined;
    const own = read(props.parseError);
    return own === false ? undefined : (own ?? labelsIn().notValidJson);
  };
  /** @type {Record<string, any>} */
  const rest = {};
  for (const k in props) if (!OWN.has(k)) rest[k] = props[k];
  return (
    <Textarea
      {...rest}
      rows={props.rows ?? 4}
      value={text}
      onChange={edit}
      onBlur={leave}
      error={message}
      invalid={() => read(props.invalid) === true || $read(bad)}
    />
  );
}
