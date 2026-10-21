// rui's own menus on the DOM and on Skia: a text field's (`editMenu` 'app':
// Undo, Redo, Cut, Copy, Paste, Select all through the Edit's actions) and
// the text menu over static text (`textMenu`: Copy, Select text), opened by
// a right press or the keys, with the same text, presses and state on both.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';
import { editOf, selectedText } from 'ren-core';
import { Rui, Clock, manualClock, themeOf, TextInput, PasswordInput, Autocomplete, Text, Button, Menu } from 'rui-core';
import { ContextMenu } from 'rui-core/more';
import { pair } from './overlay-harness.jsx';

const APP = themeOf({ control: { editMenu: 'app' } });
const TEXT = themeOf({ control: { textMenu: 'text' } });
const ALL = themeOf({ control: { textMenu: 'all' } });

/** The field menu's items as both renderers show them in node (no platform known: Ctrl's words). */
const ITEMS = 'Undo Ctrl+Z Redo Ctrl+Shift+Z Cut Ctrl+X Copy Ctrl+C Paste Ctrl+V Select all Ctrl+A';

/**
 * The values a field's onChange gave, and `count(n)`: resolves once it has
 * given `n` (an edit the menu makes after the clipboard's promise).
 */
function changes() {
  /** @type {string[]} */
  const list = [];
  /** @type {(() => void) | null} */
  let woken = null;
  return {
    list,
    /** @param {string} v */
    push(v) {
      list.push(v);
      woken?.();
    },
    /** @param {number} n */
    async count(n) {
      while (list.length < n) await new Promise(resolve => void (woken = resolve));
    },
  };
}

/**
 * Resumes after the promise chain a refused paste runs: the clipboard's
 * readText, `$clipboard`'s paste, then the menu's own continuation, each a
 * turn of the microtask queue (no timer: the turns are the chain's length).
 */
async function refused() {
  for (let i = 0; i < 4; i++) await null;
}

/**
 * Runs `body` with a clipboard that records what is written and reads
 * what `read` gives (a rejection: the platform refuses).
 * @param {(written: string[]) => Promise<void>} body @param {() => Promise<string>} [read]
 */
async function withClipboard(body, read = async () => 'XY') {
  /** @type {string[]} */
  const written = [];
  const nav = /** @type {any} */ (globalThis.navigator);
  const had = Object.getOwnPropertyDescriptor(nav, 'clipboard');
  Object.defineProperty(nav, 'clipboard', { configurable: true, value: { writeText: async (/** @type {string} */ t) => void written.push(t), readText: read } });
  try {
    await body(written);
  } finally {
    if (had === undefined) delete nav.clipboard;
    else Object.defineProperty(nav, 'clipboard', had);
  }
}

/**
 * The view on both renderers on a manual Clock (a menu's motion runs on
 * it), with presses of any button: `rightDom(node)` and `rightSkia(item)`
 * press with the second button and say whether the browser's own menu
 * stays shut there (the press's default prevented on the DOM, and on both
 * the contextmenu event that follows); a choice and a key let the menu's
 * motion end.
 * @param {() => any} view
 */
function menus(view) {
  const clock = manualClock();
  const p = pair(() => <Clock value={clock}>{view()}</Clock>);
  const { dom, skia } = p;
  /** Lets the menus' motions and frames run. */
  const frames = () => {
    clock.advance(200);
    p.flush();
  };
  /** @param {any} node */
  const rightDom = node => {
    const at = { bubbles: true, cancelable: true, button: 2, buttons: 2, pointerId: 1, clientX: 12, clientY: 12, pointerType: 'mouse' };
    const down = new dom.window.PointerEvent('pointerdown', at);
    node.dispatchEvent(down);
    $flush(dom.root);
    const menu = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    node.dispatchEvent(menu);
    return { taken: down.defaultPrevented, shut: menu.defaultPrevented };
  };
  /** @param {any} item */
  const rightSkia = item => {
    const r = p.s.box(item);
    const x = r.left + Math.min(12, r.width / 2);
    const y = r.top + r.height / 2;
    skia.skia.secondary(x, y, { button: 2, buttons: 2 });
    $flush(skia.root);
    return { shut: skia.skia.cancels('contextmenu', x, y) };
  };
  /** A key to the focused node on both. @param {string} key @param {boolean} [shift] */
  const key = (key, shift = false) => {
    const node = dom.document.activeElement ?? dom.document.body;
    node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true }));
    $flush(dom.root);
    skia.skia.key(key, shift);
    $flush(skia.root);
    frames();
  };
  /** Presses the item showing `text` on both. @param {string} text */
  const choose = text => {
    p.d.press(text);
    p.s.press(text);
    frames();
  };
  /** The menu item showing `text`: whether each renderer has it disabled. @param {string} text */
  const disabled = text => [p.d.find(text).closest('[role="menuitem"]').getAttribute('aria-disabled') === 'true', skiaDisabled(p, text)];
  return { ...p, rightDom, rightSkia, key, choose, disabled, frames };
}

