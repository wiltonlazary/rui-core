// The keyboard focus ring follows each control's own shape: a field's
// entry and its press targets hand their ring to the field's box, a
// check's pressable row to its box, circle or track, so the ring is drawn
// along those corners, never as a square around a bare row. Skia draws it;
// the DOM's sheet reads the same hand-off from `data-ren-ring`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { View } from 'ren-core';
import { Rui, Checkbox, Switch, Radio, TextInput, PasswordInput, NumberInput, Select } from 'rui-core';
import { onSkia, onDom } from './harness.jsx';

const page = () => (
  <Rui>
    <View style={{ padding: 16, gap: 12, width: 360 }}>
      <Checkbox label="Remember me" />
      <Switch label="Notifications" />
      <Radio value="a" label="Express" />
      <TextInput label="Name" placeholder="Your name" />
      <Select label="City" data={['Lisbon', 'Porto']} placeholder="Pick" />
      <PasswordInput label="Password" revealable={false} />
      <NumberInput label="Seats" />
    </View>
  </Rui>
);

/** The 2 wide rings Skia draws, each with the item it is drawn around. @param {any} skia */
function rings(skia) {
  skia.present();
  /** @type {any[]} */
  const all = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      all.push(c);
      walk(c);
    }
  };
  walk(skia.root);
  walk(skia.overlay);
  const boxOf = (/** @type {any} */ i) => {
    const r = i.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom];
  };
  const near = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) <= 1;
  return skia
    .commands()
    .filter((/** @type {any[]} */ c) => c[0] === 'border' && c[7] === 2)
    .map((/** @type {any[]} */ c) => {
      // Items of the same box (a wrapper around a field): the one marked inner or outer, if any.
      const at = all.filter(i => {
        const b = boxOf(i);
        return near(b[0] - 2, c[1]) && near(b[1] - 2, c[2]) && near(b[2] + 2, c[3]) && near(b[3] + 2, c[4]);
      });
      return { radius: c[6], around: at.find(i => i.r.ring === 2 || i.r.ring === 3) ?? at[0] ?? null };
    });
}

describe('the focus ring follows the control', () => {
  it('on Skia: each Tab stop rings the box, circle, track or field it belongs to, along its corners', t => {
    const s = onSkia(page, { width: 400, height: 600 });
    t.after(() => s.dispose());
    s.text();
    /** @type {string[]} */
    const seen = [];
    for (let i = 0; i < 7; i++) {
      s.skia.key('Tab');
      const focus = s.skia.focused;
      const drawn = rings(s.skia);
      const name = String(focus?.label || focus?.other?.get('aria-label') || '');
      assert.equal(drawn.length, 1, `${name}: one ring`);
      const [ring] = drawn;
      assert.ok(ring.around !== null && ring.around !== focus, `${name}: drawn around the shape it hands its ring to, not itself`);
      assert.ok(ring.around.r.ring === 2 || ring.around.r.ring === 3, `${name}: around an item marked inner or outer`);
      assert.ok(ring.radius > 2, `${name}: along rounded corners (${ring.radius})`);
      seen.push(`${name}:${ring.around.r.ring === 3 ? 'outer' : 'inner'}`);
    }
    assert.deepEqual(seen, ['Remember me:outer', 'Notifications:outer', 'Express:outer', 'Your name:inner', 'City:inner', 'Password:inner', 'Seats:inner']);
  });

  it('on the DOM: the same hand-off as data-ren-ring, which the sheet reads', t => {
    const d = onDom(page);
    t.after(() => d.dispose());
    d.text();
    const marks = [...d.host.querySelectorAll('[data-ren-ring]')].map(n => `${n.getAttribute('data-ren')}:${n.getAttribute('data-ren-ring')}`);
    // Each check's row hands its ring to its shape; each field's entry or press target to its box.
    assert.deepEqual(marks.filter(m => m.endsWith(':outer')), ['View:outer', 'View:outer', 'View:outer']);
    assert.equal(marks.filter(m => m.endsWith(':inner')).length, 4);
    assert.ok(marks.filter(m => m.endsWith(':false')).length >= 7, marks.join(' '));
  });
});
