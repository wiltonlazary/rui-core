// Keyboard shortcuts. A shortcut and a key event each reduce to chord
// strings (held modifiers in a fixed order, then the key, lower case), and a
// shortcut matches when one of the event's chords equals its own. `$shortcuts`
// indexes its map by chord once, so a key looks up a few strings.

import { Graph, $keys } from 'ren-core';
import { $os } from './input.js';

/** @typedef {import('./input.js').OS} OS */

/** The modifiers, in the order a chord writes them. */
const ORDER = /** @type {const} */ (['ctrl', 'alt', 'shift', 'meta']);

/** Each modifier word and the modifier it names; `primary` resolves per platform. @type {Map<string, string>} */
const WORDS = new Map([
  ['ctrl', 'ctrl'], ['control', 'ctrl'],
  ['alt', 'alt'], ['option', 'alt'], ['opt', 'alt'],
  ['shift', 'shift'],
  ['meta', 'meta'], ['cmd', 'meta'], ['command', 'meta'], ['win', 'meta'], ['super', 'meta'],
  ['primary', 'primary'],
]);

/** rui's short key names and the key they stand for, as a chord spells it. @type {Map<string, string>} */
const SHORT = new Map([['space', 'space'], ['plus', 'plus'], ['esc', 'escape'], ['del', 'delete']]);

/** The platforms whose primary modifier is Cmd. */
const APPLE = new Set(['macos', 'ios']);

/** The modifier `primary` names on `os` (the running platform by default). @param {OS | string} [os] */
const primaryOf = os => (APPLE.has(os ?? $os().value) ? 'meta' : 'ctrl');

/** A key as a chord spells it: lower case; the space bar `space`, the plus key `plus`. @param {string} key */
const spell = key => (key === ' ' ? 'space' : key === '+' ? 'plus' : key.toLowerCase());

/**
 * Whether Shift is part of typing `key`: one character that is not a letter,
 * a digit or the space (`?`, `!`, `+`).
 * @param {string} key
 */
const shifted = key => [...key].length === 1 && !/[\p{L}\p{Nd} ]/u.test(key);

/** The letter or digit a key's `code` names (`KeyA` → `a`, `Digit1` / `Numpad1` → `1`), else null. @param {unknown} code */
function positional(code) {
  if (typeof code !== 'string') return null;
  const m = /^(?:Key([A-Z])|(?:Digit|Numpad)([0-9]))$/.exec(code);
  return m === null ? null : (m[1] ?? m[2]).toLowerCase();
}

/** Joins held modifiers (by name) and a key into a chord. @param {Set<string>} held @param {string} key */
const join = (held, key) => [...ORDER.filter(m => held.has(m)), key].join('+');

/**
 * Reads a shortcut's text into its chord: parts joined by `+`, space around
 * a part ignored, case ignored. Modifier words: `ctrl`/`control`,
 * `alt`/`option`/`opt`, `shift`, `meta`/`cmd`/`command`/`win`/`super`, and
 * `primary` (Cmd on macOS and iOS, Ctrl elsewhere). The key is one other
 * part: a character, a key name as the event's `key` spells it (`Enter`,
 * `ArrowUp`, `F5`), or `space`, `plus`, `esc`, `del`.
 * @param {string} text
 * @param {OS | string} [os] the platform `primary` resolves on (the running one by default)
 * @returns {string} the chord, as `ctrl+shift+k`
 * @throws {Error} on an empty text or part, no key, two keys, or a modifier given twice
 */
export function chordOf(text, os) {
  /** @param {string} reason */
  const fail = reason => new Error(`RUI: shortcut "${text}": ${reason}`);
  if (typeof text !== 'string' || text.trim() === '') throw fail('it is empty');
  /** @type {Set<string>} */
  const held = new Set();
  /** @type {string | null} */
  let key = null;
  let primary = false;
  for (const raw of text.split('+')) {
    const part = raw.trim();
    if (part === '') throw fail('a part is empty (write the plus key as "plus")');
    const word = WORDS.get(part.toLowerCase());
    if (word === 'primary') {
      if (primary) throw fail('"primary" is given twice');
      primary = true;
    } else if (word !== undefined) {
      if (held.has(word)) throw fail(`"${word}" is given twice`);
      held.add(word);
    } else {
      if (key !== null) throw fail(`it names two keys, "${key}" and "${part}"`);
      key = SHORT.get(part.toLowerCase()) ?? spell(part);
    }
  }
  if (key === null) throw fail('it names no key, only modifiers');
  if (primary) {
    // `primary` is Ctrl or Cmd; writing either beside it would name one twice on some platform.
    if (held.has('ctrl') || held.has('meta')) throw fail('"primary" already names ctrl or meta');
    held.add(primaryOf(os));
  }
  return join(held, key);
}

