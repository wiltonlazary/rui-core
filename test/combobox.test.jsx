// The combobox family on the DOM and on Skia: the same options, the same
// choices by press and by keys (ArrowDown, ArrowUp, Enter, Escape through
// onKey), the same values, the panel under its field and over what
// follows.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active, View, For } from 'ren-core';
import {
  Rui, Clock, manualClock, Button, Text,
  Stack, $combobox, Combobox, Select, PlainSelect, Autocomplete, MultiSelect, TagInput, Tag, TagBox, Cascader, TreeSelect, Picker, BASE_THEME, SettingsIcon,
} from 'rui-core';
import { fontBelow } from '../src/theme/resolve.js';
import { $form } from 'rui-core/form';
import { both } from './harness.jsx';

/** The DOM element's inline style, as a map. @param {any} node */
const css = node => {
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of String(node.getAttribute('style') ?? '').split(';')) {
    const at = part.indexOf(':');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
};

// Driving the view the same way on the DOM and on Skia (the same helpers as
// in the other overlay suite; a later pass can move them to harness.jsx):
// Skia: what the page shows including the portal layer (on the DOM a Portal
// renders into the document's body, outside the view's host), presses as a
// browser sends them (pointerdown, pointerup, click), keys to the focused
// node, and boxes.


/** Collapses whitespace. @param {string[]} parts */
const normalize = parts => parts.join(' ').replace(/\s+/g, ' ').trim();

/** True when the node or an ancestor is not displayed. @param {any} node */
function hidden(node) {
  for (let n = node; n != null && n.style !== undefined; n = n.parentElement) if (n.style.display === 'none') return true;
  return false;
}

/**
 * The view on both renderers, with helpers that see the portal layer.
 * @param {() => any} view @param {{ width?: number, height?: number }} [size]
 */
function pair(view, size) {
  const { dom, skia, dispose } = both(view, size);
  const body = dom.document.body;
  /** @param {string} role */
  const nodes = role => /** @type {any[]} */ ([...body.querySelectorAll(`[data-ren="${role}"]`)]).filter(n => !hidden(n));
  const flush = () => {
    $flush(dom.root);
    $flush(skia.root);
  };
  const d = {
    /** The Labels, Actions and Edits the DOM shows, the portal layer's too, in document order. */
    text() {
      $flush(dom.root);
      /** @type {string[]} */
      const out = [];
      for (const node of body.querySelectorAll('[data-ren]')) {
        const role = node.getAttribute('data-ren');
        if ((role !== 'Label' && role !== 'Action' && role !== 'Edit') || hidden(node)) continue;
        if (role === 'Action' && node.querySelector('[data-ren]') !== null) continue;
        out.push(role === 'Edit' ? node.value || node.placeholder || '' : node.textContent);
      }
      return normalize(out);
    },
    nodes,
    /** The deepest Action or View whose text is `text`. @param {string} text */
    find(text) {
      const found = [...nodes('Action'), ...nodes('Label'), ...nodes('View')].filter(n => n.textContent.trim() === text);
      const node = found.find(n => n.getAttribute('data-ren') !== 'View') ?? found.at(-1);
      if (node === undefined) throw new Error(`no "${text}" on the DOM in: ${d.text()}`);
      return node;
    },
    /** Presses a node as a browser does. @param {any} node */
    tap(node) {
      const w = dom.window;
      const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 };
      node.dispatchEvent(new w.PointerEvent('pointerdown', at));
      node.dispatchEvent(new w.PointerEvent('pointerup', { ...at, buttons: 0 }));
      node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      $flush(dom.root);
    },
    /** Presses the node showing `text`. @param {string} text */
    press(text) {
      d.tap(d.find(text));
    },
    /** A key to the focused node (the DOM's keydown). @param {string} key */
    key(key) {
      const node = dom.document.activeElement ?? body;
      node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      $flush(dom.root);
    },
    /** Types into the focused Edit as the browser does. @param {string} text */
    type(text) {
      const node = /** @type {any} */ (dom.document.activeElement);
      for (const ch of text) {
        node.value = node.value + ch;
        node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        $flush(dom.root);
      }
    },
    /** Moves the pointer onto a node (enter). @param {any} node */
    enter(node) {
      node.dispatchEvent(new dom.window.PointerEvent('pointerenter', { bubbles: false }));
      node.dispatchEvent(new dom.window.PointerEvent('pointerover', { bubbles: true }));
      $flush(dom.root);
    },
    /** Moves the pointer off a node (leave). @param {any} node */
    leave(node) {
      node.dispatchEvent(new dom.window.PointerEvent('pointerleave', { bubbles: false }));
      node.dispatchEvent(new dom.window.PointerEvent('pointerout', { bubbles: true }));
      $flush(dom.root);
    },
    focused: () => dom.document.activeElement,
  };
  /** Every scene item, the overlay's too, in tree order. */
  const items = () => {
    skia.skia.present();
    /** @type {any[]} */
    const out = [];
    const walk = (/** @type {any} */ n) => {
      for (let c = n.first; c !== null; c = c.next) {
        out.push(c);
        walk(c);
      }
    };
    walk(skia.skia.root);
    walk(skia.skia.overlay);
    return out;
  };
  const s = {
    text: () => skia.text(),
    items,
    /** The item painted with `text` (a Label's or an Action's). @param {string} text */
    find(text) {
      const found = items().filter(i => (i.text ?? '') === text || (i.draft ?? '') === text);
      if (found.length === 0) throw new Error(`no "${text}" item on Skia in: ${skia.text()}`);
      return found.at(-1);
    },
    /** Presses where the text `text` is painted. @param {string} text */
    press(text) {
      skia.press(text);
    },
    /** Presses at a point. @param {number} x @param {number} y */
    at(x, y) {
      skia.skia.press(x, y);
      skia.skia.release(x, y);
      $flush(skia.root);
    },
    /** A key to the focused item. @param {string} key */
    key(key) {
      skia.skia.key(key);
      $flush(skia.root);
    },
    /** Types into the focused Edit. @param {string} text */
    type(text) {
      for (const ch of text) skia.skia.key(ch);
      $flush(skia.root);
    },
    /** Moves the pointer to a point. @param {number} x @param {number} y */
    move(x, y) {
      skia.skia.move(x, y);
      $flush(skia.root);
    },
    /** An item's box. @param {any} item */
    box: item => {
      skia.skia.present();
      return item.getBoundingClientRect();
    },
    focused: () => skia.skia.focused,
  };
  return { dom, skia, d, s, flush, dispose };
}

/** Per-root state: each renderer's root keeps its own. */
function states() {
  /** @type {any[]} */
  const list = [];
  return { list, add: (/** @type {any} */ v) => (list.push(v), v) };
}

/** A view in the theme, on a clock, 300 wide. @param {any} clock @param {() => any} content */
const app = (clock, content) => () => (
  <Clock value={clock}>
    <Rui>
      <View style={{ padding: 20, width: 340, gap: 8 }}>{content()}</View>
    </Rui>
  </Clock>
);

/**
 * The view on both, a clock to settle it, and helpers.
 * @param {(clock: any, st: ReturnType<typeof states>) => () => any} make @param {{ width?: number, height?: number }} [size]
 */
function setup(make, size) {
  const clock = manualClock();
  const st = states();
  const p = pair(make(clock, st), size);
  const settle = () => {
    clock.advance(200);
    p.flush();
  };
  /** Presses the text on both, then settles. @param {string} text */
  const press = text => {
    p.d.press(text);
    p.s.press(text);
    settle();
  };
  /** Presses the last thing showing the text (an option, where the field shows the same) on both. @param {string} text */
  const pick = text => {
    const nodes = [...p.d.nodes('Action'), ...p.d.nodes('Label')].filter(n => n.textContent.trim() === text);
    p.d.tap(nodes.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1)).at(-1));
    const box = p.s.box(p.s.find(text));
    p.s.at(box.x + 4, box.y + 4);
    settle();
  };
  /** A key on both, then settles. @param {string} key */
  const key = key => {
    p.d.key(key);
    p.s.key(key);
    settle();
  };
  /** Focuses the i-th Edit on both. @param {number} [i] */
  const focusEdit = (i = 0) => {
    p.d.nodes('Edit')[i].focus();
    p.s.items().filter(n => n.kind === 4)[i].focus();
    p.flush();
  };
  /** Types into the focused Edit on both. @param {string} text */
  const type = text => {
    p.d.type(text);
    p.s.type(text);
    settle();
  };
  const values = () => st.list.map(x => $read(x));
  /** Both texts, asserted equal, as one. */
  const text = () => {
    const a = p.d.text();
    const b = p.s.text();
    assert.equal(a, b, 'the DOM and Skia show the same');
    return a;
  };
  return { ...p, clock, st, settle, press, pick, key, focusEdit, type, values, text };
}

