// Data display on the DOM and on Skia (OverflowList has overflow-list.test.jsx): the same text, the same answers to
// presses, the same state, and the animated ones frame by frame on a
// manual clock.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active } from 'ren-core';
import {
  Rui, Clock, manualClock, Stack, Row, Text, BASE_COLORS, BASE_THEME, pageColors,
  Accordion, Avatar, Cover, Badge, Card, Swatch, DataList, Image, Key, NumberText,
  DigitRoll, Excerpt, IconBox, Timeline,
} from 'rui-core';
import { both, onSkia, onDom } from './harness.jsx';
import { items, KIND } from './scene.js';

/** Presses the primitive around a Label's text on the DOM (a click bubbling from the Label). @param {any} dom @param {string} text */
function click(dom, text) {
  const node = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === text) ?? dom.nodes('Action').find((/** @type {any} */ n) => n.textContent.trim() === text);
  if (node === undefined) throw new Error(`no "${text}" on the DOM in: ${dom.text()}`);
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  $flush(dom.root);
}

/**
 * Gives happy-dom boxes (it lays nothing out): as wide as the text (8 px a
 * character, or `width` for the Views of that `data-box`), 20 px a Label high.
 * @param {any} dom @param {number} [width] the width of Views with no text of their own
 */
function boxes(dom, width) {
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    const labels = this.getAttribute('data-ren') === 'Label' ? 1 : this.querySelectorAll('[data-ren="Label"]').length;
    const w = width !== undefined && this.style.overflow === 'hidden' ? width : this.textContent.length * 8;
    return { x: 0, y: 0, left: 0, top: 0, width: w, height: labels * 20, right: w, bottom: labels * 20 };
  };
}

