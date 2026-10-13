// Chip.Group's value: a list of the chosen chips' values with `multiple`
// (as Checkbox.Group), else one value or null (as Radio.Group).

import { read } from 'ren-core';
import { $value } from './shared.js';

/**
 * The api a Chip.Group gives its chips. `multiple`: the value is a list
 * (`[]` by default) in press order, capped by `max`. Single: one value
 * (`null` by default); a press on the chosen chip clears it unless
 * `toggle` is false. `onChange` fires only when the value changes.
 * @param {Record<string, any>} props
 * @returns {import('./choice.jsx').GroupApi}
 */
export function chipGroupApi(props) {
  const multiple = () => read(props.multiple) === true;
  const model = $value(props, /** @type {any} */ (multiple() ? [] : null));
  /** The chosen values as a list, whatever the mode holds. @returns {string[]} */
  const list = () => {
    const v = model.get();
    return v == null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];
  };
  return {
    has: v => (multiple() ? list().includes(v) : model.get() != null && String(model.get()) === v),
    toggle: v => {
      if (multiple()) {
        const now = list();
        if (now.includes(v)) return model.set(now.filter(x => x !== v));
        const max = read(props.max);
        if (max != null && now.length >= max) return;
        return model.set([...now, v]);
      }
      const now = model.get();
      if (now != null && String(now) === v) {
        if (read(props.toggle) !== false) model.set(null);
        return;
      }
      model.set(v);
    },
    size: props.size,
    disabled: props.disabled,
  };
}
