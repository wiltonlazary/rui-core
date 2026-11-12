// rui-core/more, Sortable on the DOM and on Skia: an item taken by its
// handle follows the pointer while the others make room, and drops at its
// place with one change told; a drop on its own place, far from the list,
// Escape, a press taken back and a list changed under it tell none; the
// keys lift, move and drop; the focus stays on the handle of the item moved.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active, View, Show } from 'ren-core';
import { Rui, Clock, manualClock, Text, ScrollBox, BASE_LABELS, BASE_THEME } from 'rui-core';
import { Sortable } from 'rui-core/more';
import { both } from './harness.jsx';
import { primitives, mirror, action } from './more-harness.jsx';

/** The gap between a Sortable's items: the theme's spacing xs. */
const GAP = BASE_THEME.spacing.xs;

/**
 * A Sortable of rows of text on both renderers, a record per root of what it told, and drivers that act on both at
 * once. `items` are texts, or `[text, height]` pairs; each row is 30 px high unless it says.
 * @param {{ items?: (string | [string, number])[], props?: Record<string, any>, controlled?: boolean, item?: (text: string) => Record<string, any>, around?: (list: any, root: number) => any }} [o]
 */
function setup(o = {}) {
  const clock = manualClock();
  const given = o.items ?? ['a', 'b', 'c', 'd'];
  const texts = given.map(i => (typeof i === 'string' ? i : i[0]));
  const heights = new Map(given.map(i => (typeof i === 'string' ? [i, 30] : i)));
  /** @type {{ changes: string[], commits: [string, number, number][], value: any }[]} */
  const recs = [];
  let roots = 0;
  const view = () => {
    const value = $signal($active(), texts);
    /** @type {{ changes: string[], commits: [string, number, number][], value: any }} */
    const rec = { changes: [], commits: [], value };
    recs.push(rec);
    const root = roots++;
    const list = (
      <Sortable
        w={200}
        {...(o.controlled === false ? { defaultValue: texts } : { value })}
        onChange={(/** @type {string[]} */ next) => {
          rec.changes.push(next.join(''));
          if (o.controlled !== false && o.props?.keep !== true) $write(value, next);
        }}
        onCommit={(/** @type {string[]} */ next, /** @type {number} */ from, /** @type {number} */ to) => rec.commits.push([next.join(''), from, to])}
        {...o.props}
      >
        {(/** @type {() => string} */ item) => (
          <Sortable.Item {...o.item?.(item())}>
            <View style={{ direction: 'row', width: 60, height: heights.get(item()) ?? 30, align: 'center' }}>
              <Sortable.Handle label={() => `Reorder ${item()}`} />
              <Text>{item}</Text>
            </View>
          </Sortable.Item>
        )}
      </Sortable>
    );
    return (
      <Clock value={clock}>
        <Rui>{o.around === undefined ? list : o.around(list, root)}</Rui>
      </Clock>
    );
  };
  const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
  const flush = () => {
    $flush(dom.root);
    $flush(skia.root);
  };
  /** The frames of a move's easing run. */
  const settle = () => {
    flush();
    clock.advance(300);
    flush();
  };
  /** Skia's Action labeled `label`. @param {string} label */
  const item = label => {
    const found = primitives(skia).find(i => i.kind === 5 && i.label === label);
    if (found === undefined) throw new Error(`no "${label}" on Skia`);
    return found;
  };
  /** The DOM's Action labeled `label`. @param {string} label */
  const node = label => dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === label);
  /** The point at the middle of the handle of `text`. @param {string} text @returns {[number, number]} */
  const at = text => {
    const r = item(`Reorder ${text}`).getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  };
  /** The DOM handle that holds the pointer. @type {any} */
  let holder = null;
  /** @param {string} type @param {number} x @param {number} y */
  const send = (type, x, y) => holder.dispatchEvent(new dom.window.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  const t = {
    dom,
    skia,
    clock,
    recs,
    flush,
    settle,
    item,
    node,
    at,
    dispose,
    /** What each root told, as one. @param {'changes' | 'commits'} name */
    told: name => recs.map(r => r[name]),
    /** The texts in the order shown on each renderer (Skia's from top to bottom, or left to right). */
    order() {
      flush();
      const d = dom.nodes('Action').map((/** @type {any} */ n) => String(n.getAttribute('aria-label')).replace('Reorder ', '')).join('');
      const s = primitives(skia)
        .filter(i => i.kind === 5)
        .map(i => ({ text: String(i.label).replace('Reorder ', ''), r: i.getBoundingClientRect() }))
        .sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x)
        .map(i => i.text)
        .join('');
      return [d, s];
    },
    /** Where each text's handle shows on Skia, along `axis`, by its text. @param {'x' | 'y'} [axis] */
    places(axis = 'y') {
      settle();
      return Object.fromEntries(primitives(skia).filter(i => i.kind === 5).map(i => [String(i.label).replace('Reorder ', ''), Math.round(i.getBoundingClientRect()[axis])]));
    },
    /** The pointer goes down on the handle of `text`, on both. @param {string} text */
    press(text) {
      mirror(dom, skia);
      const [x, y] = at(text);
      holder = node(`Reorder ${text}`);
      send('pointerdown', x, y);
      skia.skia.press(x, y, 1, false, { button: 0, buttons: 1 });
      flush();
      return /** @type {[number, number]} */ ([x, y]);
    },
    /** The held pointer moves, on both. @param {number} x @param {number} y */
    moveTo(x, y) {
      send('pointermove', x, y);
      skia.skia.move(x, y, { buttons: 1 });
      flush();
    },
    /** The held pointer lets go, on both. @param {number} x @param {number} y */
    release(x, y) {
      send('pointerup', x, y);
      skia.skia.release(x, y, { button: 0, buttons: 0 });
      flush();
    },
    /** The platform takes the press back, on both. */
    takeBack() {
      send('pointercancel', 0, 0);
      skia.skia.cancel(0, 0);
      flush();
    },
    /** A whole drag of the handle of `text` by (dx, dy), in two moves. @param {string} text @param {number} dx @param {number} dy */
    drag(text, dx, dy) {
      const [x, y] = t.press(text);
      t.moveTo(x + dx / 2, y + dy / 2);
      t.moveTo(x + dx, y + dy);
      t.release(x + dx, y + dy);
      settle();
    },
    /** The focus goes to the handle of `text`, on both. @param {string} text */
    focus(text) {
      node(`Reorder ${text}`).focus();
      item(`Reorder ${text}`).focus();
      flush();
    },
    /** A key to what has the focus, on both. @param {string} key */
    key(key) {
      (dom.document.activeElement ?? dom.document.body).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      skia.skia.key(key);
      flush();
    },
    /** The label of what has the focus on each renderer. */
    focused: () => [dom.document.activeElement?.getAttribute('aria-label') ?? null, skia.skia.focused?.label ?? null],
    /** Whether the item of `text` is held: on the DOM as its handle says (`aria-pressed`), on Skia as its row shows (over the others). @param {string} text */
    pressed: text => {
      flush();
      skia.text();
      return [node(`Reorder ${text}`).getAttribute('aria-pressed'), item(`Reorder ${text}`).parent.parent.style.zIndex === 1 ? 'true' : 'false'];
    },
    /** What the DOM's status says. */
    status: () => {
      flush();
      return dom.host.querySelector('[role="status"]').textContent;
    },
  };
  return t;
}