describe('rui-core data display on the DOM and on Skia', () => {
  it('Badge, IconBox, Swatch, Key: the same text, variants and sizes', () => {
    /** @type {number[]} */
    const pressed = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Row>
          <Badge>new</Badge>
          <Badge variant="soft" color="teal" size="lg">soft</Badge>
          <Badge variant="dot" color="red">dot</Badge>
          <Badge variant="outline" round>7</Badge>
          <Badge start={<Text size="xs">+</Text>} end={<Text size="xs">!</Text>}>ends</Badge>
          <IconBox variant="soft" size="lg">i</IconBox>
          <Swatch color="purple" onPress={() => pressed.push(1)}><Text>S</Text></Swatch>
          <Key>Ctrl</Key>
        </Row>
      </Rui>
    ));
    // A badge's text shows in upper case (the style's textTransform) and stays as written.
    assert.equal(dom.text(), 'new soft dot 7 + ends ! i S Ctrl');
    assert.equal(skia.text(), 'NEW SOFT DOT 7 + ENDS ! i S Ctrl');
    const badge = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'new');
    assert.equal(badge.style.textTransform, 'uppercase');
    assert.equal(badge.style.height, '22px', 'md: 22 px');
    const lg = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'soft');
    assert.equal(lg.style.height, '26px', 'lg: 26 px');
    const circle = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === '7');
    assert.equal(circle.style.width, '22px', 'a round badge is as wide as high');
    click(dom, 'S');
    skia.press('S');
    assert.deepEqual(pressed, [1, 1]);
    dispose();
  });

  it('Badge and IconBox gradients, Key\'s bottom border', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Row>
          <Badge variant="gradient">grad</Badge>
          <IconBox variant="gradient" gradient={{ colors: ['magenta', 'amber', 'teal'], angle: 45 }}>i</IconBox>
          <Key>K</Key>
        </Row>
      </Rui>
    ));
    assert.equal(skia.text(), 'GRAD i K');
    const views = dom.nodes('View');
    const badge = views.find((/** @type {any} */ n) => n.textContent === 'grad');
    assert.match(badge.style.background, /linear-gradient\(120deg, #087c6a 0%, #4b5ec8 100%\)/, 'the default gradient');
    const icon = views.find((/** @type {any} */ n) => n.textContent === 'i');
    // Three colors spread evenly (0, 50, 100 %), each at the accent shade (6).
    assert.match(icon.style.background, /linear-gradient\(45deg, #aa377b 0%, #915e04 50%, #087c6a 100%\)/);
    const key = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === 'K');
    assert.equal(key.style.borderBottomWidth, '2px');
    assert.equal(key.style.borderTopWidth, '1px');
    const drawn = items(skia, KIND.View).filter(n => n.style.background?.angle !== undefined).map(n => n.style.background.angle);
    assert.deepEqual(drawn, [120, 45]);
    const drawnKey = items(skia, KIND.Label).find(n => n.text === 'K');
    assert.deepEqual([drawnKey.style.borderTop, drawnKey.style.borderBottom], [1, 2]);
    dispose();
  });

  it('Avatar: initials, a colored hash, a placeholder, a picture and a group', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Row>
          <Avatar name="Ada Lovelace" color="auto" />
          <Avatar>AB</Avatar>
          <Avatar />
          <Avatar source="avatar.png" label="photo" />
          <Avatar.Group>
            <Avatar name="Grace Hopper" />
            <Avatar name="Alan Turing" />
            <Avatar>+12</Avatar>
          </Avatar.Group>
        </Row>
      </Rui>
    ));
    assert.equal(dom.text(), 'AL AB GH AT +12');
    assert.equal(skia.text(), 'AL AB GH AT +12');
    assert.equal(dom.nodes('Shape').length, 1, 'the placeholder silhouette');
    assert.equal(dom.nodes('Image')[0].getAttribute('src'), 'avatar.png');
    assert.ok(skia.skia.commands().some((/** @type {any[]} */ c) => c[0] === 'image' && c[1] === 'avatar.png'));
    const at = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'AT');
    assert.equal(at.style.marginLeft, '-12px', 'group: overlapping by ratios.mark of the side (40 × 0.3)');
    assert.ok(/px/.test(at.style.boxShadow), 'group: set apart by a shadow');
    assert.ok(!at.style.borderTopWidth || at.style.borderTopWidth === '0px', 'group: no ring');
    const gh = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'GH');
    assert.ok(!gh.style.marginLeft || gh.style.marginLeft === '0px', 'the first lies over nothing');
    const ada = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'AL');
    assert.deepEqual([ada.style.fontSize, ada.style.fontWeight, ada.style.borderTopLeftRadius], ['17px', '600', '9999px'], 'initials: 40 × ratios.glyph, strong; a circle');
    dispose();
  });

  it('initials: the first and last words\' first letters; autoColor: FNV-1a over the hues', async () => {
    const { initials, autoColor } = await import('../src/core/data/media.jsx');
    assert.equal(initials('Mary Ann Evans'), 'ME', 'the first word and the last, not the second');
    assert.equal(initials('  plato  '), 'P', 'one word, one letter');
    assert.equal(initials('Mary Ann Evans'), 'ME', 'no limit: always the two ends');
    assert.equal(initials.length, 1, 'the name alone');
    assert.equal(initials(''), '');
    // FNV-1a 32-bit of 'a' is 0xe40c292c; 0xe40c292c % 8 = 4.
    assert.equal(autoColor('a', ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7']), 'h4');
    assert.deepEqual(['Ada Lovelace', 'Grace Hopper', 'Alan Turing', ''].map(n => autoColor(n)), ['teal', 'indigo', 'amber', 'orange']);
  });

  it('Card, Image and Cover: media across the top, rules across, pictures covering', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Card bordered w={300}>
          <Card.Media>
            <Image source="cover.png" h={80} />
          </Card.Media>
          <Text fontWeight="bold">Title</Text>
          <Card.Rule />
          <Text>middle</Text>
          <Card.Rule />
          <Text>body</Text>
          <Card.Media>
            <Text>band</Text>
          </Card.Media>
        </Card>
        <Image source="" fallback="fallback.png" w={40} h={40} />
        <Cover source="bg.png" radius="md" p="md">
          <Text>over</Text>
        </Cover>
      </Rui>
    ));
    assert.equal(dom.text(), 'band Title middle body over', 'every media at the top, in the order written');
    assert.equal(skia.text(), 'band Title middle body over');
    const images = skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'image' || c[0] === 'picture');
    assert.deepEqual(images.map((/** @type {any[]} */ c) => [c[0], c[6]]), [['picture', 2], ['picture', 2], ['picture', 2]], 'covered: Image and Cover');
    assert.deepEqual(images.map((/** @type {any[]} */ c) => c[1]), ['cover.png', 'fallback.png', 'bg.png']);
    const cover = images[0];
    assert.equal(cover[2], 1, 'the first media reaches the card edge (inside its border)');
    assert.equal(cover[4] - cover[2], 298, 'and its full width');
    const band = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'band');
    assert.ok(band[3] > cover[5] && band[3] < skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'Title')[3], 'the second media under the first, above the body, on Skia');
    assert.equal(cover[3], 1, 'and its top');
    // The frame: the media, then the padded body; the media has no margin or padding, the first the card's corner on its top corners.
    const card = dom.nodes('View').find((/** @type {any} */ n) => n.style.borderTopWidth === '1px' && n.textContent.startsWith('band'));
    const [first, second, content] = [...card.children];
    assert.equal(second.textContent, 'band');
    assert.deepEqual([first.style.marginLeft, first.style.paddingTop, first.style.borderTopLeftRadius, first.style.borderTopRightRadius, first.style.borderBottomLeftRadius || '0px'], ['', '', '10px', '10px', '0px'], 'the first media: the card\'s corner (md) on top');
    assert.equal(second.style.borderTopLeftRadius || '0px', '0px', 'the next media: square');
    assert.deepEqual([card.style.paddingTop || '0px', content.style.paddingTop, content.style.paddingLeft], ['0px', '16px', '16px'], 'the body holds the padding (md)');
    const rules = dom.nodes('View').filter((/** @type {any} */ n) => n.getAttribute('aria-hidden') === 'true' && n.style.borderTopWidth === '1px');
    assert.equal(rules.length, 2, 'two rules, decoration');
    assert.deepEqual([rules[0].style.marginTop, rules[0].style.marginLeft, rules[0].style.marginBottom, rules[0].style.height], ['16px', '-16px', '16px', '0px'], 'a rule: across the card, the card\'s padding above and below');
    const tops = skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'text' && (c[1] === 'Title' || c[1] === 'middle'));
    assert.ok(tops[1][3] - tops[0][3] > 32, 'on Skia too: the text sits apart from the rule between');
    const bg = images[2];
    const over = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'over');
    assert.ok(over[3] > bg[3] && over[3] < bg[5], 'the text over the picture');
    dispose();
  });

  it('Image: fit by objectFit, fallback once src fails to load', () => {
    /** @type {string[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Image source="missing.png" fallback="fallback.png" fit="contain" w={40} h={40} onError={() => heard.push('error')} />
        <Image source="plain.png" w={40} h={40} />
      </Rui>
    ));
    const pictures = dom.nodes('Image');
    assert.equal(pictures[0].style.objectFit, 'contain');
    assert.equal(pictures[1].style.objectFit, 'cover', 'the default fit');
    const drawn = items(skia, KIND.Image);
    assert.deepEqual(drawn.map(n => n.style.objectFit), [1, 2], 'contain and cover on Skia');
    assert.deepEqual(drawn.map(n => n.source), ['missing.png', 'plain.png']);
    pictures[0].dispatchEvent(new dom.window.Event('error'));
    $flush(dom.root);
    skia.skia.failed('missing.png');
    $flush(skia.root);
    assert.equal(dom.nodes('Image')[0].getAttribute('src'), 'fallback.png', 'the DOM shows the fallback');
    assert.deepEqual(items(skia, KIND.Image).map(n => n.source), ['fallback.png', 'plain.png'], 'Skia too');
    assert.deepEqual(heard, ['error', 'error']);
    dispose();
  });

  it('NumberText and DataList: formatted values in pairs', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <DataList divided>
          <DataList.Item>
            <DataList.Term>Price</DataList.Term>
            <DataList.Detail>
              <NumberText value={1234567.891} locale="en-US" prefix="€ " groupMark decimals={2} />
            </DataList.Detail>
          </DataList.Item>
          <DataList.Item>
            <DataList.Term>Share</DataList.Term>
            <DataList.Detail>
              <NumberText value={-0.5} suffix="%" decimals={2} fixedDecimals />
            </DataList.Detail>
          </DataList.Item>
        </DataList>
        <DataList orientation="vertical">
          <DataList.Item>
            <DataList.Term>Name</DataList.Term>
            <DataList.Detail>rui</DataList.Detail>
          </DataList.Item>
        </DataList>
      </Rui>
    ));
    const shown = 'Price € 1,234,567.89 Share -0.50% Name rui';
    assert.equal(dom.text(), shown);
    assert.equal(skia.text(), shown);
    const price = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'Price');
    const value = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === '€ 1,234,567.89');
    assert.equal(price[3], value[3], 'horizontal: side by side');
    const name = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'Name');
    const rui = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'rui');
    assert.ok(rui[3] > name[3], 'vertical: the value below');
    dispose();
  });

  it('DataList divided: rows a step apart, a hairline in the edge role between rows only, sides inset', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <DataList divided>
          <DataList.Item><DataList.Term>A</DataList.Term><DataList.Detail>1</DataList.Detail></DataList.Item>
          <DataList.Item><DataList.Term>B</DataList.Term><DataList.Detail>2</DataList.Detail></DataList.Item>
          <DataList.Item><DataList.Term>C</DataList.Term><DataList.Detail>3</DataList.Detail></DataList.Item>
        </DataList>
      </Rui>
    ));
    const list = dom.nodes('View').find((/** @type {any} */ n) => n.getAttribute('role') === 'list');
    const kids = [...list.children];
    const rows = kids.filter(n => n.getAttribute('role') === 'listitem');
    const lines = kids.filter(n => n.getAttribute('role') !== 'listitem');
    assert.equal(rows.length, 3);
    assert.equal(lines.length, 2, 'between rows only');
    assert.equal(kids[0].getAttribute('role'), 'listitem', 'none before the first');
    assert.equal(lines[0].style.height, `${BASE_THEME.sizes.divider.xs}px`, 'a hairline');
    assert.equal(lines[0].style.backgroundColor.toLowerCase(), pageColors(BASE_THEME, 'light').edge.toLowerCase(), 'the edge role');
    assert.equal(list.style.rowGap || list.style.gap, `${BASE_THEME.spacing.sm / 2}px`, 'half a step either side of the line');
    assert.equal(rows[0].style.paddingLeft, `${BASE_THEME.control.panelPad}px`, 'the sides inset');
    assert.equal(rows[0].style.paddingTop, '0px');
    dispose();
  });

  it('DigitRoll settles by rui\'s own curve', async () => {
    const { EASES } = await import('../src/core/misc/tween.js');
    assert.equal(EASES.settle(0), 0);
    assert.equal(EASES.settle(1), 1);
    assert.equal(EASES.settle(0.5), 1 - 0.5 ** 4, 'most of the way by half time');
  });

  it('Accordion: one item open at a time, animated, the same on both', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const values = [];
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Accordion defaultValue="a" variant="boxed" onChange={(/** @type {any} */ v) => values.push(v)}>
            <Accordion.Item value="a">
              <Accordion.Trigger>Nile</Accordion.Trigger>
              <Accordion.Panel>long</Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="b">
              <Accordion.Trigger>Amazon</Accordion.Trigger>
              <Accordion.Panel>wide</Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Nile long Amazon');
    assert.equal(skia.text(), 'Nile long Amazon');
    click(dom, 'Amazon');
    skia.press('Amazon');
    assert.deepEqual(values, ['b', 'b']);
    clock.advance(300);
    assert.equal(dom.text(), 'Nile Amazon wide');
    assert.equal(skia.text(), 'Nile Amazon wide');
    click(dom, 'Amazon');
    skia.press('Amazon');
    clock.advance(300);
    assert.deepEqual(values, ['b', 'b', null, null]);
    assert.equal(dom.text(), 'Nile Amazon');
    assert.equal(skia.text(), 'Nile Amazon');
    dispose();
  });

  it('Accordion multiple: several open, the chevron turning', () => {
    const clock = manualClock();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Accordion multiple chevronAt="start" variant="split">
            <Accordion.Item value="x">
              <Accordion.Trigger>X</Accordion.Trigger>
              <Accordion.Panel>x panel</Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="y">
              <Accordion.Trigger>Y</Accordion.Trigger>
              <Accordion.Panel>y panel</Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    const chevron = () => dom.nodes('Shape')[0].querySelector('path').getAttribute('d');
    const closed = chevron();
    assert.equal(dom.nodes('Shape')[0].style.rotate, '', 'closed: not turned');
    click(dom, 'X');
    skia.press('X');
    click(dom, 'Y');
    skia.press('Y');
    clock.advance(300);
    assert.equal(dom.text(), 'X x panel Y y panel');
    assert.equal(skia.text(), 'X x panel Y y panel');
    assert.equal(chevron(), closed, 'one drawing');
    assert.equal(dom.nodes('Shape')[0].style.rotate, '-90deg', 'the start-pointing chevron turned down by the style');
    assert.deepEqual(items(skia, KIND.Shape).slice(0, 2).map(n => n.style.rotate), [-90, -90], 'turned on Skia too');
    dispose();
  });

  it('Accordion chevron={{ turn: false }}: the chevron stays as it is', () => {
    const clock = manualClock();
    const { dom, dispose } = both(() => (
      <Clock value={clock}>
        <Rui>
          <Accordion defaultValue="x" chevron={{ turn: false }}>
            <Accordion.Item value="x">
              <Accordion.Trigger>X</Accordion.Trigger>
              <Accordion.Panel>x panel</Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Rui>
      </Clock>
    ));
    clock.advance(300);
    assert.equal(dom.text(), 'X x panel');
    assert.equal(dom.nodes('Shape')[0].style.rotate, '', 'open, not turned');
    dispose();
  });

  it('Accordion chevron={{ size }}; its variants\' looks; a disabled trigger', () => {
    const clock = manualClock();
    const list = (/** @type {string} */ variant, /** @type {Record<string, any>} */ more = {}) => (
      <Accordion variant={variant} defaultValue="a" {...more}>
        <Accordion.Item value="a">
          <Accordion.Trigger>{`${variant} a`}</Accordion.Trigger>
          <Accordion.Panel>open</Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="b">
          <Accordion.Trigger disabled>{`${variant} b`}</Accordion.Trigger>
          <Accordion.Panel>shut</Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
    const { dom, skia, dispose } = both(() => (
      <Clock value={clock}>
        <Rui>
          {list('plain', { chevron: { size: 24 } })}
          {list('boxed')}
          {list('soft')}
          {list('split')}
        </Rui>
      </Clock>
    ));
    const root = (/** @type {string} */ v) => dom.nodes('Action').find((/** @type {any} */ n) => n.textContent === `${v} a`).parentElement.parentElement;
    const rules = (/** @type {string} */ v) => [...root(v).querySelectorAll('[aria-hidden="true"]')].filter((/** @type {any} */ n) => n.style.height === '1px').length;
    assert.equal(dom.nodes('Shape')[0].style.width, '24px', 'chevron={{ size }}');
    assert.equal(items(skia, KIND.Shape)[0].style.width, 24, 'the same on Skia');
    assert.equal(dom.nodes('Shape')[2].style.width, '16px', 'the chevron at 16 by default');
    assert.deepEqual([rules('plain'), rules('boxed'), rules('soft'), rules('split')], [1, 1, 0, 0], 'a rule between items, none after the last');
    assert.equal(root('boxed').style.borderTopWidth, '1px', 'boxed: one bordered box');
    const [softA, softB] = [...root('soft').children];
    assert.equal(softA.style.backgroundColor, softB.style.backgroundColor, 'soft: every item on the sunken ground, open or not');
    assert.equal(root('soft').style.rowGap || root('soft').style.gap, '8px', 'soft: apart by xs');
    const [splitA, splitB] = [...root('split').children];
    assert.equal(root('split').style.rowGap || root('split').style.gap, '12px', 'split: apart by sm');
    assert.equal(splitB.style.borderTopWidth, '1px', 'split: every item a bordered card');
    assert.notEqual(splitA.style.borderTopColor, splitB.style.borderTopColor, 'its border firmer while open');
    const off = dom.nodes('Action').find((/** @type {any} */ n) => n.textContent === 'plain b');
    assert.equal(off.style.opacity, '0.45', 'disabled: the theme\'s disabled opacity');
    const trigger = dom.nodes('Action').find((/** @type {any} */ n) => n.textContent === 'plain a');
    assert.equal(trigger.style.fontWeight, '600', 'the trigger: a strong label');
    const panel = dom.document.querySelector('[role="region"]');
    assert.deepEqual([panel.style.paddingTop, panel.style.paddingLeft, panel.style.paddingRight, panel.style.paddingBottom], ['0px', '12px', '12px', '6px'], 'the panel: under its trigger\'s label, optionPad x in, panelPad below');
    dispose();
  });

  it('Accordion geometry: optionPad trigger, iconGap, a chevron pointing to the end that turns 90 degrees down', () => {
    const clock = manualClock();
    const t = BASE_THEME;
    const list = (/** @type {string} */ name, /** @type {Record<string, any>} */ more = {}) => (
      <Accordion {...more}>
        <Accordion.Item value="a">
          <Accordion.Trigger>{name}</Accordion.Trigger>
          <Accordion.Panel>{`${name} panel`}</Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
    const { dom, skia, dispose } = both(() => (
      <Clock value={clock}>
        <Rui>
          {list('End')}
          {list('Start', { chevronAt: 'start' })}
        </Rui>
      </Clock>
    ));
    const [y, x] = t.control.optionPad;
    const trigger = dom.nodes('Action').find((/** @type {any} */ n) => n.textContent === 'End');
    assert.deepEqual([trigger.style.paddingTop, trigger.style.paddingLeft, trigger.style.paddingBottom], [`${y}px`, `${x}px`, `${y}px`], 'the trigger: optionPad');
    const row = trigger.firstElementChild;
    assert.equal(row.style.columnGap || row.style.gap, `${t.control.iconGap}px`, 'label and chevron apart by iconGap');
    const onSkia = items(skia, KIND.Action)[0];
    assert.deepEqual([onSkia.style.paddingTop, onSkia.style.paddingLeft, onSkia.style.paddingBottom], [y, x, y], 'the same on Skia');
    const d = (/** @type {number} */ i) => dom.nodes('Shape')[i].querySelector('path').getAttribute('d');
    const g = t.sizes.glyph.md;
    assert.equal(dom.nodes('Shape')[0].style.width, `${g}px`, 'the chevron: sizes.glyph.md');
    // At rest: the end one's tip at the right middle, the start one's at the left middle.
    assert.match(d(0), new RegExp(`L\\s*${g * 0.65}[ ,]+${g * 0.5}`), 'points toward the end');
    assert.match(d(1), new RegExp(`L\\s*${g * 0.35}[ ,]+${g * 0.5}`), 'points toward the start');
    assert.deepEqual([dom.nodes('Shape')[0].style.rotate, dom.nodes('Shape')[1].style.rotate], ['', ''], 'closed: not turned');
    click(dom, 'End');
    skia.press('End');
    click(dom, 'Start');
    skia.press('Start');
    clock.advance(300);
    assert.deepEqual([dom.nodes('Shape')[0].style.rotate, dom.nodes('Shape')[1].style.rotate], ['90deg', '-90deg'], 'open: both turned 90 degrees to point down');
    assert.deepEqual(items(skia, KIND.Shape).slice(0, 2).map(n => n.style.rotate), [90, -90], 'the same turn on Skia');
    const panels = [...dom.document.querySelectorAll('[role="region"]')];
    assert.equal(panels[0].style.paddingLeft, `${x}px`, 'end chevron: the panel in by optionPad x');
    assert.equal(panels[1].style.paddingLeft, `${x + g + t.control.iconGap}px`, 'start chevron: the panel under the label, past the chevron');
    dispose();
  });

  it('DigitRoll: digits roll to the new value, then read it', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const values = [];
    const view = () => {
      const v = $signal($active(), 4096);
      values.push(v);
      return (
        <Clock value={clock}>
          <Rui>
            <DigitRoll value={v} locale="en-US" prefix="#" groupMark duration={300} />
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), '# 4 , 0 9 6');
    assert.equal(skia.text(), '# 4 , 0 9 6');
    for (const v of values) $write(v, 4128);
    $flush(dom.root);
    $flush(skia.root);
    clock.advance(160);
    const moving = dom.text();
    assert.notEqual(moving, '# 4 , 0 9 6', 'rolling');
    assert.equal(skia.text(), moving, 'the same frame on both');
    clock.advance(300);
    assert.equal(dom.text(), '# 4 , 1 2 8');
    assert.equal(skia.text(), '# 4 , 1 2 8');
    dispose();
  });

  it('DigitRoll keeps a column for each digit of either end, whatever their signs', () => {
    for (const [a, b, columns] of [[12, -5, 2], [-12, 5, 2], [5, -12, 2], [12, 5, 2], [-5, 7, 1]]) {
      const clock = manualClock();
      /** @type {any} */
      let v = null;
      const dom = onDom(() => {
        v = $signal($active(), a);
        return (
          <Clock value={clock}>
            <Rui>
              <DigitRoll value={() => $read(v)} duration={300} />
            </Rui>
          </Clock>
        );
      });
      $write(v, b);
      $flush(dom.root);
      clock.advance(16);
      $flush(dom.root);
      // A digit column: a hidden View holding the column of its digit and the next.
      const count = [...dom.document.querySelectorAll('[data-ren="View"][aria-hidden="true"]')].filter(n => n.firstElementChild?.getAttribute('data-ren') === 'View').length;
      assert.equal(count, columns, `${a} to ${b}: ${columns} digit columns while it rolls`);
      clock.advance(400);
      $flush(dom.root);
      assert.ok(dom.document.querySelector(`[aria-label="${b}"]`), `${a} to ${b}: it reads the new value`);
      dom.dispose();
    }
  });

  it('DigitRoll draws a minus only where its value is written with one', () => {
    const view = () => (
      <Rui>
        <DigitRoll value={-12} negative={false} />
        <DigitRoll value={-0.001} decimals={0} />
        <DigitRoll value={-7} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), '1 2 0 - 7', 'no sign with negative={false}, nor on a value that rounds to 0');
    assert.equal(skia.text(), dom.text());
    assert.deepEqual([...dom.document.querySelectorAll('[aria-label]')].map(n => n.getAttribute('aria-label')), ['12', '0', '-7'], 'drawn as named');
    dispose();
  });

  it('DigitRoll rolls the number alone: its prefix and suffix show as written', () => {
    const view = () => (
      <Rui>
        <DigitRoll value={5} suffix=" m2" />
        <DigitRoll value={12} prefix="$" suffix=" pre-tax" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), '5 m2 $ 1 2 pre-tax', 'no digit of the suffix rolls, no mark of it is dropped');
    assert.equal(skia.text(), dom.text());
    const labels = [...dom.document.querySelectorAll('[data-ren="Label"]')].map(n => n.textContent);
    assert.ok(labels.includes(' m2') && labels.includes(' pre-tax'), `each suffix one Label, its space kept: ${JSON.stringify(labels)}`);
    dispose();
  });

  it('Excerpt follows resizes', () => {
    const clock = manualClock();
    /** @type {any} */
    let lines = null;
    const view = () => {
      lines = $signal($active(), 1);
      return (
        <Clock value={clock}>
          <Rui>
            <Excerpt height={50} moreLabel="Read on" lessLabel="Fold">
              {() => Array.from({ length: $read(lines) }, (_, i) => <Text>{`line ${i}`}</Text>)}
            </Excerpt>
          </Rui>
        </Clock>
      );
    };
    const skia = onSkia(view, { width: 600 });
    // Measured by its onResize, with no frame of the clock.
    assert.ok(!skia.text().includes('Read on'), 'one line: nothing to reveal');
    $write(lines, 8);
    $flush(skia.root);
    skia.text();
    assert.match(skia.text(), /Read on$/, 'the grown content is cut, with its trigger');
    skia.dispose();
    const dom = onDom(view);
    boxes(dom);
    dom.report();
    assert.ok(!dom.text().includes('Read on'), 'the DOM: one line, nothing to reveal');
    $write(lines, 8);
    $flush(dom.root);
    // A frame of the clock measures nothing: the content's resize is what it follows.
    clock.advance(48);
    assert.ok(!dom.text().includes('Read on'), 'the DOM: not reported yet');
    dom.report();
    assert.match(dom.text(), /Read on$/, 'the DOM: the grown content is cut, with its trigger');
    dom.dispose();
  });

  it('Excerpt: cut at height, a trigger to show it all and hide it again', () => {
    const clock = manualClock();
    /** @type {boolean[]} */
    const changes = [];
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Excerpt height={50} moreLabel="Read on" lessLabel="Fold" onOpenChange={(/** @type {boolean} */ v) => changes.push(v)}>
            {Array.from({ length: 8 }, (_, i) => (
              <Text>{`line ${i}`}</Text>
            ))}
          </Excerpt>
          <Excerpt height={500} moreLabel="never" lessLabel="never">
            <Text>short</Text>
          </Excerpt>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    boxes(dom);
    dom.report();
    assert.match(dom.text(), /Read on short$/);
    assert.match(skia.text(), /^line 0 line 1 .*Read on short$/);
    assert.ok(!skia.text().includes('line 7'), 'Skia: the cut lines are not painted');
    dom.press('Read on');
    skia.press('Read on');
    assert.deepEqual(changes, [true, true]);
    clock.advance(300);
    assert.equal(dom.text(), 'line 0 line 1 line 2 line 3 line 4 line 5 line 6 line 7 Fold short');
    assert.equal(skia.text(), 'line 0 line 1 line 2 line 3 line 4 line 5 line 6 line 7 Fold short');
    dom.press('Fold');
    skia.press('Fold');
    clock.advance(300);
    assert.match(skia.text(), /Read on short$/);
    assert.match(dom.text(), /Read on short$/);
    dispose();
  });

  it('Timeline: markers and lines highlighted up to value', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Timeline value={1} markerSize={18} lineWidth={3}>
          <Timeline.Item title="Packed" marker="1">
            <Text size="sm">first</Text>
          </Timeline.Item>
          <Timeline.Item title="Shipped" line="dashed">second</Timeline.Item>
          <Timeline.Item title="Delivered">third</Timeline.Item>
        </Timeline>
      </Rui>
    ), { height: 400 });
    const shown = '1 Packed first Shipped second Delivered third';
    assert.equal(dom.text(), shown);
    assert.equal(skia.text(), shown);
    const markers = dom.nodes('View').filter((/** @type {any} */ n) => n.style.width === '18px' && n.style.height === '18px');
    assert.equal(markers.length, 3);
    const blue = markers[0].style.background || markers[0].style.backgroundColor;
    assert.equal(markers[1].style.background || markers[1].style.backgroundColor, blue, 'the second is active');
    assert.notEqual(markers[2].style.background || markers[2].style.backgroundColor, blue, 'the third is not');
    const lines = dom.nodes('View').filter((/** @type {any} */ n) => n.style.borderLeftWidth === '3px' && n.style.width === '0px');
    assert.equal(lines.length, 2, 'no line after the last');
    assert.equal(lines[0].style.borderLeftColor, blue, 'the line to the active item is colored');
    assert.deepEqual(lines.map((/** @type {any} */ n) => n.style.borderLeftStyle), ['solid', 'dashed'], 'line: a dashed border');
    const drawn = items(skia, KIND.View).filter(n => n.style.borderLeft === 3 && n.style.width === 0);
    assert.deepEqual(drawn.map(n => n.style.borderStyle), [0, 1], 'dashed on Skia too');
    const title = items(skia, KIND.Label).find(n => n.text === 'Packed');
    assert.equal(title.style.fontWeight, 600, 'titles strong');
    dispose();
  });

  it('Timeline from="end": progress runs from the last item up to value', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Timeline value={1} from="end">
          <Timeline.Item title="Start">a</Timeline.Item>
          <Timeline.Item title="Middle">b</Timeline.Item>
          <Timeline.Item title="Finish">c</Timeline.Item>
        </Timeline>
        <Timeline>
          <Timeline.Item title="None">d</Timeline.Item>
          <Timeline.Item title="Yet">e</Timeline.Item>
        </Timeline>
        <Timeline defaultValue={0}>
          <Timeline.Item title="Own">f</Timeline.Item>
          <Timeline.Item title="Later">g</Timeline.Item>
        </Timeline>
      </Rui>
    ));
    const markers = dom.nodes('View').filter((/** @type {any} */ n) => n.style.width === '16px' && n.style.height === '16px');
    const ground = (/** @type {any} */ n) => n.style.background || n.style.backgroundColor;
    const on = ground(markers[2]);
    assert.deepEqual(markers.slice(0, 3).map(n => ground(n) === on), [false, true, true], 'value names the same item either way; the last two reached');
    assert.equal(markers[0].style.borderTopLeftRadius, '9999px', 'round markers');
    assert.ok(markers.slice(3, 5).every(n => ground(n) !== on), 'no value: none reached');
    assert.deepEqual(markers.slice(5, 7).map(n => ground(n) === on), [true, false], 'defaultValue: its own, up to the first');
    const lines = dom.nodes('View').filter((/** @type {any} */ n) => n.style.borderLeftWidth === '2px' && n.style.width === '0px');
    assert.deepEqual(lines.slice(0, 2).map(n => n.style.borderLeftColor === on), [false, true], 'a line reached once both its ends are');
    const drawn = items(skia, KIND.View).filter(n => n.style.borderLeft === 2 && n.style.width === 0);
    assert.notEqual(drawn[0].style.borderLeftColor, drawn[1].style.borderLeftColor, 'the same on Skia');
    dispose();
  });

  it('lays an Accordion.Trigger out in one row inside its button, on the DOM too', async () => {
    const { Accordion } = await import('rui-core');
    const { dom, dispose } = both(() => (
      <Rui>
        <Accordion>
          <Accordion.Item value="a">
            <Accordion.Trigger>Label</Accordion.Trigger>
            <Accordion.Panel>Body</Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Rui>
    ));
    const control = dom.nodes('Action')[0];
    const row = control.firstElementChild;
    assert.equal(row.getAttribute('data-ren'), 'View', 'a View holds the chevron and label');
    assert.equal(row.style.flexDirection, 'row');
    dispose();
  });
});


