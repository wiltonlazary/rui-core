// Cascader on the DOM and on Skia: columns opened by press, hover and
// keys, paths chosen and cleared, a flat search and list, the check, the
// trail that stands for the levels out of view, disabled rows and what
// the parts mean.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active, View } from 'ren-core';
import { Rui, Clock, manualClock, Cascader, BASE_THEME, themeOf } from 'rui-core';
import { both } from './harness.jsx';

/** A menu three levels deep, one row disabled. */
const menu = [
  {
    value: 'drinks',
    label: 'Drinks',
    children: [
      { value: 'tea', label: 'Tea', children: [{ value: 'green', label: 'Green' }, { value: 'black', label: 'Black' }] },
      { value: 'coffee', label: 'Coffee' },
    ],
  },
  {
    value: 'snacks',
    label: 'Snacks',
    children: [
      { value: 'nuts', label: 'Nuts', children: [{ value: 'almonds', label: 'Almonds' }] },
      { value: 'candy', label: 'Candy', disabled: true },
      { value: 'fruit', label: 'Fruit' },
    ],
  },
];

/** A house four levels deep, for the window. */
const house = [
  { value: 'kitchen', label: 'Kitchen', children: [{ value: 'shelf', label: 'Shelf', children: [{ value: 'jar', label: 'Jar', children: [{ value: 'spoon', label: 'Spoon' }] }] }] },
  { value: 'hall', label: 'Hall' },
];

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

/** Collapses whitespace. @param {string[]} parts */
const normalize = parts => parts.join(' ').replace(/\s+/g, ' ').trim();

/** True when the node or an ancestor is not displayed. @param {any} node */
function hidden(node) {
  for (let n = node; n != null && n.style !== undefined; n = n.parentElement) if (n.style.display === 'none') return true;
  return false;
}

/**
 * A view on both renderers, wide enough for four columns, driven the same
 * way on each: presses as a browser sends them, the pointer moved onto a
 * row, keys to the focused node, typing; texts include the portal layer.
 * @param {(st: { add: (v: any) => any }) => any} content
 * @param {{ theme?: any }} [options]
 */
function setup(content, options = {}) {
  const clock = manualClock();
  /** @type {any[]} */
  const list = [];
  const st = { add: (/** @type {any} */ v) => (list.push(v), v) };
  const view = () => (
    <Clock value={clock}>
      <Rui theme={options.theme}>
        <View style={{ padding: 20, width: 340 }}>{content(st)}</View>
      </Rui>
    </Clock>
  );
  const { dom, skia, dispose } = both(view, { width: 900, height: 480 });
  const body = dom.document.body;
  const flush = () => {
    $flush(dom.root);
    $flush(skia.root);
  };
  const settle = () => {
    clock.advance(200);
    flush();
  };
  /** @param {string} role */
  const nodes = role => /** @type {any[]} */ ([...body.querySelectorAll(`[data-ren="${role}"]`)]).filter(n => !hidden(n));
  const domText = () => {
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
  };
  /** The last Action showing `text` on the DOM. @param {string} text */
  const domFind = text => {
    const node = nodes('Action').filter(n => n.textContent.trim() === text).at(-1);
    if (node === undefined) throw new Error(`no "${text}" on the DOM in: ${domText()}`);
    return node;
  };
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
  /** The center of the last item painted with `text` on Skia. @param {string} text */
  const skiaAt = text => {
    const found = items().filter(i => (i.text ?? '') === text);
    if (found.length === 0) throw new Error(`no "${text}" on Skia in: ${skia.text()}`);
    const box = found.at(-1).getBoundingClientRect();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  const text = () => {
    const a = domText();
    const b = skia.text();
    assert.equal(a, b, 'the DOM and Skia show the same');
    return a;
  };
  return {
    dom,
    skia,
    items,
    text,
    settle,
    domFind,
    values: () => list.map(x => $read(x)),
    /** Presses the last row or button showing `text` on both. @param {string} label */
    press(label) {
      const node = domFind(label);
      const w = dom.window;
      const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 };
      node.dispatchEvent(new w.PointerEvent('pointerdown', at));
      node.dispatchEvent(new w.PointerEvent('pointerup', { ...at, buttons: 0 }));
      node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      const [x, y] = skiaAt(label);
      skia.skia.press(x, y);
      skia.skia.release(x, y);
      settle();
    },
    /** Moves the pointer onto the row showing `text` on both. @param {string} label */
    hover(label) {
      const node = domFind(label);
      node.dispatchEvent(new dom.window.PointerEvent('pointerenter', { bubbles: false }));
      node.dispatchEvent(new dom.window.PointerEvent('pointerover', { bubbles: true }));
      const [x, y] = skiaAt(label);
      skia.skia.move(x, y);
      settle();
    },
    /** Focuses the field (the combobox) on both. */
    focus() {
      /** @type {any} */ (body.querySelector('[role="combobox"]')).focus();
      items().find(i => i.get('role') === 'combobox').focus();
      flush();
    },
    /** A key on both. @param {string} key */
    key(key) {
      const node = dom.document.activeElement ?? body;
      node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      skia.skia.key(key);
      settle();
    },
    /** Types into the focused field on both. @param {string} chars */
    type(chars) {
      const node = /** @type {any} */ (dom.document.activeElement);
      for (const ch of chars) {
        node.value = node.value + ch;
        node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        $flush(dom.root);
      }
      for (const ch of chars) skia.skia.key(ch);
      settle();
    },
    /** The DOM nodes with an ARIA role. @param {string} role */
    roles: (/** @type {string} */ role) => /** @type {any[]} */ ([...body.querySelectorAll(`[role="${role}"]`)]).filter(n => !hidden(n)),
    dispose,
  };
}

