// rui-core/snippet: the tokenizer on each language, and Snippet,
// SnippetTabs and InlineSnippet on the DOM and on Skia with the
// same text, the same presses and the same state.

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';
import { Rui } from 'rui-core';
import { Snippet, SnippetTabs, InlineSnippet, tokenize, lines, languageOf, SYNTAX_LIGHT, SYNTAX_DARK, tokenColor } from 'rui-core/snippet';
import { both } from './harness.jsx';
import { primitives } from './more-harness.jsx';

/** The tokens as [type, text] pairs, spaces left out. @param {string} code @param {string} language */
const kinds = (code, language) => tokenize(code, language).filter(t => t.text.trim() !== '').map(t => [t.type, t.text]);

/** The text of the tokens of a type. @param {string} code @param {string} language @param {string} type */
const of = (code, language, type) => tokenize(code, language).filter(t => t.type === type).map(t => t.text);

describe('snippet tokenizer', () => {
  it('JavaScript: keywords, strings, templates, numbers, comments, regular expressions, calls', () => {
    const code = "const a = /x+/g.test(`v ${b + 1}`); // note\nif (a) foo(1.5e3, 'q', 0xff, 10n);\n/* block */ x = y / 2;";
    assert.deepEqual(of(code, 'js', 'keyword'), ['const', 'if']);
    assert.deepEqual(of(code, 'js', 'regex'), ['/x+/g']);
    assert.deepEqual(of(code, 'js', 'string'), ['`v ', '`', "'q'"]);
    assert.deepEqual(of(code, 'js', 'number'), ['1', '1.5e3', '0xff', '10n', '2']);
    assert.deepEqual(of(code, 'js', 'comment'), ['// note', '/* block */']);
    assert.deepEqual(of(code, 'js', 'function'), ['test', 'foo']);
    assert.ok(of(code, 'js', 'operator').includes('/'), 'a division after a value is an operator');
    assert.deepEqual(of('x = true ?? null', 'js', 'constant'), ['true', 'null']);
  });

  it('nesting past its cap reads as one plain run, never overflowing the stack', () => {
    for (const code of ['`${'.repeat(3000), '<a>{'.repeat(5000), `${'`${'.repeat(300)}x${'}`'.repeat(300)}`]) {
      const tokens = tokenize(code, 'tsx');
      assert.equal(tokens.map(t => t.text).join(''), code, 'every character kept, in order');
    }
    const deep = tokenize('`${'.repeat(3000), 'tsx');
    assert.equal(deep.at(-1)?.type, 'plain', 'the rest past the cap is one plain token');
  });

  it('JSX: tags, attributes, expressions in attributes and children', () => {
    const code = 'const App = () => <View a="1" b={x > 1}>hi {name} <Label text={`t`} /></View>;';
    assert.deepEqual(of(code, 'jsx', 'tag'), ['View', 'Label', 'View']);
    assert.deepEqual(of(code, 'jsx', 'attribute'), ['a', 'b', 'text']);
    assert.deepEqual(of(code, 'jsx', 'string'), ['"1"', '`t`']);
    assert.ok(kinds(code, 'jsx').some(([t, s]) => t === 'plain' && s.includes('hi')), 'children text stays plain');
    assert.deepEqual(of('a < b && c > d', 'jsx', 'tag'), [], 'a comparison is no tag');
  });

  it('TypeScript: its keywords and primitive types; no JSX in plain ts', () => {
    const code = 'interface A { x: number } type B<T> = string | T; enum E { A }';
    assert.deepEqual(of(code, 'ts', 'keyword'), ['interface', 'type', 'enum']);
    assert.deepEqual(of(code, 'ts', 'constant'), ['number', 'string']);
    assert.deepEqual(of(code, 'ts', 'tag'), []);
    assert.deepEqual(of('const x = <div a={1} />', 'tsx', 'tag'), ['div']);
  });

  it('JSON: keys, strings, numbers, constants, punctuation', () => {
    const code = '{"a": [1, -2.5, true, null], "b": "s"}';
    assert.deepEqual(of(code, 'json', 'property'), ['"a"', '"b"']);
    assert.deepEqual(of(code, 'json', 'string'), ['"s"']);
    assert.deepEqual(of(code, 'json', 'number'), ['1', '-2.5']);
    assert.deepEqual(of(code, 'json', 'constant'), ['true', 'null']);
  });

  it('CSS: selectors, properties, values, at-rules, !important', () => {
    const code = '.a:hover > p, #id { color: #fff; margin: 0 4px !important; width: calc(100% - 2px) }\n@media (max-width: 10px) { a { display: block } }';
    assert.deepEqual(of(code, 'css', 'attribute'), ['.a:hover', '#id']);
    assert.deepEqual(of(code, 'css', 'tag'), ['p', 'a']);
    assert.deepEqual(of(code, 'css', 'property'), ['color', 'margin', 'width', 'display']);
    assert.deepEqual(of(code, 'css', 'number'), ['#fff', '0', '4px', '100%', '2px', '10px']);
    assert.deepEqual(of(code, 'css', 'keyword'), ['!important', '@media']);
    assert.deepEqual(of(code, 'css', 'function'), ['calc']);
    assert.deepEqual(of(code, 'css', 'constant'), ['block']);
  });

  it('HTML: tags, attributes, comments, entities, doctype, script and style inside', () => {
    const code = '<!DOCTYPE html><div class="x" id=y>a &amp; b<!-- c --></div><script>let x = 1;</script><style>a { b: 1px }</style>';
    assert.deepEqual(of(code, 'html', 'tag'), ['div', 'div', 'script', 'script', 'style', 'a', 'style']);
    assert.deepEqual(of(code, 'html', 'attribute'), ['class', 'id']);
    assert.deepEqual(of(code, 'html', 'string'), ['"x"', 'y']);
    assert.deepEqual(of(code, 'html', 'comment'), ['<!-- c -->']);
    assert.deepEqual(of(code, 'html', 'constant'), ['&amp;']);
    assert.deepEqual(of(code, 'html', 'keyword'), ['<!DOCTYPE html>', 'let']);
    assert.deepEqual(of(code, 'html', 'property'), ['b']);
  });

  it('Shell: comments, keywords, builtins, variables, strings, operators, assignments', () => {
    const code = '# setup\nexport X=1\nfor f in *.js; do echo "$HOME/$f" | grep -v y && ls ${A} $1; done';
    assert.deepEqual(of(code, 'bash', 'comment'), ['# setup']);
    assert.deepEqual(of(code, 'bash', 'keyword'), ['export', 'for', 'in', 'do', 'done']);
    assert.deepEqual(of(code, 'bash', 'builtin'), ['echo', 'grep', 'ls']);
    assert.deepEqual(of(code, 'bash', 'variable'), ['X', '$HOME', '$f', '${A}', '$1']);
    assert.deepEqual(of(code, 'bash', 'operator'), ['=', ';', '|', '&&', ';']);
    assert.equal(languageOf('sh'), 'bash');
    assert.equal(languageOf('zsh'), 'bash');
  });

  it('keeps every character: the tokens join back to the source, in every language', () => {
    const samples = {
      js: 'a /* x */ = `q${`w${1}`}` / 2 // z\n',
      jsx: '<a b={<c d="e" />}>{f}</a>',
      ts: 'let x: Array<number> = [];',
      json: '{ "a": [1, {"b": null}] }',
      css: '@import "x.css"; a > b { c: d(1px, 2%) }',
      html: '<p a=b>c<br/>&lt;</p>',
      bash: 'A=1 b "c $d" \'e\' `f` | g > h',
      plain: 'anything',
    };
    for (const [language, code] of Object.entries(samples)) {
      assert.equal(tokenize(code, language).map(t => t.text).join(''), code, language);
    }
  });

  it('splits tokens into lines (a comment across lines too), tabs as two spaces', () => {
    const rows = lines(tokenize('a /* one\ntwo */ b\n\tc', 'js'));
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[1].map(r => [r.type, r.text]), [['comment', 'two */'], ['plain', ' b']]);
    assert.deepEqual(rows[2].map(r => r.text), ['  c']);
    assert.deepEqual(lines(tokenize('x\r\ny', 'unknown')).map(r => r.map(t => t.text)), [['x'], ['y']]);
  });

  it('maps each type to its syntax colors', () => {
    assert.equal(tokenColor(SYNTAX_LIGHT, 'keyword'), '#a92e52');
    assert.equal(tokenColor(SYNTAX_LIGHT, 'string'), '#147732');
    assert.equal(tokenColor(SYNTAX_DARK, 'keyword'), '#ff9daf');
    assert.equal(tokenColor(SYNTAX_DARK, 'tag'), '#67d4c3');
  });
});