/** The modifiers as Apple's menus write them, before the key with no `+`. @type {Record<string, string>} */
const APPLE_MARKS = { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' };
/** The modifiers as the other platforms' menus write them. @type {Record<string, string>} */
const WORDS_SHOWN = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' };
/** Named keys as a menu shows them. @type {Map<string, string>} */
const KEYS_SHOWN = new Map([['plus', '+'], ['space', 'Space'], ['escape', 'Esc'], ['delete', 'Del'], ['arrowup', '↑'], ['arrowdown', '↓'], ['arrowleft', '←'], ['arrowright', '→']]);

/**
 * A shortcut as the platform's menus write it: `primary+shift+z` is '⇧⌘Z'
 * on macOS and iOS, 'Ctrl+Shift+Z' elsewhere; a letter in upper case.
 * @param {string} text a shortcut, as `chordOf` reads it
 * @param {OS | string} [os] the platform (the running one by default)
 * @returns {string}
 */
export function chordText(text, os) {
  const place = os ?? $os().value;
  const parts = chordOf(text, place).split('+');
  const key = /** @type {string} */ (parts.pop());
  const shown = KEYS_SHOWN.get(key) ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
  return APPLE.has(place) ? parts.map(m => APPLE_MARKS[m]).join('') + shown : [...parts.map(m => WORDS_SHOWN[m]), shown].join('+');
}

/**
 * A key event's candidate chords: by its `key`, then by the letter or digit
 * its `code` names (a layout that types another character, Shift with a
 * digit); for a symbol typed with Shift, the chord without Shift too. Empty
 * when the event cannot match: no string `key`, or an input method composing.
 * @param {any} event
 * @returns {string[]}
 */
export function eventChords(event) {
  if (event == null || typeof event.key !== 'string' || event.key === '' || event.isComposing === true) return [];
  /** @type {Set<string>} */
  const held = new Set();
  if (event.ctrlKey === true) held.add('ctrl');
  if (event.altKey === true) held.add('alt');
  if (event.shiftKey === true) held.add('shift');
  if (event.metaKey === true) held.add('meta');
  /** @type {string[]} */
  const out = [join(held, spell(event.key))];
  if (held.has('shift') && shifted(event.key)) {
    const bare = new Set(held);
    bare.delete('shift');
    out.push(join(bare, spell(event.key)));
  }
  const at = positional(event.code);
  if (at !== null && at !== spell(event.key)) out.push(join(held, at));
  return out;
}

/** The chord by the key's position (`event.code`), when it differs from the key's own; else null. @param {any} event */
const positionChord = event => {
  const chords = eventChords(event);
  const at = positional(event?.code);
  return at !== null && at !== spell(event.key) ? /** @type {string} */ (chords.at(-1)) : null;
};

/**
 * @typedef {object} ShortcutEntry
 * @property {(event: any) => void} run
 * @property {boolean=} allowDefault true: the key keeps its default action (the Shortcuts' option by default)
 */

/**
 * @typedef {object} ShortcutsOptions
 * @property {boolean=} allowDefault true: every key that runs an entry keeps its default action
 * @property {boolean=} global true: hear every key of the application root, nothing focused too (call it in a component)
 * @property {boolean=} fields with `global`: hear keys typed in a text field too
 * @property {(OS | string)=} os the platform `primary` resolves on (the running one by default)
 */

/** @typedef {Record<string, ((event: any) => void) | ShortcutEntry>} ShortcutMap */

/**
 * Keyboard shortcuts: `{ 'primary+S': save, Escape: { run: close, allowDefault: true } }`.
 * Every shortcut is read now (a bad one throws). A key runs every entry it
 * matches, in the map's order, each with the event, preventing the event's
 * default first unless `allowDefault`. Returns a handler for a primitive's
 * `onKey`; with `global: true`, hears the whole application root instead
 * (ren-core's `$keys`, leaving keys typed in a field alone unless `fields`)
 * and returns their removal, which the owner's end also runs.
 * @overload
 * @param {import('ren-core').Graph} root
 * @param {ShortcutMap} map
 * @param {ShortcutsOptions} [options]
 * @returns {(event: any) => void}
 */
/**
 * @overload
 * @param {ShortcutMap} map
 * @param {ShortcutsOptions} [options]
 * @returns {(event: any) => void}
 */
/** @param {any[]} args @returns {any} */
export function $shortcuts(...args) {
  if (args[0] instanceof Graph) args.shift();
  const map = /** @type {ShortcutMap} */ (args[0] ?? {});
  const options = /** @type {ShortcutsOptions} */ (args[1] ?? {});
  /** @type {Map<string, { order: number, run: (event: any) => void, allowDefault: boolean }[]>} */
  const byChord = new Map();
  let order = 0;
  for (const [text, value] of Object.entries(map)) {
    const run = typeof value === 'function' ? value : value?.run;
    if (typeof run !== 'function') throw new Error(`RUI: shortcut "${text}": its handler is not a function`);
    const allow = typeof value === 'function' ? undefined : value.allowDefault;
    const chord = chordOf(text, options.os);
    const list = byChord.get(chord) ?? [];
    list.push({ order: order++, run, allowDefault: (allow ?? options.allowDefault) === true });
    byChord.set(chord, list);
  }
  /** @param {any} event */
  const onKey = event => {
    /** @type {{ order: number, run: (event: any) => void, allowDefault: boolean }[]} */
    let hits = [];
    let lists = 0;
    const position = positionChord(event);
    // The key's chords first; its position only when none of them is bound (a layout without the letter).
    const keys = eventChords(event).filter(chord => chord !== position);
    for (const chord of keys) {
      const list = byChord.get(chord);
      if (list === undefined) continue;
      hits = hits.concat(list);
      lists++;
    }
    if (lists === 0 && position !== null) {
      const list = byChord.get(position);
      if (list !== undefined) hits = list;
    }
    if (lists > 1) hits.sort((a, b) => a.order - b.order);
    for (const hit of hits) {
      if (!hit.allowDefault) event.preventDefault?.();
      hit.run(event);
    }
  };
  if (options.global !== true) return onKey;
  return $keys(event => {
    if (event.editable === true && options.fields !== true) return;
    onKey(event);
  });
}