describe('Sortable: what it shows and means', () => {
  it('draws its items in order, a list of listitems, each handle a button described by the keys\' text', () => {
    const t = setup();
    assert.deepEqual(t.order(), ['abcd', 'abcd']);
    assert.deepEqual(t.places(), { a: 1, b: 31 + GAP, c: 61 + 2 * GAP, d: 91 + 3 * GAP }, 'a column, the theme\'s spacing xs apart');
    const list = t.dom.host.querySelector('[role="list"]');
    assert.equal(list.querySelectorAll('[role="listitem"]').length, 4);
    const handle = t.node('Reorder a');
    assert.deepEqual([handle.tagName, handle.getAttribute('aria-pressed'), handle.getAttribute('aria-disabled')], ['BUTTON', 'false', null]);
    assert.equal(t.dom.document.getElementById(handle.getAttribute('aria-describedby')).textContent, BASE_LABELS.sortableKeys);
    // Only a handle keeps a touch from panning the page.
    assert.equal(handle.style.touchAction, 'none');
    assert.deepEqual([list.style.touchAction, list.querySelector('[role="listitem"]').style.touchAction], ['', '']);
    t.dispose();
  });

  it('with children that are no function, and parts outside a list, draws them as they are', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Sortable>
          <Text>plain</Text>
        </Sortable>
        <Sortable.Item>
          <Sortable.Handle />
          <Text>alone</Text>
        </Sortable.Item>
      </Rui>
    ));
    assert.match(dom.text(), /^plain .*alone$/);
    assert.equal(skia.text(), 'plain alone');
    assert.equal(dom.nodes('Action')[0].getAttribute('aria-disabled'), 'true', 'a handle outside a list takes nothing');
    dispose();
  });
});

