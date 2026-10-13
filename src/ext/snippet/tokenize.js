// The tokenizer for the languages a Snippet shows:
// JavaScript (with JSX), TypeScript (TSX), JSON, CSS, HTML (with its script
// and style) and shell. One pass over the source, no regular expressions on
// the hot loop, each token a fixed-shape `{ type, text }` record; adjacent
// runs of one type merge. `lines` splits the tokens at line breaks for a
// renderer that draws a row per line.
//
// It highlights, it does not parse: a construct the scanner misreads (a
// regular expression after `)`, a generic `<T>` in plain JavaScript) keeps
// its text and only its colors are off, as with any lexical highlighter.

import { tables } from '../../own.js';

/**
 * @typedef {'plain' | 'keyword' | 'operator' | 'string' | 'number' | 'constant' | 'builtin' | 'comment' | 'punctuation' | 'tag' | 'attribute' | 'function' | 'property' | 'regex' | 'variable'} TokenType
 */

/** @typedef {{ type: TokenType, text: string }} Token */

/** The languages by name and alias. */
const LANGUAGES = tables(/** @type {Record<string, string>} */ ({
  js: 'js', javascript: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx',
  ts: 'ts', typescript: 'ts', mts: 'ts', tsx: 'tsx',
  json: 'json', jsonc: 'json',
  css: 'css',
  html: 'html', htm: 'html', xml: 'html', svg: 'html',
  bash: 'bash', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
}));

/** The language a name or alias stands for (`'plain'` when unknown). @param {string | undefined | null} language */
export const languageOf = language => LANGUAGES[String(language ?? '').toLowerCase()] ?? 'plain';

/** The names `tokenize` knows (aliases included). */
export const LANGUAGE_NAMES = Object.freeze(Object.keys(LANGUAGES));

const words = (/** @type {string} */ s) => new Set(s.split(' '));

const JS_KEYWORDS = words(
  'await break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return static super switch this throw try typeof var void while with yield async of from as get set',
);
const TS_KEYWORDS = words(
  'abstract declare enum implements interface keyof namespace private protected public readonly type satisfies infer is module override unique asserts accessor',
);
const JS_CONSTANTS = words('true false null undefined NaN Infinity');
const TS_TYPES = words('string number boolean any unknown never void object symbol bigint');
const SH_KEYWORDS = words('if then else elif fi for while until do done case esac in function select return break continue local export readonly declare unset');
const SH_BUILTINS = words(
  'echo cd pwd ls cat printf read source alias set shift exit test eval exec trap kill wait true false type command builtin cp mv rm mkdir rmdir touch grep sed awk find chmod chown sudo npm npx node git curl tar',
);

/** @param {number} c */
const isDigit = c => c >= 48 && c <= 57;
/** @param {number} c */
const isIdentStart = c => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36 || c > 127;
/** @param {number} c */
const isIdent = c => isIdentStart(c) || isDigit(c);
/** @param {number} c */
const isSpace = c => c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
/** @param {number} c */
const isHex = c => isDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

/** What a scanner writes into: tokens, merged by type. */
class Out {
  constructor() {
    /** @type {Token[]} */
    this.tokens = [];
  }

  /** @param {TokenType} type @param {string} text */
  push(type, text) {
    if (text === '') return;
    const t = this.tokens;
    const last = t.length > 0 ? t[t.length - 1] : null;
    if (last !== null && last.type === type) last.text += text;
    else t.push({ type, text });
  }
}

/** The end of a run of spaces from `i`. @param {string} s @param {number} i @param {number} end */
function spaces(s, i, end) {
  while (i < end && isSpace(s.charCodeAt(i))) i++;
  return i;
}

/** The end of a quoted string begun at `i` (escapes honored; `lineEnds` stops at a line break). @param {string} s @param {number} i @param {number} end @param {boolean} lineEnds */
function quoted(s, i, end, lineEnds) {
  const q = s.charCodeAt(i);
  let j = i + 1;
  while (j < end) {
    const c = s.charCodeAt(j);
    if (c === 92) j += 2;
    else if (c === q) return j + 1;
    else if (c === 10 && lineEnds) return j;
    else j++;
  }
  return end;
}