// ---------------------------------------------------------------------------
// Components

/** The scene items of a kind (5 Action), in tree order. @param {any} skia @param {number} kind */
function items(skia, kind) {
  skia.skia.present();
  /** @type {any[]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      if (c.kind === kind) out.push(c);
      walk(c);
    }
  };
  walk(skia.skia.root);
  return out;
}

/** Presses the Action named `label` on both. @param {any} dom @param {any} skia @param {string} label */
function pressLabel(dom, skia, label) {
  const node = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === label);
  if (node === undefined) throw new Error(`no "${label}" on the DOM`);
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  $flush(dom.root);
  const item = items(skia, 5).find(i => i.label === label);
  if (item === undefined) throw new Error(`no "${label}" on Skia`);
  const r = item.getBoundingClientRect();
  skia.skia.press(r.left + r.width / 2, r.top + r.height / 2);
  skia.skia.release(r.left + r.width / 2, r.top + r.height / 2);
  $flush(skia.root);
}

/**
 * The text a DOM element holds as its accessible name: its text, less what
 * is hidden from assistive technology, white space collapsed.
 * @param {any} node
 * @returns {string}
 */
const heldText = node => {
  let text = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) text += c.data;
    else if (c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true' && !c.hidden) text += ` ${heldText(c)} `;
  }
  return text.replace(/\s+/g, ' ').trim();
};