describe('Sortable: the pointer', () => {
  it('the item follows the pointer, the others make room, and the drop tells one change with the places', () => {
    const t = setup();
    const [x, y] = t.press('a');
    assert.deepEqual(t.pressed('a'), ['true', 'true'], 'held');
    assert.equal(t.status(), BASE_LABELS.sortableTaken(1, 4));
    t.moveTo(x, y + 10);
    assert.deepEqual(t.places(), { a: 11, b: 31 + GAP, c: 61 + 2 * GAP, d: 91 + 3 * GAP }, 'it follows; no middle passed, no item moved');
    // Past b's middle, and past c's: each makes room by the item's length and the gap.
    t.moveTo(x, y + 2 * (30 + GAP) + 4);
    assert.deepEqual(t.places(), { a: 1 + 2 * (30 + GAP) + 4, b: 1, c: 31 + GAP, d: 91 + 3 * GAP });
    assert.equal(t.status(), BASE_LABELS.sortablePlace(3, 4));
    const list = t.dom.host.querySelector('[role="list"]');
    assert.equal(list.style.userSelect, 'none', 'no text selected under the item on its way');
    assert.deepEqual(t.told('commits'), [[], []], 'nothing told while it is held');
    assert.deepEqual(t.told('changes'), [[], []]);
    t.release(x, y + 2 * (30 + GAP) + 4);
    t.settle();
    assert.deepEqual(t.told('commits'), [[['bcad', 0, 2]], [['bcad', 0, 2]]], 'one change at the drop: the list, from, to');
    assert.deepEqual(t.told('changes'), [['bcad'], ['bcad']]);
    assert.deepEqual(t.order(), ['bcad', 'bcad']);
    assert.deepEqual(t.places(), { b: 1, c: 31 + GAP, a: 61 + 2 * GAP, d: 91 + 3 * GAP }, 'every item in its place');
    assert.deepEqual(t.pressed('a'), ['false', 'false']);
    assert.equal(list.style.userSelect, '');
    assert.equal(t.status(), BASE_LABELS.sortableDropped(3, 4));
    assert.deepEqual(t.focused(), ['Reorder a', 'Reorder a'], 'the focus on the handle of the item moved');
    // Up again, to the first place.
    t.drag('d', 0, -3 * (30 + GAP));
    assert.deepEqual(t.told('commits').map(c => c.at(-1)), [['dbca', 3, 0], ['dbca', 3, 0]]);
    assert.deepEqual(t.order(), ['dbca', 'dbca']);
    t.dispose();
  });

  it('a press alone, and a drop on its own place, tell nothing', () => {
    const t = setup();
    const [x, y] = t.press('b');
    t.release(x, y);
    t.drag('b', 0, 12);
    t.drag('b', 0, -12);
    assert.deepEqual(t.told('commits'), [[], []]);
    assert.deepEqual(t.told('changes'), [[], []]);
    assert.deepEqual(t.order(), ['abcd', 'abcd']);
    assert.deepEqual(t.pressed('b'), ['false', 'false']);
    t.dispose();
  });

  it('let go far from the list, the move is given up: the order as it was, nothing told', () => {
    const t = setup();
    const [x, y] = t.press('a');
    t.moveTo(x, y + 2 * (30 + GAP));
    assert.deepEqual(t.places().b, 1, 'b made room');
    // Across the list by more than the item is long: the others show their places again.
    t.moveTo(x + 200 + 40, y + 2 * (30 + GAP));
    assert.deepEqual([t.places().b, t.places().c], [31 + GAP, 61 + 2 * GAP]);
    t.release(x + 200 + 40, y + 2 * (30 + GAP));
    t.settle();
    assert.deepEqual(t.told('commits'), [[], []]);
    assert.deepEqual(t.told('changes'), [[], []]);
    assert.deepEqual(t.order(), ['abcd', 'abcd']);
    assert.deepEqual(t.places(), { a: 1, b: 31 + GAP, c: 61 + 2 * GAP, d: 91 + 3 * GAP });
    assert.equal(t.status(), BASE_LABELS.sortableCanceled);
    // Just past the last item is no give-up: it drops at the end.
    t.drag('a', 0, 3 * (30 + GAP) + 40);
    assert.deepEqual(t.told('commits'), [[['bcda', 0, 3]], [['bcda', 0, 3]]]);
    t.dispose();
  });

  it('Escape gives the move up and goes no further; what the pointer does after it is nothing', () => {
    let escapes = 0;
    const t = setup({ around: list => <View onKey={(/** @type {any} */ e) => e.key === 'Escape' && escapes++}>{list}</View> });
    const [x, y] = t.press('a');
    t.moveTo(x, y + 2 * (30 + GAP));
    assert.deepEqual(t.focused(), ['Reorder a', 'Reorder a'], 'the handle pressed has the focus');
    t.key('Escape');
    t.settle();
    assert.deepEqual(t.pressed('a'), ['false', 'false']);
    assert.equal(t.skia.skia.grabbed, null, 'the pointer let go');
    assert.deepEqual(t.places(), { a: 1, b: 31 + GAP, c: 61 + 2 * GAP, d: 91 + 3 * GAP });
    assert.equal(escapes, 0, 'the Escape that ended a move stays in the list');
    t.moveTo(x, y + 3 * (30 + GAP));
    t.release(x, y + 3 * (30 + GAP));
    t.settle();
    assert.deepEqual(t.told('commits'), [[], []]);
    assert.deepEqual(t.order(), ['abcd', 'abcd']);
    t.key('Escape');
    assert.equal(escapes, 2, 'with no move, Escape goes on (once on each renderer)');
    t.dispose();
  });

  it('a press the platform takes back gives the move up', () => {
    const t = setup();
    const [x, y] = t.press('c');
    t.moveTo(x, y - (30 + GAP) - 4);
    assert.equal(t.places().b, 61 + 2 * GAP, 'b made room below');
    t.takeBack();
    t.settle();
    assert.deepEqual(t.told('commits'), [[], []]);
    assert.deepEqual(t.order(), ['abcd', 'abcd']);
    assert.deepEqual(t.places(), { a: 1, b: 31 + GAP, c: 61 + 2 * GAP, d: 91 + 3 * GAP });
    t.dispose();
  });

  it('items of different heights: a place is counted by the middles passed, and room is the taken item\'s own length', () => {
    const t = setup({ items: [['a', 30], ['b', 80], ['c', 30], ['d', 50]] });
    // Rows at 0, 30 + GAP, 110 + 2 GAP, 140 + 3 GAP; b's middle is 40 below its top.
    const top = { a: 0, b: 30 + GAP, c: 110 + 2 * GAP, d: 140 + 3 * GAP };
    const [x, y] = t.press('a');
    // a's middle is at 15: 30 px down it is short of b's middle (70 + GAP), 60 px down past it.
    t.moveTo(x, y + 30);
    assert.equal(t.places().b, top.b + 26, 'b in its place (its handle 26 px below its top)');
    t.moveTo(x, y + 60 + GAP);
    assert.equal(t.places().b, top.b + 26 - (30 + GAP), 'b up by a\'s length and the gap');
    t.release(x, y + 60 + GAP);
    t.settle();
    assert.deepEqual(t.told('commits'), [[['bacd', 0, 1]], [['bacd', 0, 1]]]);
    // The tall one taken up over two: each makes room by its length.
    t.drag('d', 0, -(30 + 30 + 2 * GAP + 20));
    assert.deepEqual(t.told('commits').map(c => c.at(-1)), [['bdac', 3, 1], ['bdac', 3, 1]]);
    assert.deepEqual(t.places(), { b: 26, d: 80 + GAP + 11, a: 130 + 2 * GAP + 1, c: 160 + 3 * GAP + 1 });
    t.dispose();
  });

  it('the list changed under a move gives it up cleanly; the same items given again do not', () => {
    const t = setup();
    const [x, y] = t.press('a');
    t.moveTo(x, y + 2 * (30 + GAP));
    // The same items, as a new array: the move goes on.
    for (const r of t.recs) $write(r.value, ['a', 'b', 'c', 'd']);
    t.flush();
    assert.deepEqual(t.pressed('a'), ['true', 'true']);
    // Another list: the places measured are no longer its own.
    for (const r of t.recs) $write(r.value, ['a', 'c', 'd']);
    t.settle();
    assert.deepEqual(t.pressed('a'), ['false', 'false']);
    assert.equal(t.status(), BASE_LABELS.sortableCanceled);
    t.moveTo(x, y + 3 * (30 + GAP));
    t.release(x, y + 3 * (30 + GAP));
    t.settle();
    assert.deepEqual(t.told('commits'), [[], []]);
    assert.deepEqual(t.order(), ['acd', 'acd']);
    assert.deepEqual(t.places(), { a: 1, c: 31 + GAP, d: 61 + 2 * GAP });
    // The list as it is now sorts.
    t.drag('a', 0, 30 + GAP + 4);
    assert.deepEqual(t.told('commits'), [[['cad', 0, 1]], [['cad', 0, 1]]]);
    t.dispose();
  });

  it('a disabled list takes no item; a disabled item is not taken and still makes room', () => {
    const off = setup({ props: { disabled: true } });
    assert.equal(off.node('Reorder a').getAttribute('aria-disabled'), 'true');
    assert.equal(off.node('Reorder a').style.touchAction, '', 'a touch on it pans the page');
    off.drag('a', 0, 2 * (30 + GAP));
    off.focus('a');
    off.key(' ');
    off.key('ArrowDown');
    off.key(' ');
    assert.deepEqual(off.told('commits'), [[], []]);
    assert.deepEqual(off.pressed('a'), ['false', 'false']);
    off.dispose();
    const one = setup({ item: text => ({ disabled: text === 'b' }) });
    assert.deepEqual([one.node('Reorder a').getAttribute('aria-disabled'), one.node('Reorder b').getAttribute('aria-disabled')], [null, 'true']);
    one.drag('b', 0, 2 * (30 + GAP));
    assert.deepEqual(one.told('commits'), [[], []]);
    one.drag('a', 0, 2 * (30 + GAP) + 4);
    assert.deepEqual(one.told('commits'), [[['bcad', 0, 2]], [['bcad', 0, 2]]], 'the others pass it');
    one.dispose();
  });

  it('another pointer on another handle moves nothing; the list disabled with an item held gives the move up', () => {
    /** @type {any[]} */
    const offs = [];
    const t = setup({
      around: list => list,
      props: {
        get disabled() {
          const off = $signal($active(), false);
          offs.push(off);
          return () => $read(off);
        },
      },
    });
    const [x, y] = t.press('a');
    t.moveTo(x, y + 30 + GAP + 4);
    const row = t.node('Reorder a').closest('[role="listitem"]');
    assert.equal(row.style.translate, `0px ${30 + GAP + 4}px`);
    // A second finger on d's handle (the DOM tells pointers apart by their ids).
    const other = t.node('Reorder d');
    other.dispatchEvent(new t.dom.window.PointerEvent('pointerdown', { clientX: x, clientY: 120, bubbles: true, cancelable: true, pointerId: 2, button: 0, buttons: 1 }));
    other.dispatchEvent(new t.dom.window.PointerEvent('pointermove', { clientX: x, clientY: 20, bubbles: true, cancelable: true, pointerId: 2, buttons: 1 }));
    other.dispatchEvent(new t.dom.window.PointerEvent('pointerup', { clientX: x, clientY: 20, bubbles: true, cancelable: true, pointerId: 2 }));
    // On Skia too: the second finger's press leaves the first one's capture, and its moves and release are its own.
    const [ox, oy] = t.at('d');
    t.skia.skia.press(ox, oy, 1, false, { pointerId: 2, pointerType: 'touch' });
    t.skia.skia.move(ox, 20, { pointerId: 2 });
    t.skia.skia.release(ox, 20, { pointerId: 2 });
    t.flush();
    assert.equal(t.item('Reorder a').hasPointerCapture(1), true, 'Skia: the held handle keeps its pointer');
    assert.equal(row.style.translate, `0px ${30 + GAP + 4}px`, 'the held item stays with its own pointer');
    assert.deepEqual(t.pressed('a'), ['true', 'true']);
    // That finger taken back by the platform is not the held one's end either.
    other.dispatchEvent(new t.dom.window.PointerEvent('pointercancel', { bubbles: true, pointerId: 2 }));
    // Skia's goes to the handle that holds the pointer, with the other finger's id.
    t.skia.skia.cancel(x, 20, { pointerId: 2 });
    t.flush();
    assert.equal(row.style.translate, `0px ${30 + GAP + 4}px`, 'another finger taken back gives nothing up');
    assert.deepEqual(t.pressed('a'), ['true', 'true']);
    assert.deepEqual(t.told('commits'), [[], []]);
    for (const off of offs) $write(off, true);
    t.settle();
    assert.deepEqual(t.pressed('a'), ['false', 'false'], 'disabled: given up');
    t.release(x, y + 30 + GAP + 4);
    assert.deepEqual(t.told('commits'), [[], []]);
    assert.deepEqual(t.order(), ['abcd', 'abcd']);
    t.dispose();
  });

  it('a list that goes with an item held lets the pointer go, and hears no more of it', () => {
    /** @type {any[]} */
    const shown = [];
    const t = setup({
      around: list => {
        const on = $signal($active(), true);
        shown.push(on);
        return <Show when={() => $read(on)}>{list}</Show>;
      },
    });
    const handle = t.node('Reorder a');
    /** @type {any[]} */
    const let_ = [];
    handle.releasePointerCapture = (/** @type {any} */ id) => let_.push(id);
    const held = t.item('Reorder a');
    const [x, y] = t.press('a');
    t.moveTo(x, y + 30 + GAP);
    assert.equal(t.skia.skia.grabbed, held, 'Skia: the handle holds the pointer');
    for (const on of shown) $write(on, false);
    t.flush();
    assert.deepEqual(let_, [1], 'the DOM pointer let go');
    assert.equal(t.skia.skia.grabbed, null, 'and Skia\'s');
    assert.deepEqual([t.dom.host.querySelector('[role="list"]'), t.skia.text()], [null, '']);
    // The pointer's later moves and release find nothing.
    t.skia.skia.move(x, y + 60, { buttons: 1 });
    t.skia.skia.release(x, y + 60, { button: 0, buttons: 0 });
    handle.dispatchEvent(new t.dom.window.PointerEvent('pointerup', { clientX: x, clientY: y + 60, bubbles: true, pointerId: 1 }));
    t.settle();
    assert.deepEqual(t.told('commits'), [[], []]);
    t.dispose();
  });

  it('a list scrolled under the held pointer counts the places from where it now lies', () => {
    /** @type {any[]} */
    const boxes = [];
    const t = setup({ around: list => <ScrollBox h={100} w={220} ref={(/** @type {any} */ n) => boxes.push(n)}>{list}</ScrollBox> });
    const [x, y] = t.press('a');
    t.moveTo(x, y + 2);
    assert.equal(t.status(), BASE_LABELS.sortableTaken(1, 4), 'two px down: its own place still');
    // The list goes up by a row and its gap under the pointer (the DOM's boxes are Skia's): the pointer is over b's place.
    boxes[1].scrollTop = 30 + GAP;
    t.flush();
    t.moveTo(x, y + 3);
    assert.equal(t.status(), BASE_LABELS.sortablePlace(2, 4));
    t.release(x, y + 3);
    t.settle();
    assert.deepEqual(t.told('commits'), [[['bacd', 0, 1]], [['bacd', 0, 1]]]);
    t.dispose();
  });

  it('controlled, an owner that keeps its list shows it as it was; on its own, the list sorts itself', () => {
    const kept = setup({ props: { keep: true } });
    kept.drag('a', 0, 30 + GAP + 4);
    assert.deepEqual(kept.told('commits'), [[['bacd', 0, 1]], [['bacd', 0, 1]]], 'the change is told');
    assert.deepEqual(kept.order(), ['abcd', 'abcd'], 'and the list shows its value');
    assert.deepEqual(kept.places(), { a: 1, b: 31 + GAP, c: 61 + 2 * GAP, d: 91 + 3 * GAP });
    kept.dispose();
    const own = setup({ controlled: false });
    own.drag('a', 0, 30 + GAP + 4);
    assert.deepEqual(own.told('changes'), [['bacd'], ['bacd']]);
    assert.deepEqual(own.order(), ['bacd', 'bacd']);
    own.dispose();
  });

  it('across: orientation horizontal lays the items in a row and moves them along it', () => {
    const t = setup({ props: { orientation: 'horizontal', w: 400 } });
    assert.deepEqual(t.places('x'), { a: 0, b: 60 + GAP, c: 120 + 2 * GAP, d: 180 + 3 * GAP });
    const [x, y] = t.press('a');
    t.moveTo(x + 60 + GAP + 4, y + 5);
    assert.deepEqual(t.places('x'), { a: 60 + GAP + 4, b: 0, c: 120 + 2 * GAP, d: 180 + 3 * GAP }, 'along the row only');
    assert.equal(t.places('y').a, 1);
    t.release(x + 60 + GAP + 4, y + 5);
    t.settle();
    assert.deepEqual(t.told('commits'), [[['bacd', 0, 1]], [['bacd', 0, 1]]]);
    t.focus('d');
    t.key('Enter');
    t.key('ArrowUp');
    t.key('ArrowLeft');
    t.key('Home');
    t.key('ArrowRight');
    t.key('Enter');
    assert.deepEqual(t.told('commits').map(c => c.at(-1)), [['bdac', 3, 1], ['bdac', 3, 1]], 'ArrowLeft and ArrowRight move it; ArrowUp does not');
    t.dispose();
  });
});

