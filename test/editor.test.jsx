// rui-core/editor: the document model, its operations and serialization,
// and Editor on the DOM and on Skia with the same text, the same
// presses, selections and keys, and the same document on both.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush, $signal, $write } from 'rrx-core';
import { $active, Show } from 'ren-core';
import { Rui, Clock, manualClock, BASE_THEME, pageColors } from 'rui-core';
import {
  Editor, LABELS, $editor, createDoc, toggleMark, setMark, clearMarks, setText, splice, setBlock, split, join, hasMark, marksAt, runs,
  toHTML, fromHTML, toJSON, fromJSON, toText, normalize, indent, outdent, insertRule, setAlign, shortcut,
} from 'rui-core/editor';
import { both, onDom } from './harness.jsx';
import { offsetAt } from '../src/ext/editor/caret.js';

/** A one-paragraph document. @param {string} text */
const one = text => createDoc([{ text }]);

describe('editor model', () => {
  it('toggles marks over a range: on where any part lacks it, off where all has it', () => {
    let d = one('abcdef');
    d = toggleMark(d, 1, 1, 4, 'bold');
    assert.equal(toHTML(d), '<p>a<strong>bcd</strong>ef</p>');
    d = toggleMark(d, 1, 2, 3, 'bold');
    assert.equal(toHTML(d), '<p>a<strong>b</strong>c<strong>d</strong>ef</p>');
    d = toggleMark(d, 1, 0, 6, 'bold');
    assert.equal(toHTML(d), '<p><strong>abcdef</strong></p>', 'part lacked it: on everywhere, merged');
    d = toggleMark(d, 1, 0, 6, 'bold');
    assert.equal(toHTML(d), '<p>abcdef</p>');
    assert.equal(toggleMark(d, 1, 2, 2, 'bold'), d, 'an empty range changes nothing');
  });

  it('nests marks in one order and keeps links apart by address', () => {
    let d = one('link here');
    d = setMark(d, 1, 0, 4, 'link', true, 'https://a.b/?x=1&y="2"');
    d = toggleMark(d, 1, 2, 9, 'italic');
    d = toggleMark(d, 1, 0, 9, 'bold');
    assert.equal(toHTML(d), '<p><a href="https://a.b/?x=1&amp;y=&quot;2&quot;"><strong>li<em>nk</em></strong></a><strong><em> here</em></strong></p>');
    assert.deepEqual(normalize([{ type: 'link', from: 0, to: 4, href: 'a' }, { type: 'link', from: 2, to: 6, href: 'b' }], 6), [
      { type: 'link', from: 0, to: 2, href: 'a' },
      { type: 'link', from: 2, to: 6, href: 'b' },
    ]);
    assert.equal(hasMark(d.blocks[0], 'link', 0, 4, 'https://a.b/?x=1&y="2"'), true);
    assert.equal(hasMark(d.blocks[0], 'link', 0, 5), false);
  });

  it('moves marks with typing: inside and at the end of a mark (not a link or code) extends it', () => {
    let d = setMark(setMark(one('ab cd'), 1, 0, 2, 'bold', true), 1, 3, 5, 'link', true, 'u');
    d = setText(d, 1, 'abX cd');
    assert.equal(toHTML(d), '<p><strong>abX</strong> <a href="u">cd</a></p>');
    d = setText(d, 1, 'abX cdY');
    assert.equal(toHTML(d), '<p><strong>abX</strong> <a href="u">cd</a>Y</p>', 'a link does not extend');
    d = setText(d, 1, 'ZabX cdY');
    assert.equal(toHTML(d), '<p><strong>ZabX</strong> <a href="u">cd</a>Y</p>', 'at the start, the marks that start there');
    d = setText(d, 1, 'ZX cdY');
    assert.equal(toHTML(d), '<p><strong>ZX</strong> <a href="u">cd</a>Y</p>', 'a deletion shrinks the mark');
    assert.deepEqual(marksAt(d.blocks[0], 2).map(m => m.type), ['bold']);
  });

  it('places an ambiguous insertion by the caret, and applies marks toggled at a caret', () => {
    const d = setMark(one('aa'), 1, 0, 1, 'bold', true);
    // "a" typed after the first "a" (caret 2): the new "a" is at 1, not 2.
    assert.equal(toHTML(setText(d, 1, 'aaa', null, 2)), '<p><strong>aa</strong>a</p>');
    assert.equal(toHTML(setText(d, 1, 'aaa', null, 3)), '<p><strong>a</strong>aa</p>');
    const stored = new Map(/** @type {[any, boolean][]} */ ([['italic', true], ['bold', false]]));
    assert.equal(toHTML(splice(one('xy'), 1, 1, 0, 'Z', stored)), '<p>x<em>Z</em>y</p>');
    assert.equal(toHTML(splice(d, 1, 1, 0, 'Z', stored)), '<p><strong>a</strong><em>Z</em>a</p>', 'a mark stored off stays off');
  });

  it('splits and joins blocks with their marks; a heading split at its end goes on as a paragraph', () => {
    const d = toggleMark(one('hello world'), 1, 3, 8, 'bold');
    const s = split(d, 1, 5);
    assert.equal(toHTML(s.doc), '<p>hel<strong>lo</strong></p><p><strong>&nbsp;wo</strong>rld</p>');
    const j = join(s.doc, s.id);
    assert.ok(j !== null);
    assert.equal(toHTML(j.doc), '<p>hel<strong>lo wo</strong>rld</p>');
    assert.equal(j.at, 5);
    assert.equal(join(d, 1), null, 'the first block has nothing before it');
    const h = setBlock(one('Title'), 1, 'heading', 2);
    assert.equal(toHTML(split(h, 1, 5).doc), '<h2>Title</h2><p></p>');
    assert.equal(toHTML(split(h, 1, 2).doc), '<h2>Ti</h2><h2>tle</h2>');
    const list = setBlock(one('item'), 1, 'bullet');
    assert.equal(toHTML(split(list, 1, 4).doc), '<ul><li><p>item</p></li><li><p></p></li></ul>');
  });

  it('sets block types; a code block drops marks; clears marks', () => {
    const d = toggleMark(one('abc'), 1, 0, 3, 'bold');
    assert.equal(toHTML(setBlock(d, 1, 'heading', 9)), '<h4><strong>abc</strong></h4>', 'levels 1 to 4');
    assert.equal(toHTML(setBlock(d, 1, 'code')), '<pre><code>abc</code></pre>');
    assert.equal(toHTML(clearMarks(d, 1, 1, 2)), '<p><strong>a</strong>b<strong>c</strong></p>');
    assert.equal(toggleMark(setBlock(d, 1, 'code'), 1, 0, 1, 'italic').blocks[0].marks.length, 0, 'no marks in code');
  });

  it('writes and reads HTML: headings, lists, quotes, code, marks, entities', () => {
    const html =
      '<h1>Title</h1><p>Hello <strong>bold <em>both</em></strong> and <a href="https://x.y?a=1&amp;b=2">link</a></p>' +
      '<ul><li><p>one</p></li><li><p>two</p></li></ul><ol><li><p>first</p></li></ol><blockquote><p>q1</p><p>q2</p></blockquote>' +
      '<pre><code>a &lt; b\n  c</code></pre><p><u>u</u> <s>s</s> <code>c</code></p>';
    const d = fromHTML(html);
    assert.deepEqual(d.blocks.map(b => b.type), ['heading', 'paragraph', 'bullet', 'bullet', 'ordered', 'quote', 'quote', 'code', 'paragraph']);
    assert.equal(d.blocks[7].text, 'a < b\n  c');
    assert.equal(d.blocks[1].marks.find(m => m.type === 'link')?.href, 'https://x.y?a=1&b=2');
    assert.equal(toHTML(d), html, 'round trip');
    // Close to the subset: b, i, del, h6, loose text, whitespace, br, unknown tags.
    const loose = fromHTML('  loose <b>b</b>\n  <i>i</i><h6>six</h6><div><span>in <del>d</del></span><br>x</div>');
    assert.equal(toHTML(loose), '<p>loose <strong>b</strong> <em>i</em></p><h4>six</h4><p>in <s>d</s> x</p>');
    assert.deepEqual(toHTML(fromHTML('')), '<p></p>', 'empty: one empty paragraph');
  });

  it('writes and reads JSON: the blocks, their fields that differ from a plain block', () => {
    const d = fromHTML('<h2>T</h2><p>a <strong>b</strong> <a href="u">c</a></p><ol><li><p>x</p></li></ol><blockquote><p>q</p></blockquote><pre><code>k</code></pre><hr><p></p>');
    const json = toJSON(d);
    assert.deepEqual(json, {
      blocks: [
        { type: 'heading', text: 'T', level: 2 },
        { type: 'paragraph', text: 'a b c', marks: [{ type: 'link', from: 4, to: 5, href: 'u' }, { type: 'bold', from: 2, to: 3 }] },
        { type: 'ordered', text: 'x' },
        { type: 'quote', text: 'q' },
        { type: 'code', text: 'k' },
        { type: 'rule' },
        { type: 'paragraph' },
      ],
    });
    assert.deepEqual(JSON.parse(JSON.stringify(json)), json, 'plain data');
    assert.equal(toHTML(fromJSON(json)), toHTML(d));
    // Unknown types are paragraphs, unknown or broken marks dropped, missing fields their defaults.
    assert.equal(toHTML(fromJSON({ blocks: [{ type: 'x', text: 'ab', marks: [{ type: 'bold', from: 0, to: 1 }, { type: 'glow', from: 0, to: 2 }, { type: 'italic' }] }, {}] })), '<p><strong>a</strong>b</p><p></p>');
    assert.equal(toHTML(fromJSON(null)), '<p></p>');
    assert.equal(toText(d), 'T\na b c\nx\nq\nk\n\n');
    assert.deepEqual(runs(d.blocks[1]).map(r => [r.text, r.marks.map(m => m.type)]), [['a ', []], ['b', ['bold']], [' ', []], ['c', ['link']]]);
  });
});

// ---------------------------------------------------------------------------
// The editor on the renderers

/** The scene items of a kind (4 Edit, 5 Action), in tree order. @param {any} skia @param {number} kind */
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

/** Presses a toolbar control by its label, as a pointer does (pointerdown, then the press) on both. @param {any} dom @param {any} skia @param {string} label */
function control(dom, skia, label) {
  const node = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === label);
  if (node === undefined) throw new Error(`no "${label}" on the DOM`);
  node.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  $flush(dom.root);
  const item = items(skia, 5).find(i => i.label === label);
  if (item === undefined) throw new Error(`no "${label}" on Skia`);
  const r = item.getBoundingClientRect();
  skia.skia.press(r.left + r.width / 2, r.top + r.height / 2);
  skia.skia.release(r.left + r.width / 2, r.top + r.height / 2);
  $flush(skia.root);
}

/** A drawn block's text on Skia: a Label's runs joined, or its text. @param {any} item */
const textOfItem = item => (item.spans !== null ? item.joined : String(item.text));