/**
 * The accessible names of the Actions shown on each renderer, the same
 * measure on both: on the DOM its aria-label, else the text it holds; on
 * Skia the item's accessible name (its `label`).
 * @param {any} dom @param {any} skia
 */
const labels = (dom, skia) => [
  dom.nodes('Action').map((/** @type {any} */ n) => n.getAttribute('aria-label') || heldText(n)).filter(Boolean),
  items(skia, 5).map(i => i.label).filter(Boolean),
];

/** The DOM color of the first run whose text is `text`. @param {any} dom @param {string} text */
const colorOf = (dom, text) => [...dom.host.querySelectorAll('[data-ren="Label"] > span')].find((/** @type {any} */ n) => n.textContent === text)?.style.color;

/** The texts of Skia's Labels of runs (the code's lines), in tree order. @param {any} skia */
const runLines = skia => items(skia, 3).filter(i => i.spans !== null).map(i => i.joined);

/** Skia's paint color of the text `text`, as the renderer drew it. @param {any} skia @param {string} text */
const painted = (skia, text) => {
  skia.text();
  return skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === text);
};

describe('Snippet on the DOM and on Skia', () => {
  const code = "const a = 'x';\n// done\n";

  it('shows each line as runs, the same text on both, in the palette of the scheme', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Snippet code={code} language="js" />
      </Rui>
    ));
    assert.equal(dom.text(), "const a = 'x'; // done");
    assert.deepEqual(runLines(skia), ["const a = 'x';", '// done'], 'Skia: one Label of runs a line');
    assert.equal(dom.nodes('Label').length, 2, 'the DOM: one Label a line');
    assert.equal(dom.nodes('Label')[0].children.length, 6, 'a run per stretch of one color');
    assert.match(String(colorOf(dom, 'const')), /a92e52|169, 46, 82/i);
    assert.match(String(colorOf(dom, '// done')), /6a7683|106, 118, 131/i);
    assert.ok(painted(skia, 'const') !== undefined && painted(skia, "'x'") !== undefined, 'a run each on Skia');
    assert.deepEqual(labels(dom, skia), [['Copy'], ['Copy']]);
    dispose();
    const dark = both(() => (
      <Rui scheme="dark">
        <Snippet code={code} language="js" copyable={false} />
      </Rui>
    ));
    assert.match(String(colorOf(dark.dom, 'const')), /ff9daf|255, 157, 175/i);
    assert.deepEqual(labels(dark.dom, dark.skia), [[], []]);
    dark.dispose();
  });

  it('draws in the monospace stack, and a long line scrolls across instead of being cut', () => {
    const long = 'const x = ' + 'a + '.repeat(40) + '1;\nshort();';
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <Snippet code={long} language="js" copyable={false} />
        </Rui>
      ),
      { width: 300, height: 300 },
    );
    assert.equal(dom.text(), runLines(skia).join(' '));
    const scroll = dom.nodes('Scroll')[0];
    assert.match(scroll.getAttribute('style'), /overflow-x: auto/);
    assert.match(scroll.parentElement.getAttribute('style'), /font-family: var\(--ren-mono, ui-monospace, .*monospace\)/, "the monospace stack behind the root's mono face (ren-dom's --ren-mono)");
    assert.equal(painted(skia, 'const')[6] & 4, 4, 'Skia draws it in its monospace face');
    const item = primitives(skia).find(i => i.kind === 2);
    assert.ok(item.scrollWidth > item.clientWidth + 500, 'the line is wider than the block');
    assert.equal(item.getBoundingClientRect().height, Math.ceil(2 * 13 * 1.65) + 16, 'as high as its two lines (at the code leading, 1.65) and its padding');
    const before = painted(skia, 'short')[2];
    item.scrollLeft = 200;
    $flush(skia.root);
    assert.equal(Math.round(painted(skia, 'short')[2]), Math.round(before - 200), 'scrolled across');
    dispose();
  });

  it('numbers its lines', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Snippet code={'a\nb\n\nc'} language="text" numbered copyable={false} />
      </Rui>
    ));
    assert.equal(dom.text(), '1 a 2 b 3 4 c');
    assert.equal(skia.text(), '1 a 2 b 3 4 c');
    dispose();
  });

  it('copies the code through the clipboard and says so', async () => {
    /** @type {string[]} */
    const written = [];
    const nav = /** @type {any} */ (globalThis.navigator);
    const had = Object.getOwnPropertyDescriptor(nav, 'clipboard');
    /** @type {Promise<void>[]} */
    const writes = [];
    const writeText = (/** @type {string} */ t) => {
      written.push(t);
      const done = Promise.resolve();
      writes.push(done);
      return done;
    };
    Object.defineProperty(nav, 'clipboard', { configurable: true, value: { writeText } });
    // The reset is timed: the mock clock moves it.
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const { dom, skia, dispose } = both(() => (
        <Rui>
          <Snippet code={code} language="js" hold={20} />
        </Rui>
      ));
      pressLabel(dom, skia, 'Copy');
      // The copy resumes on the clipboard's promise, ahead of this await.
      await Promise.all(writes);
      assert.deepEqual(written, [code, code]);
      assert.deepEqual(labels(dom, skia), [['Done'], ['Done']]);
      mock.timers.tick(19);
      assert.deepEqual(labels(dom, skia), [['Done'], ['Done']]);
      mock.timers.tick(1);
      assert.deepEqual(labels(dom, skia), [['Copy'], ['Copy']]);
      dispose();
    } finally {
      mock.timers.reset();
      if (had === undefined) delete nav.clipboard;
      else Object.defineProperty(nav, 'clipboard', had);
    }
  });

  it('collapses to its height and expands, from the cover and the control', () => {
    /** @type {boolean[]} */
    const changes = [];
    const long = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n');
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <Snippet code={long} expandable defaultOpen={false} height={60} copyable={false} onOpenChange={(/** @type {boolean} */ v) => changes.push(v)} />
        </Rui>
      ),
      { width: 480, height: 900 },
    );
    const clipped = () => dom.nodes('View').find((/** @type {any} */ n) => n.style.maxHeight === '60px');
    assert.ok(clipped() !== undefined, 'the DOM clips the code');
    assert.match(skia.text(), /line0 .* Show all lines$/);
    assert.ok(!skia.text().includes('line29'), 'Skia paints only what the clip shows');
    dom.press('Show all lines');
    skia.press('Show all lines');
    assert.deepEqual(changes, [true, true]);
    assert.equal(clipped(), undefined);
    assert.match(skia.text(), /line29$/);
    assert.deepEqual(labels(dom, skia), [['Fold'], ['Fold']]);
    pressLabel(dom, skia, 'Fold');
    assert.deepEqual(changes, [true, true, false, false]);
    assert.match(dom.text(), /Show all lines$/);
    assert.match(skia.text(), /Show all lines$/);
    dispose();
  });
});

