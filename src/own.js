// Own keys only, for maps keyed by user or data names: a key such as
// `__proto__`, `constructor` or `toString` is plain data, never a member
// Object.prototype holds or the prototype itself. Internal, not an entry.

/**
 * Writes `key` as an own entry of `out`, so a '__proto__' key stays data.
 * @param {Record<string, any>} out @param {string} key @param {any} value
 */
export const own = (out, key, value) => Object.defineProperty(out, key, { value, writable: true, enumerable: true, configurable: true });

/**
 * The value `map` holds as its own entry at `key`, else undefined.
 * @param {any} map @param {PropertyKey} key
 */
export const ownValue = (map, key) => (map != null && typeof map === 'object' && Object.hasOwn(map, key) ? map[key] : undefined);

/**
 * `value` with every plain object in it rebuilt without a prototype (arrays
 * kept as arrays): a table keyed by user-given names (a theme's colors,
 * spacing, sizes) then answers only its own keys, `toString` or
 * `__proto__` being no entry. Other values stay as they are.
 * @template T @param {T} value @returns {T}
 */
export const tables = value => {
  if (Array.isArray(value)) return /** @type {any} */ (value.map(tables));
  if (value === null || typeof value !== 'object') return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  /** @type {Record<string, any>} */
  const out = Object.create(null);
  for (const key of Object.keys(value)) own(out, key, tables(/** @type {any} */ (value)[key]));
  return /** @type {any} */ (out);
};
