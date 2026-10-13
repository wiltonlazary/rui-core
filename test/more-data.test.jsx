// rui-core/more, data goodies: ContextMenu and DataTable on the DOM and on
// Skia, with the same text, presses, drags and state on both.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';
import { Rui, Clock as Time, manualClock, Menu, Text, themeOf, alpha, BASE_THEME } from 'rui-core';
import { ContextMenu, DataTable, sortRecords, windowOf } from 'rui-core/more';
import { both } from './harness.jsx';
import { primitives, drag, mirror, pressLabel, allText, domPress } from './more-harness.jsx';

describe('ContextMenu on the DOM and on Skia', () => {
  it('opens at the pointer on a right press, and a choice closes it', () => {
    const clock = manualClock();
    /** @type {string[]} */
    const chosen = [];
    /** @type {any[]} */
    const points = [];
    const view = () => (
      <Time value={clock}>
        <Rui>
          <ContextMenu
            style={{ width: 300, height: 200 }}
            onOpenChange={(/** @type {boolean} */ open, /** @type {any} */ p) => open && points.push(p)}
            menu={[<Menu.Item onPress={() => chosen.push('copy')}>Copy</Menu.Item>, <Menu.Item onPress={() => chosen.push('paste')}>Paste</Menu.Item>]}
          >
            <Text>Right click here</Text>
          </ContextMenu>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(allText(dom), 'Right click here');
    assert.equal(skia.text(), allText(dom));
    drag(dom, skia, [[120, 80]], { button: 2 });
    clock.advance(200);
    assert.deepEqual(points, [{ x: 120, y: 80 }, { x: 120, y: 80 }]);
    assert.equal(allText(dom), 'Right click here Copy Paste');
    assert.equal(skia.text(), allText(dom));
    // The browser's contextmenu comes after the press, over the open menu's backdrop: it stays the app's.
    const menu = dom.document.querySelector('[role="menu"]');
    const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 80 });
    menu.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, "the DOM keeps the browser's menu off the app's");
    assert.equal(skia.skia.cancels('contextmenu', 120, 80), true, "Skia keeps it off the menu's backdrop");
    // The panel sits at the pointer on Skia.
    const copy = primitives(skia).find(i => i.kind === 3 && i.text === 'Copy');
    const r = copy.getBoundingClientRect();
    assert.ok(r.left >= 120 && r.left < 150 && r.top >= 80 && r.top < 110, `at the pointer: ${r.left}, ${r.top}`);
    domPress(dom, 'Paste');
    skia.press('Paste');
    clock.advance(200);
    assert.deepEqual(chosen, ['paste', 'paste']);
    assert.equal(allText(dom), 'Right click here');
    assert.equal(skia.text(), allText(dom));
    dispose();
  });

  it('opens on a long press held still, not on a short one or a moved one', () => {
    const clock = manualClock();
    let opens = 0;
    const view = () => (
      <Time value={clock}>
        <Rui>
          <ContextMenu style={{ width: 300, height: 200 }} onOpenChange={(/** @type {boolean} */ open) => open && opens++} menu={<Menu.Item>Delete</Menu.Item>}>
            <Text>Hold</Text>
          </ContextMenu>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    drag(dom, skia, [[50, 50], [52, 51]]);
    clock.advance(600);
    assert.equal(opens, 0, 'released before the delay');
    mirror(dom, skia);
    const region = dom.document.querySelector('[data-ren="View"]');
    region.dispatchEvent(new dom.window.PointerEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true, pointerId: 1, button: 0, buttons: 1 }));
    skia.skia.press(50, 50);
    clock.advance(300);
    region.dispatchEvent(new dom.window.PointerEvent('pointermove', { clientX: 80, clientY: 50, bubbles: true, pointerId: 1, buttons: 1 }));
    skia.skia.move(80, 50, { buttons: 1 });
    clock.advance(400);
    assert.equal(opens, 0, 'moved away');
    region.dispatchEvent(new dom.window.PointerEvent('pointerup', { clientX: 80, clientY: 50, bubbles: true, pointerId: 1 }));
    skia.skia.release(80, 50);
    region.dispatchEvent(new dom.window.PointerEvent('pointerdown', { clientX: 60, clientY: 60, bubbles: true, pointerId: 1, button: 0, buttons: 1 }));
    skia.skia.press(60, 60);
    clock.advance(520);
    assert.equal(opens, 0, 'the default hold is twice MOTION.calm, 600 ms: not yet');
    clock.advance(100);
    assert.equal(opens, 2, 'held: opens on both');
    assert.equal(allText(dom), 'Hold Delete');
    assert.equal(skia.text(), allText(dom));
    dispose();
  });

  it('takes its `hold` as a MOTION preset name or ms', () => {
    const clock = manualClock();
    let opens = 0;
    const view = () => (
      <Time value={clock}>
        <Rui>
          <ContextMenu hold="calm" style={{ width: 300, height: 200 }} onOpenChange={(/** @type {boolean} */ open) => open && opens++} menu={<Menu.Item>Delete</Menu.Item>}>
            <Text>Hold</Text>
          </ContextMenu>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    mirror(dom, skia);
    const region = dom.document.querySelector('[data-ren="View"]');
    region.dispatchEvent(new dom.window.PointerEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true, pointerId: 1, button: 0, buttons: 1 }));
    skia.skia.press(50, 50);
    clock.advance(250);
    assert.equal(opens, 0);
    clock.advance(70);
    assert.equal(opens, 2, "'calm' is 300 ms");
    dispose();
  });
});