/** The end of a number from `i` (hex, binary, octal, decimals, exponent, separators, bigint). @param {string} s @param {number} i @param {number} end */
function number(s, i, end) {
  let j = i;
  if (s.charCodeAt(j) === 48 && j + 1 < end && /[xXbBoO]/.test(s[j + 1])) {
    j += 2;
    while (j < end && (isHex(s.charCodeAt(j)) || s.charCodeAt(j) === 95)) j++;
  } else {
    while (j < end && (isDigit(s.charCodeAt(j)) || s.charCodeAt(j) === 95 || s.charCodeAt(j) === 46)) j++;
    if (j < end && (s[j] === 'e' || s[j] === 'E')) {
      let k = j + 1;
      if (s[k] === '+' || s[k] === '-') k++;
      if (k < end && isDigit(s.charCodeAt(k))) {
        j = k;
        while (j < end && isDigit(s.charCodeAt(j))) j++;
      }
    }
  }
  if (j < end && s[j] === 'n') j++;
  return j;
}

/** The end of an identifier from `i`. @param {string} s @param {number} i @param {number} end */
function ident(s, i, end) {
  let j = i;
  while (j < end && isIdent(s.charCodeAt(j))) j++;
  return j;
}

const JS_PUNCTUATION = '()[]{};,.:';
const OPERATORS = '=+-*/%&|^!~?<>@#';

// ---------------------------------------------------------------------------
// JavaScript, JSX, TypeScript

/**
 * @typedef {object} JsOptions
 * @property {boolean} jsx
 * @property {boolean} ts
 * @property {number=} depth how deep this scan nests in templates and JSX (0 at the top)
 */

/** How deep templates and JSX may nest before the rest reads as one plain run (the stack stays bounded). */
const DEPTH = 256; // count: nesting levels before the rest reads as one run

/** The options one level deeper. @param {JsOptions} o @returns {JsOptions} */
const deeper = o => ({ ...o, depth: (o.depth ?? 0) + 1 });

/**
 * Scans JavaScript from `i` to `end`; with `nested`, stops before the `}`
 * that closes the expression it was called for (a template's `${`, a JSX
 * `{`). Returns where it stopped.
 * @param {string} s @param {number} i @param {number} end @param {Out} out @param {JsOptions} o @param {boolean} nested
 */
function scanJs(s, i, end, out, o, nested) {
  // Nested past the cap: the rest of the span is one plain run.
  if ((o.depth ?? 0) > DEPTH) {
    out.push('plain', s.slice(i, end));
    return end;
  }
  let depth = 0;
  // Whether the last significant token ends a value: a `/` or `<` after it divides or compares.
  let value = false;
  // Whether the last significant token was a `.` (a property follows).
  let dot = false;
  while (i < end) {
    const c = s.charCodeAt(i);
    if (isSpace(c)) {
      const j = spaces(s, i, end);
      out.push('plain', s.slice(i, j));
      i = j;
      continue;
    }
    const next = i + 1 < end ? s.charCodeAt(i + 1) : 0;
    if (c === 47 && next === 47) {
      let j = s.indexOf('\n', i);
      if (j < 0 || j > end) j = end;
      out.push('comment', s.slice(i, j));
      i = j;
      continue;
    }
    if (c === 47 && next === 42) {
      let j = s.indexOf('*/', i + 2);
      j = j < 0 || j + 2 > end ? end : j + 2;
      out.push('comment', s.slice(i, j));
      i = j;
      continue;
    }
    if (c === 34 || c === 39) {
      const j = quoted(s, i, end, true);
      out.push('string', s.slice(i, j));
      i = j;
      value = true;
      dot = false;
      continue;
    }
    if (c === 96) {
      i = template(s, i, end, out, o);
      value = true;
      dot = false;
      continue;
    }
    if (isDigit(c) || (c === 46 && isDigit(next))) {
      const j = number(s, i, end);
      out.push('number', s.slice(i, j));
      i = j;
      value = true;
      dot = false;
      continue;
    }
    if (isIdentStart(c)) {
      const j = ident(s, i, end);
      const word = s.slice(i, j);
      const k = spaces(s, j, end);
      const call = k < end && s.charCodeAt(k) === 40;
      /** @type {TokenType} */
      let type = 'plain';
      if (dot) type = call ? 'function' : 'plain';
      else if (JS_CONSTANTS.has(word)) type = 'constant';
      else if (JS_KEYWORDS.has(word) || (o.ts && TS_KEYWORDS.has(word))) type = call && !CALLABLE_KEYWORDS.has(word) ? 'function' : 'keyword';
      else if (o.ts && TS_TYPES.has(word)) type = 'constant';
      else if (call) type = 'function';
      out.push(type, word);
      i = j;
      value = type !== 'keyword' || word === 'this' || word === 'super';
      dot = false;
      continue;
    }
    if (c === 60 && o.jsx && !value && (isIdentStart(next) || next === 62)) {
      i = scanJsx(s, i, end, out, o);
      value = true;
      dot = false;
      continue;
    }
    if (c === 47 && !value) {
      const j = regex(s, i, end);
      if (j > i) {
        out.push('regex', s.slice(i, j));
        i = j;
        value = true;
        dot = false;
        continue;
      }
    }
    if (c === 123) depth++;
    else if (c === 125) {
      if (nested && depth === 0) return i;
      depth--;
    }
    const ch = s[i];
    if (JS_PUNCTUATION.includes(ch)) {
      // `?.` is a dot too.
      out.push('punctuation', ch);
      i++;
      dot = ch === '.';
      value = ch === ')' || ch === ']' || ch === '}';
      continue;
    }
    if (OPERATORS.includes(ch)) {
      let j = i + 1;
      while (j < end && OPERATORS.includes(s[j]) && s[j] !== '/') j++;
      const op = s.slice(i, j);
      out.push('operator', op);
      i = j;
      dot = op === '?.';
      value = false;
      continue;
    }
    out.push('plain', ch);
    i++;
  }
  return i;
}