describe('rui-core data display: rui\'s own defaults', () => {
  it('Excerpt: More and Less by default, cut at 120', () => {
    const clock = manualClock();
    const { dom, dispose } = both(() => (
      <Clock value={clock}>
        <Rui>
          <Excerpt>
            {Array.from({ length: 10 }, (_, i) => (
              <Text>{`note ${i}`}</Text>
            ))}
          </Excerpt>
        </Rui>
      </Clock>
    ));
    boxes(dom);
    dom.report();
    assert.match(dom.text(), /More$/);
    dom.press('More');
    clock.advance(300);
    assert.match(dom.text(), /note 9 Less$/);
    dispose();
  });

  it('Timeline: every item\'s marker from the timeline, 16 px with a 2 px line by default', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Timeline marker="•" value={0}>
          <Timeline.Item title="Ordered">in the cart</Timeline.Item>
          <Timeline.Item title="Paid" marker="$">by card</Timeline.Item>
        </Timeline>
      </Rui>
    ));
    assert.equal(dom.text(), '• Ordered in the cart $ Paid by card');
    assert.equal(dom.nodes('View').filter((/** @type {any} */ n) => n.style.width === '16px' && n.style.height === '16px').length, 2);
    assert.equal(dom.nodes('View').filter((/** @type {any} */ n) => n.style.borderLeftWidth === '2px' && n.style.width === '0px').length, 1);
    dispose();
  });

  it('Avatar: the accent by default, color="auto" picks a hue from the name', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Avatar name="Mira Okafor" />
        <Avatar name="Mira Okafor" color="auto" />
        <Avatar name="Mira Okafor" color="auto" colors={['teal']} />
      </Rui>
    ));
    const bg = (/** @type {any} */ n) => n.style.background || n.style.backgroundColor;
    const [accent, auto, teal] = dom.nodes('View').filter((/** @type {any} */ n) => n.getAttribute('role') === 'img');
    assert.equal(bg(accent), '#677ee724', 'indigo.5 at .14: soft');
    assert.notEqual(bg(auto), bg(accent));
    assert.equal(bg(teal), '#079e8824');
    dispose();
  });

  it('Badge: a tag at radius sm, 18 to 30 high; Swatch: 24, radius sm, a rule edge', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Badge size="xs">low</Badge>
        <Badge size="xl">high</Badge>
        <Badge round>9</Badge>
        <Badge variant="dot" size="xl">spot</Badge>
        <Swatch color="amber" />
      </Rui>
    ));
    const views = dom.nodes('View');
    const of = (/** @type {string} */ t) => views.find((/** @type {any} */ n) => n.textContent === t);
    assert.deepEqual([of('low').style.height, of('high').style.height], ['18px', '30px']);
    assert.equal(of('low').style.borderTopLeftRadius, '6px', 'radius sm');
    assert.equal(of('9').style.borderTopLeftRadius, '9999px', 'round: the theme\'s round radius');
    // The rest from the theme: text two type steps down, inset by ratios.inset, a bold weight.
    assert.deepEqual([of('low').style.fontSize, of('high').style.fontSize, of('high').style.fontWeight], ['12px', '15px', '700']);
    assert.deepEqual([of('low').style.paddingLeft, of('high').style.paddingLeft], ['5px', '9px'], 'the height times ratios.inset');
    const spot = of('spot').firstElementChild;
    assert.deepEqual([spot.style.width, spot.style.borderTopLeftRadius], ['9px', '9999px'], 'the dot: 30 × ratios.mark, round');
    const swatch = views.find((/** @type {any} */ n) => n.style.width === '24px');
    assert.deepEqual([swatch.style.borderTopLeftRadius, swatch.style.borderTopColor], ['6px', '#d1d6de'], 'radius sm, the page\'s rule (gray.2)');
    assert.equal(swatch.style.boxShadow, '', 'no shadow unless shadowed');
    dispose();
  });

  it('Card.Media sits across the card\'s top; DataList.Term and DataList.Detail pair up', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Card bordered w={240}>
          <Card.Media>
            <Text>ticket</Text>
          </Card.Media>
          <DataList>
            <DataList.Item>
              <DataList.Term>Gate</DataList.Term>
              <DataList.Detail>B12</DataList.Detail>
            </DataList.Item>
          </DataList>
        </Card>
      </Rui>
    ));
    assert.equal(skia.text(), 'ticket Gate B12');
    assert.deepEqual(['term', 'definition'].map(r => dom.document.querySelector(`[role="${r}"]`)?.textContent), ['Gate', 'B12']);
    dispose();
  });
});