/** Whether Skia has the menu item showing `text` disabled. @param {any} p @param {string} text */
function skiaDisabled(p, text) {
  let item = p.s.find(text);
  while (item != null && item.other?.get('role') !== 'menuitem') item = item.parent;
  return String(item?.other?.get('aria-disabled')) === 'true';
}

describe('the field menu on the DOM and on Skia', () => {
  it("opens on a right press where the theme says 'app', not by default, and the prop wins", () => {
    for (const [theme, prop, opens] of /** @type {[any, any, boolean][]} */ ([
      [undefined, undefined, false],
      [APP, undefined, true],
      [undefined, 'app', true],
      [APP, 'browser', false],
    ])) {
      /** @type {any[]} */
      const refs = [];
      const m = menus(() => (
        <Rui theme={theme}>
          <TextInput defaultValue="hello world" editMenu={prop} ref={(/** @type {any} */ n) => refs.push(n)} />
        </Rui>
      ));
      const tag = `${theme === APP ? 'app' : 'browser'} theme, prop ${prop}`;
      const dom = m.rightDom(refs[0]);
      const skia = m.rightSkia(refs[1]);
      assert.deepEqual([dom.taken, dom.shut, skia.shut], [opens, opens, opens], `the browser's menu is shut where rui's opens: ${tag}`);
      assert.equal(m.d.text(), opens ? `hello world ${ITEMS}` : 'hello world', tag);
      assert.equal(m.s.text(), m.d.text(), tag);
      m.dispose();
    }
  });

  it('cuts and copies the selection it opened on, through the clipboard, and onChange follows', () =>
    withClipboard(async written => {
      /** @type {any[]} */
      const refs = [];
      const changed = changes();
      const m = menus(() => (
        <Rui theme={APP}>
          <TextInput defaultValue="hello world" onChange={changed.push} ref={(/** @type {any} */ n) => refs.push(n)} />
        </Rui>
      ));
      const edits = refs.map(editOf);
      for (const e of edits) {
        e?.focus();
        e?.setSelection(6, 11);
      }
      m.rightDom(refs[0]);
      m.rightSkia(refs[1]);
      // The item's press moves the selection (as a press can): the menu acts on the one it opened on.
      for (const e of edits) e?.setSelection(0, 0);
      m.choose('Copy');
      assert.deepEqual(written, ['world', 'world']);
      assert.deepEqual(changed.list, []);
      assert.equal(m.d.text(), 'hello world', 'a choice closes it');
      assert.deepEqual(edits.map(e => e?.selection().start), [6, 6], 'the field has its selection back');
      for (const e of edits) e?.setSelection(0, 6);
      m.rightDom(refs[0]);
      m.rightSkia(refs[1]);
      m.choose('Cut');
      // The cut text goes once the clipboard has it.
      await changed.count(2);
      m.flush();
      assert.deepEqual(written, ['world', 'world', 'hello ', 'hello ']);
      assert.deepEqual(changed.list, ['world', 'world']);
      assert.deepEqual(edits.map(e => e?.value()), ['world', 'world']);
      assert.equal(m.s.text(), m.d.text());
      m.dispose();
    }));

  it('pastes over the selection, and where the platform refuses, stays open with the keys to paste', async () => {
    await withClipboard(async () => {
      /** @type {any[]} */
      const refs = [];
      const changed = changes();
      const m = menus(() => (
        <Rui theme={APP}>
          <TextInput defaultValue="hello world" onChange={changed.push} ref={(/** @type {any} */ n) => refs.push(n)} />
        </Rui>
      ));
      const edits = refs.map(editOf);
      for (const e of edits) {
        e?.focus();
        e?.setSelection(0, 5);
      }
      m.rightDom(refs[0]);
      m.rightSkia(refs[1]);
      m.choose('Paste');
      await changed.count(2);
      m.frames();
      assert.deepEqual(changed.list, ['XY world', 'XY world']);
      assert.equal(m.d.text(), 'XY world', 'pasted, it closes');
      assert.equal(m.s.text(), m.d.text());
      m.dispose();
    });
    await withClipboard(
      async written => {
        /** @type {any[]} */
        const refs = [];
        const m = menus(() => (
          <Rui theme={APP}>
            <TextInput defaultValue="hello" ref={(/** @type {any} */ n) => refs.push(n)} />
          </Rui>
        ));
        m.rightDom(refs[0]);
        m.rightSkia(refs[1]);
        m.choose('Paste');
        await refused();
        m.flush();
        assert.equal(m.d.text(), `hello ${ITEMS.replace('Paste Ctrl+V', 'Paste with Ctrl+V')}`, 'refused: open, the keys in its place');
        assert.equal(m.s.text(), m.d.text());
        assert.deepEqual(m.disabled('Paste with Ctrl+V'), [true, true]);
        assert.deepEqual(written, []);
        assert.deepEqual(refs.map(r => editOf(r)?.value()), ['hello', 'hello']);
        m.dispose();
      },
      async () => Promise.reject(new Error('NotAllowedError')),
    );
  });

  it('selects all, and closed with no choice gives the focus back to the field with its selection', () => {
    /** @type {any[]} */
    const refs = [];
    const m = menus(() => (
      <Rui theme={APP}>
        <TextInput defaultValue="hello world" ref={(/** @type {any} */ n) => refs.push(n)} />
      </Rui>
    ));
    const edits = refs.map(editOf);
    for (const e of edits) {
      e?.focus();
      e?.setSelection(2, 4);
    }
    m.rightDom(refs[0]);
    m.rightSkia(refs[1]);
    m.choose('Select all');
    assert.deepEqual(edits.map(e => [e?.selection().start, e?.selection().end]), [[0, 11], [0, 11]]);
    for (const e of edits) e?.setSelection(2, 4);
    // Shift+F10 opens it from the keys, the focus on its first item; Escape closes it.
    m.key('F10', true);
    assert.equal(m.d.text(), `hello world ${ITEMS}`);
    assert.equal(m.s.text(), m.d.text());
    assert.equal(m.d.focused()?.getAttribute('role'), 'menuitem', 'the keys took the focus into it');
    assert.equal(m.s.focused()?.other?.get('role'), 'menuitem');
    m.key('Escape');
    assert.equal(m.d.text(), 'hello world');
    assert.equal(m.s.text(), 'hello world');
    assert.deepEqual([m.d.focused(), m.s.focused()], refs, 'the field has the focus back');
    assert.deepEqual(edits.map(e => [e?.selection().start, e?.selection().end]), [[2, 4], [2, 4]]);
    // Opened by a pointer, the focus stays in the field, and Escape there closes it.
    m.rightDom(refs[0]);
    m.rightSkia(refs[1]);
    assert.deepEqual([m.d.focused(), m.s.focused()], refs);
    m.key('Escape');
    assert.equal(m.d.text(), 'hello world');
    assert.equal(m.s.text(), 'hello world');
    m.dispose();
  });

  it("undoes and redoes the typing on Skia, the field's history", () => {
    /** @type {any[]} */
    const refs = [];
    /** @type {string[]} */
    const seen = [];
    const m = menus(() => (
      <Rui theme={APP}>
        <TextInput defaultValue="" onChange={(/** @type {string} */ v) => seen.push(v)} ref={(/** @type {any} */ n) => refs.push(n)} />
      </Rui>
    ));
    const edit = editOf(refs[1]);
    edit?.focus();
    m.s.type('abc');
    seen.length = 0;
    m.rightSkia(refs[1]);
    assert.equal(skiaDisabled(m, 'Undo'), false);
    assert.equal(skiaDisabled(m, 'Redo'), true, 'nothing to redo yet');
    m.s.press('Undo');
    m.frames();
    assert.equal(edit?.value(), '');
    assert.deepEqual(seen, ['']);
    m.rightSkia(refs[1]);
    assert.equal(skiaDisabled(m, 'Redo'), false);
    m.s.press('Redo');
    m.frames();
    assert.equal(edit?.value(), 'abc');
    assert.deepEqual(seen, ['', 'abc']);
    m.dispose();
  });

  it('keeps a secret field from the clipboard, a read-only one from edits, and a disabled one closed', () => {
    /** @type {any[]} */
    const refs = [];
    const m = menus(() => (
      <Rui theme={APP}>
        <PasswordInput defaultValue="secret" ref={(/** @type {any} */ n) => refs.push(n)} />
        <TextInput defaultValue="fixed" readOnly ref={(/** @type {any} */ n) => refs.push(n)} />
        <TextInput defaultValue="off" disabled ref={(/** @type {any} */ n) => refs.push(n)} />
      </Rui>
    ));
    const [secret, fixed, off] = [0, 1, 2].map(i => [refs[i], refs[i + 3]]);
    for (const r of [...secret, ...fixed]) editOf(r)?.setSelection(0, 3);
    m.rightDom(secret[0]);
    m.rightSkia(secret[1]);
    assert.deepEqual(['Cut', 'Copy', 'Paste', 'Select all'].map(m.disabled), [[true, true], [true, true], [false, false], [false, false]], 'a secret is not copied');
    m.key('Escape');
    m.rightDom(fixed[0]);
    m.rightSkia(fixed[1]);
    assert.deepEqual(['Undo', 'Redo', 'Cut', 'Copy', 'Paste'].map(m.disabled), [[true, true], [true, true], [true, true], [false, false], [true, true]], 'read-only: copied, not changed');
    m.key('Escape');
    const dom = m.rightDom(off[0]);
    const skia = m.rightSkia(off[1]);
    assert.deepEqual([dom.taken, skia.shut], [false, false], 'disabled: no menu of its own');
    assert.doesNotMatch(m.d.text(), /Undo/);
    assert.doesNotMatch(m.s.text(), /Undo/);
    m.dispose();
  });

  it("opens over a combobox's field instead of its list, and a right press opens no list where it is the browser's", () => {
    for (const theme of [APP, undefined]) {
      /** @type {any[]} */
      const refs = [];
      const m = menus(() => (
        <Rui theme={theme}>
          <Autocomplete data={['apple', 'apricot']} defaultValue="ap" ref={(/** @type {any} */ n) => refs.push(n)} />
        </Rui>
      ));
      const edits = m.d.nodes('Edit');
      const items = m.s.items().filter(i => i.draft === 'ap');
      m.rightDom(edits[0]);
      m.rightSkia(items[0]);
      assert.equal(m.d.text(), theme === APP ? `ap ${ITEMS}` : 'ap', 'the menu, not the options');
      assert.equal(m.s.text(), m.d.text());
      m.dispose();
    }
  });

  it("takes a right press inside a ContextMenu's region: the region's menu stays shut", () => {
    let opens = 0;
    const m = menus(() => (
      <Rui theme={APP}>
        <ContextMenu style={{ width: 300, height: 200 }} onOpenChange={(/** @type {boolean} */ open) => open && opens++} menu={<Menu.Item>Delete</Menu.Item>}>
          <TextInput defaultValue="inside" />
        </ContextMenu>
      </Rui>
    ));
    m.rightDom(m.d.nodes('Edit')[0]);
    m.rightSkia(m.s.items().find(i => i.draft === 'inside'));
    assert.equal(opens, 0);
    assert.equal(m.d.text(), `inside ${ITEMS}`);
    assert.equal(m.s.text(), m.d.text());
    m.dispose();
  });
});

