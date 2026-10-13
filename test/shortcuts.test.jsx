// rui-core's keyboard shortcuts: the grammar a shortcut is written in, how a
// key event matches it, `$shortcuts` on plain events, and its root-wide and
// `onKey` forms on the DOM and on Skia.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { $root, $dispose, $flush, $read } from 'rrx-core';
import { View, Label, Action, Edit } from 'ren-core';
import { $shortcuts, $counter } from 'rui-core/hooks';
import { chordOf, eventChords } from '../src/hooks/shortcuts.js';
import { both } from './harness.jsx';

/** A plain key event that records whether its default was prevented. @param {Record<string, any>} fields */
function key(fields) {
  const event = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, prevented: false, ...fields };
  return Object.assign(event, { preventDefault: () => void (event.prevented = true) });
}

/** Whether `text` matches `fields` on `os`. @param {string} text @param {Record<string, any>} fields @param {string} [os] */
const matches = (text, fields, os = 'linux') => eventChords(key(fields)).includes(chordOf(text, os));

describe('shortcuts: the grammar', () => {
  it('reads modifier words and their synonyms in one fixed order', () => {
    assert.equal(chordOf('ctrl+k'), 'ctrl+k');
    assert.equal(chordOf('control+K'), 'ctrl+k');
    for (const word of ['alt', 'option', 'opt', 'Alt']) assert.equal(chordOf(`${word}+x`), 'alt+x');
    for (const word of ['meta', 'cmd', 'command', 'win', 'super', 'CMD']) assert.equal(chordOf(`${word}+x`), 'meta+x');
    assert.equal(chordOf('meta+shift+alt+ctrl+z'), 'ctrl+alt+shift+meta+z');
  });

  it('resolves primary to Cmd on macOS and iOS, Ctrl elsewhere', () => {
    for (const os of ['macos', 'ios']) assert.equal(chordOf('primary+K', os), 'meta+k', os);
    for (const os of ['windows', 'linux', 'unknown']) assert.equal(chordOf('primary+K', os), 'ctrl+k', os);
    assert.equal(chordOf('primary+shift+p', 'macos'), 'shift+meta+p');
  });

  it('takes a letter in any case as the key itself, key names in any case, and the short names', () => {
    assert.equal(chordOf('K'), 'k', 'K is the K key, not Shift+K');
    assert.equal(chordOf('Enter'), 'enter');
    assert.equal(chordOf('ESCAPE'), 'escape');
    assert.equal(chordOf('ctrl+arrowup'), 'ctrl+arrowup');
    assert.equal(chordOf('shift+PageDown'), 'shift+pagedown');
    assert.equal(chordOf('F5'), 'f5');
    assert.equal(chordOf('space'), 'space');
    assert.equal(chordOf('ctrl+plus'), 'ctrl+plus');
    assert.equal(chordOf('esc'), 'escape');
    assert.equal(chordOf('Del'), 'delete');
    assert.equal(chordOf('ctrl+?'), 'ctrl+?');
    assert.equal(chordOf('/'), '/');
  });

  it('ignores the space around each part', () => {
    assert.equal(chordOf(' ctrl + shift +  k '), 'ctrl+shift+k');
    assert.equal(chordOf('primary + P', 'windows'), 'ctrl+p');
  });

  it('throws on an empty text or part, no key, two keys and a repeated modifier, naming the text', () => {
    for (const text of ['', '   ', 'ctrl++', '+k', 'ctrl+ +k', 'ctrl+shift', 'a+b', 'ctrl+up+x', 'ctrl+control+k', 'cmd+meta+k', 'primary+primary+k', 'primary+ctrl+k']) {
      assert.throws(() => chordOf(text, 'linux'), (/** @type {Error} */ e) => e.message.startsWith(`RUI: shortcut "${text}": `), JSON.stringify(text));
    }
  });
});