describe('Snippet look', () => {
  it('puts its controls in a header strip above the code, copy first; the theme corner; code padded from control', () => {
    const long = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n');
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <Snippet code={long} expandable defaultOpen={false} height={60} />
        </Rui>
      ),
      { width: 480, height: 900 },
    );
    assert.deepEqual(labels(dom, skia), [['Copy', 'Show all lines', 'Show all lines'], ['Copy', 'Show all lines', 'Show all lines']], 'copy first, then expand; the fade\'s button named by its text');
    const copy = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === 'Copy');
    for (let n = copy; n !== null && n !== dom.host; n = n.parentElement) assert.notEqual(n.style.position, 'absolute', 'in the flow, not over a corner');
    const scroll = dom.nodes('Scroll')[0];
    assert.ok(copy.compareDocumentPosition(scroll) & 4, 'the strip comes before the code');
    assert.equal(scroll.style.padding, '8px 12px', 'control.densePad.md high, control.pad.sm wide');
    const frame = dom.host.querySelector('[data-ren="View"]');
    assert.equal(frame.style.borderRadius, '10px', "the theme's corner (md)");
    // Closed: a fade row over the code's bottom, its text button opening it.
    const fade = dom.nodes('View').find((/** @type {any} */ n) => n.style.position === 'absolute' && /gradient/.test(n.style.background + n.style.backgroundImage));
    assert.ok(fade !== undefined, 'a fade row with a gradient');
    assert.equal(fade.textContent, 'Show all lines');
    assert.match(skia.text(), /Show all lines$/);
    dispose();
    const plain = both(() => (
      <Rui>
        <Snippet code="x" copyable={false} />
      </Rui>
    ));
    assert.equal(plain.dom.nodes('Action').length, 0, 'no controls: no strip');
    plain.dispose();
  });
});

