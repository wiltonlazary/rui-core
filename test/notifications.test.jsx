// rui-core/notifications: the store (per root, show, hide, update,
// clear, clearWaiting and the ones waiting beyond the limit), and <Notifications> on
// the DOM and on Skia with the same text, presses, timers and transitions
// on a manual clock.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $root, $flush } from 'rrx-core';
import { $active, $signal, $read, $write, View } from 'ren-core';
import { Rui, Clock, manualClock, Text, Button, Modal, Drawer, Dialog } from 'rui-core';
import * as notifications from 'rui-core/notifications';
import { Notifications, $notifications, notificationsStore, NOTIFICATION_PLACES } from 'rui-core/notifications';
import { both } from './harness.jsx';

/** Collapses whitespace. @param {string[]} parts */
const normalize = parts => parts.join(' ').replace(/\s+/g, ' ').trim();

/** True when the node or an ancestor is not displayed. @param {any} node */
function hidden(node) {
  for (let n = node; n != null && n.style !== undefined; n = n.parentElement) if (n.style.display === 'none') return true;
  return false;
}

/**
 * The view on both renderers, seeing the portal layer: text, presses and
 * boxes on each.
 * @param {() => any} view @param {{ width?: number, height?: number }} [size]
 */
function pair(view, size) {
  const { dom, skia, dispose } = both(view, size);
  const body = dom.document.body;
  const flush = () => {
    $flush(dom.root);
    $flush(skia.root);
  };
  const d = {
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
    /** @param {any} node */
    tap(node) {
      const w = dom.window;
      const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 };
      node.dispatchEvent(new w.PointerEvent('pointerdown', at));
      node.dispatchEvent(new w.PointerEvent('pointerup', { ...at, buttons: 0 }));
      node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      $flush(dom.root);
    },
    /** @param {string} selector */
    all: selector => /** @type {any[]} */ ([...body.querySelectorAll(selector)]).filter(n => !hidden(n)),
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
  const s = {
    text: () => skia.text(),
    items,
    /** @param {string} text */
    find(text) {
      const found = items().filter(i => (i.text ?? '') === text);
      if (found.length === 0) throw new Error(`no "${text}" item on Skia in: ${skia.text()}`);
      return found.at(-1);
    },
    /** @param {any} item */
    box: item => {
      skia.skia.present();
      return item.getBoundingClientRect();
    },
    /** @param {any} item */
    tap(item) {
      const b = s.box(item);
      skia.skia.press(b.x + b.width / 2, b.y + b.height / 2);
      skia.skia.release(b.x + b.width / 2, b.y + b.height / 2);
      $flush(skia.root);
    },
    /** @param {number} x @param {number} y */
    move(x, y) {
      skia.skia.move(x, y);
      $flush(skia.root);
    },
  };
  return { dom, skia, d, s, flush, dispose };
}

/** The store each renderer's root made, captured while the view is built. */
function stores() {
  /** @type {import('rui-core/notifications').NotificationsStore[]} */
  const list = [];
  const Grab = () => {
    list.push($notifications());
    return null;
  };
  return { list, Grab };
}

/** A view on a clock, in the theme, with Notifications. @param {any} clock @param {Record<string, any>} props @param {() => any} [inside] */
const app = (clock, props, inside) => () => (
  <Clock value={clock}>
    <Rui>
      <Notifications {...props}>
        <View style={{ padding: 20 }}>
          <Text>page</Text>
          {inside?.()}
        </View>
      </Notifications>
    </Rui>
  </Clock>
);