describe('Combobox', () => {
  it('a store, a trigger, options in groups, a filter, a no-match line, a top and a bottom part', () => {
    const t = setup((clock, st) =>
      app(clock, () => {
        const chosen = st.add($signal($active(), ''));
        const store = $combobox();
        const search = $signal($active(), '');
        const all = ['Amazon', 'Danube', 'Everest', 'Kilimanjaro'];
        const shown = () => all.filter(x => x.toLowerCase().includes($read(search).toLowerCase()));
        return (
          <Combobox store={store} onPick={(/** @type {string} */ v) => ($write(chosen, v), store.close())}>
            <Combobox.Trigger>
              <Button onPress={() => store.toggle()}>Pick</Button>
            </Combobox.Trigger>
            <Combobox.Panel>
              <Combobox.Top>
                <Text>Places</Text>
              </Combobox.Top>
              <Combobox.Filter value={search} onChange={(/** @type {any} */ e) => $write(search, e.value)} placeholder="Search" />
              <Combobox.List>
                <Combobox.Group label="Rivers">
                  {() => shown().filter(x => x === 'Amazon' || x === 'Danube').map(x => <Combobox.Option value={x}>{x}</Combobox.Option>)}
                </Combobox.Group>
                <Combobox.Group label="Peaks">
                  {() => shown().filter(x => x === 'Everest' || x === 'Kilimanjaro').map(x => <Combobox.Option value={x}>{x}</Combobox.Option>)}
                </Combobox.Group>
                {() => (shown().length === 0 ? <Combobox.NoMatch>No matches</Combobox.NoMatch> : null)}
              </Combobox.List>
              <Combobox.Bottom>
                <Text>4 items</Text>
              </Combobox.Bottom>
            </Combobox.Panel>
          </Combobox>
        );
      }),
    );
    assert.equal(t.text(), 'Pick');
    t.press('Pick');
    assert.equal(t.text(), 'Pick Places Search Rivers Amazon Danube Peaks Everest Kilimanjaro 4 items');
    t.press('Everest');
    assert.deepEqual(t.values(), ['Everest', 'Everest']);
    assert.equal(t.text(), 'Pick');
    // Keys on the trigger: ArrowDown opens, then moves; Enter picks.
    t.d.find('Pick').focus();
    t.s.find('Pick').focus();
    t.key('ArrowDown');
    assert.ok(t.text().includes('Amazon'));
    t.key('ArrowDown');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.values(), ['Danube', 'Danube']);
    // The search filters; the empty state shows when nothing matches.
    t.press('Pick');
    t.focusEdit();
    t.type('zz');
    assert.equal(t.text(), 'Pick Places zz Rivers Peaks No matches 4 items');
    t.key('Escape');
    assert.equal(t.text(), 'Pick');
    t.dispose();
  });

  it('Combobox.Opener draws in its color when given, the quiet text color otherwise', async () => {
    const { onDom } = await import('./harness.jsx');
    const { BASE_THEME, colorOf, pageColors } = await import('rui-core');
    const v = onDom(() => (
      <Rui>
        <Combobox.Opener color="red.6" />
        <Combobox.Opener />
      </Rui>
    ));
    v.text();
    const [colored, plain] = [...v.document.body.querySelectorAll('[data-ren="Shape"]')].map((/** @type {any} */ n) => n.innerHTML.toLowerCase());
    const red = colorOf(BASE_THEME, 'light', 'red.6').toLowerCase();
    const quiet = pageColors(BASE_THEME, 'light').quiet.toLowerCase();
    assert.ok(colored.includes(red), `the given color: ${colored.slice(0, 200)}`);
    assert.ok(plain.includes(quiet) && !plain.includes(red), 'the quiet text color by default');
    v.dispose();
  });

  it("the parts' names: Filter, NoMatch, Top, Bottom, Opener; an option's `chosen`; the store's focusFilter", () => {
    const C = /** @type {Record<string, any>} */ (Combobox);
    for (const name of ['Filter', 'NoMatch', 'Top', 'Bottom', 'Opener']) assert.equal(typeof C[name], 'function', name);
    /** @type {any[]} */
    const stores = [];
    const t = setup(clock =>
      app(clock, () => {
        const store = $combobox({ defaultOpen: true });
        stores.push(store);
        return (
          <Combobox store={store}>
            <Combobox.Trigger>
              <Button>Pick</Button>
            </Combobox.Trigger>
            <Combobox.Panel>
              <Combobox.Filter placeholder="Narrow" />
              <Combobox.List>
                <Combobox.Option value="a" chosen={true}>Alpha</Combobox.Option>
                <Combobox.Option value="b" chosen={false}>Beta</Combobox.Option>
              </Combobox.List>
            </Combobox.Panel>
          </Combobox>
        );
      }),
    );
    t.settle();
    assert.equal(t.d.find('Alpha').getAttribute('aria-selected'), 'true', 'chosen: selected though the keyboard is elsewhere');
    assert.equal(t.d.find('Beta').getAttribute('aria-selected'), 'false');
    for (const s of stores) assert.equal(typeof s.focusFilter, 'function');
    for (const s of stores) s.focusFilter();
    assert.equal(t.d.focused().getAttribute('data-ren'), 'Edit', 'focusFilter focuses the filter');
    assert.equal(t.d.focused().placeholder, 'Narrow');
    t.dispose();
  });
});

describe('Combobox panel geometry', () => {
  it("takes the theme's tokens: the panel pad, option pads, rules without negative margins, a quiet NoMatch, a disabled option", () => {
    const T = BASE_THEME;
    const t = setup(clock =>
      app(clock, () => {
        const store = $combobox({ defaultOpen: true });
        return (
          <Combobox store={store} size="md">
            <Combobox.Trigger>
              <Button>Pick</Button>
            </Combobox.Trigger>
            <Combobox.Panel>
              <Combobox.Top>
                <Text>Places</Text>
              </Combobox.Top>
              <Combobox.Filter placeholder="Search" />
              <Combobox.List>
                <Combobox.Group label="Rivers">
                  <Combobox.Option value="Amazon">Amazon</Combobox.Option>
                  <Combobox.Option value="Nile" disabled>Nile</Combobox.Option>
                </Combobox.Group>
                <Combobox.NoMatch>Nothing else</Combobox.NoMatch>
              </Combobox.List>
              <Combobox.Bottom>
                <Text>2 items</Text>
              </Combobox.Bottom>
            </Combobox.Panel>
          </Combobox>
        );
      }),
    );
    t.settle();
    assert.equal(t.text(), 'Pick Places Search Rivers Amazon Nile Nothing else 2 items');
    const px = (/** @type {number} */ n) => `${n}px`;
    // md: the option pad itself; the top, bottom, group label and NoMatch sit at it too.
    const [py, pxx] = T.control.optionPad;
    const amazon = css(t.d.find('Amazon'));
    assert.equal(amazon.padding, `${px(py)} ${px(pxx)}`);
    assert.equal(amazon.gap, px(T.control.iconGap));
    const nile = css(t.d.find('Nile'));
    assert.equal(nile.opacity, String(T.opacity.disabled));
    assert.equal(nile.cursor, 'default', 'a disabled option is no press target');
    assert.equal(t.d.find('Nile').getAttribute('aria-disabled'), 'true');
    const group = css(t.d.find('Rivers'));
    assert.equal(group['font-weight'], String(T.weights.strong));
    assert.equal(group['font-size'], px(fontBelow(T, T.fontSizes.md)));
    const empty = css(t.d.find('Nothing else'));
    assert.equal(empty['font-size'], px(T.fontSizes.md), 'the panel text size');
    assert.equal(empty.padding, `${px(py)} ${px(pxx)}`, "where an option's text is");
    assert.equal(empty['text-align'], 'start');
    // The panel: `control.panelPad` inside its edge; no part reaches past it by a negative margin.
    const panel = t.d.nodes('View').find(n => css(n).padding === px(T.control.panelPad) && n.textContent.includes('Places'));
    assert.ok(panel !== undefined, 'the panel pads by control.panelPad');
    for (const n of panel.querySelectorAll('[data-ren]')) assert.ok(!/margin[^;]*-\d/.test(String(n.getAttribute('style'))), 'no negative margins');
    // The rules: a pixel high, panelPad from the options.
    const rules = [...panel.querySelectorAll('[data-ren="View"]')].filter(n => css(n).height === '1px');
    assert.equal(rules.length, 3, 'under the header and the search, over the footer');
    t.dispose();
  });
});

