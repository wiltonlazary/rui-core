// MaskInput: a text field whose text follows a pattern, and applyMask, the
// reader behind it. A mask is read once into a list of cells (a fixed
// character, or a slot that takes one typed character); typed text is then
// walked against the cells, so typing, pasting and deleting all come down to
// reading the whole text again.
//
// The grammar: `#` a digit, `@` a letter, `^` a letter shown upper-case,
// `&` a letter or digit; `{…}` literal text; `[…]` an optional tail; any
// other character is itself. More slots come through `slots` (a sign or
// hex digit, say: `{ h: /[0-9a-f]/i }`).

import { read } from 'ren-core';
import { field } from './input.jsx';
import { Field, fieldOf, outerOf } from './field.jsx';
import { $value } from './shared.js';
import { tables } from '../../own.js';

/**
 * One cell of a mask: fixed text, or a slot that takes one character.
 * @typedef {{ text: string } | { take: (ch: string) => string | null, optional: boolean }} Cell
 */

/** A slot's test, from a pattern tested against one character. @param {RegExp} pattern @returns {(ch: string) => string | null} */
const testing = pattern => ch => {
  pattern.lastIndex = 0;
  return pattern.test(ch) ? ch : null;
};

const LETTER = /^\p{L}$/u;

/** The slot characters every mask knows. @type {Record<string, (ch: string) => string | null>} */
const BUILT_IN = tables({
  '#': testing(/^[0-9]$/),
  '@': testing(LETTER),
  // A letter, kept upper-case (a case change that is not one character keeps the letter as typed).
  '^': ch => {
    if (!LETTER.test(ch)) return null;
    const up = ch.toUpperCase();
    return [...up].length === 1 ? up : ch;
  },
  '&': testing(/^[\p{L}0-9]$/u),
});

/** @type {{ mask: string, slots: any, cells: Cell[] } | null} */
let last = null;

/**
 * A mask read into cells. `slots` adds slot characters or replaces the
 * built-in ones (a replaced `^` no longer changes case); the braces and
 * brackets stay structural.
 * @param {string} mask @param {Record<string, RegExp>} [slots]
 * @returns {Cell[]}
 */
function cellsOf(mask, slots) {
  if (last !== null && last.mask === mask && last.slots === slots) return last.cells;
  /** @type {Cell[]} */
  const cells = [];
  let optional = false;
  let literal = false;
  for (const ch of mask) {
    if (literal) {
      if (ch === '}') literal = false;
      else cells.push({ text: ch });
    } else if (ch === '{') literal = true;
    else if (ch === '[') optional = true;
    else if (ch === ']') optional = false;
    else {
      const own = slots?.[ch];
      const take = own instanceof RegExp ? testing(own) : BUILT_IN[ch];
      cells.push(take === undefined ? { text: ch } : { take, optional });
    }
  }
  last = { mask, slots, cells };
  return cells;
}

/**
 * Typed text walked against cells: the characters slots took (`raw`), the
 * text shown up to the last taken slot, whether every required slot is
 * filled, and, for each position in the typed text, where the shown text
 * ended once the characters before it were read (for the caret).
 * @param {string} text @param {Cell[]} cells @param {((ch: string) => string) | undefined} transform
 */
function walk(text, cells, transform) {
  let raw = '';
  let out = '';
  let shown = 0;
  let at = 0;
  let filled = 0;
  /** @type {number[]} */
  const ends = [0];
  for (const typed of text) {
    const mapped = transform === undefined ? typed : String(transform(typed) ?? '');
    for (const ch of mapped) {
      while (at < cells.length) {
        const cell = cells[at];
        if ('text' in cell) {
          out += cell.text;
          at++;
          if (cell.text === ch) break;
          continue;
        }
        const kept = cell.take(ch);
        if (kept !== null) {
          raw += kept;
          out += kept;
          shown = out.length;
          at++;
          if (!cell.optional) filled++;
        }
        break;
      }
    }
    for (let i = 0; i < typed.length; i++) ends.push(shown);
  }
  const required = cells.reduce((n, c) => ('take' in c && !c.optional ? n + 1 : n), 0);
  return { raw, shown: out.slice(0, shown), complete: filled === required, ends };
}

/**
 * Reads typed text through a mask: `raw` the characters its slots took,
 * `shown` the mask's text up to the last taken slot (nothing typed: ''),
 * `complete` when every slot outside the optional tail is filled. A typed
 * character equal to the literal where the walk stands steps past it; any
 * other one fills in the literals up to the next slot, and a character the
 * slot refuses is dropped, as is anything past the end of the mask.
 * `transform` maps each typed character first.
 * @param {string} text @param {string} mask
 * @param {Record<string, RegExp>} [slots] extra or replacing slot characters, each tested against one character
 * @param {(ch: string) => string} [transform]
 * @returns {{ raw: string, shown: string, complete: boolean }}
 */
export function applyMask(text, mask, slots, transform) {
  const { raw, shown, complete } = walk(String(text ?? ''), cellsOf(String(mask ?? ''), slots), transform);
  return { raw, shown, complete };
}

/** The mask as a hint: its literals, with `_` for each slot. @param {string} mask @param {Record<string, RegExp>} [slots] */
const hintOf = (mask, slots) => cellsOf(mask, slots).map(c => ('text' in c ? c.text : '_')).join('');

/**
 * A TextInput whose text follows `mask` (see applyMask): `slots`,
 * `transform`, `value` + `onChange` (the text shown) or `defaultValue`,
 * `onRawChange` (the characters the slots took), `onComplete` (the text,
 * each time it becomes complete), and TextInput's props. Typing, pasting
 * and deleting read the whole text again; the caret stays after the last
 * character taken before it. The placeholder is the mask with `_` for each
 * slot unless `placeholder` is given.
 * @param {Record<string, any>} props
 */
export function MaskInput(props) {
  const model = $value(props, '');
  const mask = () => String(read(props.mask) ?? '');
  const slots = () => read(props.slots) ?? undefined;
  const reading = (/** @type {string} */ text) => walk(text, cellsOf(mask(), slots()), props.transform);
  const text = () => reading(String(model.get())).shown;
  const input = (/** @type {string} */ typed) => {
    const before = reading(String(model.get()));
    const now = reading(typed);
    if (now.shown === before.shown) return;
    model.set(now.shown);
    if (now.raw !== before.raw) props.onRawChange?.(now.raw);
    if (now.complete && !before.complete) props.onComplete?.(now.shown);
  };
  return (
    <Field {...outerOf(props)}>
      {field(
        { ...fieldOf(props), placeholder: () => read(props.placeholder) ?? hintOf(mask(), slots()) },
        {
          text,
          input,
          caret: (typed, at) => reading(typed).ends[at] ?? text().length,
        },
      )}
    </Field>
  );
}
