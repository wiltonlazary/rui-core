// ColorInput on the DOM and on Skia: the draft and the value, commits and
// the format they are written in, the panel's opening rules, the preview
// sample and the eye dropper.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active, Label } from 'ren-core';
import { manualClock, ColorInput } from 'rui-core';
import { pair, app, layer } from './overlay-harness.jsx';
import { items, tap } from './inputs-harness.jsx';

/**
 * A ColorInput on both renderers, with a record per root of its changes,
 * commits and open changes, and drivers that act on both at once.
 * @param {(rec: Record<string, any>) => Record<string, any>} [propsOf] the props, given the root's record
 */
function setup(propsOf = () => ({})) {
  const clock = manualClock();
  /** @type {Record<string, any>[]} */
  const recs = [];
  const view = app(clock, () => {
    /** @type {Record<string, any>} */
    const rec = { changes: [], commits: [], opens: [] };
    recs.push(rec);
    return <ColorInput label="Tint" onChange={(/** @type {string} */ c) => rec.changes.push(c)} onCommit={(/** @type {string} */ c) => rec.commits.push(c)} {...propsOf(rec)} />;
  });
  const p = pair(view);
  const dEdit = () => p.d.nodes('Edit')[0];
  const sEdit = () => items(p.skia, 4)[0];
  const settle = () => {
    clock.advance(250);
    p.flush();
  };
  const t = {
    ...p,
    clock,
    recs,
    /** Each root's record field. @param {string} name */
    each: name => recs.map(r => r[name]),
    focus() {
      dEdit().focus();
      sEdit().focus();
      p.flush();
    },
    blur() {
      dEdit().blur();
      sEdit().blur();
      p.flush();
    },
    /** Replaces the whole draft, as a paste over everything. @param {string} text */
    put(text) {
      const node = dEdit();
      node.value = text;
      node.dispatchEvent(new p.dom.window.Event('input', { bubbles: true }));
      $flush(p.dom.root);
      p.skia.skia.input(text, text.length, text.length);
      $flush(p.skia.root);
    },
    /** A key in the field on both. @param {string} key @param {Record<string, any>} [more] */
    key(key, more = {}) {
      dEdit().dispatchEvent(new p.dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...more }));
      $flush(p.dom.root);
      p.skia.skia.key(key);
      $flush(p.skia.root);
    },
    /** A press on the field on both. */
    press() {
      p.d.tap(dEdit());
      tap(p.skia, sEdit());
      p.flush();
    },
    /** The field's text on each renderer. */
    shown: () => {
      p.flush();
      return [dEdit().value, sEdit().draft];
    },
    /** Whether each renderer shows the invalid look. */
    invalid: () => {
      p.flush();
      return [dEdit().getAttribute('aria-invalid') === 'true', sEdit().invalid === true];
    },
    /** Whether the panel shows on each renderer (its hue slider). */
    open: () => {
      settle();
      return [p.d.nodes('Action').some(n => n.getAttribute('aria-label') === 'Hue'), p.s.items().some(i => i.label === 'Hue')];
    },
    settle,
  };
  return t;
}

/** Hex colors of the swatch strip. */
const SWATCHES = ['#3a7bd5', '#e8590c', '#2f9e44'];

