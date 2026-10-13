// Running a form's rules: an object of rules shaped like the values (a
// nested object for a nested object, an object at a list's key for each of
// its items, a function for the value at its key), or one schema function
// that gives every error by path.

import { segmentsOf, readAt, isIndex } from './paths.js';
import { own } from '../own.js';

/** @typedef {import('./validators.js').Rule} Rule */
/** @typedef {{ [key: string]: Rule | RuleTree }} RuleTree */
/**
 * Rules by field (`{ venue: { room: rule }, crew: { role: rule } }`), or a
 * schema function giving the errors by path (nullish for none).
 * @typedef {RuleTree | ((values: any) => FormErrors | null | undefined)} Rules
 */
/** Errors by path (`{ 'venue.room': 'Pick a room' }`). @typedef {Record<string, any>} FormErrors */

/** An error counts unless it is `null`, `undefined` or `false`. @param {unknown} error */
export const counts = error => error !== null && error !== undefined && error !== false;

/**
 * Only the entries of `map` that count, as a new object.
 * @param {FormErrors | null | undefined} map
 * @returns {FormErrors}
 */
export function kept(map) {
  /** @type {FormErrors} */
  const out = {};
  if (map == null) return out;
  for (const key of Object.keys(map)) if (counts(map[key])) own(out, key, map[key]);
  return out;
}

/**
 * Every error the rules give for `values`.
 * @param {Rules | undefined} rules @param {any} values
 * @returns {FormErrors}
 */
export function runAll(rules, values) {
  if (rules === undefined) return {};
  if (typeof rules === 'function') return kept(rules(values));
  /** @type {FormErrors} */
  const out = {};
  walk(rules, values, '', values, out);
  return out;
}

/** @param {RuleTree} tree @param {any} value @param {string} prefix @param {any} values @param {FormErrors} out */
function walk(tree, value, prefix, values, out) {
  for (const key of Object.keys(tree)) {
    const rule = tree[key];
    const path = prefix === '' ? key : `${prefix}.${key}`;
    const field = value !== null && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined;
    if (typeof rule === 'function') {
      const error = rule(field, values, path);
      if (counts(error)) own(out, path, error);
    } else if (rule !== null && typeof rule === 'object') {
      if (Array.isArray(field)) for (let i = 0; i < field.length; i++) walk(rule, field[i], `${path}.${i}`, values, out);
      else walk(rule, field, path, values, out);
    }
  }
}

/**
 * The error of the field at `path` (`null` when it passes or has no rule).
 * @param {Rules | undefined} rules @param {any} values @param {string} path
 * @returns {any}
 */
export function runOne(rules, values, path) {
  if (rules === undefined) return null;
  if (typeof rules === 'function') {
    const all = rules(values);
    const error = all != null && Object.hasOwn(all, path) ? all[path] : undefined;
    return counts(error) ? error : null;
  }
  const rule = ruleAt(rules, path);
  if (rule === null) return null;
  const error = rule(readAt(values, segmentsOf(path)), values, path);
  return counts(error) ? error : null;
}

/**
 * The rule for `path`: the rule tree walked by the path's keys, stepping
 * over each index where an object of rules applies to a list's items.
 * @param {RuleTree} tree @param {string} path
 * @returns {Rule | null}
 */
function ruleAt(tree, path) {
  /** @type {Rule | RuleTree | undefined} */
  let at = tree;
  for (const segment of segmentsOf(path)) {
    if (typeof at !== 'object' || at === null) return null;
    if (!Object.hasOwn(at, segment)) {
      if (isIndex(segment)) continue;
      // An inherited member (toString, constructor) is no rule.
      return null;
    }
    at = at[segment];
  }
  return typeof at === 'function' ? at : null;
}
