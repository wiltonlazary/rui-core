// rui-core/form: the form engine `$form`, the EACH path pattern and the
// validators.

export { $form } from './form.js';
export { EACH } from './patterns.js';
export { required, email, emailTest, pattern, range, length, same } from './validators.js';

/**
 * @template V @typedef {import('./form.js').Form<V>} Form
 */
/**
 * @template V @typedef {import('./form.js').FormOptions<V>} FormOptions
 */
/** @typedef {import('./form.js').Binding} Binding */
/** @typedef {import('./form.js').ValidateOn} ValidateOn */
/** @typedef {import('./form.js').TouchOn} TouchOn */
/** @typedef {import('./form.js').AfterError} AfterError */
/** @typedef {import('./rules.js').Rules} Rules */
/** @typedef {import('./rules.js').FormErrors} FormErrors */
/** @typedef {import('./validators.js').Rule} Rule */
/** @typedef {import('./patterns.js').PathPattern} PathPattern */