describe('ColorInput: the draft and the value', () => {
  it('typing changes the value only with a color, as typed; Enter commits once in the format', () => {
    const t = setup(() => ({ picker: false, defaultValue: '#3a7bd5' }));
    t.focus();
    t.put('rgb(40, 16');
    assert.deepEqual(t.shown(), ['rgb(40, 16', 'rgb(40, 16']);
    assert.deepEqual(t.each('changes'), [[], []], 'an invalid prefix leaves the value alone');
    t.put('rgb(40, 160, 90)');
    assert.deepEqual(t.each('changes'), [['rgb(40, 160, 90)'], ['rgb(40, 160, 90)']], 'a color is the value as typed');
    assert.deepEqual(t.shown(), ['rgb(40, 160, 90)', 'rgb(40, 160, 90)'], 'no rewrite while typing');
    assert.deepEqual(t.each('commits'), [[], []], 'typing alone never commits');
    t.key('Enter');
    assert.deepEqual(t.each('changes'), [['rgb(40, 160, 90)', '#28a05a'], ['rgb(40, 160, 90)', '#28a05a']], 'the commit writes it in the format');
    assert.deepEqual(t.each('commits'), [['#28a05a'], ['#28a05a']]);
    assert.deepEqual(t.shown(), ['#28a05a', '#28a05a']);
    t.blur();
    assert.deepEqual(t.each('commits'), [['#28a05a'], ['#28a05a']], 'leaving after Enter commits nothing more');
    t.dispose();
  });

  it('leaving commits a change; nothing changed commits nothing', () => {
    const t = setup(() => ({ picker: false, defaultValue: 'rgb(40, 160, 90)', format: 'rgb' }));
    t.focus();
    t.blur();
    t.focus();
    t.key('Enter');
    t.blur();
    assert.deepEqual(t.each('commits'), [[], []], 'no change, no commit');
    assert.deepEqual(t.each('changes'), [[], []], 'and no rewrite of a value it was given');
    t.focus();
    t.put('#3a7bd5');
    t.blur();
    assert.deepEqual(t.each('commits'), [['rgb(58, 123, 213)'], ['rgb(58, 123, 213)']]);
    assert.deepEqual(t.shown(), ['rgb(58, 123, 213)', 'rgb(58, 123, 213)']);
    t.dispose();
  });

  it('an emptied draft is no color: the value is ""', () => {
    const t = setup(() => ({ picker: false, defaultValue: '#3a7bd5' }));
    t.focus();
    t.put('');
    assert.deepEqual(t.each('changes'), [[''], ['']]);
    t.blur();
    assert.deepEqual(t.each('commits'), [[''], ['']]);
    assert.deepEqual(t.shown(), ['', '']);
    t.dispose();
  });

  it('revert shows the value again after an invalid draft; revert={false} keeps it, invalid', () => {
    const a = setup(() => ({ picker: false, defaultValue: '#3a7bd5' }));
    a.focus();
    a.put('nope');
    a.blur();
    assert.deepEqual(a.shown(), ['#3a7bd5', '#3a7bd5']);
    assert.deepEqual(a.invalid(), [false, false]);
    assert.deepEqual(a.each('changes'), [[], []]);
    a.dispose();
    const b = setup(() => ({ picker: false, defaultValue: '#3a7bd5', revert: false }));
    b.focus();
    b.put('nope');
    assert.deepEqual(b.invalid(), [false, false], 'not invalid while still typing');
    b.blur();
    assert.deepEqual(b.shown(), ['nope', 'nope'], 'the draft stays');
    assert.deepEqual(b.invalid(), [true, true], 'with the invalid look');
    assert.deepEqual(b.each('changes'), [[], []], 'the value untouched');
    b.focus();
    b.put('#2f9e44');
    assert.deepEqual(b.invalid(), [false, false], 'a color clears it');
    assert.deepEqual(b.each('changes'), [['#2f9e44'], ['#2f9e44']]);
    b.dispose();
  });

  it('a format change alone does not rewrite the value; the next commit writes it', () => {
    /** @type {any[]} */
    const formats = [];
    const t = setup(rec => {
      const f = $signal($active(), 'hex');
      formats.push(f);
      rec.format = f;
      return { picker: false, defaultValue: '#ff0000', format: f };
    });
    for (const f of formats) $write(f, 'hsl');
    t.flush();
    assert.deepEqual(t.each('changes'), [[], []]);
    assert.deepEqual(t.shown(), ['#ff0000', '#ff0000']);
    t.focus();
    t.put('#00ff00');
    t.key('Enter');
    assert.deepEqual(t.each('commits'), [['hsl(120, 100%, 50%)'], ['hsl(120, 100%, 50%)']]);
    t.dispose();
  });

  it('a value from outside replaces the draft', () => {
    /** @type {any[]} */
    const values = [];
    const t = setup(() => {
      const v = $signal($active(), '#3a7bd5');
      values.push(v);
      return { picker: false, revert: false, value: v };
    });
    t.focus();
    t.put('nope');
    t.blur();
    assert.deepEqual(t.shown(), ['nope', 'nope']);
    for (const v of values) $write(v, '#e8590c');
    assert.deepEqual(t.shown(), ['#e8590c', '#e8590c']);
    assert.deepEqual(t.invalid(), [false, false]);
    t.dispose();
  });
});

