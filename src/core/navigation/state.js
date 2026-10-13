// A component's value, controlled or not: a
// `value` prop (a value, an accessor or a signal) holds it; without one, the
// component keeps its own from `defaultValue`. A change calls `onChange`,
// and writes the `value` prop when it is a signal, so a signal passed in is
// two-way.

import { $active, $signal, $read, $write, $kind, read } from 'ren-core';

/**
 * @template T
 * @param {Record<string, any>} props
 * @param {T} fallback the value without `value` or `defaultValue`
 * @param {string} [name] the prop holding the value ('value')
 * @param {string} [change] the change handler's name ('onChange')
 * @returns {{ get: () => T, set: (value: T) => void }}
 */
export function $navValue(props, fallback, name = 'value', change = 'onChange') {
  const initial = `default${name[0].toUpperCase()}${name.slice(1)}`;
  const own = $signal($active(), /** @type {T} */ (props[initial] ?? fallback));
  const controlled = () => props[name] !== undefined;
  return {
    get: () => (controlled() ? /** @type {T} */ (read(props[name])) : $read(own)),
    set(value) {
      const outer = props[name];
      if (outer === undefined) $write(own, value);
      else if ($kind(outer) === 'signal') $write(outer, value);
      props[change]?.(value);
    },
  };
}

/** A prop's children as a flat array of what they hold. @param {any} children @returns {any[]} */
export const flat = children => (Array.isArray(children) ? children.flat(Infinity) : children == null || children === false ? [] : [children]);