/** Keywords that stay keywords before `(` (`if (`, `for (`, …). */
const CALLABLE_KEYWORDS = words('if for while switch catch return typeof function await yield new import super this with do in of as void delete throw case');

/** A template literal from its backquote: strings, and `${…}` scanned as JavaScript. @param {string} s @param {number} i @param {number} end @param {Out} out @param {JsOptions} o */
function template(s, i, end, out, o) {
  let j = i + 1;
  let from = i;
  while (j < end) {
    const c = s.charCodeAt(j);
    if (c === 92) j += 2;
    else if (c === 96) {
      j++;
      break;
    } else if (c === 36 && s.charCodeAt(j + 1) === 123) {
      out.push('string', s.slice(from, j));
      out.push('punctuation', '${');
      j = scanJs(s, j + 2, end, out, deeper(o), true);
      if (j < end) {
        out.push('punctuation', '}');
        j++;
      }
      from = j;
    } else j++;
  }
  j = Math.min(j, end);
  out.push('string', s.slice(from, j));
  return j;
}

/** The end of a regular expression literal from its `/`, or `i` when there is none on the line. @param {string} s @param {number} i @param {number} end */
function regex(s, i, end) {
  let j = i + 1;
  let klass = false;
  while (j < end) {
    const c = s.charCodeAt(j);
    if (c === 10) return i;
    if (c === 92) j += 2;
    else if (c === 91) (klass = true), j++;
    else if (c === 93) (klass = false), j++;
    else if (c === 47 && !klass) {
      j++;
      while (j < end && isIdent(s.charCodeAt(j))) j++;
      return j;
    } else j++;
  }
  return i;
}

/**
 * A tag from its `<`: name, attributes (names, strings, `{…}` in JSX,
 * unquoted values in HTML) and its end.
 * @param {string} s @param {number} i @param {number} end @param {Out} out @param {JsOptions | null} js JSX's options, or null for HTML
 * @returns {{ i: number, name: string, closing: boolean, self: boolean }}
 */