describe('notifications store', () => {
  it('clear, clearWaiting and set call onHide for each notification they drop', () => {
    const R = $root('dropped');
    const store = notificationsStore(R);
    /** @type {string[]} */
    const hidden = [];
    const onHide = (/** @type {any} */ n) => hidden.push(String(n.title));
    store.limit = () => 1;
    store.show({ title: 'A', onHide });
    store.show({ title: 'B', onHide });
    store.clearWaiting();
    assert.deepEqual(hidden, ['B'], 'clearWaiting: the waiting one');
    const kept = store.show({ title: 'C', onHide });
    store.set(store.all().filter(n => n.id === kept));
    assert.deepEqual(hidden, ['B', 'A'], 'set: the one left out');
    store.clear();
    assert.deepEqual(hidden, ['B', 'A', 'C'], 'clear: every one');
  });

  it('shows, updates, hides (with onHide), clears and queues beyond the limit per place', () => {
    const R = $root('notes');
    const store = notificationsStore(R);
    /** @type {string[]} */
    const closed = [];
    store.limit = () => 2;
    const a = store.show({ title: 'A', onHide: n => closed.push(String(n.title)) });
    const b = store.show({ id: 'b', title: 'B' });
    store.show({ title: 'C' });
    store.show({ title: 'L', at: 'top-start' });
    assert.equal(b, 'b');
    assert.deepEqual(store.shown().map(n => n.title), ['A', 'B', 'L']);
    assert.deepEqual(store.waiting().map(n => n.title), ['C']);
    store.update({ id: 'b', title: 'B2', color: 'red' });
    assert.equal(store.all().find(n => n.id === 'b')?.color, 'red');
    store.hide(a);
    assert.deepEqual(closed, ['A']);
    assert.deepEqual(store.shown().map(n => n.title), ['B2', 'C', 'L'], 'the waiting one moves in');
    store.show({ title: 'D' });
    store.clearWaiting();
    assert.deepEqual(store.all().map(n => n.title), ['B2', 'C', 'L']);
    store.clear();
    assert.deepEqual(store.all(), []);
    store.set([{ id: '1', title: 'one' }, { id: '2', title: 'two' }, { id: '3', title: 'three', at: 'bottom-start' }]);
    assert.deepEqual(store.all().map(n => n.id), ['1', '2', '3'], 'set puts the whole list in place');
    store.limit = () => 1;
    const places = store.places();
    assert.deepEqual([...places.keys()], ['top-end', 'bottom-start'], 'places in use, in order of first use');
    assert.deepEqual(places.get('top-end')?.shown.map(n => n.id), ['1']);
    assert.deepEqual(places.get('top-end')?.waiting.map(n => n.id), ['2']);
    assert.deepEqual(places.get('bottom-start')?.shown.map(n => n.id), ['3'], 'each place has its own limit');
    assert.deepEqual(store.waiting().map(n => n.id), ['2']);
    assert.equal(NOTIFICATION_PLACES.length, 6);
  });
});