describe('shortcuts: matching', () => {
  it('needs exactly the modifiers written: none extra, none missing', () => {
    assert.ok(matches('ctrl+k', { key: 'k', ctrlKey: true }));
    assert.ok(!matches('ctrl+k', { key: 'k', ctrlKey: true, altKey: true }), 'an extra modifier');
    assert.ok(!matches('ctrl+shift+k', { key: 'k', ctrlKey: true }), 'a missing modifier');
    assert.ok(!matches('k', { key: 'K', shiftKey: true }), 'Shift with a letter is written');
    assert.ok(matches('shift+k', { key: 'K', shiftKey: true }));
    assert.ok(matches('Escape', { key: 'Escape' }));
    assert.ok(matches('space', { key: ' ' }));
    assert.ok(matches('ArrowUp', { key: 'ArrowUp' }));
  });

  it('matches primary+K to Cmd+K on macOS and Ctrl+K elsewhere', () => {
    assert.ok(matches('primary+K', { key: 'k', metaKey: true }, 'macos'));
    assert.ok(!matches('primary+K', { key: 'k', ctrlKey: true }, 'macos'));
    assert.ok(matches('primary+K', { key: 'k', ctrlKey: true }, 'windows'));
    assert.ok(!matches('primary+K', { key: 'k', metaKey: true }, 'windows'));
  });

  it('lets a symbol ignore the Shift that types it unless shift is written', () => {
    assert.ok(matches('primary+?', { key: '?', ctrlKey: true, shiftKey: true, code: 'Slash' }), 'Ctrl+Shift+/ on a US layout');
    assert.ok(matches('primary+?', { key: '?', ctrlKey: true }), 'a layout with ? unshifted');
    assert.ok(matches('shift+?', { key: '?', shiftKey: true }));
    assert.ok(!matches('shift+?', { key: '?' }), 'shift written needs Shift');
    assert.ok(matches('primary+plus', { key: '+', ctrlKey: true, shiftKey: true, code: 'Equal' }));
    assert.ok(!matches('ctrl+space', { key: ' ', ctrlKey: true, shiftKey: true }), 'the space is not a symbol');
    assert.ok(!matches('ctrl+1', { key: '1', ctrlKey: true, shiftKey: true }), 'a digit is not a symbol');
  });

  it("matches by the key's position when its code names a letter or digit", () => {
    assert.ok(matches('ctrl+shift+1', { key: '!', ctrlKey: true, shiftKey: true, code: 'Digit1' }));
    assert.ok(matches('alt+s', { key: 'ß', altKey: true, code: 'KeyS' }), 'Alt changes the character');
    assert.ok(matches('ctrl+5', { key: 'Clear', ctrlKey: true, code: 'Numpad5' }));
    assert.ok(matches('ctrl+z', { key: 'z', ctrlKey: true, code: 'KeyY' }), 'the key first');
    assert.ok(matches('ctrl+y', { key: 'z', ctrlKey: true, code: 'KeyY' }), 'then its position');
    assert.ok(!matches('ctrl+f', { key: 'ArrowUp', ctrlKey: true, code: 'ArrowUp' }), 'other codes name nothing');
  });

  it('never matches while an input method composes or without a key', () => {
    assert.deepEqual(eventChords(key({ key: 'k', ctrlKey: true, isComposing: true })), []);
    assert.deepEqual(eventChords(key({ ctrlKey: true, code: 'KeyK' })), []);
    assert.deepEqual(eventChords(null), []);
    assert.ok(!matches('ctrl+k', { key: 'k', ctrlKey: true, isComposing: true }));
  });
});

describe('$shortcuts on plain events', () => {
  /** @type {any} */
  let R;
  beforeEach(() => (R = $root('shortcuts')));
  afterEach(() => $dispose(R));

  it('runs every matching entry in the map order, each with the event', () => {
    /** @type {string[]} */
    const log = [];
    /** @type {any[]} */
    const seen = [];
    const onKey = $shortcuts(
      {
        'ctrl+?': e => (log.push('question'), seen.push(e)),
        'ctrl+shift+?': () => log.push('shifted'),
        'ctrl + /': () => log.push('slash'),
        'Control+?': () => log.push('again'),
        'ctrl+k': () => log.push('k'),
      },
      { os: 'linux' },
    );
    const event = key({ key: '?', code: 'Slash', ctrlKey: true, shiftKey: true });
    onKey(event);
    assert.deepEqual(log, ['question', 'shifted', 'again']);
    assert.equal(seen[0], event);
    onKey(key({ key: 'j', ctrlKey: true }));
    assert.deepEqual(log, ['question', 'shifted', 'again'], 'no match runs nothing');
  });

  it("prevents the default unless allowDefault, the entry's before the options'", () => {
    const hit = $shortcuts({ a: () => {}, b: { run: () => {}, allowDefault: true }, c: { run: () => {}, allowDefault: false } }, { os: 'linux' });
    const loose = $shortcuts({ a: () => {}, c: { run: () => {}, allowDefault: false } }, { allowDefault: true, os: 'linux' });
    const run = (/** @type {any} */ handler, /** @type {string} */ k) => {
      const event = key({ key: k });
      handler(event);
      return event.prevented;
    };
    assert.deepEqual([run(hit, 'a'), run(hit, 'b'), run(hit, 'c'), run(hit, 'x')], [true, false, true, false]);
    assert.deepEqual([run(loose, 'a'), run(loose, 'c')], [false, true]);
  });

  it('takes a root first, reads primary on the given os, and throws on a bad shortcut at once', () => {
    let n = 0;
    const onKey = $shortcuts(R, { 'primary+s': () => n++ }, { os: 'macos' });
    onKey(key({ key: 's', ctrlKey: true }));
    onKey(key({ key: 's', metaKey: true }));
    assert.equal(n, 1);
    assert.throws(() => $shortcuts(R, { 'ctrl+shift': () => {} }), /RUI: shortcut "ctrl\+shift": /);
    assert.throws(() => $shortcuts({ 'ctrl+k': /** @type {any} */ ({ allowDefault: true }) }), /RUI: shortcut "ctrl\+k": /);
  });
});