// ---------------------------------------------------------------------------

const PEOPLE = [
  { id: 1, name: 'Ada', age: 36, city: 'London' },
  { id: 2, name: 'Linus', age: 28, city: 'Helsinki' },
  { id: 3, name: 'Grace', age: 45, city: 'Arlington' },
  { id: 4, name: 'Alan', age: 41, city: 'Wilmslow' },
  { id: 5, name: 'Edsger', age: 30, city: 'Nuenen' },
];

const FIELDS = {
  name: { sort: true },
  age: { sort: true, align: 'end', width: 80 },
  city: { cell: (/** @type {any} */ r) => <Text>{r.city.toUpperCase()}</Text> },
};
/** The fields `keys` of FIELDS, in their order. @param {string[]} keys */
const only = (...keys) => Object.fromEntries(keys.map(k => [k, /** @type {any} */ (FIELDS)[k]]));

describe('DataTable', () => {
  it('a selected record not among the rows selects none of them', async () => {
    const { onDom } = await import('./harness.jsx');
    const rows = [{ name: 'Ada' }, { name: 'Linus' }, { name: 'Grace' }];
    const v = onDom(() => (
      <Rui>
        <DataTable fields={{ name: {} }} rows={rows} picking={{ value: [{ name: 'Old' }] }} />
      </Rui>
    ));
    v.text();
    const checks = [...v.document.body.querySelectorAll('[role="checkbox"]')].map((/** @type {any} */ n) => n.getAttribute('aria-checked'));
    assert.ok(checks.length >= 3, `the row checks: ${checks.length}`);
    assert.equal(checks.filter(c => c === 'true').length, 0, `no row checked: ${checks.join(' ')}`);
    v.dispose();
  });

  it('sorts stably with nulls last, and windows virtual rows', () => {
    const rows = [{ a: 2 }, { a: null }, { a: 1 }, { a: 2, b: 1 }];
    assert.deepEqual(sortRecords(rows, {}, { by: 'a' }), [rows[2], rows[0], rows[3], rows[1]]);
    assert.deepEqual(sortRecords(rows, {}, { by: 'a', desc: true }), [rows[0], rows[3], rows[2], rows[1]]);
    assert.deepEqual(sortRecords(rows, { a: { sort: (/** @type {any} */ r) => -(r.a ?? 0) } }, { by: 'a' }).map(r => r.a), [2, 2, 1, null], 'a field sorts by what its `sort` gives');
    // NaN and an Invalid Date are no value: they sort last, as null, stably.
    const odd = [{ a: 3 }, { a: NaN }, { a: 1 }, { a: NaN }, { a: 2 }];
    assert.deepEqual(sortRecords(odd, {}, { by: 'a' }), [odd[2], odd[4], odd[0], odd[1], odd[3]]);
    assert.deepEqual(sortRecords(odd, {}, { by: 'a', desc: true }), [odd[0], odd[4], odd[2], odd[1], odd[3]]);
    const days = [{ d: new Date(2000) }, { d: new Date('never') }, { d: new Date(1000) }, { d: new Date('nope') }];
    assert.deepEqual(sortRecords(days, {}, { by: 'd' }), [days[2], days[0], days[1], days[3]]);
    assert.deepEqual(sortRecords(days, {}, { by: 'd', desc: true }), [days[0], days[2], days[1], days[3]]);
    assert.deepEqual(windowOf(0, 300, 30, 10000, 4), { first: 0, last: 14 });
    assert.deepEqual(windowOf(3000, 300, 30, 10000, 4), { first: 96, last: 114 });
    assert.deepEqual(windowOf(299700, 300, 30, 10000, 4), { first: 9986, last: 10000 });
  });

  it('shows columns and rows, sorts by a header press, per root', () => {
    /** @type {any[]} */
    const orders = [];
    const view = () => (
      <Rui>
        <DataTable fields={FIELDS} rows={PEOPLE} onOrderChange={(/** @type {any} */ o) => orders.push(o)} defaultOrder={null} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 400 });
    assert.equal(dom.text(), 'Name Age City Ada 36 LONDON Linus 28 HELSINKI Grace 45 ARLINGTON Alan 41 WILMSLOW Edsger 30 NUENEN');
    assert.equal(skia.text(), dom.text());
    pressLabel(dom, skia, 'Age');
    assert.equal(dom.text(), 'Name Age City Linus 28 HELSINKI Edsger 30 NUENEN Ada 36 LONDON Alan 41 WILMSLOW Grace 45 ARLINGTON');
    assert.equal(skia.text(), dom.text());
    pressLabel(dom, skia, 'Age');
    assert.match(dom.text(), /City Grace 45/);
    assert.equal(skia.text(), dom.text());
    assert.deepEqual(orders.map(o => o.desc), [false, false, true, true]);
    assert.deepEqual(orders[0], { by: 'age', desc: false });
    dispose();
  });

  it('selects rows with checkboxes (one, then all on the page), and hears row presses apart', () => {
    /** @type {any[][]} */
    const selections = [];
    /** @type {string[]} */
    const clicked = [];
    const view = () => (
      <Rui>
        <DataTable
          fields={only('name', 'age')}
          rows={PEOPLE.slice(0, 3)}
          picking={{ defaultValue: [], onChange: (/** @type {any[]} */ l) => selections.push(l.map(r => r.id)) }}
          onRowPress={(/** @type {any} */ row, /** @type {number} */ index) => clicked.push(`${row.name}@${index}`)}
        />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    assert.doesNotMatch(dom.text() + skia.text(), /Select/, 'the checkboxes\' names are accessible names only: the boxes alone show');
    pressLabel(dom, skia, 'Select row 2');
    assert.deepEqual(selections, [[2], [2]]);
    assert.deepEqual(clicked, [], 'a checkbox press is not a row press');
    pressLabel(dom, skia, 'Select all rows');
    assert.deepEqual(selections.slice(2), [[2, 1, 3], [2, 1, 3]]);
    pressLabel(dom, skia, 'Select all rows');
    assert.deepEqual(selections.slice(4), [[], []]);
    dom.press('Grace');
    skia.press('Grace');
    assert.deepEqual(clicked, ['Grace@2', 'Grace@2']);
    dispose();
  });

  it('paginates rows it holds, and says so in the footer', () => {
    /** @type {number[]} */
    const pages = [];
    const view = () => (
      <Rui>
        <DataTable fields={only('name')} rows={PEOPLE} pages={{ size: 2, onChange: (/** @type {number} */ p) => pages.push(p) }} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    assert.equal(dom.text(), 'Name Ada Linus 1–2 of 5 1 2 3');
    assert.equal(skia.text(), dom.text());
    dom.press('3');
    skia.press('3');
    assert.deepEqual(pages, [3, 3]);
    assert.equal(dom.text(), 'Name Edsger 5 of 5 1 2 3');
    assert.equal(skia.text(), dom.text());
    pressLabel(dom, skia, 'Previous page');
    assert.equal(dom.text(), 'Name Grace Alan 3–4 of 5 1 2 3');
    assert.equal(skia.text(), dom.text());
    dispose();
  });

  it('shows only the fields it is given, in their order, at a density, with its own page text', () => {
    const view = () => (
      <Rui>
        <DataTable fields={{ city: {}, name: { title: 'Who' } }} rows={PEOPLE.slice(0, 2)} density="tight" pages={{ size: 1, text: (/** @type {number} */ from, /** @type {number} */ to, /** @type {number} */ total) => `${from} of ${total}` }} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    assert.equal(dom.text(), 'City Who London Ada 1 of 2 1 2', 'age left out; city first');
    assert.equal(skia.text(), dom.text());
    const cell = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === 'Ada').parentElement;
    assert.match(cell.getAttribute('style'), /padding: 4px 8px/, 'tight: 4 × 8');
    dispose();
  });

  it('takes its densities from the theme\'s control.density', () => {
    const view = () => (
      <Rui theme={themeOf({ control: { density: { tight: [2, 6] } } })}>
        <DataTable fields={{ name: {} }} rows={PEOPLE.slice(0, 1)} density="tight" />
      </Rui>
    );
    const { dom, dispose } = both(view, { width: 480, height: 300 });
    const cell = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === 'Ada').parentElement;
    assert.match(cell.getAttribute('style'), /padding: 2px 6px/, 'the theme\'s tight: 2 × 6');
    dispose();
  });

  it('shows the empty state, and a loader while loading', () => {
    const clock = manualClock();
    const view = () => (
      <Time value={clock}>
        <Rui>
          <DataTable fields={only('name')} rows={[]} />
          <DataTable fields={only('name')} rows={[]} empty="No people yet" />
          <DataTable fields={only('name')} rows={[]} loading />
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Name Nothing here yet Name No people yet Name');
    assert.equal(skia.text(), dom.text());
    // A ring loader: two stroked paths, its track (the arc's color at opacity.faint) and its arc.
    const ring = (/** @type {any} */ f) => f.length === 2 && f.every((/** @type {any} */ p) => p.kind === 'path' && p.stroke > 0) && String(f[0].color).toLowerCase() === alpha(String(f[1].color), BASE_THEME.opacity.faint).toLowerCase();
    const loaders = primitives(skia).filter(i => i.kind === 7 && Array.isArray(i.shapes) && ring(i.shapes));
    assert.equal(loaders.length, 1, 'one loader, on the loading table');
    dispose();
  });

  it('builds only the rows in view of 10,000 rows, and follows the scroll', () => {
    const records = Array.from({ length: 10000 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}`, value: i * 3 }));
    const clock = manualClock();
    const view = () => (
      <Time value={clock}>
        <Rui>
          <DataTable fields={{ name: {}, value: { width: 100 } }} rows={records} height={300} virtual rowHeight={30} overscan={2} />
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 360 });
    // The rows in view from the Scroll's and the header's onResize: the DOM's boxes are Skia's.
    skia.text();
    const firstOf = (/** @type {any} */ n) => {
      let c = n.first;
      while (c !== null && c.kind > 7) c = c.next;
      return c;
    };
    const skiaScroll = primitives(skia).find(i => i.kind === 2);
    const skiaHead = firstOf(firstOf(skiaScroll));
    const domScroll = dom.nodes('Scroll')[0];
    const domHead = domScroll.firstElementChild.firstElementChild;
    domScroll.getBoundingClientRect = () => skiaScroll.getBoundingClientRect();
    domHead.getBoundingClientRect = () => skiaHead.getBoundingClientRect();
    assert.ok(skiaHead.getBoundingClientRect().height > 0 && skiaHead.getBoundingClientRect().height < 100, 'the header');
    dom.report();
    const built = () => {
      const d = dom.nodes('Label').filter((/** @type {any} */ n) => /^Row /.test(n.textContent)).map((/** @type {any} */ n) => n.textContent);
      const s = primitives(skia).filter(i => i.kind === 3 && /^Row /.test(i.caption)).map(i => i.caption);
      assert.deepEqual(s, d, 'the same rows built on both');
      return d;
    };
    const rows = built();
    // The rows in view: the Scroll's 300 less the header's height, 30 a row, and the overscan after them.
    const inView = Math.ceil((skiaScroll.getBoundingClientRect().height - skiaHead.getBoundingClientRect().height) / 30);
    assert.equal(rows.length, inView + 2, `a window of rows: ${rows.length}`);
    assert.match(dom.text(), /^Name Value Row 1 0 Row 2 3/);
    // The header is sticky at the top of the Scroll: it stays as the rows scroll under it.
    const headerAt = () => {
      skia.text();
      return skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'Name')[3];
    };
    const top = headerAt();
    const name = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === 'Name');
    let cell = name;
    while (!/position: sticky/.test(cell.getAttribute('style') ?? '')) cell = cell.parentElement;
    assert.match(cell.getAttribute('style'), /top: 0px;.*z-index: 1/);
    assert.equal(cell.parentElement.parentElement.getAttribute('data-ren'), 'Scroll', 'inside the scrolling body');
    // Scroll 3000 px down: rows from 100 on.
    const scroll = dom.nodes('Scroll')[0];
    scroll.scrollTop = 3000;
    scroll.dispatchEvent(new dom.window.Event('scroll'));
    $flush(dom.root);
    const item = primitives(skia).find(i => i.kind === 2);
    item.scrollTop = 3000;
    $flush(skia.root);
    const moved = built();
    assert.equal(moved[0], 'Row 99', 'overscan before the first in view');
    assert.equal(moved.length, rows.length + 2, 'the window, with overscan on both sides now');
    assert.equal(headerAt(), top, 'the header stayed');
    dispose();
  });
});

describe('ContextMenu opens at the pointer inside its border', () => {
  it('its trigger sits where the pointer pressed, bordered or not (Skia); the point reported is the region\'s', () => {
    for (const border of [0, 30]) {
      const clock = manualClock();
      /** @type {any[]} */
      const opened = [];
      const view = () => (
        <Time value={clock}>
          <Rui>
            <ContextMenu style={{ width: 300, height: 200, border }} onOpenChange={(/** @type {boolean} */ v, /** @type {any} */ p) => v && opened.push(p)} menu={[<Menu.Item onPress={() => {}}>Copy</Menu.Item>]}>
              <Text>Right click here</Text>
            </ContextMenu>
          </Rui>
        </Time>
      );
      const { dom, skia, dispose } = both(view);
      skia.text();
      drag(dom, skia, [[120, 80]], { button: 2 });
      clock.advance(200);
      skia.text();
      const trigger = primitives(skia).find((/** @type {any} */ i) => {
        const r = i.getBoundingClientRect();
        return r.width === 1 && r.height === 1;
      });
      const t = trigger.getBoundingClientRect();
      assert.ok(Math.abs(t.left - 120) <= 1 && Math.abs(t.top - 80) <= 1, `border ${border}: the trigger at the pointer, not at ${t.left}, ${t.top}`);
      assert.deepEqual(opened.at(-1), { x: 120, y: 80 }, `border ${border}: the point in the region's box`);
      dispose();
    }
  });
});