describe('Sortable: the keys', () => {
  it('Space lifts, the arrows move, Space drops with one change told, and the focus stays on the handle', () => {
    const t = setup();
    t.focus('a');
    t.key('ArrowDown');
    assert.deepEqual(t.pressed('a'), ['false', 'false'], 'an arrow alone lifts nothing');
    t.key(' ');
    assert.deepEqual(t.pressed('a'), ['true', 'true']);
    assert.equal(t.status(), BASE_LABELS.sortableTaken(1, 4));
    t.key('ArrowDown');
    t.key('ArrowDown');
    assert.equal(t.status(), BASE_LABELS.sortablePlace(3, 4));
    assert.deepEqual(t.places(), { a: 1 + 2 * (30 + GAP), b: 1, c: 31 + GAP, d: 91 + 3 * GAP }, 'the item shows at its place, the others made room');
    assert.deepEqual(t.told('commits'), [[], []], 'nothing told while it is lifted');
    t.key('ArrowUp');
    t.key('ArrowDown');
    t.key(' ');
    t.settle();
    assert.deepEqual(t.told('commits'), [[['bcad', 0, 2]], [['bcad', 0, 2]]]);
    assert.deepEqual(t.told('changes'), [['bcad'], ['bcad']]);
    assert.deepEqual(t.order(), ['bcad', 'bcad']);
    assert.deepEqual(t.focused(), ['Reorder a', 'Reorder a']);
    assert.deepEqual(t.pressed('a'), ['false', 'false']);
    assert.equal(t.status(), BASE_LABELS.sortableDropped(3, 4));
    // Enter lifts and drops too; End and Home take it to the ends, where the arrows stop.
    t.key('Enter');
    t.key('End');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.told('commits').map(c => c.at(-1)), [['bcda', 2, 3], ['bcda', 2, 3]]);
    t.key('Enter');
    t.key('Home');
    t.key('ArrowUp');
    t.key('Enter');
    assert.deepEqual(t.told('commits').map(c => c.at(-1)), [['abcd', 3, 0], ['abcd', 3, 0]]);
    assert.deepEqual(t.focused(), ['Reorder a', 'Reorder a']);
    t.dispose();
  });

  it('a drop on its own place tells nothing; Escape, Tab and the focus gone give the move up', () => {
    let escapes = 0;
    const t = setup({ around: list => <View onKey={(/** @type {any} */ e) => e.key === 'Escape' && escapes++}>{list}</View> });
    t.focus('b');
    t.key(' ');
    t.key('ArrowDown');
    t.key('ArrowUp');
    t.key(' ');
    assert.deepEqual(t.told('commits'), [[], []], 'back at its own place');
    t.key(' ');
    t.key('ArrowDown');
    t.key('Escape');
    t.settle();
    assert.deepEqual(t.pressed('b'), ['false', 'false']);
    assert.equal(escapes, 0, 'the Escape that ended the move stays in the list');
    assert.equal(t.status(), BASE_LABELS.sortableCanceled);
    assert.deepEqual(t.places(), { a: 1, b: 31 + GAP, c: 61 + 2 * GAP, d: 91 + 3 * GAP });
    t.key(' ');
    t.key('ArrowDown');
    t.key('Tab');
    assert.deepEqual(t.pressed('b'), ['false', 'false'], 'Tab');
    t.focus('b');
    t.key(' ');
    t.key('ArrowDown');
    t.focus('d');
    assert.deepEqual(t.pressed('b'), ['false', 'false'], 'the focus on another handle');
    t.key(' ');
    assert.deepEqual(t.pressed('d'), ['true', 'true'], 'which lifts its own');
    t.key('Escape');
    assert.deepEqual(t.told('commits'), [[], []]);
    assert.deepEqual(t.order(), ['abcd', 'abcd']);
    t.dispose();
  });
});