describe('Notifications', () => {
  it('a notification shown again by its id while it leaves comes back, and frees its slot when hidden', () => {
    const clock = manualClock();
    const st = stores();
    const { d, s, flush, dispose } = pair(app(clock, { at: 'top-end', limit: 1 }, () => <st.Grab />));
    for (const store of st.list) store.show({ id: 'x', title: 'Saved', timeout: false });
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'page Saved');
    for (const store of st.list) store.hide('x');
    clock.advance(48);
    flush();
    for (const store of st.list) store.show({ id: 'x', title: 'Again', timeout: false });
    clock.advance(1000);
    flush();
    assert.equal(d.text(), 'page Again', 'the DOM: shown again');
    assert.equal(s.text(), 'page Again', 'Skia: shown again');
    for (const store of st.list) {
      store.hide('x');
      store.show({ id: 'y', title: 'Next', timeout: false });
    }
    clock.advance(1000);
    flush();
    assert.equal(d.text(), 'page Next', 'the slot is free again');
    assert.equal(s.text(), 'page Next');
    dispose();
  });

  it('a leaving notification keeps its own data: its place, and its text while its id comes back', () => {
    const clock = manualClock();
    const st = stores();
    const { d, s, flush, dispose } = pair(app(clock, { at: 'top-end' }, () => <st.Grab />));
    for (const store of st.list) store.show({ id: 'p', title: 'Placed', at: 'bottom-start', timeout: false });
    clock.advance(300);
    flush();
    for (const store of st.list) store.hide('p');
    clock.advance(32);
    flush();
    assert.equal(d.text(), 'page Placed', 'the DOM: it leaves where it was, with its exit');
    assert.equal(s.text(), 'page Placed', 'Skia: the same');
    clock.advance(1000);
    flush();
    for (const store of st.list) store.show({ id: 'x', title: 'Saved', timeout: false });
    clock.advance(300);
    flush();
    for (const store of st.list) store.hide('x');
    clock.advance(48);
    flush();
    for (const store of st.list) store.show({ id: 'x', title: 'Again', timeout: false });
    clock.advance(16);
    flush();
    assert.equal(d.text(), 'page Saved Again', 'the DOM: the leaving copy keeps its text');
    assert.equal(s.text(), 'page Saved Again', 'Skia: the same');
    dispose();
  });

  it('stacks the shown ones at the top right, queues the rest, and each root keeps its own store', () => {
    const clock = manualClock();
    const st = stores();
    const { d, s, flush, dispose } = pair(app(clock, { at: 'top-end', limit: 2 }, () => <st.Grab />));
    assert.equal(st.list.length, 2);
    assert.notEqual(st.list[0], st.list[1], 'one store per root');
    st.list[0].show({ title: 'Saved', text: 'Your file is saved', timeout: false });
    flush();
    assert.equal(d.text(), 'page Saved Your file is saved');
    assert.equal(s.text(), 'page', 'the Skia root has its own store');
    for (const store of st.list.slice(1)) store.show({ title: 'Saved', text: 'Your file is saved', timeout: false });
    for (const store of st.list) {
      store.show({ title: 'Two', text: 'second', timeout: false });
      store.show({ title: 'Three', text: 'third', timeout: false });
    }
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'page Saved Your file is saved Two second');
    assert.equal(s.text(), 'page Saved Your file is saved Two second');
    assert.deepEqual(st.list.map(x => x.waiting().length), [1, 1]);
    // Top right on Skia: spacing.lg (24) from the top and the right edge, 360 wide.
    const box = s.box(s.find('Saved').parent.parent.parent);
    assert.deepEqual([Math.round(box.y), Math.round(box.x + box.width)], [24, 480 - 24]);
    assert.equal(Math.round(box.width), 360);
    for (const store of st.list) store.hide(store.shown()[0].id);
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'page Two second Three third', 'the queued one moved in');
    assert.equal(s.text(), 'page Two second Three third');
    dispose();
  });

  it('closes by timeout on the clock (a notification\'s own, the default, or never), paused while hovered', () => {
    const clock = manualClock();
    const st = stores();
    const { d, s, flush, dispose } = pair(app(clock, { at: 'top-end', timeout: 3000 }, () => <st.Grab />));
    for (const store of st.list) {
      store.show({ title: 'Quick', timeout: 500 });
      store.show({ title: 'Default' });
      store.show({ title: 'Stays', timeout: false });
    }
    flush();
    clock.advance(260);
    flush();
    assert.equal(d.text(), 'page Quick Default Stays');
    assert.equal(s.text(), 'page Quick Default Stays');
    clock.advance(600);
    flush();
    assert.deepEqual(st.list.map(x => x.all().map(n => n.title).join()), ['Default,Stays', 'Default,Stays'], 'the 500 ms one closed');
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'page Default Stays', 'it left after its transition');
    assert.equal(s.text(), 'page Default Stays');
    // Hovered, the default one waits; it closes a full timeout after the pointer leaves.
    const dom = d.all('[data-ren="Label"]').find(n => n.textContent === 'Default');
    const wrap = dom.parentElement.parentElement.parentElement;
    wrap.dispatchEvent(new (/** @type {any} */ (wrap.ownerDocument.defaultView).PointerEvent)('pointerenter', { bubbles: false }));
    const box = s.box(s.find('Default'));
    s.move(box.x + 2, box.y + 2);
    clock.advance(2000);
    flush();
    assert.deepEqual(st.list.map(x => x.all().length), [2, 2], 'paused while hovered');
    wrap.dispatchEvent(new (/** @type {any} */ (wrap.ownerDocument.defaultView).PointerEvent)('pointerleave', { bubbles: false }));
    s.move(2, 350);
    clock.advance(2000);
    flush();
    assert.deepEqual(st.list.map(x => x.all().length), [2, 2], "the timer starts again on leave");
    clock.advance(1100);
    flush();
    assert.deepEqual(st.list.map(x => x.all().map(n => n.title).join()), ['Stays', 'Stays']);
    dispose();
  });

  it('a notification shown as its <Notifications> is built again (a new language) stays once and closes on its time', () => {
    const clock = manualClock();
    const st = stores();
    /** @type {any[]} */
    const langs = [];
    const view = () => {
      const lang = $signal($active(), 'en');
      langs.push(lang);
      return (
        <Clock value={clock}>
          {() => {
            const said = $read(lang);
            return (
              <Rui>
                <Notifications at="bottom-end">
                  <View style={{ padding: 20 }}>
                    <Text>{`page ${said}`}</Text>
                    <st.Grab />
                  </View>
                </Notifications>
              </Rui>
            );
          }}
        </Clock>
      );
    };
    const { d, s, flush, dispose } = pair(view);
    for (const store of new Set(st.list)) store.show({ title: 'Saved', timeout: 2500 });
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'page en Saved');
    for (const lang of langs) $write(lang, 'es');
    flush();
    clock.advance(16);
    flush();
    assert.equal(d.text(), 'page es Saved', 'the DOM: shown once, built again');
    assert.equal(s.text(), 'page es Saved', 'Skia: the same');
    clock.advance(2500);
    flush();
    clock.advance(1000);
    flush();
    assert.equal(d.text(), 'page es', 'the DOM: it closed on its time');
    assert.equal(s.text(), 'page es', 'Skia: the same');
    dispose();
  });

  it('enters and leaves with a transition, runs onShow and onHide, and its close button hides it', () => {
    const clock = manualClock();
    const st = stores();
    /** @type {string[]} */
    const log = [];
    const { d, s, flush, dispose } = pair(app(clock, { at: 'top-start', timeout: false }, () => <st.Grab />));
    for (const [i, store] of st.list.entries())
      store.show({ id: 'n', title: 'Synced', text: 'just now', color: 'teal', onShow: () => log.push(`open ${i}`), onHide: () => log.push(`close ${i}`) });
    flush();
    clock.advance(16);
    flush();
    assert.deepEqual(log, ['open 0', 'open 1']);
    clock.advance(96);
    flush();
    const wrapper = d.all('[data-ren="Label"]').find(n => n.textContent === 'Synced').parentElement.parentElement.parentElement;
    const opacity = Number(wrapper.style.opacity);
    assert.ok(opacity > 0 && opacity < 1, `half way in: ${opacity}`);
    const [tx, ty] = wrapper.style.translate.split(' ').map(parseFloat);
    assert.ok(tx === 0 && ty < 0 && ty > -8, `top-start: sinks in from under spacing.xs above, never across: ${wrapper.style.translate}`);
    const item = s.find('Synced').parent.parent.parent;
    assert.ok(Math.abs(item.r.opacity - opacity) < 0.01, `the same opacity on Skia: ${item.r.opacity}`);
    clock.advance(200);
    flush();
    assert.equal(wrapper.style.opacity, '', 'in place at the end');
    assert.equal(s.find('Synced').parent.parent.parent.r.opacity, 1);
    // The close button, on each.
    d.tap(d.all('[aria-label="Close"]')[0]);
    s.tap(s.items().find(i => i.label === 'Close'));
    assert.deepEqual(log, ['open 0', 'open 1', 'close 0', 'close 1']);
    clock.advance(50);
    flush();
    assert.equal(d.text(), 'page Synced just now', 'still leaving (190 ms by default)');
    // On Skia the message is still there, its line clipped as the height runs down from the bottom.
    assert.equal(s.text(), 'page Synced');
    assert.equal(s.find('just now').text, 'just now');
    clock.advance(250);
    flush();
    assert.equal(d.text(), 'page');
    assert.equal(s.text(), 'page');
    dispose();
  });

  it('updates a shown notification in place: loading, then done', () => {
    const clock = manualClock();
    const st = stores();
    const { d, s, flush, dispose } = pair(app(clock, { at: 'top-center', timeout: false }, () => <st.Grab />));
    for (const store of st.list) store.show({ id: 'load', title: 'Loading', text: 'Uploading', loading: true });
    clock.advance(300);
    flush();
    const shapes = () => [d.all('[data-ren="Shape"]').length, s.items().filter(i => Array.isArray(i.shapes) && i.shapes.length > 0).length];
    assert.equal(d.text(), 'page Loading Uploading');
    assert.equal(s.text(), 'page Loading Uploading');
    const loading = shapes();
    // The rule: a 2 px track of two views along the bottom edge; busy on the DOM.
    const rules = () => [d.all('[aria-busy="true"]').filter(n => n.lastElementChild?.style.height === '2px').length, s.items().filter(i => i.style?.height === 2 && i.style?.bottom === 0).length];
    const busy = rules();
    for (const store of st.list) store.update({ id: 'load', title: 'Done', text: 'Uploaded', loading: false });
    flush();
    assert.equal(d.text(), 'page Done Uploaded');
    assert.equal(s.text(), 'page Done Uploaded');
    assert.deepEqual(shapes().map((n, i) => loading[i] - n), [0, 0], 'no loader drawn: a rule of views');
    assert.deepEqual(busy, [1, 1], 'busy while loading, with its rule on both');
    assert.deepEqual(rules(), [0, 0], 'the rule and busy went on both');
    // Centered: the middle of the canvas.
    const box = s.box(s.find('Done').parent.parent.parent);
    assert.equal(Math.round(box.x + box.width / 2), 240);
    dispose();
  });

  it('updates everything a notification shows: its text to content, its icon, its close button', () => {
    const clock = manualClock();
    const st = stores();
    const { d, s, flush, dispose } = pair(app(clock, { at: 'top-center', timeout: false }, () => <st.Grab />));
    for (const store of st.list) store.show({ id: 'n', title: 'Export', text: 'Preparing', closable: false });
    clock.advance(300);
    flush();
    const closes = () => [d.all('[aria-label="Close"]').length, s.items().filter(i => i.label === 'Close').length];
    assert.equal(d.text(), 'page Export Preparing');
    assert.deepEqual(closes(), [0, 0], 'no close button yet');
    for (const store of st.list) store.update({ id: 'n', title: 'Ready', text: <Text>Download</Text>, icon: <Text>✓</Text>, closable: true });
    flush();
    assert.equal(d.text(), 'page ✓ Ready Download', 'the icon, the title, and the text now a node');
    assert.equal(s.text(), 'page ✓ Ready Download');
    assert.deepEqual(closes(), [1, 1], 'its close button now shows');
    for (const store of st.list) store.update({ id: 'n', text: 'Saved again', icon: undefined });
    flush();
    assert.equal(d.text(), 'page Ready Saved again', 'back to text, no icon');
    dispose();
  });

  it('at a bottom place rises in from a short step below, fading, never sliding across', () => {
    const clock = manualClock();
    const st = stores();
    const { d, s, flush, dispose } = pair(app(clock, { at: 'bottom-end', timeout: false }, () => <st.Grab />));
    for (const store of st.list) store.show({ title: 'Up', timeout: false });
    flush();
    clock.advance(96);
    flush();
    const wrapper = d.all('[data-ren="Label"]').find(n => n.textContent === 'Up').parentElement.parentElement.parentElement;
    const [tx, ty] = wrapper.style.translate.split(' ').map(parseFloat);
    assert.ok(tx === 0 && ty > 0 && ty < 8, `rises from under spacing.xs below: ${wrapper.style.translate}`);
    const opacity = Number(wrapper.style.opacity);
    assert.ok(opacity > 0 && opacity < 1, `fading in: ${opacity}`);
    assert.ok(Math.abs(s.find('Up').parent.parent.parent.r.opacity - opacity) < 0.01, 'the same on Skia');
    dispose();
  });

  it('keeps each place\'s notifications within a viewport narrower than one, across it', () => {
    const clock = manualClock();
    const st = stores();
    const { d, s, flush, dispose } = pair(app(clock, { timeout: false }, () => <st.Grab />), { width: 320, height: 600 });
    for (const store of st.list) for (const at of NOTIFICATION_PLACES) store.show({ title: at, at });
    clock.advance(300);
    flush();
    for (const at of NOTIFICATION_PLACES) {
      const box = s.box(s.find(at).parent.parent.parent);
      assert.ok(box.x >= 0 && box.x + box.width <= 320, `${at} within the viewport on Skia: ${box.x}..${box.x + box.width}`);
      const wrapper = d.all('[data-ren="Label"]').find(n => n.textContent === at).parentElement.parentElement.parentElement;
      const stack = wrapper.parentElement;
      const sides = at.endsWith('center') ? ['0px', '0px'] : ['24px', '24px'];
      assert.deepEqual([stack.style.left, stack.style.right, stack.style.pointerEvents, wrapper.style.maxWidth, wrapper.style.pointerEvents], [...sides, 'none', '100%', 'auto'], `${at} across the viewport on the DOM`);
    }
    dispose();
  });

  it('lets a press beside a notification reach the page under its place', () => {
    const clock = manualClock();
    const st = stores();
    /** @type {number[]} */
    const pressed = [];
    const { skia, s, flush, dispose } = pair(app(clock, { at: 'top-end', timeout: false }, () => [<st.Grab />, <View style={{ direction: 'row' }}><Button onPress={() => pressed.push(1)}>Under</Button></View>]), { width: 480, height: 600 });
    for (const store of st.list) store.show({ title: 'Beside', text: 'one\ntwo\nthree' });
    clock.advance(300);
    flush();
    const under = s.box(s.find('Under'));
    const note = s.box(s.find('Beside').parent.parent.parent);
    // a point of the button left of the notification, within its row
    const x = under.x + under.width / 2;
    const y = (Math.max(under.y, note.y) + Math.min(under.y + under.height, note.y + note.height)) / 2;
    assert.ok(x < note.x - 24 && y > note.y && y < note.y + note.height && y > under.y && y < under.y + under.height, `beside it, in its row: ${x},${y} ${JSON.stringify(note)}`);
    skia.skia.press(x, y);
    skia.skia.release(x, y);
    flush();
    assert.deepEqual(pressed, [1], 'the press reached the page on Skia');
    dispose();
  });

  it('sits at the top right by default, with positions in reading order', () => {
    assert.deepEqual(NOTIFICATION_PLACES, ['top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end']);
    const clock = manualClock();
    const st = stores();
    const { d, s, flush, dispose } = pair(app(clock, {}, () => <st.Grab />));
    for (const store of st.list) store.show({ title: 'Corner', timeout: false });
    clock.advance(300);
    flush();
    const stack = d.all('[data-ren="Label"]').find(n => n.textContent === 'Corner').parentElement.parentElement.parentElement.parentElement;
    assert.deepEqual([stack.style.position, stack.style.top, stack.style.right, stack.style.rowGap || stack.style.gap], ['fixed', '24px', '24px', '12px']);
    const fixed = s.find('Corner').parent.parent.parent.parent;
    assert.ok(fixed.r.fixed, 'fixed on Skia');
    const box = s.box(fixed);
    assert.deepEqual([Math.round(box.y), Math.round(box.right)], [24, 480 - 24], 'its rect where it is placed on Skia');
    // The order: the newest last, under the older ones.
    for (const store of st.list) store.show({ title: 'Newer', timeout: false });
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'page Corner Newer');
    assert.equal(s.text(), 'page Corner Newer');
    const y = (/** @type {string} */ t) => s.box(s.find(t)).y;
    assert.ok(y('Newer') > y('Corner'), 'the newer one under the older one on Skia');
    assert.equal(Math.round(s.box(s.find('Corner').parent.parent.parent).y), 24, 'the older one against the top edge');
    dispose();
  });

  it('a nested store: $notifications() below <Notifications store> is that store', () => {
    /** @type {any[]} */
    const seen = [];
    const view = () => {
      const mine = notificationsStore($active());
      seen.push(mine);
      const Inner = () => {
        seen.push($notifications());
        return null;
      };
      return (
        <Rui>
          <Notifications store={mine} portal={false}>
            <Inner />
          </Notifications>
        </Rui>
      );
    };
    const { dispose } = pair(view);
    assert.equal(seen[1], seen[0]);
    assert.equal(seen[3], seen[2]);
    dispose();
  });
});

