// The style-token guard: every component style number in src/core,
// src/ext, src/hooks and src/form reads a theme token (opacity, weights,
// ratios, control, chart, spacing, fontSizes, lineHeights, radius.round,
// MOTION, LAYERS), never an inline literal. Refused: literal opacities
// (in a style, in alpha(), in an opacity-named value, or written into a
// '#rrggbbaa' color), weights and leadings; divisions of a size by a
// literal; any literal past 2 px in a padding, margin or gap value, even
// after a ternary; decimal size ratios (`size * 0.6`); px boxes, glyphs
// and offsets (a literal size or offset prop, a size-like default, a
// literal width or height past 2 px); tween durations in ms
// (`$follow(…, 200)`); UPPER_CASE px constants (a count or a time
// says so on its line: `// count: …`, `// ms: …`); `?? <number>` defaults
// on any *Size, *Width, *Height, h, w, cutout, gap, size or offset;
// literal default positions; panel offsets and delays in options objects;
// radius, speed and strength defaults and ratio-like decimal defaults;
// pixel font offsets
// and literal font sizes; stacking orders past 2; pill radii; `duration`
// defaults in ms; and hidden tables (a constant named for paddings, gaps,
// leadings or densities holding literals, or keyed by size step: those
// live in theme.sizes). Drawing math may carry
// `// geometry: <reason>` (a figure's own points are exempt), and a loop
// period that is no transition `// cycle: <reason>`; those stay few.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The values after each key match, to their end at depth 0 (a nested call or list stays in). @param {string} code @param {RegExp} key @returns {string[]} */
function valuesOf(code, key) {
  const out = [];
  for (const m of code.matchAll(key)) {
    let depth = 0;
    let i = m.index + m[0].length;
    const from = i;
    for (; i < code.length; i++) {
      const c = code[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) break;
    }
    out.push(code.slice(from, i));
  }
  return out;
}

/** The top-level arguments of each call a pattern opens. @param {string} code @param {RegExp} open @returns {string[][]} */
function argsOf(code, open) {
  const out = [];
  for (const m of code.matchAll(open)) {
    const args = [];
    let depth = 0;
    let from = m.index + m[0].length;
    let i = from;
    for (; i < code.length; i++) {
      const c = code[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) {
        if (depth === 0) break;
        depth--;
      } else if (c === ',' && depth === 0) {
        args.push(code.slice(from, i));
        from = i + 1;
      }
    }
    args.push(code.slice(from, i));
    out.push(args);
  }
  return out;
}