describe('rui-core data display: Swatch, NumberText and Key', () => {
  it('Swatch with onPress is a button: focusable, pressed by pointer and by keys', () => {
    /** @type {string[]} */
    const pressed = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Swatch color="teal" label="Teal" onPress={() => pressed.push('teal')} />
        <Swatch color="amber" />
      </Rui>
    ));
    const [button] = dom.nodes('Action');
    assert.equal(dom.nodes('Action').length, 1, 'only the pressable one is a button');
    assert.equal(button.getAttribute('aria-label'), 'Teal');
    button.focus();
    assert.equal(dom.document.activeElement, button, 'focusable');
    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    skia.skia.key('Tab');
    $flush(skia.root);
    skia.skia.key('Enter');
    $flush(skia.root);
    assert.deepEqual(pressed, ['teal', 'teal'], 'a click on the DOM, Tab then Enter on Skia');
    dispose();
  });

  it('NumberText takes the locale\'s marks unless given', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <NumberText value={9876.5} locale="de-DE" groupMark decimals={1} />
        <NumberText value={9876.5} locale="de-DE" groupMark=" " decimalMark="." decimals={1} />
        <NumberText value={9876.5} locale="en-US" decimals={1} />
      </Rui>
    ));
    assert.equal(dom.text(), '9.876,5 9 876.5 9876.5');
    dispose();
  });

  it('NumberText and DigitRoll hold decimals to 0..100 instead of throwing', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <NumberText value={12.345} locale="en-US" decimals={-1} />
        <NumberText value={1.5} locale="en-US" decimals={101} fixedDecimals />
        <DigitRoll value={12.345} locale="en-US" decimals={-1} />
      </Rui>
    ));
    const want = `12 1.5${'0'.repeat(99)} 1 2`;
    assert.equal(dom.text(), want);
    assert.equal(skia.text().replace(/\s+/g, ' ').trim(), want);
    dispose();
  });

  it('Key: a sunken key with a rule border and a 2 px edge lip', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Key>Esc</Key>
      </Rui>
    ));
    const key = dom.nodes('Label')[0];
    assert.deepEqual([key.style.borderBottomWidth, key.style.borderTopWidth, key.style.fontWeight, key.style.fontSize], ['2px', '1px', '600', '12px']);
    assert.equal(key.style.borderBottomColor, BASE_COLORS.gray[4], 'the edge role');
    dispose();
  });
});