/** A Cascader whose value lands in a signal per root. @param {Record<string, any>} [extra] */
const field = (extra = {}) => (/** @type {{ add: (v: any) => any }} */ st) => {
  const v = st.add($signal($active(), /** @type {any} */ (extra.defaultValue ?? null)));
  return <Cascader placeholder="Order" data={menu} {...extra} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
};

describe('Cascader', () => {
  it('opens a column per pressed parent; a leaf sets the path, the field text and closes the panel; again clears it', () => {
    const t = setup(field());
    assert.equal(t.text(), 'Order');
    t.press('Order');
    assert.equal(t.text(), 'Order Drinks Snacks');
    t.press('Drinks');
    assert.equal(t.text(), 'Order Drinks Snacks Tea Coffee');
    t.press('Tea');
    assert.equal(t.text(), 'Order Drinks Snacks Tea Coffee Green Black');
    t.press('Snacks');
    assert.equal(t.text(), 'Order Drinks Snacks Nuts Candy Fruit', 'another branch closes the deeper columns');
    t.press('Drinks');
    t.press('Tea');
    t.press('Green');
    assert.deepEqual(t.values(), [['drinks', 'tea', 'green'], ['drinks', 'tea', 'green']]);
    assert.equal(t.text(), 'Drinks › Tea › Green', 'the labels joined by " › "; the panel closed');
    t.press('Drinks › Tea › Green');
    assert.equal(t.text(), 'Drinks › Tea › Green Drinks Snacks Tea Coffee Green Black', 'reopened on the chosen path');
    t.press('Green');
    assert.deepEqual(t.values(), [null, null], 'the chosen path again clears it');
    assert.equal(t.text(), 'Order');
    t.dispose();
  });

  it('openOn="hover": hovering a parent opens its column, a leaf closes the deeper ones; a press still chooses', () => {
    const t = setup(field({ openOn: 'hover' }));
    t.press('Order');
    t.hover('Drinks');
    assert.equal(t.text(), 'Order Drinks Snacks Tea Coffee');
    t.hover('Tea');
    assert.equal(t.text(), 'Order Drinks Snacks Tea Coffee Green Black');
    t.hover('Coffee');
    assert.equal(t.text(), 'Order Drinks Snacks Tea Coffee');
    assert.deepEqual(t.values(), [null, null], 'hovering chooses nothing');
    t.press('Coffee');
    assert.deepEqual(t.values(), [['drinks', 'coffee'], ['drinks', 'coffee']]);
    t.dispose();
  });

  it('pick="any": a second press on an open parent chooses it; Enter on an open parent too', () => {
    const t = setup(field({ pick: 'any' }));
    t.press('Order');
    t.press('Drinks');
    assert.deepEqual(t.values(), [null, null], 'the first press opens');
    t.press('Drinks');
    assert.deepEqual(t.values(), [['drinks'], ['drinks']]);
    assert.equal(t.text(), 'Drinks');
    t.focus();
    t.key('ArrowDown');
    t.key('ArrowDown');
    t.key('Enter');
    assert.equal(t.text(), 'Drinks Drinks Snacks Nuts Candy Fruit', 'Enter opens Snacks');
    t.key('Enter');
    assert.deepEqual(t.values(), [['snacks'], ['snacks']], 'Enter again chooses it');
    t.dispose();

    const leaf = setup(field());
    leaf.press('Order');
    leaf.press('Drinks');
    leaf.press('Drinks');
    assert.deepEqual(leaf.values(), [null, null], "pick='leaf' never chooses a parent");
    leaf.dispose();
  });

  it('toggle={false} keeps the path chosen again; stay keeps the panel open', () => {
    const t = setup(field({ toggle: false, defaultValue: ['drinks', 'coffee'] }));
    t.press('Drinks › Coffee');
    t.press('Coffee');
    assert.deepEqual(t.values(), [['drinks', 'coffee'], ['drinks', 'coffee']]);
    t.dispose();

    const s = setup(field({ stay: true }));
    s.press('Order');
    s.press('Drinks');
    s.press('Coffee');
    assert.deepEqual(s.values(), [['drinks', 'coffee'], ['drinks', 'coffee']]);
    assert.equal(s.text(), 'Drinks › Coffee Drinks Snacks Tea Coffee', 'still open');
    s.dispose();
  });

  it('keys: ArrowDown opens; the arrows, Home and End move (past disabled rows); Enter opens and chooses; Escape closes', () => {
    const t = setup(field());
    t.focus();
    t.key('ArrowDown');
    assert.equal(t.text(), 'Order Drinks Snacks');
    t.key('End');
    t.key('ArrowRight');
    assert.equal(t.text(), 'Order Drinks Snacks Nuts Candy Fruit', 'End went to Snacks; ArrowRight opened it');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.values(), [['snacks', 'fruit'], ['snacks', 'fruit']], 'ArrowDown stepped over Candy');
    t.key('Enter');
    t.key('ArrowLeft');
    t.key('Home');
    t.key('Enter');
    assert.equal(t.text(), 'Snacks › Fruit Drinks Snacks Tea Coffee', 'Home went to Drinks; Enter opened it');
    t.key('ArrowRight');
    t.key('ArrowRight');
    t.key('ArrowUp');
    t.key('ArrowDown');
    assert.equal(t.text(), 'Snacks › Fruit Drinks Snacks Tea Coffee Green Black');
    t.key('ArrowLeft');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.values(), [['drinks', 'coffee'], ['drinks', 'coffee']], 'ArrowLeft went back to Tea, ArrowDown on to Coffee');
    t.key('Enter');
    assert.ok(t.text().includes('Snacks'));
    t.key('Escape');
    assert.equal(t.text(), 'Drinks › Coffee');
    t.dispose();
  });

  it('search: words in any order across labels, in tree order; limit caps them; match replaces the rule; the empty text', () => {
    const t = setup(field({ searchable: true }));
    t.focus();
    t.type('gre tea');
    assert.equal(t.text(), 'gre tea Drinks › Tea › Green');
    t.key('Enter');
    assert.deepEqual(t.values(), [['drinks', 'tea', 'green'], ['drinks', 'tea', 'green']]);
    assert.equal(t.text(), 'Drinks › Tea › Green');
    t.dispose();

    const s = setup(field({ searchable: true, limit: 2 }));
    s.focus();
    s.type('snacks');
    assert.equal(s.text(), 'snacks Snacks › Nuts › Almonds Snacks › Candy', 'leaves only, at most two');
    s.dispose();

    const d = setup(field({ searchable: true }));
    d.focus();
    d.type('snacks');
    assert.equal(d.text(), 'snacks Snacks › Nuts › Almonds Snacks › Candy Snacks › Fruit');
    d.key('ArrowDown');
    d.key('Enter');
    assert.deepEqual(d.values(), [['snacks', 'fruit'], ['snacks', 'fruit']], 'the disabled path is listed and skipped');
    d.dispose();

    const m = setup(field({ searchable: true, match: (/** @type {any[]} */ nodes, /** @type {string} */ q) => nodes.at(-1).label.startsWith(q.toUpperCase()) }));
    m.focus();
    m.type('b');
    assert.equal(m.text(), 'b Drinks › Tea › Black');
    m.dispose();

    for (const [empty, shown] of [[undefined, 'No match'], ['Nothing here', 'Nothing here']]) {
      const e = setup(field({ searchable: true, empty }));
      e.focus();
      e.type('zz');
      assert.equal(e.text(), `zz ${shown}`);
      e.dispose();
    }
  });

  it('layout="list": every choosable path in one list, parents too with pick="any"', () => {
    const t = setup(field({ layout: 'list' }));
    t.press('Order');
    assert.equal(t.text(), 'Order Drinks › Tea › Green Drinks › Tea › Black Drinks › Coffee Snacks › Nuts › Almonds Snacks › Candy Snacks › Fruit');
    t.press('Drinks › Coffee');
    assert.deepEqual(t.values(), [['drinks', 'coffee'], ['drinks', 'coffee']]);
    t.dispose();

    const a = setup(field({ layout: 'list', pick: 'any', separator: ' / ' }));
    a.press('Order');
    assert.ok(a.text().startsWith('Order Drinks Drinks / Tea Drinks / Tea / Green'), a.text());
    a.dispose();
  });

  it('check: none, at the end (by default) or at the start of the chosen row', () => {
    for (const [check, where] of /** @type {[any, string][]} */ ([
      [false, 'none'],
      [undefined, 'end'],
      [{ at: 'start' }, 'start'],
    ])) {
      const t = setup(field({ check, defaultValue: ['drinks', 'coffee'] }));
      t.press('Drinks › Coffee');
      const row = t.domFind('Coffee');
      const kinds = [...row.querySelectorAll('[data-ren]')].map(n => n.getAttribute('data-ren')).filter(k => k === 'Shape' || k === 'Label');
      assert.deepEqual(kinds, where === 'none' ? ['Label'] : where === 'end' ? ['Label', 'Shape'] : ['Shape', 'Label'], String(where));
      t.dispose();
    }
  });

  it('levels={2}: a trail of crumbs for the hidden levels; a crumb and the arrows move the window', () => {
    const t = setup(st => {
      const v = st.add($signal($active(), /** @type {any} */ (null)));
      return <Cascader placeholder="Place" levels={2} data={house} value={v} onChange={(/** @type {any} */ x) => $write(v, x)} />;
    });
    t.press('Place');
    t.press('Kitchen');
    assert.equal(t.text(), 'Place Kitchen Hall Shelf', 'two columns fit: no trail');
    assert.equal(t.roles('navigation').length, 0);
    t.press('Shelf');
    t.press('Jar');
    assert.equal(t.text(), 'Place Kitchen › Shelf Jar Spoon', 'the last two columns, a crumb per hidden level');
    const nav = t.roles('navigation');
    assert.equal(nav.length, 1);
    assert.equal(nav[0].getAttribute('aria-label'), 'Levels above');
    t.press('Kitchen');
    assert.equal(t.text(), 'Place › Kitchen Hall Shelf', 'the window starts at the root; a crumb leads back deeper');
    t.press('›');
    assert.equal(t.text(), 'Place Kitchen › Shelf Jar Spoon');
    t.press('Shelf');
    assert.equal(t.text(), 'Place Kitchen › Shelf Jar');
    t.press('›');
    // The keys: from the chosen spot the window follows the keyboard.
    t.focus();
    t.key('Escape');
    t.key('ArrowDown');
    t.key('ArrowRight');
    t.key('ArrowRight');
    t.key('ArrowRight');
    assert.equal(t.text(), 'Place Kitchen › Shelf Jar Spoon', 'ArrowRight into hidden columns moves the window on');
    t.key('ArrowLeft');
    assert.equal(t.text(), 'Place Kitchen › Shelf Jar Spoon', 'Jar is in view');
    t.key('ArrowLeft');
    assert.equal(t.text(), 'Place Kitchen › Shelf Jar', 'ArrowLeft from the first column in view moves it one level back');
    t.key('ArrowRight');
    t.key('ArrowRight');
    assert.equal(t.text(), 'Place Kitchen › Shelf Jar Spoon');
    t.key('Enter');
    assert.deepEqual(t.values(), [['kitchen', 'shelf', 'jar', 'spoon'], ['kitchen', 'shelf', 'jar', 'spoon']]);
    t.dispose();
  });

  it("a disabled row: the option look dimmed, the theme's disabled cursor, aria-disabled, not chosen", () => {
    const t = setup(field());
    t.press('Order');
    t.press('Snacks');
    const candy = t.domFind('Candy');
    assert.equal(candy.getAttribute('aria-disabled'), 'true');
    assert.equal(css(candy).opacity, String(BASE_THEME.opacity.disabled));
    assert.equal(css(candy).cursor, BASE_THEME.cursor.disabled);
    assert.equal(t.domFind('Fruit').getAttribute('aria-disabled'), null);
    t.press('Candy');
    assert.deepEqual(t.values(), [null, null]);
    t.dispose();
  });

  it('means a combobox over listboxes named by their parents, options selected along the path', () => {
    const t = setup(field({ label: 'Menu' }));
    const box = t.roles('combobox')[0];
    assert.equal(box.getAttribute('aria-expanded'), 'false');
    t.press('Order');
    assert.equal(box.getAttribute('aria-expanded'), 'true');
    t.press('Drinks');
    t.press('Tea');
    assert.deepEqual(t.roles('listbox').map(n => n.getAttribute('aria-label')), ['Menu', 'Drinks', 'Tea']);
    const selected = t.roles('option').filter(n => n.getAttribute('aria-selected') === 'true').map(n => n.textContent.trim());
    assert.deepEqual(selected, ['Drinks', 'Tea']);
    t.press('Black');
    t.press('Drinks › Tea › Black');
    const now = t.roles('option').filter(n => n.getAttribute('aria-selected') === 'true').map(n => n.textContent.trim());
    assert.deepEqual(now, ['Drinks', 'Tea', 'Black'], 'the chosen node too');
    t.dispose();
  });

  it('columns are sizes.box.menu wide, a theme override widens them; column={{ width }} sets it', () => {
    for (const [theme, column, width] of /** @type {[any, any, number][]} */ ([
      [undefined, undefined, BASE_THEME.sizes.box.menu],
      [themeOf({ sizes: { box: { menu: 210 } } }), undefined, 210],
      [undefined, { width: 180 }, 180],
    ])) {
      const t = setup(field({ column }), { theme });
      t.press('Order');
      const list = t.roles('listbox')[0];
      assert.equal(css(list).width, `${width}px`, 'on the DOM');
      const scroll = t.items().find(i => i.get('role') === 'listbox');
      assert.equal(Math.round(scroll.getBoundingClientRect().width), width, 'on Skia');
      t.dispose();
    }
  });
});