describe('Select', () => {
  /** @param {Record<string, any>} extra */
  const select = extra =>
    setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), extra.value ?? null));
        return (
          <>
            <Select label="Fruit" placeholder="Your pick" data={['Apple', 'Banana', 'Cherry']} {...extra} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />
            <Button>Below</Button>
          </>
        );
      }),
    );

  it('an action option ends the list apart: a rule above it, drawn as a button with its icon; pressed, it is chosen', () => {
    const t = select({ data: ['Apple', 'Banana', { value: 'manage', label: 'Manage…', action: true, icon: SettingsIcon }] });
    t.press('Your pick');
    assert.equal(t.text(), 'Fruit Your pick Below Apple Banana Manage…');
    // DOM: the option holds the icon (a Shape) before its label, in a box of its own, a rule just before the option
    const option = t.d.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('role') === 'option' && n.textContent.trim() === 'Manage…');
    assert.ok(option !== undefined, 'an option');
    assert.equal(option.querySelectorAll('[data-ren="Shape"]').length, 1, 'its icon');
    const rule = option.previousElementSibling;
    assert.ok(rule !== null && rule.textContent === '' && rule.getAttribute('aria-hidden') === 'true', 'a rule before it, hidden from assistive technology');
    // Skia: the label sits below Banana's, past the rule
    assert.ok(t.s.box(t.s.find('Manage…')).y > t.s.box(t.s.find('Banana')).bottom, 'below the other options');
    t.press('Manage…');
    assert.deepEqual(t.values(), ['manage', 'manage']);
    t.dispose();
  });

  it('its list is as high as few options, panelHeight for many, scrolling down only and without bars; a long label ends with an ellipsis', () => {
    const long = 'A fruit with a name far too long for its field, however wide that field may be';
    const T = BASE_THEME;
    const t = select({ data: ['Apple', 'Banana', long] });
    t.press('Your pick');
    // Skia: the label's row, option, group, list, the fitted content, then the list's ScrollBox
    const content = t.s.find('Apple').parent.parent.parent.parent.parent;
    const scroll = content.parent;
    assert.equal(Math.round(t.s.box(scroll).height), Math.round(t.s.box(content).height), 'as high as its three options');
    assert.ok(t.s.box(scroll).height < T.sizes.box.panel, 'not the panel height');
    // the long label stays inside the list, cut by its ellipsis
    const label = t.s.find(long);
    assert.ok(t.s.box(label).right <= t.s.box(scroll).right + 0.5, 'within the list');
    assert.ok(t.s.box(label).width < t.s.box(scroll).width, 'cut to the row');
    // DOM: the list scrolls down only, without bars, and the long label is one line ending with an ellipsis
    const list = t.d.nodes('Scroll').find((/** @type {any} */ n) => n.querySelector('[role="listbox"]') !== null);
    assert.equal(list.style.overflowX, 'hidden', 'no scroll across');
    assert.equal(list.style.getPropertyValue('--ren-bars'), 'none', 'no bars');
    const text = t.d.nodes('Label').find((/** @type {any} */ n) => n.textContent === long);
    assert.equal(text.style.textOverflow, 'ellipsis');
    t.dispose();
    // many options: the list is panelHeight high and scrolls
    const many = select({ data: Array.from({ length: 40 }, (_, i) => `Fruit ${i + 1}`) });
    many.press('Your pick');
    const at = many.s.find('Fruit 1').parent.parent.parent.parent.parent.parent;
    assert.equal(Math.round(many.s.box(at).height), T.sizes.box.panel);
    many.dispose();
  });

  it('opens under its field as wide, over what follows; chooses by press and by keys', () => {
    const t = select({});
    assert.equal(t.text(), 'Fruit Your pick Below');
    t.press('Your pick');
    assert.equal(t.text(), 'Fruit Your pick Below Apple Banana Cherry');
    const field = t.s.box(t.s.find('Your pick').parent.parent.parent);
    // the panel: the label's row, option, group, list, the fitted content, the list's ScrollBox, then the panel
    const drop = t.s.box(t.s.find('Apple').parent.parent.parent.parent.parent.parent.parent);
    assert.equal(Math.round(drop.y), Math.round(field.bottom + 4), 'under the field, 4 below it');
    assert.equal(Math.round(drop.width), Math.round(field.width), 'as wide as the field');
    // An option sits over the Below button: a press there chooses it.
    const below = t.s.box(t.s.find('Below'));
    const over = ['Apple', 'Banana', 'Cherry'].find(o => {
      const b = t.s.box(t.s.find(o));
      return b.y < below.bottom && b.bottom > below.y;
    });
    assert.ok(over !== undefined, 'an option overlaps the button');
    const box = t.s.box(t.s.find(/** @type {string} */ (over)));
    t.d.press(/** @type {string} */ (over));
    t.s.at(box.x + 4, Math.max(box.y, below.y) + 2);
    t.settle();
    assert.deepEqual(t.values(), [over, over]);
    t.press(/** @type {string} */ (over));
    t.press('Banana');
    assert.deepEqual(t.values(), ['Banana', 'Banana']);
    assert.equal(t.text(), 'Fruit Banana Below');
    // Keys: ArrowDown opens on the value, ArrowDown moves, Enter chooses.
    t.key('ArrowDown');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.values(), ['Cherry', 'Cherry']);
    t.key('ArrowDown');
    t.key('ArrowUp');
    t.key('ArrowUp');
    t.key('Enter');
    assert.deepEqual(t.values(), ['Apple', 'Apple']);
    t.key('ArrowDown');
    t.key('Escape');
    assert.equal(t.text(), 'Fruit Apple Below');
    // deselectable: choosing the value again clears it.
    t.press('Apple');
    t.pick('Apple');
    assert.deepEqual(t.values(), [null, null]);
    t.dispose();
  });

  it('searchable: typing filters; no matches; clearable; groups', () => {
    const t = select({
      searchable: true,
      clearable: true,
      empty: 'No matches',
      data: [{ label: 'Fruit', options: ['Apple', 'Banana'] }, { label: 'Nuts', options: [{ value: 'wal', label: 'Walnut' }] }],
    });
    assert.equal(t.text(), 'Fruit Your pick Below');
    t.focusEdit();
    t.type('an');
    assert.equal(t.text(), 'Fruit an Below Fruit Banana');
    t.key('Enter');
    assert.deepEqual(t.values(), ['Banana', 'Banana'], 'the first match was selected');
    assert.equal(t.text(), 'Fruit Banana Below');
    t.focusEdit();
    t.type('x');
    assert.equal(t.text(), 'Fruit Bananax Below No matches');
    t.key('Escape');
    assert.equal(t.text(), 'Fruit Banana Below', 'the search goes back to the value');
    const side = `${BASE_THEME.sizes.icon.xs}px`;
    assert.deepEqual([css(t.dom.document.querySelector('[aria-label="Clear"]')).width, css(t.dom.document.querySelector('[aria-label="Clear"]')).height], [side, side], 'Clear: a CloseButton\'s side at xs');
    t.d.tap(t.dom.document.querySelector('[aria-label="Clear"]'));
    const clear = t.s.items().find(i => i.label === 'Clear');
    t.s.at(t.s.box(clear).x + 4, t.s.box(clear).y + 4);
    t.settle();
    assert.deepEqual(t.values(), [null, null]);
    t.focusEdit();
    t.type('w');
    assert.equal(t.text(), 'Fruit w Below Nuts Walnut');
    t.press('Walnut');
    assert.deepEqual(t.values(), ['wal', 'wal']);
    t.dispose();
  });

  it('check: your own mark on the chosen option, at the end by default, at the start by checkAt', () => {
    for (const [at, want] of [[undefined, 'Banana Apple Banana chosen'], ['end', 'Banana Apple Banana chosen'], ['start', 'Banana Apple chosen Banana']]) {
      const t = setup((clock, st) =>
        app(clock, () => {
          const v = st.add($signal($active(), 'Banana'));
          return <Select placeholder="Pick" data={['Apple', 'Banana']} check={<Text>chosen</Text>} checkAt={at} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
        }),
      );
      t.press('Banana');
      assert.equal(t.text(), want, `checkAt ${at}: the mark on the chosen option only`);
      t.dispose();
    }
  });

  it('onPick hands the chosen option; onChange the value alone', () => {
    /** @type {any[]} */
    const picks = [];
    /** @type {any[][]} */
    const changes = [];
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {string | null} */ (null)));
        return (
          <Select
            placeholder="Planet"
            data={[{ label: 'Inner', options: [{ value: 'mars', label: 'Mars' }] }, { label: 'Outer', options: [{ value: 'saturn', label: 'Saturn' }] }]}
            value={v}
            onPick={(/** @type {string} */ x, /** @type {any} */ option) => picks.push([x, option.label, option.group])}
            onChange={(/** @type {any[]} */ ...args) => {
              changes.push(args);
              $write(v, args[0]);
            }}
          />
        );
      }),
    );
    t.press('Planet');
    assert.equal(t.text(), 'Planet Inner Mars Outer Saturn', 'groups of { label, options }');
    t.press('Saturn');
    assert.deepEqual(t.values(), ['saturn', 'saturn']);
    assert.deepEqual(picks, [['saturn', 'Saturn', 'Outer'], ['saturn', 'Saturn', 'Outer']]);
    assert.deepEqual(changes, [['saturn'], ['saturn']]);
    t.dispose();
  });

  it('match(option, search) decides, shown caps; renderOption(option, { picked })', () => {
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), 'mars'));
        const starts = (/** @type {any} */ o, /** @type {string} */ q) => o.label.toLowerCase().startsWith(q.toLowerCase());
        return (
          <Picker
            searchable
            data={[{ value: 'mars', label: 'Mars' }, { value: 'mercury', label: 'Mercury' }, { value: 'saturn', label: 'Saturn' }, { value: 'venus', label: 'Venus' }]}
            match={starts}
            limit={2}
            check={false}
            renderOption={(/** @type {any} */ o, /** @type {{ picked: boolean }} */ s) => <Text>{`${o.label}${s.picked ? ' (picked)' : ''}`}</Text>}
            value={v}
            onChange={(/** @type {any} */ x) => $write(v, x)}
          >
            <Picker.Trigger>
              <Button>Planet</Button>
            </Picker.Trigger>
          </Picker>
        );
      }),
    );
    t.press('Planet');
    assert.equal(t.text(), 'Planet Search Mars (picked) Mercury', 'shown 2: the first two; the picked one marked');
    t.focusEdit();
    t.type('s');
    assert.equal(t.text(), 'Planet s Saturn', 'match: the labels starting with s');
    t.dispose();
  });

  it('Select starts its value and its options (DOM and Skia)', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Select data={['Apple', 'Cherry']} defaultValue="Apple" w={300} open popover={{ portal: false }} />
      </Rui>
    ));
    $flush(dom.root);
    // On the DOM an Action is a button, centering its text: a start aligns it.
    const labels = dom.nodes('Label').filter((/** @type {any} */ n) => n.textContent === 'Apple' || n.textContent === 'Cherry');
    assert.equal(labels.length, 3, 'the value and two options');
    for (const label of labels) {
      let at = label;
      while (at.style.textAlign === '' && at.getAttribute('data-ren') !== 'Action') at = at.parentElement;
      if (at.style.textAlign === '') at = at.parentElement;
      assert.equal(at.style.textAlign, 'start', `${label.textContent} started`);
    }
    skia.skia.present();
    const field = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'Apple');
    assert.ok(field[2] < 40, `the value at the field's start on Skia (${field[2]})`);
    dispose();
  });

  it('PlainSelect shows the first option and chooses without deselecting', () => {
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), 'apple'));
        return <PlainSelect data={[{ value: 'apple', label: 'Apple' }, { value: 'cherry', label: 'Cherry' }]} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    assert.equal(t.text(), 'Apple');
    t.press('Apple');
    t.press('Cherry');
    assert.deepEqual(t.values(), ['cherry', 'cherry']);
    t.press('Cherry');
    t.pick('Cherry');
    assert.deepEqual(t.values(), ['cherry', 'cherry'], 'no deselecting');
    assert.equal(t.text(), 'Cherry');
    t.dispose();
  });
});