describe('rui-core data display: Excerpt\'s handle', () => {
  it('Excerpt: getHandle opens, closes and toggles it', () => {
    const clock = manualClock();
    /** @type {any} */
    let handle = null;
    /** @type {boolean[]} */
    const heard = [];
    const { dom, dispose } = both(() => (
      <Clock value={clock}>
        <Rui>
          <Excerpt height={20} getHandle={(/** @type {any} */ h) => (handle = h)} onOpenChange={(/** @type {boolean} */ v) => heard.push(v)}>
            {Array.from({ length: 6 }, (_, i) => (
              <Text>{`row ${i}`}</Text>
            ))}
          </Excerpt>
        </Rui>
      </Clock>
    ));
    handle.open();
    handle.open();
    handle.toggle();
    handle.close();
    assert.deepEqual(heard, [true, false], 'a change only: open, then the toggle closes, close does nothing');
    dom.text();
    dispose();
  });
});

describe('Excerpt follows a new height while closed', () => {
  it('a lower height cuts the closed excerpt there (Skia)', () => {
    const clock = manualClock();
    /** @type {any} */
    let h = null;
    const view = () => {
      h = $signal($active(), 120);
      return (
        <Clock value={clock}>
          <Rui>
            <Excerpt height={() => $read(h)}>
              {Array.from({ length: 12 }, (_, i) => (
                <Text>{`line ${i}`}</Text>
              ))}
            </Excerpt>
          </Rui>
        </Clock>
      );
    };
    const skia = onSkia(view, { width: 600 });
    clock.advance(48);
    const clipOf = () => {
      $flush(skia.root);
      skia.text();
      return Math.round(items(skia, KIND.Label).find((/** @type {any} */ i) => i.caption === 'line 0').parent.parent.getBoundingClientRect().height);
    };
    assert.equal(clipOf(), 120, 'cut at 120');
    $write(h, 40);
    $flush(skia.root);
    clock.advance(48);
    assert.equal(clipOf(), 40, 'cut at the new 40');
    skia.dispose();
  });
});