describe('notifications collapse as they leave', () => {
  it('a leaving notification’s height runs from its own measured height to 0; the ones after it move up', () => {
    const clock = manualClock();
    const st = stores();
    const { d, s, flush, dispose } = pair(app(clock, { at: 'top-start', timeout: false, duration: 200 }, () => <st.Grab />), { width: 600, height: 600 });
    for (const store of st.list) {
      store.show({ id: 'a', title: 'First', text: 'one' });
      store.show({ id: 'b', title: 'Second', text: 'two' });
    }
    flush();
    clock.advance(400);
    flush();
    const outer = (/** @type {string} */ title) => s.find(title).parent.parent.parent;
    const full = s.box(outer('First')).height;
    const second = s.box(outer('Second')).top;
    assert.ok(full > 0, `laid out: ${full}`);
    // The DOM here lays nothing out: its wrapper is given the height Skia measured.
    const wrapper = d.all('[data-ren="Label"]').find(n => n.textContent === 'First').parentElement.parentElement.parentElement;
    assert.equal(wrapper.style.height, '', 'its own height while shown');
    wrapper.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 360, height: full, right: 360, bottom: full });
    for (const store of st.list) store.hide('a');
    flush();
    clock.advance(16);
    flush();
    const early = s.box(outer('First')).height;
    assert.ok(early <= full && early > full / 2, `starting from its own height: ${early} of ${full}`);
    clock.advance(134);
    flush();
    // Three quarters through: under half its height, clipped; the second moved up with it.
    const mid = s.box(outer('First')).height;
    assert.ok(mid < full / 2, `collapsing: ${mid}`);
    assert.ok(s.box(outer('Second')).top < second, 'the next one moves up');
    assert.match(wrapper.style.height, /^\d+(\.\d+)?px$/);
    assert.ok(Number.parseFloat(wrapper.style.height) < full / 2, `the same on the DOM: ${wrapper.style.height}`);
    assert.equal(wrapper.style.overflow, 'hidden');
    clock.advance(100);
    flush();
    assert.equal(d.text(), 'page Second two');
    assert.equal(s.text(), 'page Second two');
    dispose();
  });
});