/** The span of a DOM Label of runs holding `text`. @param {any} dom @param {string} text */
const span = (dom, text) => [...dom.host.querySelectorAll('[data-ren="Label"] > span')].find((/** @type {any} */ n) => n.textContent === text);

/**
 * Presses the drawn word `word` on both (a block pressed is edited), at
 * its character `at`: on Skia where the Label's offsetAt says that
 * character is (the word's start without `at`); on the DOM through
 * caretPositionFromPoint, which happy-dom lacks, so the test gives it: the
 * text node of the run's span, an offset in it (without `at`, the DOM has
 * none: the end).
 * @param {any} dom @param {any} skia @param {string} word @param {number} [at]
 */
function pressWord(dom, skia, word, at) {
  const node = dom.nodes('Label').find((/** @type {any} */ n) => new RegExp(`(^|\\s)${word}(\\s|$)`).test(n.textContent));
  if (node === undefined) throw new Error(`no "${word}" drawn on the DOM`);
  const doc = /** @type {any} */ (dom.document);
  const index = node.textContent.indexOf(word) + (at ?? 0);
  if (at !== undefined) {
    let start = 0;
    for (const s of node.children) {
      if (index <= start + s.textContent.length) {
        const offset = index - start;
        doc.caretPositionFromPoint = () => ({ offsetNode: s.firstChild, offset });
        break;
      }
      start += s.textContent.length;
    }
  }
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  delete doc.caretPositionFromPoint;
  $flush(dom.root);
  const item = items(skia, 3).find(i => new RegExp(`(^|\\s)${word}(\\s|$)`).test(textOfItem(i)));
  const goal = textOfItem(item).indexOf(word) + (at ?? 0);
  const r = item.getBoundingClientRect();
  const y = r.top + r.height / 2;
  let x = r.left;
  while (x < r.right && item.offsetAt(x, y) < goal) x++;
  skia.skia.press(x + (at === undefined ? 2 : 0), y);
  skia.skia.release(x + (at === undefined ? 2 : 0), y);
  $flush(skia.root);
}

/** The edited block's Edit on each renderer. @param {any} dom @param {any} skia @param {number} [i] */
const edits = (dom, skia, i = 0) => [dom.nodes('Edit')[i], items(skia, 4)[i]];

/** Selects [from, to] in the edited block on both. @param {any} dom @param {any} skia @param {number} from @param {number} to */
function select(dom, skia, from, to) {
  const [d, s] = edits(dom, skia);
  d.focus();
  d.setSelectionRange(from, to);
  if (skia.skia.focused !== s) s.focus();
  s.setSelectionRange(from, to);
}

/** A key in the edited block on both. @param {any} dom @param {any} skia @param {string} key @param {Record<string, boolean>} [mods] */
function key(dom, skia, key, mods = {}) {
  const [d] = edits(dom, skia);
  d.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
  $flush(dom.root);
  skia.skia.key(key, mods.shiftKey === true, mods);
  $flush(skia.root);
}

/** Types at the caret on both (the DOM as a browser: the new value, the caret after it, an input event). @param {any} dom @param {any} skia @param {string} text */
function type(dom, skia, text) {
  const [d, s] = edits(dom, skia);
  for (const ch of text) {
    const at = d.selectionStart;
    const end = d.selectionEnd;
    d.value = d.value.slice(0, at) + ch + d.value.slice(end);
    d.setSelectionRange(at + 1, at + 1);
    d.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
  }
  if (skia.skia.focused !== s) s.focus();
  for (const ch of text) skia.skia.key(ch);
  $flush(skia.root);
}

/** An editor made in a root and shown by no view, and its disposal. @param {any} content @returns {[ReturnType<typeof $editor>, () => void]} */
function bare(content) {
  /** @type {any} */
  let made = null;
  const dom = onDom(() => ((made = $editor({ content })), null));
  return [made, dom.dispose];
}

/** The editors of each root. */
function editors() {
  /** @type {ReturnType<typeof $editor>[]} */
  const list = [];
  return {
    list,
    /** @param {any} content */
    make: content => (list.push($editor({ content })), list[list.length - 1]),
    /** The HTML of each. */
    html: () => list.map(e => e.html()),
  };
}

/** The toolbar's glyphs, as the harness reads them. */
const GLYPHS = 'B I U S Tx </> { } H1 H2 “ 1.';

/** An editor with a toolbar, on a manual clock. @param {any} clock @param {ReturnType<typeof editors>} eds @param {any} content @param {Record<string, any>} [contentProps] */
const editorView = (clock, eds, content, contentProps = {}) => () => (
  <Clock value={clock}>
    <Rui>
      <Editor store={eds.make(content)}>
        <Editor.Toolbar>
          <Editor.Group>
            <Editor.Bold />
            <Editor.Italic />
            <Editor.Underline />
            <Editor.Strike />
            <Editor.Clear />
            <Editor.Code />
            <Editor.CodeBlock />
          </Editor.Group>
          <Editor.Group>
            <Editor.Heading level={1} />
            <Editor.Heading level={2} />
            <Editor.Quote />
            <Editor.Bullet />
            <Editor.Ordered />
          </Editor.Group>
          <Editor.Group>
            <Editor.Link />
            <Editor.Unlink />
            <Editor.Undo />
            <Editor.Redo />
          </Editor.Group>
        </Editor.Toolbar>
        <Editor.Content {...contentProps} />
      </Editor>
    </Rui>
  </Clock>
);