function tag(s, i, end, out, js) {
  out.push('punctuation', '<');
  i++;
  let closing = false;
  if (s[i] === '/') {
    out.push('punctuation', '/');
    closing = true;
    i++;
  }
  let j = i;
  while (j < end && (isIdent(s.charCodeAt(j)) || s[j] === '.' || s[j] === ':' || s[j] === '-')) j++;
  const name = s.slice(i, j);
  out.push('tag', name);
  i = j;
  while (i < end) {
    const c = s.charCodeAt(i);
    if (isSpace(c)) {
      const k = spaces(s, i, end);
      out.push('plain', s.slice(i, k));
      i = k;
    } else if (c === 47 && s.charCodeAt(i + 1) === 62) {
      out.push('punctuation', '/>');
      return { i: i + 2, name, closing, self: true };
    } else if (c === 62) {
      out.push('punctuation', '>');
      return { i: i + 1, name, closing, self: false };
    } else if (c === 123 && js !== null) {
      out.push('punctuation', '{');
      i = scanJs(s, i + 1, end, out, deeper(js), true);
      if (i < end) {
        out.push('punctuation', '}');
        i++;
      }
    } else if (c === 34 || c === 39) {
      const k = quoted(s, i, end, false);
      out.push('string', s.slice(i, k));
      i = k;
    } else if (c === 61) {
      out.push('operator', '=');
      i++;
      // An unquoted HTML value.
      if (js === null && i < end && !isSpace(s.charCodeAt(i)) && s[i] !== '"' && s[i] !== "'" && s[i] !== '>') {
        let k = i;
        while (k < end && !isSpace(s.charCodeAt(k)) && s[k] !== '>') k++;
        out.push('string', s.slice(i, k));
        i = k;
      }
    } else if (isIdentStart(c) || c === 58 || c === 64) {
      let k = i + 1;
      while (k < end && (isIdent(s.charCodeAt(k)) || s[k] === '-' || s[k] === ':' || s[k] === '.')) k++;
      out.push('attribute', s.slice(i, k));
      i = k;
    } else {
      out.push('plain', s[i]);
      i++;
    }
  }
  return { i, name, closing, self: false };
}

/** A JSX element from its `<` through its closing tag, children included. @param {string} s @param {number} i @param {number} end @param {Out} out @param {JsOptions} o */
function scanJsx(s, i, end, out, o) {
  let depth = 0;
  while (i < end && s.charCodeAt(i) === 60) {
    const t = tag(s, i, end, out, o);
    i = t.i;
    if (t.closing) depth--;
    else if (!t.self) depth++;
    if (depth <= 0) return i;
    while (i < end && s.charCodeAt(i) !== 60) {
      if (s.charCodeAt(i) === 123) {
        out.push('punctuation', '{');
        i = scanJs(s, i + 1, end, out, deeper(o), true);
        if (i < end) {
          out.push('punctuation', '}');
          i++;
        }
      } else {
        let k = i;
        while (k < end && s.charCodeAt(k) !== 60 && s.charCodeAt(k) !== 123) k++;
        out.push('plain', s.slice(i, k));
        i = k;
      }
    }
  }
  return i;
}

// ---------------------------------------------------------------------------
// JSON

/** @param {string} s @param {Out} out */
function scanJson(s, out) {
  const end = s.length;
  let i = 0;
  while (i < end) {
    const c = s.charCodeAt(i);
    if (isSpace(c)) {
      const j = spaces(s, i, end);
      out.push('plain', s.slice(i, j));
      i = j;
    } else if (c === 34) {
      const j = quoted(s, i, end, true);
      const k = spaces(s, j, end);
      out.push(s.charCodeAt(k) === 58 ? 'property' : 'string', s.slice(i, j));
      i = j;
    } else if (c === 47 && (s[i + 1] === '/' || s[i + 1] === '*')) {
      let j = s[i + 1] === '/' ? s.indexOf('\n', i) : s.indexOf('*/', i + 2) + 2;
      if (j < i + 2) j = end;
      out.push('comment', s.slice(i, j));
      i = j;
    } else if (isDigit(c) || (c === 45 && isDigit(s.charCodeAt(i + 1)))) {
      const j = number(s, i + 1, end);
      out.push('number', s.slice(i, j));
      i = j;
    } else if (isIdentStart(c)) {
      const j = ident(s, i, end);
      const word = s.slice(i, j);
      out.push(word === 'true' || word === 'false' || word === 'null' ? 'constant' : 'plain', word);
      i = j;
    } else {
      out.push('{}[],:'.includes(s[i]) ? 'punctuation' : 'plain', s[i]);
      i++;
    }
  }
}

