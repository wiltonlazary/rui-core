// The pointer's cursor over what presses: the theme's `cursor` (a hand by
// default; an app sets another or turns it off), on the DOM and on Skia.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { View } from 'ren-core';
import * as ui from 'rui-core';
import { disposeAfter } from './harness.jsx';
import { pair, css } from './overlay-harness.jsx';

const { Rui, Box, Button, Select, BASE_THEME, themeOf } = ui;

/** A page with a pressed Box, a plain one, a pressed and a searchable Select, and a disabled Button, under `theme`. @param {any} theme */
const page = theme => () => (
  <Rui theme={theme}>
    <View style={{ padding: 20, gap: 12 }}>
      <Box onPress={() => {}}>Go</Box>
      <Box>Still</Box>
      <Select placeholder="Pick" data={['Alpha', 'Beta']} />
      <Select searchable placeholder="Find" data={['Alpha', 'Beta']} />
      <Button disabled>Off</Button>
    </View>
  </Rui>
);

/** The page on both renderers, and the cursor Skia shows with the pointer at an item's middle (or `dx` from its end). @param {any} t @param {any} theme */
function open(t, theme) {
  const p = pair(page(theme));
  disposeAfter(t, () => p.dispose());
  /** @param {any} item @param {number} [dx] */
  const over = (item, dx) => {
    const b = p.s.box(item);
    p.s.move(dx === undefined ? b.x + b.width / 2 : b.x + b.width - dx, b.y + b.height / 2);
    return p.skia.skia.cursor;
  };
  const combos = [...p.dom.document.querySelectorAll('[role="combobox"]')];
  const sCombos = p.s.items().filter(i => i.other?.get?.('role') === 'combobox');
  return { p, over, combos, sCombos };
}

describe("the theme's cursor over what presses", () => {
  it('a hand over a Box pressed, a pressed field and its chevron; none over a plain Box; text in a searchable field (DOM and Skia)', t => {
    const { p, over, combos, sCombos } = open(t, undefined);
    const hand = BASE_THEME.cursor.press;
    assert.equal(hand, 'pointer', 'a hand by default');
    // DOM: the styles written
    assert.equal(css(p.d.find('Go').closest('[data-ren="View"]')).cursor, hand, 'a Box with onPress');
    assert.equal(css(p.d.find('Still').closest('[data-ren="View"]')).cursor, undefined, 'a Box without one');
    const [pick, find] = combos.map(c => c.parentElement.parentElement);
    assert.equal(css(pick).cursor, hand, 'a pressed field, all of it');
    assert.equal(css(combos[0]).cursor, hand, 'its press target');
    assert.equal(css(find).cursor, undefined, 'a searchable field: its Edit shows the text cursor');
    assert.equal(css(find.lastElementChild).cursor, hand, "a searchable field's chevron");
    assert.equal(css(p.d.find('Off')).cursor, BASE_THEME.cursor.disabled, 'a disabled Button');
    // Skia: the cursor shown under the pointer
    assert.equal(over(p.s.find('Go')), hand);
    assert.equal(over(p.s.find('Still')), 'default');
    assert.equal(over(sCombos[0].parent.parent, 8), hand, "the pressed field's chevron");
    assert.equal(over(sCombos[1]), 'text', 'inside the searchable Edit');
    assert.equal(over(sCombos[1].parent.parent, 8), hand, "the searchable field's chevron");
  });

  it('an app sets its own press cursor, or none (null: the plain pointer) (DOM and Skia)', t => {
    const grab = open(t, themeOf({ cursor: { press: 'grab' } }));
    assert.equal(css(grab.p.d.find('Go').closest('[data-ren="View"]')).cursor, 'grab');
    assert.equal(grab.over(grab.p.s.find('Go')), 'grab');
    assert.equal(css(grab.p.d.find('Off')).cursor, BASE_THEME.cursor.disabled, 'the disabled cursor stays its own');
    const none = open(t, themeOf({ cursor: { press: null, disabled: null } }));
    assert.equal(css(none.p.d.find('Go').closest('[data-ren="View"]')).cursor, undefined);
    assert.equal(css(none.p.d.find('Off')).cursor, undefined);
    assert.equal(none.over(none.p.s.find('Go')), 'default');
    assert.equal(none.over(none.sCombos[0].parent.parent, 8), 'default');
  });
});