describe('notifications keep clear of the sheets over the viewport', () => {
  /** Two boxes overlap. @param {any} a @param {any} b */
  const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  /** The Action holding a Skia item (a button's label): the nearest item of kind 5, an Action. @param {any} item */
  const pressOf = item => {
    let n = item;
    while (n !== null && n.kind !== 5) n = n.parent;
    return n;
  };
  /** The notifications' stack on the DOM (its region). @param {any} d */
  const stackOn = d => d.all('[aria-label="Notifications"]')[0];
  /** A record form in a Modal, its action at its end, with a notice to show. @param {any} clock @param {any} st @param {Record<string, any>} [props] */
  const form = (clock, st, props = {}) =>
    app(clock, { at: 'bottom-end', timeout: false, ...props }, () => [
      <st.Grab />,
      <Modal open title="New record" motion={{ duration: 0 }}>
        <View style={{ height: 380 }}>
          <Text>Fields</Text>
        </View>
        <Button stretch>Record expense</Button>
      </Modal>,
    ]);

  it('on a phone a notice stands below an open Modal: its bottom action stays in view above the notice', () => {
    const clock = manualClock();
    const st = stores();
    const { dom, d, s, flush, dispose } = pair(form(clock, st), { width: 360, height: 640 });
    clock.advance(50);
    flush();
    const action = () => s.box(pressOf(s.find('Record expense')));
    const before = action();
    assert.ok(before.y + before.height <= 640, `the action in view before: ${JSON.stringify(before)}`);
    for (const store of st.list) store.show({ title: 'Merchant deleted', text: 'Creating one with its name again brings it back.' });
    clock.advance(300);
    flush();
    // Skia lays out: the notice where it was placed, the action clear of it and within the scroller's view.
    const note = s.box(s.find('Merchant deleted').parent.parent.parent);
    assert.equal(Math.round(note.y + note.height), 640 - 24, 'the notice stays at its place');
    assert.ok(overlap(before, note), `without room the notice would cover the action: ${JSON.stringify({ before, note })}`);
    const after = action();
    assert.ok(!overlap(after, note), `the action clear of the notice on Skia: ${JSON.stringify({ after, note })}`);
    const scroller = s.items().find((/** @type {any} */ i) => i.kind === 2); // kind 2: a Scroll
    const view = s.box(scroller);
    assert.ok(view.y + view.height <= note.y, `the sheet's scroller ends above the notice: ${JSON.stringify(view)}`);
    assert.ok(after.y >= view.y && after.y + after.height <= view.y + view.height, 'the action within the scroller\'s view');
    // The DOM lays nothing out: its stack reports the height Skia measured; the scroller ends a sm step above it.
    const stack = stackOn(d);
    stack.getBoundingClientRect = () => ({ x: 24, y: 640 - 24 - note.height, left: 24, top: 640 - 24 - note.height, width: 312, height: note.height, right: 336, bottom: 640 - 24 });
    dom.report();
    const scroll = d.all('[data-ren="Scroll"]')[0];
    assert.equal(stack.style.bottom, '24px');
    assert.equal(scroll.style.marginBottom, `${24 + note.height + 12}px`, 'the room on the DOM: the notice and a sm step');
    // The notice gone, the sheet has the whole layer again.
    for (const store of st.list) store.clear();
    clock.advance(300);
    flush();
    dom.report();
    assert.equal(Math.round(s.box(scroller).height), 640, 'the whole layer on Skia');
    assert.equal(scroll.style.marginBottom, '0px', 'and on the DOM');
    dispose();
  });

  it('a notice at the top pushes the Modal down, so its title and Close stay clear', () => {
    const clock = manualClock();
    const st = stores();
    const { s, flush, dispose } = pair(form(clock, st, { at: 'top-center' }), { width: 360, height: 640 });
    clock.advance(50);
    flush();
    // closable: false, so the one Close is the Modal's
    for (const store of st.list) store.show({ title: 'Merchant deleted', text: 'Creating one with its name again brings it back.', closable: false });
    clock.advance(300);
    flush();
    const note = s.box(s.find('Merchant deleted').parent.parent.parent);
    assert.equal(Math.round(note.y), 24);
    for (const part of ['New record', 'Close']) {
      const item = s.items().find((/** @type {any} */ i) => i.text === part || i.label === part);
      assert.ok(item !== undefined, `${part} on Skia`);
      assert.ok(!overlap(s.box(item), note), `${part} clear of the notice: ${JSON.stringify(s.box(item))}`);
    }
    dispose();
  });

  it('a bottom Drawer and a Dialog in a corner stand above the notices on a phone', () => {
    const clock = manualClock();
    const st = stores();
    const view = app(clock, { at: 'bottom-center', timeout: false }, () => [
      <st.Grab />,
      <Drawer open at="bottom" size={200} title="Filters" motion={{ duration: 0 }}>
        <Button>Apply</Button>
      </Drawer>,
      <Dialog open motion={{ duration: 0 }}>
        <Button>Undo</Button>
      </Dialog>,
    ]);
    const { s, flush, dispose } = pair(view, { width: 360, height: 640 });
    clock.advance(50);
    flush();
    for (const store of st.list) store.show({ title: 'Saved', text: 'Your filters are kept.' });
    clock.advance(300);
    flush();
    const note = s.box(s.find('Saved').parent.parent.parent);
    for (const part of ['Apply', 'Undo']) {
      const b = s.box(pressOf(s.find(part)));
      assert.ok(b.y + b.height <= note.y, `${part} above the notice: ${JSON.stringify({ b, note })}`);
    }
    dispose();
  });

  it('on a wide screen, or with no sheet open, nothing moves for a notice', () => {
    const clock = manualClock();
    const st = stores();
    const { dom, d, s, flush, dispose } = pair(form(clock, st), { width: 1024, height: 640 });
    clock.advance(50);
    flush();
    const action = () => s.box(pressOf(s.find('Record expense')));
    const before = action();
    for (const store of st.list) store.show({ title: 'Merchant deleted' });
    clock.advance(300);
    flush();
    const stack = stackOn(d);
    stack.getBoundingClientRect = () => ({ x: 640, y: 560, left: 640, top: 560, width: 360, height: 56, right: 1000, bottom: 616 });
    dom.report();
    assert.deepEqual(action(), before, 'the Modal where it was on Skia');
    assert.ok(['', '0px'].includes(d.all('[data-ren="Scroll"]')[0].style.marginBottom), 'and on the DOM');
    dispose();
    // No sheet: the notice stands at its place, the page as it was.
    const clock2 = manualClock();
    const st2 = stores();
    const page = pair(app(clock2, { at: 'bottom-end', timeout: false }, () => <st2.Grab />), { width: 360, height: 640 });
    for (const store of st2.list) store.show({ title: 'Alone' });
    clock2.advance(300);
    page.flush();
    const box = page.s.box(page.s.find('Alone').parent.parent.parent);
    assert.deepEqual([Math.round(box.x), Math.round(box.y + box.height)], [24, 640 - 24], 'at its place on Skia');
    const alone = stackOn(page.d);
    assert.deepEqual([alone.style.bottom, alone.style.left, alone.style.right], ['24px', '24px', '24px'], 'and on the DOM');
    page.dispose();
  });
});