// ---------------------------------------------------------------------------
// CSS

/** Whether the statement from `i` is a rule's selector (a `{` comes before `;` or `}`). @param {string} s @param {number} i @param {number} end */
function selectorAhead(s, i, end) {
  for (let j = i; j < end; j++) {
    const c = s[j];
    if (c === '{') return true;
    if (c === ';' || c === '}') return false;
    if (c === '"' || c === "'") j = quoted(s, j, end, true) - 1;
    else if (c === '/' && s[j + 1] === '*') {
      const k = s.indexOf('*/', j + 2);
      j = k < 0 ? end : k + 1;
    }
  }
  return false;
}

/** @param {string} s @param {number} i @param {number} end @param {Out} out */
function scanCss(s, i, end, out) {
  /** 0 a statement starts, 1 selector, 2 property, 3 value, 4 an at-rule's prelude. */
  let mode = 0;
  while (i < end) {
    const c = s.charCodeAt(i);
    const ch = s[i];
    if (isSpace(c)) {
      const j = spaces(s, i, end);
      out.push('plain', s.slice(i, j));
      i = j;
      continue;
    }
    if (c === 47 && s.charCodeAt(i + 1) === 42) {
      let j = s.indexOf('*/', i + 2);
      j = j < 0 || j + 2 > end ? end : j + 2;
      out.push('comment', s.slice(i, j));
      i = j;
      continue;
    }
    if (c === 34 || c === 39) {
      const j = quoted(s, i, end, true);
      out.push('string', s.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '{' || ch === '}' || ch === ';') {
      out.push('punctuation', ch);
      i++;
      mode = 0;
      continue;
    }
    if (mode === 0) {
      if (ch === '@') mode = 4;
      else mode = selectorAhead(s, i, end) ? 1 : 2;
    }
    if (mode === 4 && ch === '@') {
      let j = i + 1;
      while (j < end && (isIdent(s.charCodeAt(j)) || s[j] === '-')) j++;
      out.push('keyword', s.slice(i, j));
      i = j;
      continue;
    }
    if (mode === 1) {
      // Selectors: .class, #id, :pseudo, [attribute], tags, combinators.
      if (ch === '.' || ch === '#' || ch === ':') {
        let j = i + 1;
        while (j < end && s[j] === ':') j++;
        while (j < end && (isIdent(s.charCodeAt(j)) || s[j] === '-')) j++;
        out.push('attribute', s.slice(i, j));
        i = j;
      } else if (ch === '[') {
        let j = s.indexOf(']', i);
        j = j < 0 || j >= end ? end : j + 1;
        out.push('attribute', s.slice(i, j));
        i = j;
      } else if (isIdentStart(c) || ch === '*' || ch === '-') {
        let j = i + 1;
        while (j < end && (isIdent(s.charCodeAt(j)) || s[j] === '-')) j++;
        out.push('tag', s.slice(i, j));
        i = j;
      } else {
        out.push(ch === ',' || ch === '(' || ch === ')' ? 'punctuation' : 'operator', ch);
        i++;
      }
      continue;
    }
    if (mode === 2) {
      if (ch === ':') {
        out.push('punctuation', ':');
        i++;
        mode = 3;
      } else if (isIdentStart(c) || ch === '-') {
        let j = i + 1;
        while (j < end && (isIdent(s.charCodeAt(j)) || s[j] === '-')) j++;
        out.push('property', s.slice(i, j));
        i = j;
      } else {
        out.push('plain', ch);
        i++;
      }
      continue;
    }
    // A value, or an at-rule's prelude.
    if (isDigit(c) || ((ch === '.' || ch === '-' || ch === '+') && isDigit(s.charCodeAt(i + 1)))) {
      let j = number(s, i + 1, end);
      while (j < end && (isIdentStart(s.charCodeAt(j)) || s[j] === '%')) j++;
      out.push('number', s.slice(i, j));
      i = j;
    } else if (ch === '#' && isHex(s.charCodeAt(i + 1))) {
      let j = i + 1;
      while (j < end && isHex(s.charCodeAt(j))) j++;
      out.push('number', s.slice(i, j));
      i = j;
    } else if (ch === '!') {
      let j = i + 1;
      while (j < end && isIdent(s.charCodeAt(j))) j++;
      out.push('keyword', s.slice(i, j));
      i = j;
    } else if (isIdentStart(c) || (ch === '-' && (isIdentStart(s.charCodeAt(i + 1)) || s[i + 1] === '-'))) {
      let j = i + 1;
      while (j < end && (isIdent(s.charCodeAt(j)) || s[j] === '-')) j++;
      out.push(s[j] === '(' ? 'function' : mode === 4 ? 'plain' : 'constant', s.slice(i, j));
      i = j;
    } else {
      out.push(',()/:'.includes(ch) ? 'punctuation' : 'operator', ch);
      i++;
    }
  }
}

// ---------------------------------------------------------------------------
// HTML

/** @param {string} s @param {Out} out */
function scanHtml(s, out) {
  const end = s.length;
  let i = 0;
  while (i < end) {
    const c = s.charCodeAt(i);
    if (s.startsWith('<!--', i)) {
      let j = s.indexOf('-->', i + 4);
      j = j < 0 ? end : j + 3;
      out.push('comment', s.slice(i, j));
      i = j;
    } else if (c === 60 && s[i + 1] === '!') {
      let j = s.indexOf('>', i);
      j = j < 0 ? end : j + 1;
      out.push('keyword', s.slice(i, j));
      i = j;
    } else if (c === 60 && (isIdentStart(s.charCodeAt(i + 1)) || s[i + 1] === '/')) {
      const t = tag(s, i, end, out, null);
      i = t.i;
      const name = t.name.toLowerCase();
      if (!t.closing && !t.self && (name === 'script' || name === 'style')) {
        let j = s.toLowerCase().indexOf(`</${name}`, i);
        if (j < 0) j = end;
        if (name === 'script') scanJs(s, i, j, out, { jsx: false, ts: false }, false);
        else scanCss(s, i, j, out);
        i = j;
      }
    } else if (c === 38) {
      let j = i + 1;
      while (j < end && j < i + 12 && (isIdent(s.charCodeAt(j)) || s[j] === '#')) j++;
      if (s[j] === ';') {
        out.push('constant', s.slice(i, j + 1));
        i = j + 1;
      } else {
        out.push('plain', '&');
        i++;
      }
    } else {
      let j = i + 1;
      while (j < end && s.charCodeAt(j) !== 60 && s.charCodeAt(j) !== 38) j++;
      out.push('plain', s.slice(i, j));
      i = j;
    }
  }
}

// ---------------------------------------------------------------------------
// Shell

/** A variable from its `$`: `$name`, `${…}`, `$1`, `$?`, …; returns its end, or `i` for a lone `$`. @param {string} s @param {number} i @param {number} end */
function variable(s, i, end) {
  const n = s[i + 1];
  if (n === '{') {
    const j = s.indexOf('}', i);
    return j < 0 || j >= end ? end : j + 1;
  }
  if (n !== undefined && '?@#$!*-0123456789'.includes(n)) return i + 2;
  const j = ident(s, i + 1, end);
  return j > i + 1 ? j : i;
}

/** @param {string} s @param {Out} out */
function scanShell(s, out) {
  const end = s.length;
  let i = 0;
  // Whether a command starts here (a builtin or an assignment may follow).
  let start = true;
  while (i < end) {
    const c = s.charCodeAt(i);
    const ch = s[i];
    if (c === 10) {
      out.push('plain', '\n');
      i++;
      start = true;
      continue;
    }
    if (isSpace(c)) {
      let j = i;
      while (j < end && isSpace(s.charCodeAt(j)) && s.charCodeAt(j) !== 10) j++;
      out.push('plain', s.slice(i, j));
      i = j;
      continue;
    }
    const after = i === 0 || isSpace(s.charCodeAt(i - 1)) || s[i - 1] === ';';
    if (ch === '#' && after) {
      let j = s.indexOf('\n', i);
      if (j < 0) j = end;
      out.push('comment', s.slice(i, j));
      i = j;
      continue;
    }
    if (ch === "'" || ch === '`') {
      const q = s.indexOf(ch, i + 1);
      const j = q < 0 ? end : q + 1;
      out.push('string', s.slice(i, j));
      i = j;
      start = false;
      continue;
    }
    if (ch === '"') {
      // A double-quoted string: its variables show as variables.
      let j = i + 1;
      let from = i;
      while (j < end && s[j] !== '"') {
        if (s[j] === '\\') j += 2;
        else if (s[j] === '$') {
          const k = variable(s, j, end);
          if (k > j) {
            out.push('string', s.slice(from, j));
            out.push('variable', s.slice(j, k));
            from = j = k;
          } else j++;
        } else j++;
      }
      j = Math.min(end, j + 1);
      out.push('string', s.slice(from, j));
      i = j;
      start = false;
      continue;
    }
    if (ch === '$') {
      if (s[i + 1] === '(') {
        out.push('punctuation', '$(');
        i += 2;
        start = true;
        continue;
      }
      const j = variable(s, i, end);
      if (j > i) {
        out.push('variable', s.slice(i, j));
        i = j;
        start = false;
        continue;
      }
    }
    if ('|&;<>'.includes(ch)) {
      let j = i + 1;
      while (j < end && '|&<>'.includes(s[j])) j++;
      out.push('operator', s.slice(i, j));
      i = j;
      start = true;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === '{' || ch === '}' || ch === '[' || ch === ']') {
      out.push('punctuation', ch);
      i++;
      if (ch === '(' || ch === '{') start = true;
      continue;
    }
    // A word.
    let j = i;
    while (j < end && !isSpace(s.charCodeAt(j)) && !'|&;<>()"\'`${}'.includes(s[j])) j++;
    if (j === i) {
      out.push('plain', ch);
      i++;
      continue;
    }
    const word = s.slice(i, j);
    const eq = word.indexOf('=');
    if (start && eq > 0 && isIdentStart(word.charCodeAt(0)) && ident(word, 0, eq) === eq) {
      out.push('variable', word.slice(0, eq));
      out.push('operator', '=');
      out.push('plain', word.slice(eq + 1));
    } else if (SH_KEYWORDS.has(word)) {
      out.push('keyword', word);
      i = j;
      start = word !== 'in' && word !== 'function';
      continue;
    } else if (start && SH_BUILTINS.has(word)) out.push('builtin', word);
    else if (isDigit(word.charCodeAt(0)) && number(word, 0, word.length) === word.length) out.push('number', word);
    else out.push('plain', word);
    i = j;
    start = false;
  }
}

// ---------------------------------------------------------------------------

/**
 * The tokens of `code` in `language` (a name or alias: js, jsx, ts, tsx,
 * json, css, html, bash, …; anything else is one plain token).
 * @param {string} code @param {string | undefined | null} [language]
 * @returns {Token[]}
 */
export function tokenize(code, language) {
  const out = new Out();
  const s = String(code ?? '');
  switch (languageOf(language)) {
    case 'js':
      scanJs(s, 0, s.length, out, { jsx: true, ts: false }, false);
      break;
    case 'jsx':
      scanJs(s, 0, s.length, out, { jsx: true, ts: false }, false);
      break;
    case 'ts':
      scanJs(s, 0, s.length, out, { jsx: false, ts: true }, false);
      break;
    case 'tsx':
      scanJs(s, 0, s.length, out, { jsx: true, ts: true }, false);
      break;
    case 'json':
      scanJson(s, out);
      break;
    case 'css':
      scanCss(s, 0, s.length, out);
      break;
    case 'html':
      scanHtml(s, out);
      break;
    case 'bash':
      scanShell(s, out);
      break;
    default:
      out.push('plain', s);
  }
  return out.tokens;
}

/**
 * Tokens split into lines at their line breaks (a `\r\n` counts as one),
 * tabs shown as two spaces; a line is a list of runs, an empty line none.
 * @param {readonly Token[]} tokens
 * @returns {Token[][]}
 */
export function lines(tokens) {
  /** @type {Token[][]} */
  const out = [[]];
  for (const t of tokens) {
    const parts = t.text.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n');
    for (let k = 0; k < parts.length; k++) {
      if (k > 0) out.push([]);
      if (parts[k] !== '') out[out.length - 1].push({ type: t.type, text: parts[k] });
    }
  }
  return out;
}