const RULES = [
  // Opacity other than 0 or 1: theme.opacity.{disabled, muted, faint}.
  ['opacity', /\bopacity:\s*(?!(?:0|1)(?![.\d]))(?:\d*\.\d+|\d+)/],
  // Any literal weight: theme.weights.{regular, strong, bold} (or headings.weight).
  ['fontWeight', /\bfontWeight:\s*(?:\d+|'\w+'|"\w+")/],
  // A literal leading other than 1: theme.lineHeights.
  ['lineHeight', /\blineHeight:\s*(?!1(?![.\d]))(?:\d*\.\d+|\d+)/],
  // A size divided by the copied ratios anywhere, or by any literal other than 2 in a style value.
  ['division', /\/\s*(?:2\.5|3\.4|3)(?![.\d])/],
  ['division', /\b(?:padding|margin|gap|radius|fontSize|width|height|minWidth|minHeight|size|inset|top|left|right|bottom):[^,}]*\/\s*(?!2(?![.\d]))\d+(?:\.\d+)?/],
  // A padding, margin or gap with a literal past 2 px: theme.spacing or theme.control.
  ['padding', /\b(?:padding|margin|gap|rowGap|columnGap):\s*(?:\[[^\]]*?(?<![\w.])-?(?:[3-9]|\d{2,})(?:\.\d+)?(?![\w.])[^\]]*\]|-?(?:[3-9]|\d{2,})(?:\.\d+)?\b)/],
  // A font size offset by pixels: fontBelow(theme, size, steps).
  ['fontOffset', /\bfontSize:\s*(?:[^,(){}]|\((?:[^()]|\([^()]*\))*\))*[-+]\s*\d/],
  // A pill or circle by a huge radius: theme.radius.round.
  ['round', /\bradius:\s*(?:1000|9999)\b/],
  // Any literal past 2 px anywhere in a padding, margin or gap value (after a ternary, in an expression).
  ['spacingExpr', code => valuesOf(code, /\b(?:padding|margin|gap|rowGap|columnGap)\s*:/g).some(v => /(?<![\w.$])(?:[3-9]|[1-9]\d+)(?:\.\d+)?(?![\w.])/.test(v))],
  // A size taken as a decimal share of another: theme.ratios.
  // (A figure's own points, a line holding `kind: '…'`, are drawing math.)
  ['ratio', code => !/\bkind:\s*''|\bkind:\s*'\w+'/.test(code) && /\*\s*(?:0?\.\d+|\d+\.\d+)(?![\w.])|(?<![\w.])(?:0?\.\d+|\d+\.\d+)\s*\*/.test(code)],
  // An opacity given to alpha() or tint() as a literal: theme.opacity.
  ['alpha', /\b(?:alpha|tint|fade|withAlpha)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*,\s*(?:0?\.\d+|\d+\.\d+)\s*\)/],
  // An opacity-named value from a literal (fillOpacity, …): theme.opacity.
  ['opacityName', /\b\w*[oO]pacity\w*\s*(?::|=|\?\?)\s*(?:[^,;{}]*?)(?<![\w.])(?:0?\.\d+)(?![\w.])/],
  // A literal font size or stacking order: fontSizes, LAYERS.
  ['fontSize', /\bfontSize:\s*(?:[^,{}]*[?:]\s*)?\d/],
  // (0, 1 and 2 order a component's own children.)
  ['zIndex', /\bzIndex:\s*(?:[^,{}]*[?:]\s*)?(?:[3-9]|\d{2,})/],
  // A duration in ms from a literal: MOTION.
  ['duration', /\bduration\w*\b[^;,]*?(?::|\?\?|=)\s*\d{2,}(?![\w.])/],
  // A size table anywhere in a component file, inline too: an object keyed by size step holding numbers (theme.sizes).
  ['sizeTable', /\{\s*xs:\s*[\[{]?\s*(?:[wh]:\s*)?\d/],
  // A box, glyph or offset in px: theme.sizes (glyph, box, …) or spacing. A size, width or offset prop
  // given a literal, a size-like prop's default, and a literal past 2 px in a width, height, least or most
  // size (a figure's own points stay exempt, as for ratios).
  ['sizeProp', /\b(?:size|width|height|minWidth|minHeight|maxWidth|maxHeight|offset|thickness)=\{\s*\d{2,}\s*\}/],
  ['sizeDefault', /\bread\((?:props|p\.props|root|a\.props)\.(?:size|width|height|minWidth|minHeight|maxWidth|maxHeight|offset|thickness|panelHeight)\)\s*\?\?\s*(?:[3-9]|\d{2,})(?![\w.])/],
  ['sizeDefault', /\bread\(props\.offset\)\s*\?\?\s*[1-9]/],
  // A px constant: an UPPER_CASE name bound to a whole number past 2 (theme.sizes, spacing).
  ['pxConstant', /^\s*(?:export\s+)?const\s+[A-Z][A-Z0-9_]*\s*=\s*(?:\/\*\*.*?\*\/\s*)?\(?\s*(?:[3-9]|[1-9]\d+)\s*\)?\s*;/],
  // A size-like default from a literal on any prop or option: *Size, *Width, *Height, h, w, cutout, gap, an arrow's size or offset.
  ['sizeDefault', /(?<![\w$])(?:\w*(?:Size|Width|Height)|width|height|h|w|cutout|gap|size|offset)\)?\s*\?\?\s*(?:[3-9]|[1-9]\d+)(?![\w.])/],
  // A default position from literals: theme spacing.
  ['position', code => !/\bkind:\s*'\w*'/.test(code) && /\b(?:top|left|x|y)\s*(?::|\?\?)\s*(?:[^,{}]*\?\?\s*)?(?:[3-9]|[1-9]\d+)\b[^;]*\b(?:top|left|x|y)\s*(?::|\?\?)\s*(?:[^,{}]*\?\?\s*)?(?:[3-9]|[1-9]\d+)\b/.test(code)],
  // A single-digit px prop too (`offset={6}`), and a place (left, top, right, bottom) past 2 px.
  ['sizeProp', /\b(?:size|width|height|minWidth|minHeight|maxWidth|maxHeight|offset|thickness|gap)=\{\s*[3-9]\s*\}/],
  ['placeLiteral', code => !/\bkind:\s*'\w*'/.test(code) && valuesOf(code, /\b(?:left|top|right|bottom)\s*:/g).some(v => /(?<![\w.$])(?:[3-9]|[1-9]\d+)(?![\w.%])/.test(v))],
  // A pad, gap, margin or inset local or default parameter from a literal past 2 px.
  ['spacingLocal', /\b(?:const|let)\s+(?:\w*[pP]ad\w*|\w*[gG]ap\w*|\w*[mM]argin\w*|\w*[iI]nset\w*)\s*=\s*[^;]*(?<![\w.$]|[/*]\s*)(?:[3-9]|[1-9]\d+)(?![\w.])|\b(?:\w*[pP]ad\w*|\w*[gG]ap\w*)\s*=\s*(?:[3-9]|[1-9]\d+)\s*[,)]/],
  // A chart's drawn label box or mark offset from literals: theme.chart.
  ['chartBox', code => argsOf(code, /\blabels\.push\(/g).some(a => a.some(x => /(?<![\w.$])(?:[3-9]|[1-9]\d+)(?![\w.])/.test(x))) || /\bpolar\([^;]*[+-]\s*(?:[3-9]|[1-9]\d+)(?![\w.])/.test(code)],
  ['slotMin', /\bMath\.max\(\s*[1-9]\d+\s*,/],
  // A panel's offset or a delay written into an options object: spacing, MOTION or a named `// ms:` constant.
  ['optionLiteral', /\b(?:offset|\w*Delay)\s*:\s*[1-9]\d*(?![\w.])/],
  // A radius, speed or strength default from a literal, or a ratio-like default (`inner`) from a decimal.
  ['sizeDefault', /\b(?:radius|speed|strength)(?:\(\))?\)?\s*\?\?\s*[1-9]\d*(?![\w.])|\binner\)?\s*\?\?\s*0?\.\d/],
  // An oval offset from its point by a literal past 2 px (a point's radius, a dot's inset): chart.pointArea,
  // ratios. A glyph's own coordinates in its box (`x: 6.5, right: 14.5`) stay drawing math.
  ['figureOffset', code => /\bkind:\s*'oval'/.test(code) && valuesOf(code, /\b(?:x|y|right|bottom)\s*:/g).some(v => /[+-]\s*(?:[3-9]|[1-9]\d+)(?![\w.\]])/.test(v))],
  ['boxLiteral', code => !/\bkind:\s*''|\bkind:\s*'\w+'/.test(code) && valuesOf(code, /\b(?:width|height|minWidth|minHeight|maxWidth|maxHeight)\s*:/g).some(v => /(?<![\w.$])(?:[3-9]|[1-9]\d+)(?![\w.%])/.test(v))],
  // A tween's duration as a literal: MOTION (to(x, 0) jumps and stays allowed).
  ['motionLiteral', code => argsOf(code, /\$(?:follow|tween)\(|\.to\(/g).some(a => a.length > 1 && /^\s*[1-9]\d+\s*$/.test(a[1]))],
  // A size table in a component file: a constant keyed by size step holding numbers (theme.sizes).
  ['sizeTable', /^\s*(?:export\s+)?const\s+\w+\s*=.*\{\s*xs:\s*[\[{]?\s*(?:[wh]:\s*)?\d/],
  // A hidden table of spacings or leadings: a constant named for them holding literals.
  ['table', /^\s*(?:export\s+)?const\s+(?:[A-Z][A-Z_]*_)?(?:PAD|PADDING|LEADING|LINE_HEIGHT|GAP|DENSITY|SPACING|INSET|MARGIN)[A-Z_]*\s*=.*(?<![\w.])(?:[3-9]|[1-9]\d+|\d*\.\d+)(?![\w.])/],
];

/** Every .js/.jsx file under a directory. @param {string} dir @returns {string[]} */
const files = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.jsx?$/.test(name) ? [path] : [];
});

/** The findings under src/core, src/ext, src/hooks and src/form, as `file:line rule code`. @param {string} root the checkout @returns {{ hits: string[], geometry: string[] }} */
function scan(root) {
  const hits = [];
  const geometry = [];
  for (const dir of ['src/core', 'src/ext', 'src/hooks', 'src/form']) {
    for (const file of files(join(root, dir))) {
      const rel = file.slice(root.length + 1);
      // A size table over several lines: a constant opened on one line, its `xs:` number on the next.
      let opened = false;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const table = opened && /^\s*xs:\s*[\[{]?\s*(?:[wh]:\s*)?\d/.test(line);
        opened = /^\s*(?:export\s+)?const\s+\w+\s*=.*[({]\s*$/.test(line);
        if (table) hits.push(`${rel}:${i + 1}  sizeTable  ${line.trim().slice(0, 110)}`);
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//')) return;
        if (/\/\/ (?:geometry|cycle): \S/.test(line)) return void geometry.push(`${rel}:${i + 1}`);
        const code = line.replace(/\/\/.*$/, '').replace(/'[^']*'|`[^`]*`/g, m => (/^'\w+'$/.test(m) ? m : "''"));
        for (const [rule, re] of RULES) if (!(rule === 'pxConstant' && /\/\/ (?:ms|count): \S/.test(line)) && (typeof re === 'function' ? re(code) : re.test(code))) hits.push(`${rel}:${i + 1}  ${rule}  ${t.slice(0, 110)}`);
        // A color with its own alpha written in: alpha(color, theme.opacity.*).
        if (/['"`]#[0-9a-fA-F]{8}['"`]/.test(line.replace(/\/\/.*$/, ''))) hits.push(`${rel}:${i + 1}  hexAlpha  ${t.slice(0, 110)}`);
      });
    }
  }
  return { hits, geometry };
}

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

describe('style tokens', () => {
  it('no component style number is an inline literal', () => {
    const { hits } = scan(root);
    assert.deepEqual(hits, [], 'use a theme token (see README, Conventions)');
  });

  it('drawing-math exemptions stay few', () => {
    const { geometry } = scan(root);
    assert.ok(geometry.length <= 30, `${geometry.length} lines marked geometry: ${geometry.join(', ')}`);
  });
});
