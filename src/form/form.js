// $form: a form's values, errors, touched and dirty marks, each in a store
// of the form's root, with one verb per change. Every verb runs as one batch
// of the root. Marks and errors are maps keyed by dot path, so a list edit
// renumbers the keys of the items it moves.

import { $store, $at, $put, $raw, $signal, $read, $write, $batch, $watch, $untrack } from 'ren-core';
import { rooted, eventValue, later } from '../hooks/shared.js';
import { segmentsOf, readAt, writeAt, sameValue } from './paths.js';
import { names } from './patterns.js';
import { own } from '../own.js';
import { counts, kept, runAll, runOne } from './rules.js';

/** @typedef {import('ren-core').Graph} Root */
/** @template T @typedef {import('ren-core').Readable<T>} Readable */
/** @template T @typedef {import('rrx-core/store').Store<T>} Store */
/** @typedef {import('./rules.js').Rules} Rules */
/** @typedef {import('./rules.js').FormErrors} FormErrors */
/** @typedef {import('./patterns.js').PathPattern} PathPattern */

/**
 * The fields checked on an input's change or blur: `true` for all, or exact
 * paths and patterns.
 * @typedef {{ change?: boolean | (string | PathPattern)[], blur?: boolean | (string | PathPattern)[] }} ValidateOn
 */
/** When a field counts as touched: on leaving it, or on its first input. @typedef {'blur' | 'input'} TouchOn */
/** What a change does to a field's shown error: check it again, clear it, or keep it. @typedef {'check' | 'clear' | 'keep'} AfterError */

/**
 * @template V
 * @typedef {object} FormOptions
 * @property {V} [values] the first values; the reset target and the clean values until `rebase` or `settle`
 * @property {FormErrors} [errors] the first errors by path
 * @property {Record<string, boolean>} [touched] the first touched marks by path
 * @property {Record<string, boolean>} [dirty] the first dirty marks by path
 * @property {Rules} [rules]
 * @property {boolean} [keyed] the inputs keep their own state; the form re-mounts one when it sets its field
 * @property {ValidateOn} [validateOn]
 * @property {AfterError} [afterError] 'check' by default
 * @property {TouchOn} [touchOn] 'blur' by default
 * @property {(values: V) => any} [transform] what `submit` and `output` hand over
 * @property {(values: V, previous: V) => void} [onChange] after each command that changes the values
 */

/**
 * Props for an input bound to one field.
 * @typedef {object} Binding
 * @property {(change: any) => void} onChange
 * @property {() => any} [value]
 * @property {() => boolean} [checked]
 * @property {any} [defaultValue]
 * @property {boolean} [defaultChecked]
 * @property {() => any} [error]
 * @property {() => void} [onBlur]
 */

/**
 * @template V
 * @typedef {object} Form
 * @property {Store<V>} values the values; `$at(form.values, path)` tracks one field
 * @property {Store<FormErrors>} errors the errors that count, keyed by path
 * @property {Readable<boolean>} busy true while an async submit handler runs
 * @property {boolean} keyed
 * @property {{ (): V, (path: string): any }} get all values, or one field (missing: `undefined`); tracked
 * @property {() => FormErrors} allErrors
 * @property {(path?: string) => boolean} touched any mark, or one at or under `path`
 * @property {(path?: string) => boolean} dirty
 * @property {(path?: string) => boolean} valid runs the rules without showing errors
 * @property {(values?: V) => any} output
 * @property {(path: string) => string} keyOf
 * @property {(path: string, value: any, options?: { remount?: boolean }) => void} set
 * @property {(partial: Partial<V> | ((current: V) => Partial<V>)) => void} merge
 * @property {{ (path: string, error: any): void, (errors: FormErrors | ((current: FormErrors) => FormErrors)): void }} setError
 * @property {(path?: string) => void} clear
 * @property {() => { ok: boolean, errors: FormErrors }} validate
 * @property {(path: string) => { ok: boolean, error: any }} check
 * @property {{ (path: string, on: boolean): void, (marks: Record<string, boolean>): void }} touch
 * @property {() => void} untouch
 * @property {(marks: Record<string, boolean>) => void} markDirty
 * @property {(values?: V) => void} settle
 * @property {(values: V) => void} rebase
 * @property {(event?: any) => void} reset
 * @property {(path: string, callback: (value: any, previous: any) => void) => void} watch
 * @property {(path: string, item: any, index?: number) => void} insert
 * @property {(path: string, index: number) => void} remove
 * @property {(path: string, from: number, to: number) => void} move
 * @property {(path: string, index: number, item: any) => void} replace
 * @property {(path: string, options?: { as?: 'value' | 'checked', error?: boolean, focus?: boolean }) => Binding} bind
 * @property {(handler: (values: any, event?: any) => any, onInvalid?: (errors: FormErrors) => void) => (event?: any) => void} submit
 */