describe('$shortcuts on the DOM and on Skia', () => {
  /** A view with a button, a field and root-wide shortcuts; `stop` removes them. @param {Record<string, any>} options */
  function setup(options) {
    /** @type {any[]} */
    const hits = [];
    /** @type {(() => void)[]} */
    const stops = [];
    /** @type {any[]} */
    const refs = [];
    const view = () => {
      const n = $counter(0);
      hits.push(n);
      stops.push($shortcuts({ 'primary+J': () => n.add() }, { global: true, os: 'linux', ...options }));
      return (
        <View style={{ padding: 8 }}>
          <Action label="Go" ref={(/** @type {any} */ n) => refs.push(n)}>Go</Action>
          <Edit label="Note" value="" ref={(/** @type {any} */ n) => refs.push(n)} />
          <Label>{() => `hits ${$read(n.value)}`}</Label>
        </View>
      );
    };
    const { dom, skia, dispose } = both(view);
    const d = {
      /** @param {Record<string, any>} [at] a node to press it in */
      key(at) {
        const node = at ?? dom.document.activeElement ?? dom.document.body;
        node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', ctrlKey: true, bubbles: true, cancelable: true }));
        $flush(dom.root);
      },
    };
    const s = {
      key() {
        skia.skia.key('j', false, { ctrlKey: true });
        $flush(skia.root);
      },
    };
    return { dom, skia, d, s, hits, stops, refs, dispose, texts: () => [dom.text().replace(/.*hits/, 'hits'), skia.text().replace(/.*hits/, 'hits')] };
  }

  it('global hears keys with nothing focused and from a focus inside; its removal stops it', () => {
    const t = setup({});
    t.d.key();
    t.s.key();
    assert.deepEqual(t.texts(), ['hits 1', 'hits 1'], 'nothing focused');
    const [domGo, , skiaGo] = t.refs;
    domGo.focus();
    skiaGo.focus();
    assert.equal(t.skia.skia.focused, skiaGo, 'Skia: the button has the focus');
    t.d.key();
    t.s.key();
    assert.deepEqual(t.texts(), ['hits 2', 'hits 2'], 'from a focus inside');
    for (const stop of t.stops) stop();
    t.d.key();
    t.s.key();
    assert.deepEqual(t.texts(), ['hits 2', 'hits 2'], 'removed');
    t.dispose();
  });

  it('global leaves a key typed in a field alone unless fields is true', () => {
    for (const [fields, count] of /** @type {const} */ ([[false, 0], [true, 1]])) {
      const t = setup({ fields });
      const [, domNote, , skiaNote] = t.refs;
      domNote.focus();
      skiaNote.focus();
      assert.equal(t.skia.skia.focused, skiaNote, 'Skia: the field has the focus');
      t.d.key();
      t.s.key();
      assert.deepEqual(t.texts(), [`hits ${count}`, `hits ${count}`], `fields ${fields}`);
      t.dispose();
    }
  });

  it("an Edit's onKey handler fires on both renderers", () => {
    /** @type {any[]} */
    const edits = [];
    const view = () => {
      const n = $counter(0);
      const onKey = $shortcuts({ 'shift+Enter': () => n.add(), esc: { run: () => n.add(), allowDefault: true } });
      return (
        <View>
          <Edit value="" onKey={onKey} ref={(/** @type {any} */ e) => edits.push(e)} />
          <Label>{() => `hits ${$read(n.value)}`}</Label>
        </View>
      );
    };
    const { dom, skia, dispose } = both(view);
    const [domEdit, skiaEdit] = edits;
    domEdit.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    domEdit.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    domEdit.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    skiaEdit.focus();
    skia.skia.key('Enter', true, { shiftKey: true });
    skia.skia.key('Escape');
    skia.skia.key('Enter');
    assert.equal(dom.text().replace(/.*hits/, 'hits'), 'hits 2');
    assert.equal(skia.text().replace(/.*hits/, 'hits'), 'hits 2');
    dispose();
  });
});