describe('MultiSelect, TagInput, Autocomplete, Tag', () => {
  it('MultiSelect: picks by press and keys, shows tags, removes them, respects max and hides picked options', () => {
    /** @type {string[]} */
    const picks = [];
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {string[]} */ ([])));
        return <MultiSelect placeholder="Pick" data={['Apple', 'Cherry', 'Grape', 'Banana']} max={3} picked={false} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} onPick={(/** @type {string} */ x) => picks.push(x)} />;
      }),
    );
    assert.equal(t.text(), 'Pick');
    t.focusEdit();
    t.type('r');
    assert.equal(t.text(), 'r Cherry Grape');
    t.key('Enter');
    assert.deepEqual(t.values(), [['Cherry'], ['Cherry']]);
    assert.equal(t.text(), 'Cherry Apple Grape Banana', 'a tag, the search cleared, the panel open without the picked one');
    t.press('Banana');
    t.press('Apple');
    assert.deepEqual(t.values(), [['Cherry', 'Banana', 'Apple'], ['Cherry', 'Banana', 'Apple']]);
    t.press('Grape');
    assert.deepEqual(t.values()[0], ['Cherry', 'Banana', 'Apple'], 'max');
    assert.deepEqual(picks, ['Cherry', 'Cherry', 'Banana', 'Banana', 'Apple', 'Apple'], 'onPick hears no pick max refuses (both renderers)');
    // Close the panel: a press while open lands on its backdrop, as on the DOM.
    t.key('Escape');
    // Remove a tag with its button.
    t.d.tap(t.dom.document.querySelector('[aria-label="Remove Banana"]'));
    const x = t.s.items().find(i => i.label === 'Remove Banana');
    t.s.at(t.s.box(x).x + 3, t.s.box(x).y + 3);
    t.settle();
    assert.deepEqual(t.values(), [['Cherry', 'Apple'], ['Cherry', 'Apple']]);
    // Backspace in the empty search removes the last.
    t.focusEdit();
    t.key('Backspace');
    assert.deepEqual(t.values(), [['Cherry'], ['Cherry']]);
    t.dispose();
  });

  it('MultiSelect and Select follow an option relabeled under the same value, in the panel and the field', () => {
    const datas = states();
    const t = setup((clock, st) =>
      app(clock, () => {
        const data = datas.add($signal($active(), [{ value: 'A', label: 'One' }]));
        const v = st.add($signal($active(), /** @type {string[]} */ ([])));
        return <MultiSelect data={data} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    t.focusEdit();
    t.key('ArrowDown');
    assert.equal(t.text(), 'One');
    t.pick('One');
    assert.deepEqual(t.values(), [['A'], ['A']]);
    assert.equal(t.text(), 'One One', 'the tag and the option, the panel open');
    for (const d of datas.list) $write(d, [{ value: 'A', label: 'Two' }]);
    t.settle();
    assert.equal(t.text(), 'Two Two', 'the open panel and the field show the new label');
    t.key('Escape');
    assert.equal(t.text(), 'Two');
    t.key('ArrowDown');
    assert.equal(t.text(), 'Two Two', 'reopened too');
    t.dispose();

    const sdatas = states();
    const u = setup((clock, st) =>
      app(clock, () => {
        const data = sdatas.add($signal($active(), [{ value: 'A', label: 'One' }, 'B']));
        const v = st.add($signal($active(), /** @type {string | null} */ ('A')));
        return <Select data={data} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    u.press('One');
    assert.equal(u.text(), 'One One B');
    u.pick('B');
    assert.deepEqual(u.values(), ['B', 'B']);
    for (const d of sdatas.list) $write(d, [{ value: 'A', label: 'Two' }, 'B']);
    u.settle();
    u.press('B');
    assert.equal(u.text(), 'B Two B', 'the panel shows the new label');
    u.pick('Two');
    assert.deepEqual(u.values(), ['A', 'A'], 'a press on the relabeled option hands its value');
    assert.equal(u.text(), 'Two', 'the field shows the new label');
    u.dispose();
  });

  it('TagInput: Enter adds, separators split, duplicates and max refused, Backspace removes', () => {
    /** @type {string[]} */
    const repeats = [];
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {string[]} */ ([])));
        return <TagInput placeholder="Tags" max={4} onRepeat={(/** @type {string} */ x) => repeats.push(x)} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    t.focusEdit();
    t.type('one');
    t.key('Enter');
    assert.deepEqual(t.values(), [['one'], ['one']]);
    t.type('two;three,');
    assert.deepEqual(t.values(), [['one', 'two', 'three'], ['one', 'two', 'three']], 'a comma or a semicolon ends a tag');
    t.type('one');
    t.key('Enter');
    assert.deepEqual(t.values()[1], ['one', 'two', 'three'], 'no duplicates');
    assert.deepEqual(repeats, ['one', 'one'], 'onRepeat hears the refused tag');
    assert.equal(t.text(), 'one two three', 'the duplicate is dropped from the entry');
    t.type('four,five,');
    assert.deepEqual(t.values(), [['one', 'two', 'three', 'four'], ['one', 'two', 'three', 'four']], 'max');
    t.key('Backspace');
    assert.deepEqual(t.values()[0], ['one', 'two', 'three']);
    t.dispose();
  });

  it('TagInput: onPick hears only a suggestion max lets through', () => {
    /** @type {string[]} */
    const picks = [];
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {string[]} */ (['one'])));
        return <TagInput placeholder="Tags" max={1} data={['Alpha', 'Beta']} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} onPick={(/** @type {string} */ x) => picks.push(x)} />;
      }),
    );
    t.focusEdit();
    t.type('Al');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.values(), [['one'], ['one']], 'max refuses the suggestion');
    assert.deepEqual(picks, [], 'onPick hears no pick max refuses (both renderers)');
    t.dispose();
  });

  it('Autocomplete: typing suggests, a choice fills the text', () => {
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), ''));
        return <Autocomplete placeholder="City" data={['Berlin', 'Bern', 'Paris']} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    t.focusEdit();
    t.type('Ber');
    assert.equal(t.text(), 'Ber Berlin Bern');
    t.key('ArrowDown');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.values(), ['Bern', 'Bern']);
    t.focusEdit();
    t.type('x');
    assert.equal(t.text(), 'Bernx', 'no suggestion, no panel');
    t.dispose();
  });

  it('Autocomplete: a choice fills the text with its label; onPick gets its value and option', () => {
    /** @type {any[]} */
    const picks = [];
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), ''));
        const data = [{ value: 'pt', label: 'Portugal' }, { value: 'es', label: 'Spain' }];
        return <Autocomplete data={data} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} onPick={(/** @type {any} */ x, /** @type {any} */ o) => picks.push([x, o.label])} />;
      }),
    );
    t.focusEdit();
    t.type('Port');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.values(), ['Portugal', 'Portugal'], 'the label, not "pt"');
    assert.deepEqual(picks, [['pt', 'Portugal'], ['pt', 'Portugal']]);
    t.dispose();
  });

  it('Select and Autocomplete locked: the keys neither open nor choose', () => {
    for (const lock of [{}, { readOnly: true }, { disabled: true }]) {
      const which = Object.keys(lock)[0] ?? 'unlocked';
      const t = setup((clock, st) =>
        app(clock, () => {
          const v = st.add($signal($active(), /** @type {any} */ (null)));
          return <Select placeholder="Fruit" {...lock} data={['Apple', 'Pear']} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
        }),
      );
      // The trigger (an Action named by the placeholder) takes the focus on both.
      t.d.find('Fruit').focus();
      t.s.find('Fruit').parent.focus();
      t.flush();
      // ArrowDown opens, ArrowDown moves to the first option, Enter chooses.
      t.key('ArrowDown');
      t.key('ArrowDown');
      t.key('Enter');
      if (which === 'unlocked') {
        assert.deepEqual(t.values(), ['Apple', 'Apple'], 'unlocked: the keys choose (the path the lock must close)');
        t.dispose();
        continue;
      }
      assert.equal(t.text(), 'Fruit', `Select ${which}: no panel`);
      assert.deepEqual(t.values(), [null, null], `Select ${which}: nothing chosen`);
      t.dispose();

      const a = setup((clock, st) =>
        app(clock, () => {
          const v = st.add($signal($active(), 'Pe'));
          return <Autocomplete placeholder="Fruit" {...lock} data={['Pear', 'Peach']} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
        }),
      );
      a.focusEdit();
      a.key('ArrowDown');
      a.key('Enter');
      assert.equal(a.text(), 'Pe', `Autocomplete ${which}: no panel`);
      assert.deepEqual(a.values(), ['Pe', 'Pe'], `Autocomplete ${which}: nothing chosen`);
      a.dispose();
    }
  });

  it('MultiSelect and TagInput locked: the keys neither open nor pick', () => {
    for (const lock of [{}, { readOnly: true }, { disabled: true }]) {
      const which = Object.keys(lock)[0] ?? 'unlocked';
      const t = setup((clock, st) =>
        app(clock, () => {
          const v = st.add($signal($active(), /** @type {string[]} */ ([])));
          return <MultiSelect placeholder="Fruits" searchable {...lock} data={['Apple', 'Pear']} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
        }),
      );
      t.focusEdit();
      t.key('ArrowDown');
      t.key('ArrowDown');
      t.key('Enter');
      if (which === 'unlocked') assert.deepEqual(t.values(), [['Apple'], ['Apple']], 'unlocked: the keys pick (the path the lock must close)');
      else assert.deepEqual(t.values(), [[], []], `MultiSelect ${which}: nothing picked`);
      t.dispose();

      const g = setup((clock, st) =>
        app(clock, () => {
          const v = st.add($signal($active(), /** @type {string[]} */ ([])));
          return <TagInput placeholder="Tags" {...lock} data={['north', 'south']} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
        }),
      );
      g.focusEdit();
      g.key('ArrowDown');
      g.key('ArrowDown');
      g.key('Enter');
      if (which === 'unlocked') assert.deepEqual(g.values(), [['north'], ['north']], 'unlocked: the keys add a suggestion');
      else assert.deepEqual(g.values(), [[], []], `TagInput ${which}: nothing added`);
      g.dispose();
    }
  });

  it('Autocomplete disabled or read-only: no typing, no opening, no clearing', () => {
    for (const lock of [{ disabled: true }, { readOnly: true }]) {
      const t = setup((clock, st) =>
        app(clock, () => {
          const v = st.add($signal($active(), 'Ber'));
          return <Autocomplete placeholder="City" clearable {...lock} data={['Berlin', 'Bern', 'Paris']} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
        }),
      );
      const which = Object.keys(lock)[0];
      assert.equal(t.d.nodes('Action').some((/** @type {any} */ n) => n.getAttribute('aria-label') === 'Clear'), false, `${which}: no clear`);
      assert.equal(t.d.nodes('Edit')[0].getAttribute(which === 'disabled' ? 'disabled' : 'readonly') !== null || t.d.nodes('Edit')[0][which] === true, true, `${which}: the Edit knows`);
      const field = t.s.box(t.s.items().filter((/** @type {any} */ n) => n.kind === 4)[0]);
      t.s.at(field.x + 4, field.y + 4);
      t.d.tap(t.d.nodes('Edit')[0]);
      t.settle();
      assert.equal(t.text(), 'Ber', `${which}: a press opens no suggestions`);
      t.focusEdit();
      t.type('lin');
      assert.deepEqual(t.values(), ['Ber', 'Ber'], `${which}: typing changes nothing`);
      assert.equal(t.text(), 'Ber');
      t.dispose();
    }
  });

  it('Tag, Tag.Group and TagBox', () => {
    const t = setup((clock, st) =>
      app(clock, () => {
        const removed = st.add($signal($active(), 0));
        const typed = st.add($signal($active(), ''));
        return (
          <>
            <Tag.Group>
              <Tag>Plain</Tag>
              <Tag removable onRemove={() => $write(removed, $read(removed) + 1)}>Closable</Tag>
            </Tag.Group>
            <TagBox label="Tags" placeholder="more" onSearchChange={(/** @type {string} */ x) => $write(typed, x)}>
              <Tag>In</Tag>
            </TagBox>
          </>
        );
      }),
    );
    assert.equal(t.text(), 'Plain Closable Tags In more', 'the entry after the tags, with its placeholder');
    t.d.tap(t.dom.document.querySelector('[aria-label="Remove Closable"]'));
    const x = t.s.items().find(i => i.label === 'Remove Closable');
    t.s.at(t.s.box(x).x + 3, t.s.box(x).y + 3);
    assert.deepEqual(t.values(), [1, '', 1, '']);
    // TagBox builds its own entry after the tags.
    t.focusEdit();
    t.type('new');
    assert.deepEqual(t.values(), [1, 'new', 1, 'new']);
    t.dispose();
  });

  it('MultiSelect, TagInput and TreeSelect locked later: their tags lose their remove buttons', () => {
    const tree = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];
    for (const lockWith of ['disabled', 'readOnly']) {
      /** @type {any[]} */
      const locks = [];
      let flag = false;
      const t = setup((clock, st) =>
        app(clock, () => {
          const lock = $signal($active(), false);
          locks.push(lock);
          // The lock read reactively, or where no signal says it changed (a plain flag).
          const at = { [lockWith]: () => $read(lock) || flag };
          const m = st.add($signal($active(), /** @type {string[]} */ (['Apple'])));
          const g = st.add($signal($active(), /** @type {string[]} */ (['north'])));
          const r = st.add($signal($active(), /** @type {string[]} */ (['a'])));
          return (
            <>
              <MultiSelect {...at} data={['Apple', 'Pear']} value={m} onChange={(/** @type {any} */ x) => $write(m, x)} />
              <TagInput {...at} value={g} onChange={(/** @type {any} */ x) => $write(g, x)} />
              <TreeSelect checks {...at} data={tree} value={r} onChange={(/** @type {any} */ x) => $write(r, x)} />
            </>
          );
        }),
      );
      const buttons = () => [
        t.d.nodes('Action').filter((/** @type {any} */ n) => (n.getAttribute('aria-label') ?? '').startsWith('Remove')).length,
        t.s.items().filter((/** @type {any} */ i) => String(i.label ?? '').startsWith('Remove')).length,
      ];
      assert.deepEqual(buttons(), [3, 3], 'unlocked: a remove button on each tag');
      for (const lock of locks) $write(lock, true);
      t.settle();
      assert.deepEqual(buttons(), [0, 0], `${lockWith} later: no remove buttons`);
      for (const lock of locks) $write(lock, false);
      t.settle();
      assert.deepEqual(buttons(), [3, 3], 'unlocked again: the buttons are back');
      // A remove button still shown on a locked field (its lock not followed) changes nothing.
      flag = true;
      for (const name of ['Apple', 'north', 'Alpha']) {
        t.d.tap(t.dom.document.querySelector(`[aria-label="Remove ${name}"]`));
        const x = t.s.items().find((/** @type {any} */ i) => i.label === `Remove ${name}`);
        t.s.at(t.s.box(x).x + 3, t.s.box(x).y + 3);
      }
      t.settle();
      assert.deepEqual(t.values(), [['Apple'], ['north'], ['a'], ['Apple'], ['north'], ['a']], `${lockWith}: nothing removed`);
      t.dispose();
    }
  });

  it('TagBox, MultiSelect and TagInput disabled: their entries are disabled too; TagBox hears no keys', () => {
    /** @type {string[]} */
    const keys = [];
    const t = setup(clock =>
      app(clock, () => (
        <>
          <TagBox label="Tags" disabled onKey={(/** @type {any} */ e) => keys.push(e.key)}>
            <Tag>In</Tag>
          </TagBox>
          <MultiSelect label="Fruits" disabled data={['Apple']} />
          <TagInput label="Words" disabled />
        </>
      )),
    );
    const d = t.d.nodes('Edit')[0];
    assert.deepEqual(t.d.nodes('Edit').map((/** @type {any} */ n) => [n.disabled, n.getAttribute('aria-disabled')]), [[true, 'true'], [true, 'true'], [true, 'true']], 'the DOM: the entries are disabled');
    const s = t.s.items().filter((/** @type {any} */ n) => n.kind === 4)[0];
    assert.deepEqual(t.s.items().filter((/** @type {any} */ n) => n.kind === 4).map((/** @type {any} */ n) => n.disabled), [true, true, true], 'Skia: the entries are disabled');
    d.dispatchEvent(new t.dom.window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    t.skia.skia.key('Backspace');
    t.settle();
    assert.deepEqual(keys, [], 'no onKey while disabled');
    t.dispose();
  });

  it('Tag pads its sides by ratios.pad of its font size; a removable one ends in its button', () => {
    const t = setup((clock, st) =>
      app(clock, () => (
        <>
          <Tag>Plain</Tag>
          <Tag removable>Closable</Tag>
          <Tag removable disabled>Locked</Tag>
        </>
      )),
    );
    const tag = (/** @type {string} */ text) => [...t.dom.document.querySelectorAll('*')].find(n => n.textContent === text && n.style.height === '16px');
    // xs: 16 high, 10 px text: 8 px sides; the remove circle 12, 2 px from the end as from the top.
    assert.deepEqual([tag('Plain').style.paddingLeft, tag('Plain').style.paddingRight], ['8px', '8px']);
    assert.deepEqual([tag('Closable').style.paddingLeft, tag('Closable').style.paddingRight], ['8px', '2px']);
    assert.equal(tag('Locked').style.paddingRight, '8px', 'disabled: no button, the plain end');
    t.dispose();
  });
});