describe('Editor on the DOM and on Skia', () => {
  it('draws the document with its marks, the same text on both', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<h1>Title</h1><p>Hello <strong>bold</strong> <a href="u">link</a> <s>gone</s> <code>x()</code></p><ul><li><p>one</p></li></ul><ol><li><p>a</p></li><li><p>b</p></li></ol>'), {
      width: 480,
      height: 480,
    });
    const text = `${GLYPHS} Title Hello bold link gone x() • one 1. a 2. b`;
    assert.equal(dom.text(), text);
    assert.equal(skia.text(), text);
    // A block is one Label of runs, on both.
    assert.ok(dom.nodes('Label').some((/** @type {any} */ n) => n.textContent === 'Hello bold link gone x()'), 'the DOM: one Label');
    const para = items(skia, 3).find(i => i.spans !== null && i.joined === 'Hello bold link gone x()');
    assert.ok(para, 'Skia: one Label of runs');
    const bold = span(dom, 'bold');
    assert.equal(bold.style.fontWeight, '700');
    const link = span(dom, 'link');
    assert.equal(link.style.textDecoration.includes('underline') || link.style.textDecorationLine === 'underline', true);
    // Struck text shows its line; inline code draws in the monospace face.
    const gone = span(dom, 'gone');
    assert.match(gone.getAttribute('style'), /line-through/);
    assert.equal(para.spans.find((/** @type {any} */ s) => para.joined.slice(s.start, s.end) === 'gone').strike, true);
    const drawn = skia.skia.commands();
    const at = drawn.findIndex((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'gone');
    assert.equal(drawn[at + 1][0], 'line', 'a line through it on Skia');
    const code = span(dom, 'x()');
    assert.match(code.getAttribute('style'), /font-family: var\(--ren-mono, ui-monospace/);
    assert.equal(drawn.find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'x()')[6] & 4, 4);
    dispose();
  });

  it('finds the pressed character on each platform, and none in a worker', () => {
    assert.equal(offsetAt({ offsetAt: () => 3 }, 0, 0), 3, 'a canvas Label');
    assert.equal(offsetAt({ offsetAt: () => -1 }, 0, 0), null, 'not drawn');
    const text = {};
    const node = { contains: (/** @type {any} */ n) => n === text, ownerDocument: { caretPositionFromPoint: () => ({ offsetNode: text, offset: 2 }) } };
    assert.equal(offsetAt(node, 0, 0), 2, 'the DOM');
    assert.equal(offsetAt({ contains: () => true, ownerDocument: { caretRangeFromPoint: () => ({ startContainer: text, startOffset: 1 }) } }, 0, 0), 1, 'caretRangeFromPoint');
    assert.equal(offsetAt({ contains: () => false, ownerDocument: node.ownerDocument }, 0, 0), null, 'a point in another node');
    assert.equal(offsetAt({ id: 4 }, 0, 0), null, 'a worker Handle: the caller takes the end');
  });

  it('edits a pressed block in an Edit, marks the selection from the toolbar, types into the mark', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>Hello world</p><p>second</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'world', 3);
    clock.advance(16); // focus at the next frame
    const [d, s] = edits(dom, skia);
    assert.equal(d.value, 'Hello world');
    assert.equal(s.draft, 'Hello world');
    assert.ok(skia.skia.focused === s, 'focused on Skia');
    assert.deepEqual([d.selectionStart, s.selectionStart], [9, 9], 'the caret at the pressed character: wor|ld');
    select(dom, skia, 6, 11);
    control(dom, skia, 'Bold');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p>Hello <strong>world</strong></p><p>second</p>', '<p>Hello <strong>world</strong></p><p>second</p>']);
    assert.deepEqual(eds.list.map(e => e.marked('bold')), [true, true]);
    assert.ok(skia.skia.focused === edits(dom, skia)[1], 'the Edit has the focus back');
    // Typing at the end of the bold word extends it.
    select(dom, skia, 11, 11);
    type(dom, skia, '!');
    assert.deepEqual(eds.html(), ['<p>Hello <strong>world!</strong></p><p>second</p>', '<p>Hello <strong>world!</strong></p><p>second</p>']);
    // A mark toggled at a caret applies to what is typed next.
    select(dom, skia, 5, 5);
    control(dom, skia, 'Italic');
    clock.advance(16);
    select(dom, skia, 5, 5);
    type(dom, skia, ',');
    assert.deepEqual(eds.html(), ['<p>Hello<em>,</em> <strong>world!</strong></p><p>second</p>', '<p>Hello<em>,</em> <strong>world!</strong></p><p>second</p>']);
    dispose();
  });

  it('splits at Enter, joins at Backspace, moves across blocks with the arrows', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>Hello world</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'Hello');
    clock.advance(16);
    select(dom, skia, 5, 5);
    key(dom, skia, 'Enter');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p>Hello</p><p>&nbsp;world</p>', '<p>Hello</p><p>&nbsp;world</p>']);
    const [d, s] = edits(dom, skia);
    assert.deepEqual([d.value, s.draft], [' world', ' world'], 'the new block is edited');
    assert.deepEqual([d.selectionStart, s.selectionStart], [0, 0]);
    assert.equal(dom.text(), `${GLYPHS} Hello world`);
    assert.equal(skia.text(), `${GLYPHS} Hello world`);
    key(dom, skia, 'Backspace');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p>Hello world</p>', '<p>Hello world</p>']);
    const [d2, s2] = edits(dom, skia);
    assert.deepEqual([d2.selectionStart, s2.selectionStart], [5, 5], 'the caret where they joined');
    // Enter at the end, then ArrowUp goes back to the first block.
    select(dom, skia, 11, 11);
    key(dom, skia, 'Enter');
    clock.advance(16);
    type(dom, skia, 'next');
    key(dom, skia, 'ArrowUp');
    clock.advance(16);
    assert.deepEqual(edits(dom, skia).map((/** @type {any} */ e) => e.value ?? e.draft), ['Hello world', 'Hello world']);
    assert.deepEqual(eds.html(), ['<p>Hello world</p><p>next</p>', '<p>Hello world</p><p>next</p>']);
    dispose();
  });

  it('turns blocks into headings, lists, quotes and code from the toolbar; Enter in an empty item leaves the list', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>Item</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'Item');
    clock.advance(16);
    control(dom, skia, 'Title 1');
    assert.deepEqual(eds.html(), ['<h1>Item</h1>', '<h1>Item</h1>']);
    assert.deepEqual(eds.list.map(e => e.isBlock('heading', 1)), [true, true]);
    control(dom, skia, 'Title 1');
    assert.deepEqual(eds.html(), ['<p>Item</p>', '<p>Item</p>'], 'pressed again: a paragraph');
    control(dom, skia, 'Bulleted list');
    clock.advance(16);
    select(dom, skia, 4, 4);
    key(dom, skia, 'Enter');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<ul><li><p>Item</p></li><li><p></p></li></ul>', '<ul><li><p>Item</p></li><li><p></p></li></ul>']);
    key(dom, skia, 'Enter');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<ul><li><p>Item</p></li></ul><p></p>', '<ul><li><p>Item</p></li></ul><p></p>']);
    control(dom, skia, 'Quote');
    clock.advance(16);
    type(dom, skia, 'q');
    control(dom, skia, 'Code');
    assert.deepEqual(eds.html(), ['<ul><li><p>Item</p></li></ul><pre><code>q</code></pre>', '<ul><li><p>Item</p></li></ul><pre><code>q</code></pre>']);
    dispose();
  });

  it('undoes and redoes, from the toolbar and with the primary key and Z (and Shift+Z), typing grouped', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>ab</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'ab', 2);
    clock.advance(16);
    type(dom, skia, 'cd');
    select(dom, skia, 0, 4);
    control(dom, skia, 'Bold');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p><strong>abcd</strong></p>', '<p><strong>abcd</strong></p>']);
    control(dom, skia, 'Undo');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p>abcd</p>', '<p>abcd</p>']);
    key(dom, skia, 'z', { ctrlKey: true });
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p>ab</p>', '<p>ab</p>'], 'the typing is one step');
    assert.deepEqual(eds.list.map(e => e.canUndo()), [false, false]);
    key(dom, skia, 'z', { ctrlKey: true, shiftKey: true });
    control(dom, skia, 'Redo');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p><strong>abcd</strong></p>', '<p><strong>abcd</strong></p>']);
    assert.deepEqual(eds.list.map(e => e.canRedo()), [false, false]);
    // The primary key and B mark the selection too.
    select(dom, skia, 0, 2);
    key(dom, skia, 'b', { ctrlKey: true });
    assert.deepEqual(eds.html(), ['<p>ab<strong>cd</strong></p>', '<p>ab<strong>cd</strong></p>']);
    dispose();
  });

  it('drops a stored mark toggle when the caret moves: a modified arrow, a pointer', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>abcd</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'abcd', 4);
    clock.advance(16);
    // Bold stored at the end, then a word move: the platform moves the caret (on Skia without a native entry, the plain move).
    key(dom, skia, 'b', { ctrlKey: true });
    key(dom, skia, 'ArrowLeft', { ctrlKey: true });
    select(dom, skia, 3, 3);
    type(dom, skia, 'X');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p>abcXd</p>', '<p>abcXd</p>'], 'the letter typed after the move is plain');
    // Bold stored again, then a press elsewhere moves the caret.
    key(dom, skia, 'b', { ctrlKey: true });
    const [d] = edits(dom, skia);
    d.setSelectionRange(0, 0);
    d.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true }));
    $flush(dom.root);
    // On Skia a press at the start of the Edit being typed in: the caret goes there, and its pointerup reads it.
    const sk = skia.skia.focused;
    const r = sk.getBoundingClientRect();
    skia.skia.press(r.left + 1, r.top + r.height / 2);
    skia.skia.release(r.left + 1, r.top + r.height / 2);
    $flush(skia.root);
    type(dom, skia, 'Y');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p>YabcXd</p>', '<p>YabcXd</p>'], 'and after the press');
    // A stored toggle still reaches the letter typed right after it, at the caret the toggle was made at.
    select(dom, skia, 1, 1);
    key(dom, skia, 'b', { ctrlKey: true });
    type(dom, skia, 'Z');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p>Y<strong>Z</strong>abcXd</p>', '<p>Y<strong>Z</strong>abcXd</p>'], 'the toggle itself is kept');
    dispose();
  });

  it('lays the edited block\'s Edit across its block, a paragraph and a code block (Skia and the DOM)', () => {
    for (const html of ['<p>ab</p>', '<pre><code>ab</code></pre>']) {
      const clock = manualClock();
      const eds = editors();
      const { dom, skia, dispose } = both(editorView(clock, eds, html), { width: 480, height: 480 });
      pressWord(dom, skia, 'ab', 1);
      clock.advance(16);
      skia.text();
      const sk = skia.skia.focused;
      assert.equal(sk?.kind, 4, `${html}: an Edit has the focus on Skia`);
      const e = sk.getBoundingClientRect();
      const p = sk.parent.getBoundingClientRect();
      assert.ok(p.width > 100, `${html}: its column has room (${p.width})`);
      assert.equal(Math.round(e.width), Math.round(p.width), `${html}: the Edit spans its column on Skia`);
      // The DOM: no zero width, no grow of its own (it stretches across its column as CSS lays it out).
      const d = /** @type {any} */ (dom.document.activeElement);
      assert.equal(d?.getAttribute('data-ren'), 'Edit', `${html}: an Edit has the focus on the DOM`);
      assert.notEqual(d.style.width, '0px', `${html}: not 0 px wide`);
      assert.equal(d.style.flexGrow, '', `${html}: no grow along its column`);
      dispose();
    }
  });

  it('shows a code block\'s long line wrapped, drawn and edited alike (Skia and the DOM)', () => {
    const long = 'const answer = compute(alpha, beta, gamma, delta, epsilon, zeta, eta, theta, iota, kappa, lambda, mu);';
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, `<pre><code>ab\n${long}</code></pre><p>after</p>`), { width: 480, height: 480 });
    skia.text();
    const drawn = items(skia, 3).find((/** @type {any} */ i) => /answer/.test(textOfItem(i)));
    const line = drawn.getBoundingClientRect();
    const rowHeight = items(skia, 3).find((/** @type {any} */ i) => textOfItem(i) === 'ab').getBoundingClientRect().height;
    assert.ok(line.height > rowHeight * 1.5, `drawn: the long line wraps (${line.height} for rows of ${rowHeight})`);
    pressWord(dom, skia, 'ab', 1);
    clock.advance(16);
    skia.text();
    const sk = skia.skia.focused;
    assert.equal(sk?.kind, 4, 'an Edit has the focus on Skia');
    const rows = skia.skia.rows(sk);
    assert.ok(rows.length >= 3, `edited: its rows wrap too (${rows.length})`);
    const e = sk.getBoundingClientRect();
    assert.ok(e.height >= rows.length * rowHeight - 1, `edited: every row shown (${e.height} for ${rows.length} rows of ${rowHeight})`);
    assert.ok(Math.abs(e.height - (rowHeight + line.height)) <= 2, `as high edited (${e.height}) as its lines drawn (${rowHeight + line.height})`);
    // The DOM: a textarea that grows with its content (field-sizing), no fixed height of source lines.
    const d = /** @type {any} */ (dom.document.activeElement);
    assert.equal(d.tagName, 'TEXTAREA');
    assert.equal(d.style.getPropertyValue('field-sizing'), 'content', 'it grows with its rows');
    assert.equal(d.style.height, '', 'no height of its own');
    dispose();
  });

  it('leaves a code block by the arrows from its first or last row (Skia and the DOM)', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>top</p><pre><code>ab\ncd</code></pre><p>bottom</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'ab', 1);
    clock.advance(16);
    const ids = eds.list.map(e => e.doc().blocks.map(b => b.id));
    const active = () => eds.list.map((e, i) => ids[i].indexOf(e.active()));
    assert.deepEqual(active(), [1, 1], 'in the code block');
    // Down on its first row and Up on its last stay among its rows.
    select(dom, skia, 1, 1);
    key(dom, skia, 'ArrowDown');
    clock.advance(16);
    assert.deepEqual(active(), [1, 1], 'Down on the first row: still the code block');
    select(dom, skia, 4, 4);
    key(dom, skia, 'ArrowUp');
    clock.advance(16);
    assert.deepEqual(active(), [1, 1], 'Up on the last row: still the code block');
    // Up anywhere on its first row leaves, not only from its start.
    select(dom, skia, 1, 1);
    key(dom, skia, 'ArrowUp');
    clock.advance(16);
    assert.deepEqual(active(), [0, 0], 'on its first row, Up leaves for the block above');
    pressWord(dom, skia, 'cd', 1);
    clock.advance(16);
    assert.deepEqual(active(), [1, 1]);
    select(dom, skia, 4, 4);
    key(dom, skia, 'ArrowDown');
    clock.advance(16);
    assert.deepEqual(active(), [2, 2], 'on its last row, Down leaves for the block below');
    dispose();
  });

  it('leaves a wrapped paragraph from its first or last drawn row, as its Edit\'s caretRow tells (Skia and the DOM)', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty';
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, `<p>top</p><p>${long}</p><p>bottom</p>`), { width: 480, height: 480 });
    pressWord(dom, skia, 'one', 1);
    clock.advance(16);
    const ids = eds.list.map(e => e.doc().blocks.map(b => b.id));
    const active = () => eds.list.map((e, i) => ids[i].indexOf(e.active()));
    assert.deepEqual(active(), [1, 1], 'in the long paragraph');
    const [d, s] = edits(dom, skia);
    const drawn = s.caretRow();
    assert.ok(drawn.rows >= 2, `Skia: one source line drawn in rows (${drawn.rows})`);
    // happy-dom lays nothing out: the DOM's Edit tells the rows a browser would draw, as many as Skia's.
    const end = long.length;
    d.caretRow = () => ({ row: d.selectionEnd === end ? drawn.rows - 1 : d.selectionEnd < 10 ? 0 : 1, rows: drawn.rows });
    // A caret in the middle of the first row: Down moves a row, Up leaves.
    select(dom, skia, 3, 3);
    assert.equal(s.caretRow().row, 0);
    key(dom, skia, 'ArrowDown');
    clock.advance(16);
    assert.deepEqual(active(), [1, 1], 'Down on the first row stays');
    select(dom, skia, 3, 3);
    key(dom, skia, 'ArrowUp');
    clock.advance(16);
    assert.deepEqual(active(), [0, 0], 'Up on the first drawn row leaves, the caret not at the start');
    pressWord(dom, skia, 'one', 1);
    clock.advance(16);
    const [d2, s2] = edits(dom, skia);
    d2.caretRow = () => ({ row: d2.selectionEnd === end ? drawn.rows - 1 : 0, rows: drawn.rows });
    // The caret at the end, on the last drawn row: Down leaves.
    select(dom, skia, end, end);
    assert.equal(s2.caretRow().row, drawn.rows - 1);
    key(dom, skia, 'ArrowDown');
    clock.advance(16);
    assert.deepEqual(active(), [2, 2], 'Down on the last drawn row leaves');
    dispose();
  });

  it('without caretRow (a worker\'s Handle), leaves a longer block from its first or last place only (DOM)', () => {
    const clock = manualClock();
    const eds = editors();
    const dom = onDom(editorView(clock, eds, '<p>top</p><pre><code>ab\ncd</code></pre><p>bottom</p>'));
    const ids = eds.list[0].doc().blocks.map(b => b.id);
    const active = () => ids.indexOf(eds.list[0].active());
    eds.list[0].activate(ids[1], 1);
    clock.advance(16);
    $flush(dom.root);
    const d = /** @type {any} */ (dom.nodes('Edit')[0]);
    d.caretRow = undefined;
    const press = (/** @type {string} */ k) => {
      d.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      $flush(dom.root);
      clock.advance(16);
    };
    d.focus();
    d.setSelectionRange(1, 1);
    press('ArrowUp');
    assert.equal(active(), 1, 'a caret inside its first row: still the code block');
    d.setSelectionRange(0, 0);
    press('ArrowUp');
    assert.equal(active(), 0, 'from its start, Up leaves');
    dom.dispose();
  });

  it('activates a short block without growing it: the next block stays put (Skia and the DOM)', () => {
    for (const [src, html] of [['ab', '<p>ab</p>'], ['ab', '<h2>ab</h2>'], ['ab', '<pre><code>ab</code></pre>'], ['ab\ncd', '<pre><code>ab\ncd</code></pre>']]) {
      const clock = manualClock();
      const eds = editors();
      const { dom, skia, dispose } = both(editorView(clock, eds, `<p>top</p>${html}<p>after</p>`), { width: 480, height: 480 });
      skia.text();
      const top = () => {
        skia.text();
        return items(skia, 3).find((/** @type {any} */ i) => textOfItem(i) === 'after').getBoundingClientRect().top;
      };
      const before = top();
      const row = items(skia, 3).find((/** @type {any} */ i) => textOfItem(i) === 'ab').getBoundingClientRect().height;
      pressWord(dom, skia, 'ab', 1);
      clock.advance(16);
      assert.equal(skia.skia.focused?.kind, 4, `${html}: editing`);
      assert.ok(Math.abs(top() - before) <= 1, `${html}: the next block keeps its place on Skia (${before} to ${top()})`);
      // The DOM: its least height is one row, over a field's own.
      const d = /** @type {any} */ (dom.document.activeElement);
      assert.equal(d.getAttribute('data-ren'), 'Edit');
      assert.equal(Math.round(parseFloat(d.style.minHeight)), Math.round(row), `${html}: one row at the least on the DOM`);
      dispose();
    }
  });

  it('leaves an input method\'s keys to it: a composing Enter or ArrowDown changes nothing (DOM)', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>abcd</p><p>next</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'abcd', 2);
    clock.advance(16);
    const e = eds.list[0];
    const before = [e.html(), e.active()];
    const [d] = edits(dom, skia);
    for (const k of ['Enter', 'ArrowDown']) {
      d.setSelectionRange(k === 'Enter' ? 2 : 4, k === 'Enter' ? 2 : 4);
      d.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, isComposing: true, bubbles: true, cancelable: true }));
      d.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, keyCode: 229, bubbles: true, cancelable: true }));
      $flush(dom.root);
      clock.advance(16);
    }
    assert.deepEqual([e.html(), e.active()], before, 'no split, no move to the next block');
    dispose();
  });

  it('takes a line break pasted or composed into a paragraph as a space, the caret after it (Skia and the DOM)', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>ab</p><p>next</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'ab', 1);
    clock.advance(16);
    // A paste of two lines between "a" and "b": the platform's value, the caret after what it put in.
    const [d, s] = edits(dom, skia);
    d.value = 'aone\ntwob';
    d.setSelectionRange(8, 8);
    d.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
    skia.skia.input('aone\r\ntwob', 9, 9);
    $flush(skia.root);
    clock.advance(16);
    const want = '<p>aone twob</p><p>next</p>';
    assert.deepEqual(eds.html(), [want, want], 'one paragraph, the break a space');
    assert.deepEqual(eds.list.map(e => e.text()), ['aone twob\nnext', 'aone twob\nnext'], 'no block more in its text');
    const [d2, s2] = edits(dom, skia);
    assert.deepEqual([d2.value, s2.draft], ['aone twob', 'aone twob']);
    assert.deepEqual([d2.selectionStart, s2.selectionStart], [8, 8], 'the caret after the pasted text');
    // An input method commits a word with a line break in it.
    select(dom, skia, 9, 9);
    d2.value = 'aone twobx\ry';
    d2.setSelectionRange(12, 12);
    d2.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
    if (skia.skia.focused !== s2) s2.focus();
    skia.skia.compose('x');
    skia.skia.commit('x\ry');
    $flush(skia.root);
    clock.advance(16);
    const typed = '<p>aone twobx y</p><p>next</p>';
    assert.deepEqual(eds.html(), [typed, typed]);
    const [d3, s3] = edits(dom, skia);
    assert.deepEqual([d3.selectionStart, s3.selectionStart], [12, 12]);
    dispose();
    // A code block keeps its lines.
    const [e, done] = bare('<pre><code>a</code></pre><p>a</p>');
    const [code, para] = e.doc().blocks.map(b => b.id);
    e.input(code, 'a\nb');
    e.input(para, 'a\r\nb\rc\nd');
    assert.equal(e.html(), '<pre><code>a\nb</code></pre><p>a b c d</p>', 'no view: \\r\\n, \\r and \\n each a space');
    done();
  });

  it('moves across blocks with ArrowUp and ArrowDown through key(id, e) with no view', () => {
    const [e, done] = bare('<p>one</p><hr><p>two</p>');
    const [first, , last] = e.doc().blocks.map(b => b.id);
    e.activate(first, 3);
    e.key(first, { key: 'ArrowDown' });
    assert.equal(e.active(), last, 'down to the next block, past the rule');
    e.key(last, { key: 'ArrowUp' });
    assert.equal(e.active(), first, 'up to the block before');
    e.key(first, { key: 'ArrowUp' });
    assert.equal(e.active(), first, 'none before the first');
    done();
  });

  it('places the caret after a flattened paste at once: typing before the next frame stays where it is (Skia and the DOM)', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>ab</p><p>next</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'ab', 1);
    clock.advance(16);
    // "x\ny" pasted after "a": shown flattened, the caret after the space's "y" before any frame.
    const [d, s] = edits(dom, skia);
    d.value = 'ax\nyb';
    d.setSelectionRange(4, 4);
    d.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
    skia.skia.input('ax\nyb', 4, 4);
    $flush(skia.root);
    assert.deepEqual([d.value, d.selectionStart], ['ax yb', 4], 'the DOM: the caret after the paste once the value is shown');
    assert.deepEqual([s.draft, s.selectionStart], ['ax yb', 4], 'Skia: the same');
    // "Z" typed before the frame, then the frame.
    type(dom, skia, 'Z');
    clock.advance(16);
    const want = '<p>ax yZb</p><p>next</p>';
    assert.equal(eds.html()[0], want);
    assert.equal(d.selectionStart, 5, 'the DOM: the caret stays after the typed "Z"');
    assert.deepEqual(eds.list[0].selection(), { id: eds.list[0].active(), from: 5, to: 5, known: true });
    assert.equal(eds.html()[1], want);
    assert.equal(s.selectionStart, 5, 'Skia: the caret stays after the typed "Z"');
    // An undo (the paste and the typing: one step) asks for the caret at the block's end on the next frame; text
    // typed at the start before it wins.
    key(dom, skia, 'z', { ctrlKey: true });
    select(dom, skia, 0, 0);
    type(dom, skia, 'Q');
    clock.advance(16);
    const undone = '<p>Qab</p><p>next</p>';
    assert.deepEqual(eds.html(), [undone, undone]);
    assert.deepEqual([d.selectionStart, s.selectionStart], [1, 1], 'the caret after the typed "Q", not at the end');
    dispose();
  });

  it('edits a wrapping paragraph as it is drawn: its rows and height kept (Skia and the DOM)', () => {
    const long = 'A paragraph long enough to wrap across more than one row of the editor, and a good deal more of it besides.';
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, `<p>top</p><p>${long}</p><p>after</p>`), { width: 480, height: 480 });
    skia.text();
    const drawn = items(skia, 3).find((/** @type {any} */ i) => textOfItem(i) === long).getBoundingClientRect();
    const row = items(skia, 3).find((/** @type {any} */ i) => textOfItem(i) === 'top').getBoundingClientRect().height;
    assert.ok(drawn.height > row * 1.5, `drawn: it wraps (${drawn.height} for rows of ${row})`);
    const after = () => {
      skia.text();
      return items(skia, 3).find((/** @type {any} */ i) => textOfItem(i) === 'after').getBoundingClientRect().top;
    };
    const before = after();
    pressWord(dom, skia, 'paragraph', 2);
    clock.advance(16);
    const sk = skia.skia.focused;
    assert.equal(sk?.kind, 4, 'editing on Skia');
    assert.equal(skia.skia.rows(sk).length, Math.round(drawn.height / row), 'as many rows edited as drawn');
    assert.ok(Math.abs(sk.getBoundingClientRect().height - drawn.height) <= 1, `as high edited (${sk.getBoundingClientRect().height}) as drawn (${drawn.height})`);
    assert.ok(Math.abs(after() - before) <= 1, 'the next block keeps its place');
    const d = /** @type {any} */ (dom.document.activeElement);
    assert.equal(d.tagName, 'TEXTAREA', 'the DOM: a wrapping field');
    assert.equal(d.style.getPropertyValue('field-sizing'), 'content', 'that grows with its rows');
    // Shift+Enter breaks no line in it; the arrows move among its rows, and leave from its first place.
    const html = eds.html();
    select(dom, skia, 5, 5);
    key(dom, skia, 'Enter', { shiftKey: true });
    clock.advance(16);
    assert.deepEqual(eds.html(), html, 'no line break');
    const ids = eds.list.map(e => e.doc().blocks.map(b => b.id));
    const active = () => eds.list.map((e, i) => ids[i].indexOf(e.active()));
    select(dom, skia, 60, 60);
    key(dom, skia, 'ArrowUp');
    clock.advance(16);
    // Skia lays it out: its Edit shows its rows (happy-dom lays out nothing, so its Edit reads as one row there).
    assert.equal(active()[1], 1, 'a row down the block: still in it (Skia)');
    select(dom, skia, 0, 0);
    key(dom, skia, 'ArrowUp');
    clock.advance(16);
    assert.deepEqual(active(), [0, 0], 'from its start: the block above');
    dispose();
  });

  it('links the selection from the link editor and removes the link', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>see docs</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'see');
    clock.advance(16);
    select(dom, skia, 4, 8);
    control(dom, skia, 'Link');
    // The link editor: an address field and Apply.
    const [du, su] = edits(dom, skia, 0); // the link editor, in the toolbar, before the block
    du.value = 'https://rui.example';
    du.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
    su.focus();
    skia.skia.input('https://rui.example', 15, 15);
    $flush(skia.root);
    dom.press('Apply');
    skia.press('Apply');
    clock.advance(16);
    assert.deepEqual(eds.html(), ['<p>see <a href="https://rui.example">docs</a></p>', '<p>see <a href="https://rui.example">docs</a></p>']);
    assert.equal(dom.nodes('Edit').length, 1, 'the link editor closed');
    select(dom, skia, 5, 5);
    control(dom, skia, 'Unlink');
    assert.deepEqual(eds.html(), ['<p>see docs</p>', '<p>see docs</p>'], 'a caret inside removes the whole link');
    dispose();
  });

  it('reads only when not editable: links pressable, blocks not edited; a placeholder in an empty document', () => {
    const clock = manualClock();
    /** @type {string[]} */
    const links = [];
    /** @type {ReturnType<typeof $editor>[]} */
    const list = [];
    const view = () => {
      const editor = $editor({ content: '<p>go <a href="https://x.y">there</a></p>', editable: false });
      list.push(editor);
      const empty = $editor();
      return (
        <Clock value={clock}>
          <Rui>
            <Editor store={editor}>
              <Editor.Content onLinkPress={(/** @type {string} */ href) => links.push(href)} />
            </Editor>
            <Editor store={empty}>
              <Editor.Content placeholder="Write here" />
            </Editor>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'go there Write here');
    assert.equal(skia.text(), 'go there Write here');
    span(dom, 'there').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    skia.press('there');
    clock.advance(16);
    assert.deepEqual(links, ['https://x.y', 'https://x.y']);
    assert.equal(dom.nodes('Edit').length, 0, 'no block edited');
    assert.deepEqual(list.map(e => e.active()), [-1, -1]);
    dispose();
  });
});

