// The data of the combobox inputs: strings,
// `{ value, label, disabled }`, or groups `{ label, options }`; parsed once
// into flat options (each knows its group), filtered by the search and
// limited.

/**
 * @typedef {object} Option
 * @property {string} value
 * @property {string} label
 * @property {boolean} disabled
 * @property {string | null} group the label of the group it is in
 */

/**
 * The options of `data`, flat, in order.
 * @param {any} data
 * @returns {Option[]}
 */
export function parseData(data) {
  /** @type {Option[]} */
  const out = [];
  /** @param {any} item @param {string | null} group */
  const add = (item, group) => {
    if (item == null) return;
    if (typeof item === 'string' || typeof item === 'number') out.push({ value: String(item), label: String(item), disabled: false, group });
    else if (Array.isArray(item.options)) for (const inner of item.options) add(inner, String(item.label ?? ''));
    else out.push({ value: String(item.value), label: String(item.label ?? item.value), disabled: item.disabled === true, group });
  };
  for (const item of data ?? []) add(item, null);
  return out;
}

/**
 * The default match: the option's label holds the search, ignoring case
 * and the edges' spaces (an empty search matches all).
 * @param {Option} option @param {string} search
 */
export const matchLabel = (option, search) => {
  const q = search.trim().toLowerCase();
  return q === '' || option.label.toLowerCase().includes(q);
};

/**
 * The options shown: those `match(option, search)` keeps (the label match
 * by default), then at most `max`.
 * @param {Option[]} options @param {string} search @param {((option: Option, search: string) => boolean) | undefined} match @param {number} [max]
 */
export function shown(options, search, match, max) {
  const test = match ?? matchLabel;
  const found = options.filter(o => test(o, search));
  return typeof max === 'number' && Number.isFinite(max) ? found.slice(0, max) : found;
}

/**
 * Options in runs by group, in order of first appearance; each option's
 * `index` is its place in that shown order (the keyboard's).
 * @param {Option[]} options
 * @returns {{ group: string | null, options: { option: Option, index: number }[] }[]}
 */
export function grouped(options) {
  /** @type {{ group: string | null, options: { option: Option, index: number }[] }[]} */
  const runs = [];
  /** @type {Map<string | null, { group: string | null, options: { option: Option, index: number }[] }>} */
  const by = new Map();
  for (const option of options) {
    let run = by.get(option.group);
    if (run === undefined) {
      run = { group: option.group, options: [] };
      by.set(option.group, run);
      runs.push(run);
    }
    run.options.push({ option, index: 0 });
  }
  let i = 0;
  for (const run of runs) for (const entry of run.options) entry.index = i++;
  return runs;
}
