// What a component means, marked with ren-core's `Meaning` props: an ARIA
// role and its `aria-*` states (WAI-ARIA, the Authoring Practices patterns),
// so ren-json gives its data, the DOM its accessibility, and the canvases
// paint nothing of it.

import { read, Id, $lookup, $context } from 'ren-core';

/**
 * A state as an ARIA word, bound: `'true'` or `'false'` (a false attribute
 * would be dropped by the DOM, and `aria-checked="false"` says something).
 * @param {unknown} value a value, an accessor or a signal
 * @returns {() => 'true' | 'false'}
 */
export const state = value => () => (read(value) ? 'true' : 'false');

/**
 * A flag as an ARIA word, bound: `'true'` when set, nothing otherwise
 * (`aria-disabled`, `aria-invalid`, `aria-required`).
 * @param {unknown} value a value, an accessor or a signal
 * @returns {() => 'true' | undefined}
 */
export const flag = value => () => (read(value) ? 'true' : undefined);

/**
 * A label as a name, bound: its text, or nothing (an element, a boolean).
 * @param {unknown} label a value, an accessor or a signal
 * @returns {() => string | undefined}
 */
export const named = label => () => {
  const l = read(label);
  return l == null || l === '' || typeof l === 'boolean' || typeof l === 'object' ? undefined : String(l);
};

/**
 * A box out of sight on every renderer and out of the layout, still in the
 * view (its data and the accessibility tree): its content is clipped to
 * nothing, so nothing of it is painted.
 */
export const UNSEEN = /** @type {const} */ ({ position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden' });

/** A decorative part: in no accessibility tree and no data. */
export const DECOR = /** @type {const} */ ({ 'aria-hidden': 'true' });

/**
 * The role and `aria-*` props a caller set, for the primitive a component
 * is.
 * @param {Record<string, any>} props
 * @returns {Record<string, any>}
 */
export function marks(props) {
  /** @type {Record<string, any>} */
  const out = {};
  if (props.role !== undefined) out.role = props.role;
  for (const name in props) if (name.startsWith('aria-') && props[name] !== undefined) out[name] = props[name];
  return out;
}

let uids = 0;
/**
 * A new element id for `kind` (a Field's label, a Tabs' tabs), unique in the
 * root: its Id before it where it has one, as `$name` makes them, without
 * needing one. Call it while a view is built.
 * @param {string} kind
 */
export const $uid = kind => {
  const root = $lookup(Id);
  return `${root === '' ? '' : `${root}-`}rui-${kind}-${++uids}`;
};

/**
 * What a trigger says about the layer it opens (`aria-haspopup`,
 * `aria-expanded`, `aria-describedby`), for the control inside it: Button
 * and IconButton put these on their Action. Null outside a trigger.
 */
export const TriggerMeaning = $context(/** @type {Record<string, any> | null} */ (null));