describe('the text menu on the DOM and on Skia', () => {
  /** The view: a text, a button and a field. @param {any} theme */
  const view = theme => () => (
    <Rui theme={theme}>
      <Text>Hello there</Text>
      <Button>Go</Button>
      <TextInput defaultValue="field" />
    </Rui>
  );

  it('copies the text under a right press, or selects it, then copies the selection', () =>
    withClipboard(async written => {
      const m = menus(view(TEXT));
      const text = () => [m.d.find('Hello there'), m.s.find('Hello there')];
      const right = () => {
        const [d, s] = text();
        return [m.rightDom(d).taken, m.rightSkia(s).shut];
      };
      assert.deepEqual(right(), [true, true]);
      assert.equal(m.d.text(), 'Hello there Go field Copy Select text');
      assert.equal(m.s.text(), m.d.text());
      m.choose('Copy');
      assert.deepEqual(written, ['Hello there', 'Hello there']);
      assert.equal(m.d.text(), 'Hello there Go field');
      right();
      m.choose('Select text');
      assert.deepEqual(text().map(selectedText), ['Hello there', 'Hello there'], 'all of it selected');
      // Over a selection, the menu copies it.
      right();
      assert.equal(m.d.text(), 'Hello there Go field Copy');
      assert.equal(m.s.text(), m.d.text());
      m.choose('Copy');
      assert.deepEqual(written.slice(2), ['Hello there', 'Hello there']);
      m.dispose();
    }));

  it('opens over a text, not over a button or a field, and not where the theme leaves it off (the default)', () => {
    for (const theme of [TEXT, undefined]) {
      const m = menus(view(theme));
      const go = m.rightDom(m.d.find('Go'));
      m.rightSkia(m.s.find('Go'));
      assert.equal(go.taken, false);
      assert.equal(m.d.text(), 'Hello there Go field');
      assert.equal(m.s.text(), m.d.text());
      m.rightDom(m.d.nodes('Edit')[0]);
      m.rightSkia(m.s.items().find(i => i.draft === 'field'));
      assert.equal(m.d.text(), 'Hello there Go field', "a field's menu is its own");
      assert.equal(m.s.text(), m.d.text());
      const on = theme === TEXT;
      assert.equal(m.rightDom(m.d.find('Hello there')).taken, on, on ? 'over a text' : 'off by default');
      m.rightSkia(m.s.find('Hello there'));
      assert.equal(m.d.text(), on ? 'Hello there Go field Copy Select text' : 'Hello there Go field');
      assert.equal(m.s.text(), m.d.text());
      m.dispose();
    }
  });

  it("with 'all', opens over a button's text too: Copy, and Select text whose presses select, never press it", () =>
    withClipboard(async written => {
      let pressed = 0;
      const m = menus(() => (
        <Rui theme={ALL}>
          <Text>Hello there</Text>
          <Button onPress={() => pressed++}>Go</Button>
        </Rui>
      ));
      const go = () => [m.d.find('Go'), m.s.find('Go')];
      const right = () => {
        const [d, s] = go();
        return [m.rightDom(d).taken, m.rightSkia(s).shut];
      };
      assert.deepEqual(right(), [true, true], "the button's text takes the right press");
      assert.equal(m.d.text(), 'Hello there Go Copy Select text');
      assert.equal(m.s.text(), m.d.text());
      m.choose('Copy');
      assert.deepEqual(written, ['Go', 'Go']);
      right();
      m.choose('Select text');
      assert.deepEqual(go().map(selectedText), ['Go', 'Go'], 'all of it selected');
      // A press inside the selected text selects; the button does not press.
      const [d, s] = go();
      m.d.tap(d);
      const box = m.s.box(s);
      m.s.at(box.x + 2, box.y + box.height / 2);
      assert.equal(pressed, 0, 'its presses select, never press the button');
      // Escape ends it: the button presses again.
      m.d.key('Escape');
      m.s.key('Escape');
      m.d.tap(go()[0]);
      const again = m.s.box(go()[1]);
      m.s.at(again.x + 2, again.y + again.height / 2);
      assert.equal(pressed, 2, 'pressed on both after Escape');
      m.dispose();
    }));
});
