// The colors of highlighted code: a light and a dark syntax palette, one
// hue per token role (drawn in OKLCH, a lightness and chroma per scheme).
// Each token type of the tokenizer maps to one role.

import { tables } from '../../own.js';

/** @typedef {import('./tokenize.js').TokenType} TokenType */

/**
 * @typedef {object} SyntaxColors
 * @property {string} text plain text and punctuation
 * @property {string} comment
 * @property {string} literal numbers, constants, properties, builtins
 * @property {string} name functions, attributes, selectors
 * @property {string} markup tags
 * @property {string} keyword keywords and operators
 * @property {string} string
 * @property {string} variable
 * @property {string} pattern regular expressions
 */

/** The light syntax palette. @type {Readonly<SyntaxColors>} */
export const SYNTAX_LIGHT = Object.freeze(tables({
  text: '#282e38',
  comment: '#6a7683',
  literal: '#0064b5',
  name: '#7048b1',
  markup: '#007467',
  keyword: '#a92e52',
  string: '#147732',
  variable: '#9a4900',
  pattern: '#6e6500',
}));

/** The dark syntax palette. @type {Readonly<SyntaxColors>} */
export const SYNTAX_DARK = Object.freeze(tables({
  text: '#d0d8e5',
  comment: '#8d9aa8',
  literal: '#8cc2ff',
  name: '#c7adff',
  markup: '#67d4c3',
  keyword: '#ff9daf',
  string: '#8bd295',
  variable: '#ffa56c',
  pattern: '#c9c170',
}));

/** The palette key of each token type. @type {Readonly<Record<TokenType, keyof SyntaxColors>>} */
export const TOKEN_COLORS = Object.freeze(tables(/** @type {Record<TokenType, keyof SyntaxColors>} */ ({
  plain: 'text',
  punctuation: 'text',
  keyword: 'keyword',
  operator: 'keyword',
  string: 'string',
  number: 'literal',
  constant: 'literal',
  builtin: 'literal',
  property: 'literal',
  comment: 'comment',
  tag: 'markup',
  attribute: 'name',
  function: 'name',
  regex: 'pattern',
  variable: 'variable',
})));

/** The color of a token type in a palette. @param {SyntaxColors} palette @param {TokenType} type */
export const tokenColor = (palette, type) => palette[TOKEN_COLORS[type] ?? 'text'];

/** The monospace stack: code draws in the platform's monospace face (a canvas's `mono` font). */
export { MONOSPACE } from '../../core/typography/blocks.jsx';
