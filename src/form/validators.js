// rui-core/form validators: small rules a form checks a field with. Each
// rule is a pure function of its inputs; it returns null when the value
// passes, else the error it was given, else a short English message.

/**
 * A field rule: `null` when the value passes, else the error to show.
 * @typedef {(value: any, values: any, path: string) => any} Rule
 */

/**
 * The given error, or the rule's own message when none was named.
 * @param {any} error @param {any} fallback
 */
const failWith = (error, fallback) => (error === undefined ? fallback : error);

/** One segmenter for every grapheme count. */
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * User-perceived characters in a string.
 * @param {string} text
 */
const graphemeCount = text => {
  let n = 0;
  for (const _ of graphemes.segment(text)) n++;
  return n;
};

/**
 * Reads a dotted path (`'a.list.1'`) from the values; a missing step gives `undefined`.
 * @param {any} values @param {string} path
 */
const readPath = (values, path) => {
  let at = values;
  for (const step of String(path).split('.')) {
    if (at === null || typeof at !== 'object' || !Object.hasOwn(at, step)) return undefined;
    at = at[step];
  }
  return at;
};

/**
 * Fails an empty value: `null`, `undefined`, `NaN`, blank text or an empty list.
 * `false` and `0` are answers and pass.
 * @param {any} [error] @returns {Rule}
 */
export const required = error => value => {
  const empty =
    value === null ||
    value === undefined ||
    Number.isNaN(value) ||
    (typeof value === 'string' && /^\s*$/u.test(value)) ||
    (Array.isArray(value) && value.length === 0);
  return empty ? failWith(error, 'Fill this in') : null;
};

/**
 * Whether text has an email address's shape: no white space, one `@` with
 * something before it, and a domain of two or more non-empty labels.
 * @param {string} text @returns {boolean}
 */
export const emailTest = text => {
  if (typeof text !== 'string' || /\s/u.test(text)) return false;
  const parts = text.split('@');
  if (parts.length !== 2 || parts[0] === '') return false;
  const labels = parts[1].split('.');
  return labels.length >= 2 && labels.every(label => label !== '');
};

/**
 * Fails text that {@link emailTest} rejects.
 * @param {any} [error] @returns {Rule}
 */
export const email = error => value => (emailTest(value) ? null : failWith(error, 'Not an email address'));

/**
 * Fails a non-string or text the pattern does not match. A global or sticky
 * pattern is tested through a flag-free copy, so no call carries over.
 * @param {RegExp} regex @param {any} [error] @returns {Rule}
 */
export const pattern = (regex, error) => {
  const test = new RegExp(regex.source, regex.flags.replace(/[gy]/g, ''));
  return value => (typeof value === 'string' && test.test(value) ? null : failWith(error, 'Wrong format'));
};

/**
 * Reads a number from a number or non-blank text; anything else is `NaN`.
 * @param {any} value
 */
const numberOf = value => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
};

/**
 * Fails a value that is not a number within `min..max` (both inclusive;
 * `undefined` leaves a side open). Numeric text is read as its number.
 * @param {number | undefined} min @param {number | undefined} max @param {any} [error] @returns {Rule}
 */
export const range = (min, max, error) => {
  const low = min !== undefined && min !== -Infinity;
  const high = max !== undefined && max !== Infinity;
  const message = low && high ? `From ${min} to ${max}` : low ? `${min} or more` : high ? `${max} or less` : 'Not a number';
  return value => {
    const n = numberOf(value);
    const ok = !Number.isNaN(n) && (min === undefined || n >= min) && (max === undefined || n <= max);
    return ok ? null : failWith(error, message);
  };
};

/**
 * @typedef {object} LengthOptions
 * @property {boolean} [trim] count the trimmed text
 */

/**
 * Fails text or a list whose length is out of bounds. Text counts graphemes,
 * untrimmed unless `options.trim`; a list counts items. With `max` left out
 * the length must be exactly `min`. When the second argument is neither a
 * number nor `undefined` it is the error: `length(6, 'Six digits')`.
 * @param {number} min
 * @param {number | any} [max]
 * @param {any} [error]
 * @param {LengthOptions | any} [options]
 * @returns {Rule}
 */
export const length = (min, max, error, options) => {
  if (max !== undefined && typeof max !== 'number') {
    options = error;
    error = max;
    max = undefined;
  }
  const exact = max === undefined;
  const top = exact ? min : max;
  const trim = options?.trim === true;
  // The noun counts the last bound shown: 'character' after a 1.
  const shown = exact || top === Infinity ? min : top;
  /** @param {string} plural */
  const message = plural => {
    const noun = shown === 1 ? plural.slice(0, -1) : plural;
    return exact ? `${min} ${noun}` : top === Infinity ? `At least ${min} ${noun}` : min === 0 ? `At most ${top} ${noun}` : `${min} to ${top} ${noun}`;
  };
  return value => {
    let n;
    let noun;
    if (typeof value === 'string') {
      n = graphemeCount(trim ? value.trim() : value);
      noun = 'characters';
    } else if (Array.isArray(value)) {
      n = value.length;
      noun = 'items';
    } else return failWith(error, message('characters'));
    return n >= min && n <= top ? null : failWith(error, message(noun));
  };
};

/**
 * Fails a value that is not the same (`Object.is`) as the value at `field`.
 * @param {string} field @param {any} [error] @returns {Rule}
 */
export const same = (field, error) => (value, values) =>
  Object.is(value, readPath(values, field)) ? null : failWith(error, 'Does not match');