describe('SnippetTabs and InlineSnippet on the DOM and on Skia', () => {
  it('switches files by their names, the same on both', () => {
    /** @type {string[]} */
    const tabs = [];
    const files = [
      { name: 'a.js', code: 'let a = 1;', language: 'js' },
      { name: 'b.css', code: 'b { c: d }', language: 'css' },
    ];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <SnippetTabs files={files} copyable={false} onChange={(/** @type {string} */ name) => tabs.push(name)} />
      </Rui>
    ));
    assert.equal(dom.text(), 'a.js b.css let a = 1;');
    assert.equal(skia.text(), 'a.js b.css let a = 1 ;', 'a piece a run');
    assert.deepEqual(runLines(skia), ['let a = 1;']);
    dom.press('b.css');
    skia.press('b.css');
    assert.deepEqual(tabs, ['b.css', 'b.css'], 'tabs are keyed by name');
    assert.equal(dom.text(), 'a.js b.css b { c: d }');
    assert.deepEqual(runLines(skia), ['b { c: d }']);
    assert.match(String(colorOf(dom, 'c')), /0064b5|0, 100, 181/i, 'a CSS property');
    dispose();
  });

  it('opens on the tab its defaultValue names', () => {
    const files = [
      { name: 'a.js', code: 'let a = 1;', language: 'js' },
      { name: 'b.css', code: 'b { c: d }', language: 'css' },
    ];
    const { dom, dispose } = both(() => (
      <Rui>
        <SnippetTabs files={files} copyable={false} defaultValue="b.css" />
      </Rui>
    ));
    assert.equal(dom.text(), 'a.js b.css b { c: d }');
    dispose();
  });

  it('highlights inline', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <InlineSnippet code="setCount(0)" language="tsx" />
      </Rui>
    ));
    assert.equal(dom.text(), 'setCount(0)');
    assert.equal(dom.nodes('Label').length, 1, 'one Label of runs');
    assert.deepEqual(runLines(skia), ['setCount(0)']);
    assert.match(String(colorOf(dom, 'setCount')), /7048b1|112, 72, 177/i);
    dispose();
  });
});