describe('TreeSelect, Picker', () => {
  const tree = [
    { value: 'produce', label: 'Produce', children: [{ value: 'citrus', label: 'Citrus', children: [{ value: 'lemon', label: 'Lemon' }, { value: 'lime', label: 'Lime' }] }] },
    { value: 'dairy', label: 'Dairy', children: [{ value: 'cheese', label: 'Cheese' }] },
  ];

  it("TreeSelect press: 'select' chooses a parent, 'expand' opens it instead", () => {
    for (const [press, text, value] of /** @type {[string | undefined, string, any][]} */ ([
      [undefined, 'Dairy', 'dairy'],
      ['expand', 'Node Produce Dairy Cheese', null],
    ])) {
      const t = setup((clock, st) =>
        app(clock, () => {
          const v = st.add($signal($active(), /** @type {any} */ (null)));
          return <TreeSelect placeholder="Node" press={press} data={tree} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
        }),
      );
      t.press('Node');
      t.press('Dairy');
      assert.equal(t.text(), text, String(press));
      assert.deepEqual(t.values(), [value, value], String(press));
      t.dispose();
    }
  });

  it('TreeSelect without a placeholder: its trigger named Options, a dense control high', () => {
    const t = setup(clock => app(clock, () => <TreeSelect data={tree} size="md" />));
    const trigger = t.dom.document.querySelector('[aria-label="Options"]');
    assert.ok(trigger !== null, 'the fallback name');
    assert.equal(css(trigger).height, `${BASE_THEME.sizes.dense.md}px`);
    t.dispose();
  });

  it('a disabled tree row wears the option look: dimmed, the plain pointer, aria-disabled', () => {
    const data = [{ value: 'a', label: 'Open' }, { value: 'b', label: 'Shut', disabled: true }];
    for (const make of [() => <TreeSelect placeholder="Node" data={data} />]) {
      const t = setup(clock => app(clock, make));
      t.press('Node');
      const shut = t.d.find('Shut');
      assert.equal(shut.getAttribute('aria-disabled'), 'true');
      assert.equal(css(shut).opacity, String(BASE_THEME.opacity.disabled));
      assert.equal(css(shut).cursor, 'default');
      assert.equal(t.d.find('Open').getAttribute('aria-disabled'), null);
      t.dispose();
    }
  });

  it('TreeSelect: expand by the chevron and the keys, choose by press and Enter, many with checks', () => {
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {any} */ (null)));
        return <TreeSelect placeholder="Node" data={tree} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    t.press('Node');
    assert.equal(t.text(), 'Node Produce Dairy');
    assert.ok([...t.dom.document.querySelectorAll('[data-ren="Scroll"]')].some(n => /max-height: 280px/.test(n.getAttribute('style'))), 'the list scrolls past 280 by default, as Select\'s');
    // The chevrons are drawn Views, named for the tests only (aria-label, decoration).
    const chevron = (/** @type {string} */ label) => t.s.items().find(i => i.other?.get?.('aria-label') === label);
    const turn = (/** @type {string} */ label) => chevron(label).first.style.rotate;
    assert.ok(Number.isNaN(turn('Expand Dairy')), 'collapsed: one drawing, pointing to the row\'s end, not turned');
    t.d.tap(t.dom.document.querySelector('[aria-label="Expand Dairy"]'));
    const x = chevron('Expand Dairy');
    t.s.at(t.s.box(x).x + 3, t.s.box(x).y + 3);
    t.settle();
    assert.equal(t.text(), 'Node Produce Dairy Cheese');
    assert.equal(turn('Collapse Dairy'), 90, 'open: turned +90 degrees to point down');
    t.press('Cheese');
    assert.deepEqual(t.values(), ['cheese', 'cheese']);
    assert.equal(t.text(), 'Cheese');
    t.key('ArrowDown');
    t.key('ArrowUp');
    t.key('ArrowUp');
    t.key('ArrowRight');
    assert.equal(t.text(), 'Cheese Produce Citrus Dairy Cheese');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.values(), ['citrus', 'citrus']);
    t.dispose();

    const c = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {string[]} */ ([])));
        return <TreeSelect checks defaultExpanded panelHeight={60} placeholder="Nodes" data={tree} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    c.press('Nodes');
    // panelHeight scrolls the list, as Select's: a Scroll on both, 60 high.
    const scroll = c.s.items().find(i => i.kind === 2);
    assert.ok(scroll !== undefined && c.s.box(scroll).height === 60, 'a Scroll 60 high on Skia');
    assert.ok([...c.dom.document.querySelectorAll('[data-ren="Scroll"]')].some(n => /max-height: 60px/.test(n.getAttribute('style'))), 'and on the DOM');
    c.press('Citrus');
    assert.deepEqual(c.values(), [['lemon', 'lime'], ['lemon', 'lime']], 'a parent checks its leaves');
    c.press('Lemon');
    assert.deepEqual(c.values()[0], ['lime']);
    c.dispose();

    const k = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {string[]} */ ([])));
        return <TreeSelect checks strict defaultExpanded placeholder="Nodes" data={tree} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    k.press('Nodes');
    k.pick('Citrus');
    assert.deepEqual(k.values(), [['citrus'], ['citrus']], 'strict: the parent alone, not its leaves');
    k.pick('Lemon');
    assert.deepEqual(k.values(), [['citrus', 'lemon'], ['citrus', 'lemon']]);
    k.pick('Lime');
    assert.deepEqual(k.values(), [['citrus', 'lemon', 'lime'], ['citrus', 'lemon', 'lime']], 'every child checked leaves the parent as it was');
    k.pick('Citrus');
    assert.deepEqual(k.values(), [['lemon', 'lime'], ['lemon', 'lime']], 'unchecking the parent leaves its children');
    k.pick('Produce');
    assert.deepEqual(k.values(), [['lemon', 'lime', 'produce'], ['lemon', 'lime', 'produce']]);
    k.dispose();
  });

  it('TreeSelect checks at max: a parent max refuses entirely fires no onChange', () => {
    const data = [
      { value: 'produce', label: 'Produce', children: [{ value: 'lemon', label: 'Lemon' }, { value: 'lime', label: 'Lime' }] },
      { value: 'dairy', label: 'Dairy', children: [{ value: 'cheese', label: 'Cheese' }] },
    ];
    /** @type {any[]} */
    const changes = [];
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {string[]} */ ([])));
        return <TreeSelect pick="many" checks max={1} defaultExpanded placeholder="Node" data={data} value={v} onChange={(/** @type {any} */ x) => { changes.push(x); $write(v, x); }} />;
      }),
    );
    t.press('Node');
    t.press('Dairy');
    assert.deepEqual(t.values(), [['cheese'], ['cheese']]);
    assert.equal(changes.length, 2, 'one change on each renderer');
    t.press('Produce');
    assert.deepEqual(t.values(), [['cheese'], ['cheese']], 'max refuses both leaves');
    assert.equal(changes.length, 2, 'and the value did not change, so onChange stays quiet');
    t.dispose();
  });

  it('TreeSelect checks: a parent toggles its enabled leaves only; a disabled leaf keeps its state', () => {
    const data = [
      { value: 'tools', label: 'Tools', children: [{ value: 'saw', label: 'Saw' }, { value: 'vise', label: 'Vise', disabled: true }, { value: 'awl', label: 'Awl' }] },
    ];
    for (const [start, on, off] of /** @type {[string[], string[], string[]][]} */ ([
      [[], ['saw', 'awl'], []],
      [['vise'], ['vise', 'saw', 'awl'], ['vise']],
    ])) {
      const t = setup((clock, st) =>
        app(clock, () => {
          const v = st.add($signal($active(), /** @type {string[]} */ (start)));
          return <TreeSelect checks defaultExpanded defaultOpen placeholder="Kit" data={data} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
        }),
      );
      t.pick('Tools');
      assert.deepEqual(t.values(), [on, on], `from ${start}: the enabled leaves checked, Vise as it was`);
      t.pick('Tools');
      assert.deepEqual(t.values(), [off, off], `from ${start}: every enabled leaf on, so the press unchecks them; Vise as it was`);
      t.dispose();
    }
  });

  it('TreeSelect checks under a max lowered later: unchecking a parent removes its leaves only, keeping the rest', () => {
    const data = [
      { value: 'produce', label: 'Produce', children: [{ value: 'lemon', label: 'Lemon' }, { value: 'lime', label: 'Lime' }] },
      { value: 'dairy', label: 'Dairy', children: [{ value: 'cheese', label: 'Cheese' }, { value: 'milk', label: 'Milk' }] },
    ];
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {string[]} */ (['cheese', 'milk', 'lemon', 'lime'])));
        return <TreeSelect checks max={1} defaultExpanded defaultOpen placeholder="Node" data={data} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    t.pick('Produce');
    assert.deepEqual(t.values(), [['cheese', 'milk'], ['cheese', 'milk']], 'Produce unchecked; the values outside it stay, though over max');
    t.pick('Produce');
    assert.deepEqual(t.values(), [['cheese', 'milk'], ['cheese', 'milk']], 'over max, a press adds nothing and drops nothing');
    t.dispose();
  });

  it("TreeSelect pick 'many': a value array without checks, each node alone; a disabled row skipped by the keys and deaf to a press", () => {
    const data = [
      { value: 'tools', label: 'Tools', children: [{ value: 'saw', label: 'Saw' }, { value: 'vise', label: 'Vise', disabled: true }, { value: 'awl', label: 'Awl' }] },
    ];
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {string[]} */ ([])));
        return <TreeSelect pick="many" defaultExpanded placeholder="Kit" data={data} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    t.press('Kit');
    // The DOM's tap leaves the focus where it was; Skia's press focuses the trigger.
    t.d.find('Kit').focus();
    t.key('ArrowDown');
    t.key('ArrowDown');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.values(), [['awl'], ['awl']], 'the keys step over Vise to Awl');
    t.press('Tools');
    assert.deepEqual(t.values(), [['awl', 'tools'], ['awl', 'tools']], 'a parent alone: no cascade without checks; the panel stays open for more');
    t.press('Vise');
    assert.deepEqual(t.values(), [['awl', 'tools'], ['awl', 'tools']], 'a disabled row is not chosen');
    t.press('Saw');
    assert.deepEqual(t.values(), [['awl', 'tools', 'saw'], ['awl', 'tools', 'saw']]);
    t.dispose();
  });

  it('TreeSelect searchable: the matching nodes and their ancestors, open; lines join the nodes', () => {
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {any} */ (null)));
        return <TreeSelect searchable placeholder="Find" empty="Nothing" data={tree} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
      }),
    );
    t.focusEdit();
    t.type('li');
    assert.equal(t.text(), 'li Produce Citrus Lime', 'Lime and its ancestors, open');
    t.key('ArrowDown');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.values(), ['lime', 'lime']);
    assert.equal(t.text(), 'Lime', 'chosen: the field shows its label');
    t.focusEdit();
    t.type('x');
    assert.equal(t.text(), 'Limex Nothing', 'typing after the label searches it all');
    t.dispose();

    for (const lines of [true, false, undefined]) {
      const l = setup((clock, st) =>
        app(clock, () => {
          st.add($signal($active(), null));
          return <TreeSelect defaultExpanded guides={lines} defaultOpen placeholder="Lines" data={tree} />;
        }),
      );
      // Under the parent's chevron: half an iconBox.xs in.
      const mid = BASE_THEME.sizes.iconBox.xs / 2;
      const dom = [...l.dom.document.querySelectorAll('[data-ren="View"]')].filter(n => css(n).left === `${mid}px` && css(n).position === 'absolute').length;
      l.s.text();
      const skia = l.s.items().filter(i => i.style?.left === mid && (i.style?.width === 1 || i.style?.height === 1)).length;
      // Citrus, Lemon, Lime and Cheese: a branch each (down and across; the last child's down to its middle).
      assert.equal(dom, lines ? 8 : 0, `the lines on the DOM (${lines}; none by default)`);
      assert.equal(skia, dom, 'the same on Skia');
      l.dispose();
    }
  });

  it('Combobox.Value hands the value to a $form and to onChange, joined', () => {
    /** @type {any[]} */
    const forms = [];
    /** @type {string[]} */
    const seen = [];
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {string[]} */ (['a'])));
        const form = $form({ values: { tags: '', size: null } });
        forms.push(form);
        return (
          <>
            <MultiSelect placeholder="Tags" data={['a', 'b', 'c']} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />
            <Combobox.Value form={form} name="tags" value={v} separator=";" onChange={(/** @type {string} */ x) => seen.push(x)} />
            <Select placeholder="Size" data={['S', 'M', 'L']} {...form.bind('size', { as: 'value' })} />
          </>
        );
      }),
    );
    t.flush();
    assert.deepEqual(forms.map(f => f.get().tags), ['a', 'a'], 'at once');
    for (const x of t.st.list) $write(x, ['a', 'c']);
    t.flush();
    assert.deepEqual(forms.map(f => f.get().tags), ['a;c', 'a;c']);
    assert.deepEqual(seen, ['a', 'a', 'a;c', 'a;c']);
    // Without a separator: a comma and a space.
    /** @type {string[]} */
    const plain = [];
    const u = setup(clock => app(clock, () => <Combobox.Value value={['x', 'y']} onChange={(/** @type {string} */ x) => plain.push(x)} />));
    u.flush();
    assert.deepEqual(plain, ['x, y', 'x, y']);
    u.dispose();
    // A Select bound to the form: its value is the form's.
    t.press('Size');
    t.press('M');
    assert.deepEqual(forms.map(f => f.get().size), ['M', 'M'], 'bind(path, { as: \'value\' })');
    t.dispose();
  });

  it('Picker: options on a button of its own, one or many', () => {
    const t = setup((clock, st) =>
      app(clock, () => {
        const v = st.add($signal($active(), /** @type {any} */ ([])));
        return (
          <Picker multiple data={['Bold', 'Italic']} value={v} onChange={(/** @type {any} */ x) => $write(v, x)}>
            <Picker.Trigger>
              <Button>Style</Button>
            </Picker.Trigger>
          </Picker>
        );
      }),
    );
    t.press('Style');
    assert.equal(t.text(), 'Style Bold Italic');
    t.press('Italic');
    t.press('Bold');
    assert.deepEqual(t.values(), [['Italic', 'Bold'], ['Italic', 'Bold']]);
    assert.equal(t.text(), 'Style Bold Italic', 'stays open for many');
    t.key('Escape');
    t.d.find('Style').focus();
    t.s.find('Style').focus();
    t.key('Escape');
    assert.equal(t.text(), 'Style');
    t.dispose();
  });
});

