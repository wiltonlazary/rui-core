// Component sizes from the theme's `sizes`: an override of a step moves the
// component on the DOM and on Skia alike.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Rui, Clock, manualClock, themeOf, Stack, Text, Avatar, Checkbox, Loader, Modal, Badge, Tag, IconBox, ChevronIcon, Swatch, Ring, List } from 'rui-core';
import { both } from './harness.jsx';
import { items, KIND } from './scene.js';

/** The rounded widths and heights of the Skia items of `kinds`. @param {any} skia @param {number[]} kinds */
const sidesOn = (skia, kinds) =>
  kinds
    .flatMap(k => items(skia, k))
    .map(n => {
      const r = n.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    });

/** The inline widths and heights on the DOM, the portal layer's too. @param {any} dom */
const sidesIn = dom => /** @type {any[]} */ ([...dom.document.body.querySelectorAll('[data-ren]')]).map(n => `${n.style.width}x${n.style.height}`);

describe('Component sizes from the theme', () => {
  it('sizes.avatar, sizes.check, sizes.loader, sizes.badge, sizes.tag and sizes.iconBox size their components on both renderers', () => {
    const theme = themeOf({ sizes: { avatar: { md: 47 }, check: { md: 27 }, loader: { lg: 43 }, badge: { md: 25 }, tag: { xs: [19, 10] }, iconBox: { sm: 31 } } });
    const { dom, skia, dispose } = both(() => (
      <Rui theme={theme}>
        <Stack>
          <Avatar name="Ada Lovelace" />
          <Checkbox size="md" label="c" />
          <Loader size="lg" />
          <Badge>New</Badge>
          <Tag>tag</Tag>
          <IconBox size="sm" />
        </Stack>
      </Rui>
    ));
    try {
      const onDom = sidesIn(dom);
      for (const side of ['47pxx47px', '27pxx27px', '43pxx43px', '31pxx31px']) assert.ok(onDom.includes(side), `${side} on the DOM: ${onDom.join(' ')}`);
      assert.ok(onDom.some(s => s.endsWith('x25px')), 'the badge 25 high on the DOM');
      assert.ok(onDom.some(s => s.endsWith('x19px')), 'the tag 19 high on the DOM');
      const onSkia = sidesOn(skia, [KIND.View, KIND.Shape]);
      for (const side of ['47x47', '27x27', '43x43', '31x31']) assert.ok(onSkia.includes(side), `${side} on Skia: ${onSkia.join(' ')}`);
      assert.ok(onSkia.some(s => s.endsWith('x25')), 'the badge 25 high on Skia');
      assert.ok(onSkia.some(s => s.endsWith('x19')), 'the tag 19 high on Skia');
    } finally {
      dispose();
    }
  });

  it("sizes.modal sets a Modal's width on both renderers", () => {
    const clock = manualClock();
    const theme = themeOf({ sizes: { modal: { md: 517 } } });
    const { dom, skia, dispose } = both(
      () => (
        <Clock value={clock}>
          <Rui theme={theme}>
            <Modal open title="Plan" motion={{ duration: 0 }} portal={false}>
              <Text>Steps</Text>
            </Modal>
          </Rui>
        </Clock>
      ),
      { width: 800, height: 600 },
    );
    try {
      clock.advance(50);
      assert.ok(sidesIn(dom).some(s => s.startsWith('517px')), "the theme's width on the DOM");
      assert.ok(sidesOn(skia, [KIND.View]).some(s => s.startsWith('517x')), 'and on Skia');
    } finally {
      dispose();
    }
  });

  it('sizes.glyph and sizes.box size icons, marks and default boxes on both renderers', () => {
    const theme = themeOf({ sizes: { glyph: { md: 19, lg: 23 }, box: { swatch: 29, ring: 97 } } });
    const { dom, skia, dispose } = both(() => (
      <Rui theme={theme}>
        <Stack>
          <ChevronIcon />
          <Swatch color="teal" />
          <Ring segments={[{ value: 40 }]} />
          <List>
            <List.Item>one</List.Item>
          </List>
        </Stack>
      </Rui>
    ));
    try {
      const onDom = sidesIn(dom);
      for (const side of ['19pxx19px', '29pxx29px', '97pxx97px']) assert.ok(onDom.includes(side), `${side} on the DOM: ${onDom.join(' ')}`);
      assert.ok(onDom.some(s => s.startsWith('23pxx')), "the list marker's square, glyph.lg wide, on the DOM");
      const onSkia = sidesOn(skia, [KIND.View, KIND.Shape]);
      for (const side of ['19x19', '29x29', '97x97']) assert.ok(onSkia.includes(side), `${side} on Skia: ${onSkia.join(' ')}`);
      // The marker's dot: glyph.lg × ratios.mark, rounded (23 × 0.3 → 7).
      assert.ok(onSkia.includes('7x7'), `the marker dot on Skia: ${onSkia.join(' ')}`);
    } finally {
      dispose();
    }
  });
});