/**
 * A form on `root` (or the root being built).
 * @template {Record<string, any>} V
 * @overload
 * @param {Root} root @param {FormOptions<V>} [options]
 * @returns {Form<V>}
 */
/**
 * @template {Record<string, any>} V
 * @overload
 * @param {FormOptions<V>} [options]
 * @returns {Form<V>}
 */
/** @param {any[]} args @returns {any} */
export function $form(...args) {
  const R = rooted(args);
  return build(R, args[0] ?? {});
}

/** @param {Root} R @param {FormOptions<any>} options */
function build(R, options) {
  const first = options.values ?? {};
  const rules = options.rules;
  const validateOn = options.validateOn ?? {};
  const afterError = options.afterError ?? 'check';
  const touchOn = options.touchOn ?? 'blur';
  const transform = options.transform ?? (/** @param {any} v */ v => v);
  const keyed = options.keyed === true;

  const values = $store(R, first);
  const errors = $store(R, kept(options.errors));
  const touchedMarks = $store(R, /** @type {Record<string, boolean>} */ ({ ...options.touched }));
  const dirtyMarks = $store(R, /** @type {Record<string, boolean>} */ ({ ...options.dirty }));
  /** The values `dirty` compares with. */
  const clean = $signal(R, first);
  /** What `reset` goes back to. */
  let target = first;
  const busy = $signal(R, false);
  let running = 0;

  // Keys for keyed inputs: each re-key takes the next stamp and records it
  // for its path ('' for everything); a key is the path with the highest
  // stamp among the path and its ancestors.
  const stamps = $store(R, /** @type {Record<string, number>} */ ({}));
  let stamp = 0;

  /** Commands nest into one; the outermost reports the change of values. */
  let depth = 0;
  /** @template T @param {() => T} fn @returns {T} */
  const command = fn =>
    $batch(R, () => {
      if (depth > 0) return fn();
      const before = $raw(values);
      depth++;
      /** @type {any} */
      let out;
      try {
        out = fn();
      } finally {
        depth--;
      }
      const after = $raw(values);
      if (after !== before && options.onChange !== undefined) {
        const report = options.onChange;
        $untrack(R, () => report(after, before));
      }
      return out;
    });

  /** Replaces a map store whole; its changed keys notify. @param {Store<any>} store @param {Record<string, any>} next */
  const replaceMap = (store, next) => void $put(store, [], next);

  /** One entry of a map store, or its removal. @param {Store<any>} store @param {string} key @param {any} value */
  const putEntry = (store, key, value) => {
    const map = $raw(store);
    if (value === undefined) {
      if (!Object.hasOwn(map, key)) return;
      const next = { ...map };
      delete next[key];
      replaceMap(store, next);
    } else if (!Object.is(map[key], value) || !Object.hasOwn(map, key)) {
      replaceMap(store, { ...map, [key]: value });
    }
  };

  /** One field, tracked on that field only. @param {string} path */
  const field = path => {
    const segments = segmentsOf(path);
    $at(values, segments);
    return readAt($raw(values), segments);
  };

  /** @param {string} path */
  const rekey = path => {
    if (keyed) putEntry(stamps, path, ++stamp);
  };

  /** Shows or clears one field's error. @param {string} path @param {any} error */
  const showError = (path, error) => putEntry(errors, path, counts(error) ? error : undefined);

  /** @param {string} path */
  const checkField = path => {
    const error = runOne(rules, $raw(values), path);
    showError(path, error);
    return { ok: error === null, error };
  };

  /** @param {string} path @param {any} value @param {boolean} remount */
  const write = (path, value, remount) => {
    const segments = segmentsOf(path);
    const now = $raw(values);
    const next = typeof value === 'function' ? value(readAt(now, segments)) : value;
    $put(values, [], writeAt(now, segments, next));
    if (remount) rekey(path);
    if (touchOn === 'input') putEntry(touchedMarks, path, true);
    if (names(validateOn.change, path)) checkField(path);
    else if (Object.hasOwn($raw(errors), path)) {
      if (afterError === 'check') checkField(path);
      else if (afterError === 'clear') showError(path, null);
    }
  };

  /**
   * Moves the entries of a list's items to the items' new indexes:
   * `place(i)` is item i's new index, or -1 when it is gone.
   * @param {string} path @param {(i: number) => number} place
   */
  const carry = (path, place) => {
    const prefix = path === '' ? '' : `${path}.`;
    for (const store of [errors, touchedMarks, dirtyMarks]) {
      const map = $raw(store);
      /** @type {Record<string, any>} */
      const next = {};
      // Own keys, so a '__proto__' mark stays data, never the prototype.
      const put = (/** @type {string} */ key, /** @type {any} */ value) => own(next, key, value);
      let moved = false;
      for (const key of Object.keys(map)) {
        const found = prefix === '' || key.startsWith(prefix) ? /^(\d+)(\..*)?$/.exec(key.slice(prefix.length)) : null;
        if (found === null) {
          put(key, map[key]);
          continue;
        }
        const to = place(Number(found[1]));
        if (to !== Number(found[1])) moved = true;
        if (to >= 0) put(`${prefix}${to}${found[2] ?? ''}`, map[key]);
      }
      if (moved) replaceMap(store, next);
    }
  };

  /** The list at `path` (a missing one is empty). @param {string} path @returns {any[]} */
  const listAt = path => {
    const list = readAt($raw(values), segmentsOf(path));
    return Array.isArray(list) ? list : [];
  };

  /** Writes a list edit: the new list, its entries carried, the list re-keyed. @param {string} path @param {any[]} list @param {(i: number) => number} place */
  const editList = (path, list, place) => {
    $put(values, [], writeAt($raw(values), segmentsOf(path), list));
    carry(path, place);
    rekey(path);
  };

  /** @param {string} path */
  const markTouched = path => putEntry(touchedMarks, path, true);

  /** @type {Form<any>} */
  const form = {
    values,
    errors,
    busy,
    keyed,

    get: /** @type {any} */ ((/** @type {string} */ path) => (path === undefined ? $at(values, []) : field(path))),

    allErrors: () => $at(errors, []),

    touched(path) {
      const marks = $at(touchedMarks, []);
      for (const key of Object.keys(marks)) {
        if (marks[key] !== true) continue;
        if (path === undefined || key === path || key.startsWith(`${path}.`)) return true;
      }
      return false;
    },

    dirty(path) {
      const marks = $at(dirtyMarks, []);
      if (path === undefined) {
        for (const key of Object.keys(marks)) if (marks[key] === true) return true;
        return !sameValue($at(values, []), $read(clean));
      }
      const mark = Object.hasOwn(marks, path) ? marks[path] : undefined;
      if (typeof mark === 'boolean') return mark;
      const segments = segmentsOf(path);
      return !sameValue(field(path), readAt($read(clean), segments));
    },

    valid(path) {
      const now = $at(values, []);
      return path === undefined ? Object.keys(runAll(rules, now)).length === 0 : runOne(rules, now, path) === null;
    },

    output: next => transform(next ?? $raw(values)),

    keyOf(path) {
      if (!keyed) return path;
      let top = /** @type {number | null} */ ($at(stamps, [''])) ?? 0;
      const segments = segmentsOf(path);
      let at = '';
      for (let i = 0; i < segments.length; i++) {
        at = i === 0 ? String(segments[0]) : `${at}.${segments[i]}`;
        const stamp = $at(stamps, [at]);
        const seen = /** @type {number | null} */ (Object.hasOwn($raw(stamps), at) ? stamp : null);
        if (seen !== null && seen > top) top = seen;
      }
      return `${path}#${top}`;
    },

    set: (path, value, opts) => command(() => write(path, value, opts?.remount !== false)),

    merge: partial =>
      command(() => {
        const now = $raw(values);
        const part = typeof partial === 'function' ? partial(now) : partial;
        $put(values, [], Array.isArray(part) ? part : { ...now, ...part });
        rekey('');
      }),

    setError: /** @type {any} */ (
      (/** @type {any} */ path, /** @type {any} */ error) =>
        command(() => {
          if (typeof path === 'string') showError(path, error);
          else replaceMap(errors, kept(typeof path === 'function' ? path($raw(errors)) : path));
        })
    ),

    clear: path => command(() => (path === undefined ? replaceMap(errors, {}) : showError(path, null))),

    validate: () =>
      command(() => {
        const found = runAll(rules, $raw(values));
        replaceMap(errors, found);
        return { ok: Object.keys(found).length === 0, errors: found };
      }),

    check: path => command(() => checkField(path)),

    touch: /** @type {any} */ (
      (/** @type {any} */ path, /** @type {boolean} */ on) =>
        command(() => {
          if (typeof path === 'string') putEntry(touchedMarks, path, on ? true : undefined);
          else replaceMap(touchedMarks, { ...path });
        })
    ),

    untouch: () => command(() => replaceMap(touchedMarks, {})),

    markDirty: marks => command(() => replaceMap(dirtyMarks, { ...marks })),

    settle: next =>
      command(() => {
        replaceMap(dirtyMarks, {});
        $write(clean, next ?? $raw(values));
      }),

    rebase: next =>
      command(() => {
        target = next;
        $write(clean, next);
      }),

    reset(event) {
      event?.preventDefault?.();
      command(() => {
        $put(values, [], target);
        replaceMap(errors, {});
        replaceMap(touchedMarks, {});
        replaceMap(dirtyMarks, {});
        $write(clean, target);
        rekey('');
      });
    },

    watch(path, callback) {
      const segments = segmentsOf(path);
      let last = readAt($raw(values), segments);
      $watch(
        R,
        () => field(path),
        value => {
          if (Object.is(value, last)) return;
          const previous = last;
          last = value;
          $untrack(R, () => callback(value, previous));
        },
      );
    },

    insert: (path, item, index) =>
      command(() => {
        const list = listAt(path).slice();
        const at = Math.min(list.length, Math.max(0, index ?? list.length));
        list.splice(at, 0, item);
        editList(path, list, i => (i >= at ? i + 1 : i));
      }),

    remove: (path, index) =>
      command(() => {
        const list = listAt(path);
        if (index < 0 || index >= list.length) return;
        editList(path, list.toSpliced(index, 1), i => (i === index ? -1 : i > index ? i - 1 : i));
      }),

    move: (path, from, to) =>
      command(() => {
        const list = listAt(path);
        if (from < 0 || from >= list.length || list.length === 0) return;
        const end = Math.min(list.length - 1, Math.max(0, to));
        if (end === from) return;
        const next = list.slice();
        next.splice(end, 0, ...next.splice(from, 1));
        editList(path, next, i => {
          if (i === from) return end;
          if (from < end && i > from && i <= end) return i - 1;
          if (end < from && i >= end && i < from) return i + 1;
          return i;
        });
      }),

    replace: (path, index, item) =>
      command(() => {
        const list = listAt(path);
        if (index < 0 || index >= list.length) return;
        editList(path, list.with(index, item), i => i);
      }),

    bind(path, opts = {}) {
      const checkbox = opts.as === 'checked';
      /** @type {Binding} */
      const binding = {
        onChange: change => command(() => write(path, eventValue(change, checkbox), false)),
      };
      if (keyed) {
        const now = $untrack(R, () => readAt($raw(values), segmentsOf(path)));
        if (checkbox) binding.defaultChecked = now === true;
        else binding.defaultValue = now ?? '';
      } else if (checkbox) binding.checked = () => field(path) === true;
      else binding.value = () => field(path) ?? '';
      if (opts.error !== false)
        binding.error = () => {
          // Tracked, then read only as an own key: `constructor` is no error.
          const error = $at(errors, [path]);
          return Object.hasOwn($raw(errors), path) ? (error ?? undefined) : undefined;
        };
      if (opts.focus !== false) {
        binding.onBlur = () =>
          command(() => {
            if (touchOn === 'blur') markTouched(path);
            if (names(validateOn.blur, path)) checkField(path);
          });
      }
      return binding;
    },

    submit: (handler, onInvalid) => event => {
      event?.preventDefault?.();
      const { ok, errors: found } = form.validate();
      if (!ok) {
        onInvalid?.(found);
        return;
      }
      const result = handler(form.output(), event);
      if (result === null || (typeof result !== 'object' && typeof result !== 'function') || typeof result.then !== 'function') return;
      running++;
      command(() => $write(busy, true));
      const done = () =>
        later(R, () => {
          running--;
          if (running === 0) $write(busy, false);
        });
      // A failing handler clears busy and keeps its error visible.
      result.then(done, (/** @type {unknown} */ error) => {
        done();
        throw error;
      });
    },
  };
  return form;
}