describe('combobox fields in a For row', () => {
  it('a Select in a For row renders and opens (its ref writes its anchor), keyed or by position, as a thunk child does', () => {
    for (const by of /** @type {const} */ ([undefined, 'position'])) {
      const t = setup((clock, st) =>
        app(clock, () => (
          <Stack>
            <For each={() => [1]} by={by}>
              {() => {
                const v = st.add($signal($active(), /** @type {string | null} */ (null)));
                return <Select label="Payer" placeholder="Pick" data={[{ value: 'a', label: 'A' }]} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
              }}
            </For>
          </Stack>
        )),
      );
      assert.equal(t.text(), 'Payer Pick');
      t.press('Pick');
      assert.equal(t.text(), 'Payer Pick A', `${by ?? 'keyed'}: the panel opens under its field`);
      t.pick('A');
      assert.deepEqual(t.values(), ['a', 'a']);
      t.dispose();
    }
  });
});

describe('Lightbox', () => {
  const FRUITS = ['Apple', 'Banana', 'Cherry'];
  const MANY = ['Apple', 'Apricot', 'Banana', 'Blueberry', 'Cherry', 'Date', 'Fig', 'Grape', 'Kiwi', 'Lemon', 'Mango', 'Melon'];
  /**
   * A Select (or a MultiSelect, `multi`) in a theme whose lightbox is `lightbox`, in a window `size`.
   * @param {Record<string, any>} extra @param {{ multi?: boolean, theme?: any, size?: { width: number, height: number } }} [how]
   */
  const field = (extra, how = {}) =>
    setup(
      (clock, st) => () => (
        <Clock value={clock}>
          <Rui theme={how.theme ?? BASE_THEME}>
            <View style={{ padding: 20, gap: 8 }}>
              {() => {
                const v = st.add($signal($active(), how.multi ? [] : null));
                const Field = how.multi ? MultiSelect : Select;
                return <Field label="Fruit" placeholder="Your pick" data={FRUITS} {...extra} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
              }}
            </View>
          </Rui>
        </Clock>
      ),
      how.size ?? { width: 360, height: 640 },
    );
  /** The Skia box of the panel holding option `text`: its nearest ancestor much wider than the label. @param {any} t @param {string} text */
  const boxOf = (t, text) => {
    let n = t.s.find(text);
    const label = t.s.box(n);
    while (n.parent != null && t.s.box(n.parent).width < label.width + 120) n = n.parent;
    return t.s.box(n.parent ?? n);
  };

  it('a Select opens its options centered, titled by its label; a pick closes it; the field is pressed, not typed in', () => {
    const t = field({ lightbox: true, searchable: true });
    assert.equal(t.d.nodes('Edit').length, 0, 'no field to type in');
    t.press('Your pick');
    assert.match(t.text(), /Fruit Your pick Fruit .*Apple Banana Cherry/);
    // a searchable one filters in the box
    assert.equal(t.d.nodes('Edit').length, 1, 'the box holds the filter');
    const box = boxOf(t, 'Banana');
    assert.ok(Math.abs(box.x + box.width / 2 - 180) < 2, `centered across the window: ${box.x} + ${box.width}`);
    t.pick('Banana');
    assert.deepEqual(t.values(), ['Banana', 'Banana']);
    assert.doesNotMatch(t.text(), /Apple/, 'closed');
    // the pressed field's value is cut with an ellipsis where it is narrow, never under the chevron
    const value = t.d.nodes('Label').find(n => n.textContent.trim() === 'Banana');
    assert.equal(value.style.textOverflow, 'ellipsis');
    assert.equal(value.style.minWidth, '0px');
    t.dispose();
  });

  it('a long list shows its filter, which narrows with keys; a short one none; Escape closes', () => {
    const t = field({ lightbox: true, data: MANY });
    t.press('Your pick');
    assert.equal(t.d.nodes('Edit').length, 1, 'more than 10 options: the filter');
    t.focusEdit(0);
    t.type('me');
    assert.match(t.text(), /Melon/);
    assert.doesNotMatch(t.text(), /Apple|Mango/);
    t.key('Enter');
    assert.deepEqual(t.values(), ['Melon', 'Melon']);
    t.press('Melon');
    t.key('Escape');
    assert.doesNotMatch(t.text(), /Apricot/, 'Escape closes it');
    t.dispose();
    const short = field({ lightbox: true });
    short.press('Your pick');
    assert.equal(short.d.nodes('Edit').length, 0, '3 options: no filter');
    short.dispose();
  });

  it('a MultiSelect stays open while picking, until Done', () => {
    const t = field({ lightbox: true }, { multi: true });
    // pressed in its entry, on both
    t.d.tap(t.d.nodes('Edit')[0]);
    const entry = t.s.box(t.s.items().filter((/** @type {any} */ n) => n.kind === 4)[0]);
    t.s.at(entry.x + 4, entry.y + 4);
    t.settle();
    t.pick('Apple');
    t.pick('Cherry');
    assert.deepEqual(t.values(), [['Apple', 'Cherry'], ['Apple', 'Cherry']]);
    assert.match(t.text(), /Banana .*Done/, 'still open');
    t.press('Done');
    assert.doesNotMatch(t.text(), /Banana/);
    t.dispose();
  });

  it("the theme's breakpoint: below it the lightbox, above it the dropdown under the field", () => {
    const theme = { ...BASE_THEME, control: { ...BASE_THEME.control, lightbox: 'md' } };
    const narrow = field({}, { theme, size: { width: 360, height: 640 } });
    narrow.press('Your pick');
    assert.match(narrow.text(), /Fruit Your pick Fruit .*Apple/, 'titled: the lightbox');
    narrow.dispose();
    const wide = field({}, { theme, size: { width: 1100, height: 640 } });
    wide.press('Your pick');
    assert.equal(wide.text(), 'Fruit Your pick Apple Banana Cherry', 'the dropdown, untitled');
    wide.dispose();
  });
});