describe('ColorInput: the panel', () => {
  it('a press opens it; taking focus does not; ArrowDown does', () => {
    const t = setup();
    t.focus();
    assert.deepEqual(t.open(), [false, false], 'focus alone opens nothing');
    t.key('ArrowDown');
    assert.deepEqual(t.open(), [true, true], 'ArrowDown opens it');
    t.key('Escape');
    assert.deepEqual(t.open(), [false, false], 'Escape closes it');
    assert.equal(t.d.focused(), t.d.nodes('Edit')[0], 'the focus stays in the field');
    t.press();
    assert.deepEqual(t.open(), [true, true], 'a press opens it');
    t.key('Tab');
    assert.deepEqual(t.open(), [false, false], 'Tab closes it');
    t.focus();
    t.key('ArrowDown', { altKey: true });
    assert.deepEqual(t.open(), [true, true], 'Alt+ArrowDown opens it');
    t.d.tap(layer(t.dom));
    t.s.at(470, 350);
    assert.deepEqual(t.open(), [false, false], 'a press outside closes it');
    t.dispose();
  });

  it('a swatch press sets and commits; sticky={false} closes it after', () => {
    const a = setup(() => ({ swatches: SWATCHES, picker: false }));
    a.press();
    a.d.tap(a.d.nodes('Action').find(n => n.getAttribute('aria-label') === '#e8590c'));
    const item = a.s.items().find(i => i.label === '#e8590c');
    const r = item.getBoundingClientRect();
    a.s.at(r.left + r.width / 2, r.top + r.height / 2);
    assert.deepEqual(a.each('commits').map(c => c.at(-1)), ['#e8590c', '#e8590c']);
    assert.deepEqual(a.shown(), ['#e8590c', '#e8590c']);
    a.dispose();
    const b = setup(() => ({ swatches: SWATCHES, picker: false, sticky: false }));
    b.press();
    assert.deepEqual(b.open().slice(0, 1), [false], 'a swatch-only panel shows no hue slider');
    b.d.tap(b.d.nodes('Action').find(n => n.getAttribute('aria-label') === '#2f9e44'));
    const box = b.s.items().find(i => i.label === '#2f9e44').getBoundingClientRect();
    b.s.at(box.left + box.width / 2, box.top + box.height / 2);
    b.settle();
    assert.deepEqual([b.d.nodes('Action').some(n => n.getAttribute('aria-label') === '#2f9e44'), b.s.items().some(i => i.label === '#2f9e44' && i.getBoundingClientRect().width > 0)], [false, false], 'closed after the swatch');
    assert.deepEqual(b.each('commits'), [['#2f9e44'], ['#2f9e44']]);
    b.dispose();
  });

  it('no panel without content; none while disabled or read-only', () => {
    const none = setup(() => ({ picker: false }));
    none.press();
    none.key('ArrowDown');
    assert.equal(none.d.nodes('View').some(n => n.getAttribute('role') === 'dialog'), false, 'no Popover at all');
    assert.equal(none.d.nodes('Edit')[0].getAttribute('aria-haspopup'), null);
    none.dispose();
    for (const lock of [{ disabled: true }, { readOnly: true }]) {
      const t = setup(() => lock);
      t.press();
      t.focus();
      t.key('ArrowDown');
      assert.deepEqual(t.open(), [false, false], JSON.stringify(lock));
      t.dispose();
    }
  });

  it('typing={false}: the text is read-only, and Enter or Space opens it', () => {
    const t = setup(() => ({ typing: false, defaultValue: '#3a7bd5' }));
    assert.equal(t.d.nodes('Edit')[0].readOnly, true);
    t.focus();
    t.key('Enter');
    assert.deepEqual(t.open(), [true, true]);
    t.key('Escape');
    t.key(' ');
    assert.deepEqual(t.open(), [true, true]);
    t.dispose();
  });

  it('open is controlled; the popover option’s trio serves when the field’s is not given', () => {
    /** @type {any[]} */
    const opens = [];
    const t = setup(rec => {
      const o = $signal($active(), false);
      opens.push(o);
      return { open: o, onOpenChange: (/** @type {boolean} */ v) => rec.opens.push(v) };
    });
    t.press();
    assert.deepEqual(t.open(), [false, false], 'a press only asks');
    assert.deepEqual(t.each('opens'), [[true], [true]]);
    for (const o of opens) $write(o, true);
    assert.deepEqual(t.open(), [true, true]);
    t.key('Escape');
    assert.deepEqual(t.each('opens'), [[true, false], [true, false]]);
    t.dispose();
    const p = setup(rec => ({ popover: { defaultOpen: true, onOpenChange: (/** @type {boolean} */ v) => rec.opens.push(v) } }));
    assert.deepEqual(p.open(), [true, true], 'the popover’s defaultOpen');
    p.focus();
    p.key('Escape');
    assert.deepEqual(p.each('opens'), [[false], [false]]);
    assert.deepEqual(p.open(), [false, false]);
    p.dispose();
  });

  it('a picker gesture’s end commits in the format', () => {
    const t = setup(() => ({ defaultValue: '#3a7bd5', format: 'rgb' }));
    t.press();
    const dThumb = t.d.nodes('Action').find(n => n.getAttribute('aria-label') === 'Hue');
    dThumb.focus();
    dThumb.dispatchEvent(new t.dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    const sThumb = t.s.items().find(i => i.label === 'Hue');
    sThumb.focus();
    t.skia.skia.key('Home');
    t.flush();
    const [dc, sc] = t.each('commits');
    assert.equal(dc.length, 1);
    assert.deepEqual(dc, sc);
    assert.match(dc[0], /^rgb\(/);
    t.dispose();
  });
});

describe('ColorInput: the preview and the eye dropper', () => {
  it('a Swatch of the value leads; transparent when empty; start replaces it', () => {
    const t = setup(() => ({ picker: false, defaultValue: 'rgb(40, 160, 90)' }));
    const sample = () => t.d.nodes('View').find(n => n.getAttribute('aria-hidden') === 'true' && /background/.test(n.getAttribute('style') ?? ''));
    assert.match(sample().getAttribute('style'), /#28a05a|rgb\(40, 160, 90\)/);
    t.focus();
    t.put('');
    t.blur();
    assert.match(sample().getAttribute('style'), /transparent/);
    t.dispose();
    const s = setup(() => ({ picker: false, defaultValue: '#3a7bd5', start: <Label text="custom" /> }));
    assert.equal(s.d.nodes('View').some(n => n.getAttribute('aria-hidden') === 'true' && /#3a7bd5/.test(n.getAttribute('style') ?? '')), false);
    s.dispose();
    const off = setup(() => ({ picker: false, defaultValue: '#3a7bd5', preview: false }));
    assert.equal(off.d.nodes('View').some(n => /#3a7bd5/.test(n.getAttribute('style') ?? '')), false);
    off.dispose();
  });

  it('the eye dropper: shown where the platform has one; a pick sets and commits in the format', async () => {
    const g = /** @type {any} */ (globalThis);
    const absent = setup(() => ({ picker: false }));
    assert.equal(absent.d.nodes('Action').some(n => n.getAttribute('aria-label') === 'Pick a color from the screen'), false, 'absent without the platform');
    absent.dispose();
    let answer = /** @type {any} */ ({ sRGBHex: '#2f9e44' });
    /** The platform's last answer, awaited in place of a guessed wait. @type {Promise<any>} */
    let asked = Promise.resolve();
    g.EyeDropper = class {
      open() {
        asked = answer === null ? Promise.reject(new Error('canceled')) : Promise.resolve(answer);
        return asked;
      }
    };
    /** Waits for the pick the field asked for, and for the field's own step after it. */
    const picked = async () => {
      await asked.catch(() => {});
      await Promise.resolve();
    };
    try {
      const t = setup(() => ({ picker: false, format: 'hsl', defaultValue: '#3a7bd5' }));
      const dButton = () => t.d.nodes('Action').find(n => n.getAttribute('aria-label') === 'Pick a color from the screen');
      assert.ok(dButton(), 'shown with the platform');
      t.d.tap(dButton());
      await picked();
      t.flush();
      assert.deepEqual(t.recs[0].commits, ['hsl(131, 54%, 40%)']);
      assert.deepEqual(t.recs[0].changes, ['hsl(131, 54%, 40%)']);
      assert.deepEqual(t.open().slice(0, 1), [false], 'its press opens no panel');
      answer = null;
      t.d.tap(dButton());
      await picked();
      t.flush();
      assert.deepEqual(t.recs[0].commits, ['hsl(131, 54%, 40%)'], 'a canceled pick changes nothing');
      t.dispose();
      const locked = setup(() => ({ picker: false, readOnly: true }));
      const b = locked.d.nodes('Action').find(n => n.getAttribute('aria-label') === 'Pick a color from the screen');
      assert.equal(b.getAttribute('aria-disabled'), 'true', 'disabled, not hidden, while read-only');
      locked.dispose();
      const off = setup(() => ({ picker: false, eyedropper: false }));
      assert.equal(off.d.nodes('Action').some(n => n.getAttribute('aria-label') === 'Pick a color from the screen'), false);
      off.dispose();
      const named = setup(() => ({ picker: false, eyedropper: { label: 'Sample' } }));
      assert.ok(named.d.nodes('Action').some(n => n.getAttribute('aria-label') === 'Sample'));
      named.dispose();
    } finally {
      delete g.EyeDropper;
    }
  });
});