describe("the editor's actions and queries", () => {
  it('toggles marks and blocks, links, colors, aligns, reads the document out and loads another', () => {
    const clock = manualClock();
    /** @type {ReturnType<typeof $editor>[]} */
    const list = [];
    let changes = 0;
    const view = () => {
      const editor = $editor({ content: '<p>Hello</p>', onChange: e => (changes++, assert.equal(e, editor)) });
      list.push(editor);
      return (
        <Clock value={clock}>
          <Rui>
            <Editor store={editor}>
              <Editor.Content />
            </Editor>
          </Rui>
        </Clock>
      );
    };
    const { dispose } = both(view);
    for (const e of list) {
      e.activate(e.doc().blocks[0].id, 0, 5);
      clock.advance(16);
      e.toggle('bold');
      assert.equal(e.marked('bold'), true);
      e.link('https://rui.example');
      assert.equal(e.markValue('link'), 'https://rui.example');
      assert.equal(e.marked('link', 'https://x.y'), false);
      e.unlink();
      assert.equal(e.markValue('link'), null);
      e.colorText('#ff0000');
      assert.equal(e.markValue('color'), '#ff0000');
      e.colorText(null);
      e.toggle('highlight', '#ffc1bb');
      assert.equal(e.markValue('highlight'), '#ffc1bb');
      e.toggleBlock('heading', 2);
      assert.deepEqual([e.isBlock('heading'), e.isBlock('heading', 2), e.isBlock('heading', 1)], [true, true, false]);
      e.align('end');
      assert.equal(e.block()?.align, 'end');
      assert.equal(e.html(), '<h2 style="text-align: end"><strong><mark style="background-color: #ffc1bb">Hello</mark></strong></h2>');
      assert.deepEqual(e.json().blocks[0], { type: 'heading', text: 'Hello', level: 2, align: 'end', marks: [{ type: 'bold', from: 0, to: 5 }, { type: 'highlight', from: 0, to: 5, color: '#ffc1bb' }] });
      e.toggleBlock('bullet');
      e.insertRule();
      assert.equal(e.html().endsWith('</ul><hr><p></p>'), true);
      e.load({ blocks: [{ type: 'bullet', text: 'a' }, { type: 'bullet', text: 'b' }] });
      e.activate(e.doc().blocks[1].id);
      e.indent();
      assert.equal(e.html(), '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>');
      e.outdent();
      assert.equal(e.text(), 'a\nb');
      e.clearFormatting();
      assert.equal(e.html(), '<ul><li><p>a</p></li></ul><p>b</p>');
      e.undo();
      assert.equal(e.html(), '<ul><li><p>a</p></li><li><p>b</p></li></ul>');
    }
    assert.ok(changes >= 2 * 14, 'onChange after each change');
    dispose();
  });
});

describe('editor model: nesting, rules, alignment and the other marks', () => {
  const list = () => fromHTML('<ul><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ul>');

  it('nests list items under the item before them, their own items along; lifts them back', () => {
    const d = list();
    assert.equal(indent(d, d.blocks[0].id), d, 'the first item has nothing to nest under');
    const one = indent(d, d.blocks[1].id);
    assert.equal(toHTML(one), '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li><li><p>c</p></li></ul>');
    const two = indent(indent(one, one.blocks[2].id), one.blocks[2].id);
    assert.equal(toHTML(two), '<ul><li><p>a</p><ul><li><p>b</p><ul><li><p>c</p></li></ul></li></ul></li></ul>');
    assert.deepEqual(two.blocks.map(b => b.depth), [0, 1, 2]);
    // b lifts with c inside it; lifted at the top, an item leaves the list.
    assert.deepEqual(outdent(two, two.blocks[1].id).blocks.map(b => b.depth), [0, 0, 1]);
    assert.equal(toHTML(outdent(d, d.blocks[0].id)), '<p>a</p><ul><li><p>b</p></li><li><p>c</p></li></ul>');
    // Another list type at a depth is a list of its own there.
    const mixed = fromHTML('<ul><li><p>a</p><ol><li><p>1</p></li></ol><ul><li><p>x</p></li></ul></li></ul>');
    assert.deepEqual(mixed.blocks.map(b => [b.type, b.depth]), [['bullet', 0], ['ordered', 1], ['bullet', 1]]);
    assert.equal(toHTML(mixed), '<ul><li><p>a</p><ol><li><p>1</p></li></ol><ul><li><p>x</p></li></ul></li></ul>');
    const json = toJSON(one);
    assert.deepEqual(json.blocks, [{ type: 'bullet', text: 'a' }, { type: 'bullet', text: 'b', depth: 1 }, { type: 'bullet', text: 'c' }]);
    assert.equal(toHTML(fromJSON(json)), toHTML(one));
    // Enter in a nested item keeps its depth.
    assert.deepEqual(split(one, one.blocks[1].id, 1).doc.blocks.map(b => b.depth), [0, 1, 1, 0]);
  });

  it('horizontal rules: <hr>, a rule block in JSON, inserted after a block, gone at Backspace after them', () => {
    const d = fromHTML('<p>a</p><hr><p>b</p>');
    assert.deepEqual(d.blocks.map(b => b.type), ['paragraph', 'rule', 'paragraph']);
    assert.equal(toHTML(d), '<p>a</p><hr><p>b</p>');
    assert.deepEqual(toJSON(d).blocks[1], { type: 'rule' });
    assert.equal(toHTML(fromJSON(toJSON(d))), '<p>a</p><hr><p>b</p>');
    const made = insertRule(one('x'), 1);
    assert.equal(toHTML(made.doc), '<p>x</p><hr><p></p>', 'a paragraph after a rule at the end');
    assert.equal(made.id, made.doc.blocks[2].id);
    const joined = join(d, d.blocks[2].id);
    assert.equal(toHTML(/** @type {any} */ (joined).doc), '<p>a</p><p>b</p>');
  });

  it('focus waits for an Edit built after the frame, on the Clock of the view the Editor is in', () => {
    const clock = manualClock();
    /** @type {ReturnType<typeof $editor>[]} */
    const list = [];
    const view = () => {
      // Made outside the view's Clock: the Editor hands it that Clock.
      const editor = $editor({ content: '<p>Hello</p>' });
      list.push(editor);
      return (
        <Clock value={clock}>
          <Rui>
            <Editor store={editor} />
          </Rui>
        </Clock>
      );
    };
    const { dispose } = both(view);
    for (const e of list) {
      assert.ok(!Object.keys(e).some(k => /clock/i.test(k)), 'no Clock member on the handle');
      const id = e.doc().blocks[0].id;
      e.activate(id, 1, 3);
      clock.advance(16);
      /** @type {any[]} */
      const calls = [];
      const node = { focus: () => calls.push('focus'), setSelectionRange: (/** @type {number} */ a, /** @type {number} */ b) => calls.push([a, b]) };
      e.bind(id, node);
      assert.deepEqual(calls, [], 'not while it registers: it is not in the page yet');
      clock.advance(16);
      assert.ok(calls.includes('focus'), 'the Edit built late still takes the focus, the frame after');
      assert.deepEqual(calls.find(c => Array.isArray(c)), [1, 3], 'with the selection asked for');
    }
    dispose();
  });

  it('focus reaches a real Edit built after the frame, once it is in the page (ren-dom)', () => {
    const clock = manualClock();
    /** @type {ReturnType<typeof $editor>[]} */
    const list = [];
    /** @type {any} */
    let shown = null;
    const view = () => {
      const editor = $editor({ content: '<p>Hello</p>' });
      list.push(editor);
      shown = $signal($active(), false);
      return (
        <Clock value={clock}>
          <Rui>
            <Show when={shown}>
              <Editor store={editor}>
                <Editor.Content />
              </Editor>
            </Show>
          </Rui>
        </Clock>
      );
    };
    const dom = onDom(view);
    const e = list[0];
    e.activate(e.doc().blocks[0].id, 1, 3);
    clock.advance(16);
    $write(shown, true);
    $flush(dom.root);
    clock.advance(16);
    $flush(dom.root);
    const edit = dom.document.activeElement;
    assert.equal(edit?.getAttribute?.('data-ren'), 'Edit', 'the Edit built late has the focus');
    assert.deepEqual([edit.selectionStart, edit.selectionEnd], [1, 3]);
    dom.dispose();
  });

  it('reads a character reference past Unicode, a surrogate or NUL as U+FFFD, as a browser does', () => {
    const textOf = (/** @type {string} */ html) => fromHTML(`<p>${html}</p>`).blocks[0].text;
    for (const ref of ['&#x110000;', '&#99999999999;', '&#9999999999999999999999999999999999;', '&#xD800;', '&#xdfff;', '&#55296;', '&#0;']) {
      assert.equal(textOf(`a${ref}b`), 'a\ufffdb', ref);
    }
    assert.equal(textOf('&#x1F600;&#65;&#x10FFFF;'), '\u{1F600}A\u{10FFFF}', 'the valid ones read as they are');
  });

  it('reads the references 0x80 to 0x9F as windows-1252 characters, as the HTML standard does', () => {
    const textOf = (/** @type {string} */ html) => fromHTML(`<p>${html}</p>`).blocks[0].text;
    assert.equal(textOf('1&#150;2'), '1\u20132', 'an en dash');
    assert.equal(textOf('&#x93;hi&#x94;'), '\u201chi\u201d', 'curly double quotes');
    assert.equal(textOf('&#128;&#x9F;&#153;'), '\u20ac\u0178\u2122', 'the euro, Y with diaeresis, the trade mark');
    assert.equal(textOf('&#x81;&#x8D;'), '\u0081\u008d', 'the five windows-1252 leaves empty stay as they are');
  });

  it('a heading level is a whole 1 to 4, whatever it was given', () => {
    const levels = [2.5, NaN, 0, -3, 9, Infinity, 3.99, '2', null].map(level => /** @type {any} */ (fromJSON({ blocks: [{ type: 'heading', text: 'x', level: /** @type {any} */ (level) }] })).blocks[0].level);
    assert.deepEqual(levels, [2, 1, 1, 1, 4, 4, 3, 2, 1]);
    const d = createDoc([{ type: 'paragraph', text: 'x' }]);
    for (const [level, tag] of /** @type {[any, string][]} */ ([[2.5, 'h2'], [NaN, 'h1'], [7, 'h4']])) {
      assert.equal(toHTML(setBlock(d, d.blocks[0].id, 'heading', level)), `<${tag}>x</${tag}>`, String(level));
    }
  });

  it('keeps only safe link addresses: http(s), mailto, tel, relative and #; any other scheme makes no link', () => {
    const linkOf = (/** @type {string} */ href) => fromHTML(`<p><a href="${href}">x</a></p>`).blocks[0];
    for (const bad of ['javascript:alert(1)', ' JaVa\tScRiPt:alert(1)', '\u0001javascript:alert(1)', 'data:text/html,hi', 'vbscript:x']) {
      const b = linkOf(bad);
      assert.equal(b.text, 'x', `${JSON.stringify(bad)}: the text stays`);
      assert.deepEqual(b.marks, [], `${JSON.stringify(bad)}: no link`);
    }
    for (const good of ['https://rui.example/a', 'http://rui.example', 'mailto:ada@rui.example', 'tel:+1555', '/docs', 'page.html', '#top', '?q=1']) {
      assert.equal(linkOf(good).marks[0]?.href, good, `${good} kept`);
    }
    const d = one('x');
    const id = d.blocks[0].id;
    assert.deepEqual(setMark(d, id, 0, 1, 'link', true, 'javascript:alert(1)').blocks[0].marks, [], 'setMark (link()) makes no unsafe link');
    const made = /** @type {any} */ ({ blocks: [{ ...d.blocks[0], marks: [{ type: 'link', from: 0, to: 1, href: 'javascript:alert(1)' }] }], next: d.next });
    assert.equal(toHTML(made), '<p>x</p>', 'toHTML writes no unsafe link');
    assert.equal(toHTML(fromJSON({ blocks: [{ type: 'paragraph', text: 'x', marks: [{ type: 'link', from: 0, to: 1, href: 'javascript:1' }] }] })), '<p>x</p>', 'nor from JSON');
  });

  it('keeps only plain color tokens in text colors and highlights; anything else drops the mark', () => {
    const bad = ['url(https://t.example/q)', 'red; position: fixed; inset: 0; background: url(https://t.example/q)', 'expression(alert(1))', 'rgb(0,0,0) url(x)', 'var(--x)', 'image(red)', 'color-mix(in srgb, red, blue)', 'rgb(var(--x))', 'hsl(1 2% 3%) , url(x)', 'lab(1\\2 3)'];
    for (const color of bad) {
      const viaHTML = fromHTML(`<p><mark style="background-color: ${color}">y</mark><span style="color: ${color}">z</span></p>`);
      assert.doesNotMatch(toHTML(viaHTML), /url\(|position|expression|var\(/, `${color}: nothing but a color token written from HTML`);
      const viaJSON = fromJSON({ blocks: [{ type: 'paragraph', text: 'yz', marks: [{ type: 'highlight', from: 0, to: 1, color }, { type: 'color', from: 1, to: 2, color }] }] });
      assert.equal(toHTML(viaJSON), '<p>yz</p>', `${color}: no mark from JSON`);
    }
    for (const color of ['#ffc1bb', '#abc', 'teal', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'hsl(120 50% 40% / 0.5)', 'hsla(120, 50%, 40%, .5)', 'hsl(120deg 50% 50%)', 'oklch(70% 0.1 200)', 'lab(50% 40 59.5)', 'hwb(12 50% 0%)', 'lch(52.2% 72.2 50 / 0.5)', 'oklab(59% 0.1 0.1)', 'color(display-p3 1 0.5 0)', 'rgb(none 0 0)']) {
      const d = fromJSON({ blocks: [{ type: 'paragraph', text: 'yz', marks: [{ type: 'highlight', from: 0, to: 1, color }, { type: 'color', from: 1, to: 2, color }] }] });
      assert.equal(toHTML(d), `<p><mark style="background-color: ${color}">y</mark><span style="color: ${color}">z</span></p>`, `${color} kept`);
    }
  });

  it('a mark color parseColor reads draws the same on Skia as its hex; a CSS name is CSS, not a theme shade', () => {
    const clock = manualClock();
    const colors = ['#008000', 'hsl(120, 100%, 25%)', 'rgb(0 128 0)', 'rgb(0, 128, 0)'];
    const html = `<p>${colors.map((c, i) => `<span style="color: ${c}">C${i}</span>`).join(' ')} <mark style="background-color: hsl(120, 100%, 25%)">M</mark> <span style="color: red">R</span> <span style="color: #ff0000">X</span></p>`;
    const { dom, skia, dispose } = both(
      () => (
        <Clock value={clock}>
          <Rui>
            <Editor store={$editor({ content: html })}>
              <Editor.Content />
            </Editor>
          </Rui>
        </Clock>
      ),
      { width: 800, height: 300 },
    );
    clock.advance(16);
    $flush(dom.root);
    $flush(skia.root);
    /** @type {Map<string, any>} */
    const drawn = new Map();
    const walk = (/** @type {any} */ n) => {
      for (let c = n.first; c !== null; c = c.next) {
        if (c.spans) for (const sp of c.spans) drawn.set(c.joined.slice(sp.start, sp.end), sp.style ?? {});
        walk(c);
      }
    };
    walk(skia.skia.root);
    const inks = colors.map((_, i) => drawn.get(`C${i}`)?.color);
    assert.ok(typeof inks[0] === 'number', `the hex draws as a color: ${inks[0]}`);
    assert.deepEqual(inks, Array(colors.length).fill(inks[0]), 'hsl and both rgb forms draw as the hex does');
    assert.equal(drawn.get('M')?.background, inks[0], 'a highlight too');
    assert.equal(drawn.get('X')?.color, 0xffff0000, '#ff0000 is its ARGB');
    const red = [...dom.document.body.querySelectorAll('span')].find((/** @type {any} */ n) => n.textContent === 'R');
    assert.match(red?.getAttribute('style') ?? '', /color: red/, 'a pasted CSS red draws as CSS red, not a theme shade');
    const spans = [...dom.document.body.querySelectorAll('span')].filter((/** @type {any} */ n) => /^C\d$/.test(n.textContent));
    assert.equal(spans.length, colors.length, 'the DOM draws each');
    dispose();
  });

  it('keeps a no-break space: &nbsp; reads as a space that never collapses, and spaces write back as such', () => {
    assert.equal(fromHTML('<p>a&nbsp;&nbsp;b</p>').blocks[0].text, 'a  b', 'two spaces kept');
    assert.equal(fromHTML('<p>a \n b</p>').blocks[0].text, 'a b', 'ASCII whitespace still collapses');
    for (const text of ['a  b', ' a', 'a ', 'a   b']) {
      const html = toHTML(one(text));
      assert.equal(fromHTML(html).blocks[0].text, text, `${JSON.stringify(text)} survives ${html}`);
    }
    assert.equal(toHTML(one('a b')), '<p>a b</p>', 'a lone inner space stays plain');
  });

  it('text alignment: a text-align style in HTML, align in JSON', () => {
    const d = setAlign(fromHTML('<h2>T</h2><p>p</p>'), 1, 'end');
    const c = setAlign(d, 2, 'center');
    assert.equal(toHTML(c), '<h2 style="text-align: end">T</h2><p style="text-align: center">p</p>');
    assert.deepEqual(toJSON(c).blocks, [
      { type: 'heading', text: 'T', level: 2, align: 'end' },
      { type: 'paragraph', text: 'p', align: 'center' },
    ]);
    assert.equal(toHTML(fromHTML(toHTML(c))), toHTML(c));
    assert.equal(toHTML(fromJSON(toJSON(c))), toHTML(c));
    assert.equal(split(c, 2, 1).doc.blocks[2].align, 'center', 'Enter keeps the alignment');
    assert.equal(toHTML(setAlign(c, 2, 'start')), '<h2 style="text-align: end">T</h2><p>p</p>');
    assert.deepEqual(fromHTML('<p style="text-align: right">r</p><p style="text-align: left">l</p>').blocks.map(b => b.align), ['end', 'start'], 'CSS right and left read as the end and the start');
  });

  it('subscript, superscript, highlight and text color marks in HTML and JSON', () => {
    let d = setMark(one('H2O x2 hi red'), 1, 1, 2, 'subscript', true);
    d = setMark(d, 1, 5, 6, 'superscript', true);
    d = setMark(d, 1, 7, 9, 'highlight', true);
    d = setMark(d, 1, 10, 13, 'color', true, '#e34f40');
    const html = '<p>H<sub>2</sub>O x<sup>2</sup> <mark>hi</mark> <span style="color: #e34f40">red</span></p>';
    assert.equal(toHTML(d), html);
    assert.equal(toHTML(fromHTML(html)), html);
    assert.equal(toHTML(setMark(d, 1, 1, 2, 'superscript', true)), html.replace('<sub>2</sub>', '<sup>2</sup>'), 'one excludes the other');
    const colored = setMark(d, 1, 7, 9, 'highlight', true, '#ffc1bb');
    const mark = '<mark style="background-color: #ffc1bb">hi</mark>';
    assert.equal(toHTML(colored), html.replace('<mark>hi</mark>', mark));
    assert.equal(toHTML(fromHTML(toHTML(colored))), toHTML(colored));
    assert.equal(toHTML(fromHTML('<p><mark style="background: #ffc1bb">hi</mark></p>')), '<p><mark style="background-color: #ffc1bb">hi</mark></p>', 'background reads too, and writes as background-color');
    const json = toJSON(colored);
    assert.deepEqual(json.blocks[0].marks, [
      { type: 'subscript', from: 1, to: 2 },
      { type: 'superscript', from: 5, to: 6 },
      { type: 'highlight', from: 7, to: 9, color: '#ffc1bb' },
      { type: 'color', from: 10, to: 13, color: '#e34f40' },
    ]);
    assert.equal(toHTML(fromJSON(json)), toHTML(colored));
    assert.ok(hasMark(colored.blocks[0], 'color', 10, 13, '#e34f40') && !hasMark(colored.blocks[0], 'color', 10, 13, '#000000'));
    assert.equal(toHTML(fromHTML('<p><span>plain</span> <span style="color: red">r</span></p>')), '<p>plain <span style="color: red">r</span></p>', 'a span without a color is text');
  });

  it("markdown shortcuts at a paragraph's start, typed up to the caret", () => {
    assert.deepEqual(shortcut('# ', 2), { length: 2, type: 'heading', level: 1 });
    assert.deepEqual(shortcut('### x', 4), { length: 4, type: 'heading', level: 3 });
    assert.equal(shortcut('# x', 3), null, 'only where the caret ends it');
    assert.deepEqual([shortcut('- ', 2)?.type, shortcut('* ', 2)?.type, shortcut('12. ', 4)?.type, shortcut('> ', 2)?.type, shortcut('```', 3)?.type, shortcut('---', 3)?.type], ['bullet', 'bullet', 'ordered', 'quote', 'code', 'rule']);
    assert.equal(shortcut('##### ', 6), null, 'headings 1 to 4');
  });
});

/** An editor with the controls for nesting, rules, alignment and the new marks. @param {any} clock @param {ReturnType<typeof editors>} eds @param {any} content */
const moreView = (clock, eds, content) => () => (
  <Clock value={clock}>
    <Rui>
      <Editor store={eds.make(content)}>
        <Editor.Toolbar>
          <Editor.Group>
            <Editor.Rule />
            <Editor.Align value="start" />
            <Editor.Align value="center" />
            <Editor.Align value="end" />
            <Editor.Align value="justify" />
            <Editor.Sub />
            <Editor.Sup />
            <Editor.Highlight />
            <Editor.Swatch color="red.6" />
            <Editor.Uncolor />
            <Editor.Undo />
          </Editor.Group>
        </Editor.Toolbar>
        <Editor.Content />
      </Editor>
    </Rui>
  </Clock>
);

describe('Editor: nesting, rules, alignment, marks and shortcuts on the DOM and on Skia', () => {
  const TOOLS = 'x₂ x² H';

  it('Tab nests a list item, Shift+Tab lifts it; nested markers', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(moreView(clock, eds, '<ul><li><p>one</p></li><li><p>two</p></li></ul><ol><li><p>a</p></li><li><p>b</p></li></ol>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'two');
    clock.advance(16);
    key(dom, skia, 'Tab');
    clock.advance(16);
    const nested = '<ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul><ol><li><p>a</p></li><li><p>b</p></li></ol>';
    assert.deepEqual(eds.html(), [nested, nested]);
    assert.deepEqual(edits(dom, skia).map((/** @type {any} */ e) => e.value ?? e.draft), ['two', 'two'], 'still edited');
    key(dom, skia, 'ArrowDown');
    clock.advance(16);
    key(dom, skia, 'ArrowDown');
    clock.advance(16);
    key(dom, skia, 'Tab');
    clock.advance(16);
    key(dom, skia, 'ArrowUp');
    clock.advance(16);
    const text = `${TOOLS} • one ◦ two 1. a 1. b`;
    assert.equal(dom.text(), text);
    assert.equal(skia.text(), text);
    // The nested item sits a marker's width further in.
    const left = (/** @type {string} */ t) => Math.round(items(skia, 3).find(i => i.text === t).getBoundingClientRect().left);
    assert.equal(left('◦') - left('•'), 24);
    key(dom, skia, 'Tab', { shiftKey: true });
    clock.advance(16);
    const lifted = '<ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul><p>a</p><ol><li><p>b</p></li></ol>';
    assert.deepEqual(eds.html(), [lifted, lifted], 'a lifted out of its list at the top, b a list again');
    dispose();
  });

  it('the Rule control, the align controls and the marks controls', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(moreView(clock, eds, '<p>Hello world</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'Hello');
    clock.advance(16);
    control(dom, skia, 'Align center');
    assert.deepEqual(eds.html(), ['<p style="text-align: center">Hello world</p>', '<p style="text-align: center">Hello world</p>']);
    assert.deepEqual(eds.list.map(e => e.block()?.align), ['center', 'center']);
    clock.advance(16);
    select(dom, skia, 6, 11);
    control(dom, skia, 'Raise');
    clock.advance(16);
    select(dom, skia, 0, 5);
    control(dom, skia, 'Mark');
    clock.advance(16);
    select(dom, skia, 0, 5);
    control(dom, skia, 'Color red.6');
    clock.advance(16);
    const marked = '<p style="text-align: center"><mark><span style="color: #b63636">Hello</span></mark> <sup>world</sup></p>';
    assert.deepEqual(eds.html(), [marked, marked]);
    assert.deepEqual(eds.list.map(e => e.marked('color')), [true, true]);
    control(dom, skia, 'Divider');
    clock.advance(16);
    const ruled = `${marked}<hr><p></p>`;
    assert.deepEqual(eds.html(), [ruled, ruled]);
    // Drawn now: the marks show; the rule is a line; the paragraph centered.
    const hello = span(dom, 'Hello');
    assert.match(hello.getAttribute('style'), /background: #fde5c9/, 'the Mark amber 1');
    assert.match(hello.getAttribute('style'), /color: #b63636/);
    const para = items(skia, 3).find(i => i.spans !== null && i.joined === 'Hello world');
    const size = (/** @type {string} */ t) => para.spans.find((/** @type {any} */ s) => para.joined.slice(s.start, s.end) === t).size;
    assert.ok(size('world') < size('Hello'), 'superscript: smaller type');
    assert.match(span(dom, 'world').getAttribute('style'), /font-size: 12px/, 'superscript: two steps below its text (xs) on the DOM');
    skia.text();
    const h = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'Hello');
    assert.ok(h[2] > 100, 'centered');
    control(dom, skia, 'Undo');
    clock.advance(16);
    assert.deepEqual(eds.html(), [marked, marked]);
    dispose();
  });

  it('markdown shortcuts: "# ", "- ", "1. ", "> ", "```" and "---" typed at the start; undo keeps the typed text', () => {
    for (const [typed, html] of /** @type {const} */ ([
      ['# ', '<h1></h1>'],
      ['### ', '<h3></h3>'],
      ['- ', '<ul><li><p></p></li></ul>'],
      ['1. ', '<ol><li><p></p></li></ol>'],
      ['> ', '<blockquote><p></p></blockquote>'],
      ['```', '<pre><code></code></pre>'],
      ['---', '<hr><p></p>'],
    ])) {
      const clock = manualClock();
      const eds = editors();
      const { dom, skia, dispose } = both(moreView(clock, eds, '<p></p>'), { width: 480, height: 480 });
      eds.list.forEach(e => e.activate(e.doc().blocks[0].id, 0));
      clock.advance(16);
      type(dom, skia, typed);
      clock.advance(16);
      assert.deepEqual(eds.html(), [html, html], typed);
      if (typed === '# ') {
        type(dom, skia, 'Title');
        clock.advance(16);
        assert.deepEqual(eds.html(), ['<h1>Title</h1>', '<h1>Title</h1>']);
        eds.list.forEach(e => (e.undo(), e.undo()));
        assert.deepEqual(eds.html(), ['<p>#&nbsp;</p>', '<p>#&nbsp;</p>'], 'undo turns the shortcut back into its text');
      }
      dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// The edited block's marks, shown in its Edit's runs

/**
 * What the edited block's Edit shows styled, on each renderer: its runs as
 * `[text, marks]` (b bold, i italic, u underline, s strike, c a color, g a
 * background, m monospace), or null while it shows its value plain. The
 * DOM: its mirror's spans, while shown; Skia: its spans while their text is
 * its draft.
 * @param {any} dom @param {any} skia
 */
function shownRuns(dom, skia) {
  const [d, s] = edits(dom, skia);
  const mirror = d.nextSibling;
  const shown = mirror?.hasAttribute?.('data-ren-mirror') === true && mirror.style.display !== 'none';
  // A run's background is a layer of the field's own at the span's box: each span laid out as wide as its index and one
  // (happy-dom lays nothing out, and keeps only a layer's size beside a background shorthand), the field told it
  // scrolled so its layers are placed again.
  const spans = shown ? [...mirror.firstChild.children] : [];
  spans.forEach((/** @type {any} */ n, /** @type {number} */ i) => (n.getClientRects = () => [{ left: 0, top: 0, right: 1 + i, bottom: 1, width: 1 + i, height: 1 }]));
  if (shown) d.dispatchEvent(new d.ownerDocument.defaultView.Event('scroll'));
  const layers = String(d.style.getPropertyValue('background-size')).split(', ');
  const onDom = !shown ? null : spans.map((/** @type {any} */ n, /** @type {number} */ i) => {
    const css = n.getAttribute('style') ?? '';
    const marks = [/font-weight: 700/.test(css) && 'b', /font-style: italic/.test(css) && 'i', /underline/.test(css) && 'u', /line-through/.test(css) && 's', /(^|[^-])color:/.test(css) && 'c', layers.includes(`${1 + i}px 1px`) && 'g', /font-family/.test(css) && 'm'];
    return [n.textContent, marks.filter(Boolean).join('')];
  });
  skia.skia.present();
  const onSkia = s.spans === null || s.joined !== s.draft ? null : s.spans.map((/** @type {any} */ sp) => {
    const st = sp.style;
    const marks = [sp.face & 1 && 'b', sp.face & 2 && 'i', sp.underline && 'u', sp.strike && 's', st.color !== null && st.color !== undefined && 'c', sp.bg !== -1 && 'g', sp.face & 4 && 'm'];
    return [s.joined.slice(sp.start, sp.end), marks.filter(Boolean).join('')];
  });
  return [onDom, onSkia];
}

describe("Editor: the edited block's marks in its Edit", () => {
  it('shows the marks of the block being edited as the Edit\'s runs; code tinted in the Edit\'s family, sub plain', () => {
    const clock = manualClock();
    const eds = editors();
    const html = '<p>Hello <strong>bold</strong> <em>it</em> <u>u</u> <s>s</s> <a href="u">link</a> <mark>hi</mark> <code>x()</code> <sub>2</sub></p>';
    const { dom, skia, dispose } = both(editorView(clock, eds, html), { width: 640, height: 480 });
    pressWord(dom, skia, 'Hello');
    clock.advance(16);
    const want = [['Hello ', ''], ['bold', 'b'], [' ', ''], ['it', 'i'], [' ', ''], ['u', 'u'], [' ', ''], ['s', 's'], [' ', ''], ['link', 'uc'], [' ', ''], ['hi', 'g'], [' ', ''], ['x()', 'g'], [' ', ''], ['2', '']];
    assert.deepEqual(shownRuns(dom, skia), [want, want]);
    assert.equal(edits(dom, skia)[0].getAttribute('data-ren-runs'), '', "the DOM field's own text gives way to its mirror");
    assert.deepEqual(eds.html(), [html, html], 'the document is unchanged');
    dispose();
  });

  it('keeps the runs in sync with the value as the user types', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>Hello <strong>world</strong></p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'Hello');
    clock.advance(16);
    select(dom, skia, 11, 11);
    type(dom, skia, '!!');
    const at = [['Hello ', ''], ['world!!', 'b']];
    assert.deepEqual(shownRuns(dom, skia), [at, at], 'typed at the end of the bold word: in it');
    select(dom, skia, 0, 0);
    type(dom, skia, 'Oh ');
    const front = [['Oh Hello ', ''], ['world!!', 'b']];
    assert.deepEqual(shownRuns(dom, skia), [front, front]);
    // A selection across the mark's start typed over.
    select(dom, skia, 7, 11);
    type(dom, skia, 'X');
    const [d, s] = edits(dom, skia);
    assert.deepEqual([d.value, s.draft], ['Oh HellXrld!!', 'Oh HellXrld!!']);
    const [onDom, onSkia] = shownRuns(dom, skia);
    assert.deepEqual(onDom, onSkia);
    assert.equal(onDom?.map(r => r[0]).join(''), 'Oh HellXrld!!', 'the runs are the value');
    assert.deepEqual(onDom?.filter(r => r[1] === 'b').map(r => r[0]).join(''), 'rld!!', 'the bold rest');
    dispose();
  });

  it('shows bold toggled on a selection in the edited block', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p>Hello world</p>'), { width: 480, height: 480 });
    pressWord(dom, skia, 'Hello');
    clock.advance(16);
    assert.deepEqual(shownRuns(dom, skia), [null, null], 'no marks: plain');
    select(dom, skia, 6, 11);
    control(dom, skia, 'Bold');
    clock.advance(16);
    const bold = [['Hello ', ''], ['world', 'b']];
    assert.deepEqual(shownRuns(dom, skia), [bold, bold]);
    select(dom, skia, 0, 5);
    control(dom, skia, 'Italic');
    clock.advance(16);
    const both2 = [['Hello', 'i'], [' ', ''], ['world', 'b']];
    assert.deepEqual(shownRuns(dom, skia), [both2, both2]);
    select(dom, skia, 6, 11);
    control(dom, skia, 'Bold');
    clock.advance(16);
    const off = [['Hello', 'i'], [' world', '']];
    assert.deepEqual(shownRuns(dom, skia), [off, off], 'toggled off again');
    dispose();
  });
});

// ---------------------------------------------------------------------------
// The color picker control

/** An editor with the color picker control and its palette. @param {any} clock @param {ReturnType<typeof editors>} eds @param {any} content */
const pickerView = (clock, eds, content) => () => (
  <Clock value={clock}>
    <Rui>
      <Editor store={eds.make(content)}>
        <Editor.Toolbar>
          <Editor.Colors colors={['#2a2e36', '#b63636', '#4b5ec8']} picker={{ swatches: ['#05803a'] }} />
        </Editor.Toolbar>
        <Editor.Content />
      </Editor>
    </Rui>
  </Clock>
);

/** The Actions labeled `label` shown on the DOM, the portal's too. @param {any} dom @param {string} label */
const domLabeled = (dom, label) =>
  [...dom.document.body.querySelectorAll(`[data-ren="Action"][aria-label="${label}"]`)].filter((/** @type {any} */ n) => {
    for (let x = n; x != null && x.style !== undefined; x = x.parentElement) if (x.style.display === 'none') return false;
    return true;
  });

/** The Actions labeled `label` on Skia, the overlay's too. @param {any} skia @param {string} label */
function skiaLabeled(skia, label) {
  skia.skia.present();
  /** @type {any[]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      if (c.kind === 5 && c.label === label) out.push(c);
      walk(c);
    }
  };
  walk(skia.skia.root);
  walk(skia.skia.overlay);
  return out;
}

/** Presses the Action labeled `label`, in the page or a popover, as a pointer does (down, up, click) on both. @param {any} dom @param {any} skia @param {string} label */
function pressLabeled(dom, skia, label) {
  const node = domLabeled(dom, label)[0];
  if (node === undefined) throw new Error(`no "${label}" on the DOM`);
  const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 };
  node.dispatchEvent(new dom.window.PointerEvent('pointerdown', at));
  node.dispatchEvent(new dom.window.PointerEvent('pointerup', { ...at, buttons: 0 }));
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  $flush(dom.root);
  const item = skiaLabeled(skia, label)[0];
  if (item === undefined) throw new Error(`no "${label}" on Skia`);
  const r = item.getBoundingClientRect();
  skia.skia.press(r.left + r.width / 2, r.top + r.height / 2);
  skia.skia.release(r.left + r.width / 2, r.top + r.height / 2);
  $flush(skia.root);
}

describe('Editor.Colors on the DOM and on Skia', () => {
  it('opens one panel: a swatch colors the selection and closes; no color clears; Custom… opens the picker in place', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(pickerView(clock, eds, '<p>Hello world</p>'), { width: 480, height: 480 });
    const settle = () => {
      clock.advance(200);
      $flush(dom.root);
      $flush(skia.root);
    };
    const shown = (/** @type {string} */ label) => [domLabeled(dom, label).length > 0, skiaLabeled(skia, label).length > 0];
    const picker = () => shown('#05803a');
    pressWord(dom, skia, 'Hello');
    settle();
    select(dom, skia, 0, 5);
    assert.deepEqual(shown('Color #b63636'), [false, false], 'closed at first');
    pressLabeled(dom, skia, 'Ink');
    settle();
    assert.deepEqual(shown('Color #b63636'), [true, true], 'the swatches open');
    assert.deepEqual(shown('Default color'), [true, true], 'the no-color swatch among them');
    assert.deepEqual(shown('Custom…'), [true, true], 'and the Custom… entry');
    assert.deepEqual(picker(), [false, false], 'the picker closed until asked for');
    pressLabeled(dom, skia, 'Color #b63636');
    settle();
    const red = '<p><span style="color: #b63636">Hello</span> world</p>';
    assert.deepEqual(eds.html(), [red, red], 'the selection colored');
    assert.deepEqual(shown('Color #b63636'), [false, false], 'and the panel closed');
    assert.deepEqual(eds.list.map(e => e.markValue('color')), ['#b63636', '#b63636']);
    // The control's swatch shows the selection's color.
    const swatch = domLabeled(dom, 'Ink')[0].querySelector('[data-ren="View"]');
    assert.match(swatch.getAttribute('style'), /background: #b63636/);
    assert.equal(skiaLabeled(skia, 'Ink')[0].first.style.background, 0xffb63636, 'on Skia too');

    select(dom, skia, 0, 5);
    pressLabeled(dom, skia, 'Ink');
    settle();
    pressLabeled(dom, skia, 'Custom…');
    settle();
    assert.deepEqual(shown('Color #b63636'), [true, true], 'the swatches stay beside the picker');
    assert.deepEqual(picker(), [true, true], 'the picker opens in the same panel');
    pressLabeled(dom, skia, '#05803a');
    settle();
    const green = '<p><span style="color: #05803a">Hello</span> world</p>';
    assert.deepEqual(eds.html(), [green, green], 'the picker sets the color as it changes');
    assert.deepEqual(shown('Custom…'), [true, true], 'and the panel stays open');
    pressLabeled(dom, skia, 'Default color');
    settle();
    assert.deepEqual(eds.html(), ['<p>Hello world</p>', '<p>Hello world</p>'], 'the color cleared');
    assert.deepEqual(shown('Default color'), [false, false], 'and closed');
    assert.deepEqual(eds.list.map(e => e.markValue('color')), [null, null]);

    select(dom, skia, 6, 11);
    pressLabeled(dom, skia, 'Ink');
    settle();
    assert.deepEqual([shown('Color #4b5ec8'), picker()], [[true, true], [false, false]], 'each opening starts on the swatches');
    assert.deepEqual(eds.html(), ['<p>Hello world</p>', '<p>Hello world</p>'], 'unchanged');
    dispose();
  });

  it('shows every theme hue when no colors are given', () => {
    const clock = manualClock();
    const eds = editors();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Editor store={eds.make('<p>Hi</p>')}>
            <Editor.Toolbar>
              <Editor.Colors />
            </Editor.Toolbar>
            <Editor.Content />
          </Editor>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    pressLabeled(dom, skia, 'Ink');
    clock.advance(200);
    $flush(dom.root);
    $flush(skia.root);
    const hues = Object.keys(BASE_THEME.colors).map(name => `Color ${BASE_THEME.colors[name][BASE_THEME.accentShade.light]}`);
    for (const label of hues) assert.equal(domLabeled(dom, label).length > 0 && skiaLabeled(skia, label).length > 0, true, label);
    dispose();
  });
});

describe('Editor labels and parts', () => {
  it('keys its labels by part, with values as arguments', () => {
    assert.deepEqual([LABELS.bold, LABELS.strike, LABELS.heading(3), LABELS.align('end'), LABELS.swatch('teal'), LABELS.colors, LABELS.uncolor, LABELS.colorsCustom], ['Bold', 'Strike out', 'Title 3', 'Align end', 'Color teal', 'Ink', 'Default color', 'Custom…']);
  });

  it('draws the toolbar on the sunken ground, its controls borderless squares as tall as a small field', () => {
    const clock = manualClock();
    const eds = editors();
    const { dom, skia, dispose } = both(editorView(clock, eds, '<p><strong>ab</strong></p>'), { width: 480, height: 480 });
    const bar = dom.document.body.querySelector('[role="toolbar"]');
    assert.match(bar.getAttribute('style'), new RegExp(`background: ${pageColors(BASE_THEME, 'light').sunken}`));
    const bold = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === 'Bold');
    const css = bold.getAttribute('style');
    assert.match(css, new RegExp(`width: ${BASE_THEME.sizes.control.sm}px`));
    assert.doesNotMatch(css, /border-width: [1-9]/);
    const item = items(skia, 5).find(i => i.label === 'Bold');
    assert.equal(Math.round(item.getBoundingClientRect().width), BASE_THEME.sizes.control.sm, 'on Skia too');
    dispose();
  });

  it('says where a part goes when it is used outside an Editor', () => {
    assert.throws(() => both(() => <Editor.Bold />), /an Editor part goes inside an Editor/);
  });
});
