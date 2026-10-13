// The theme, and the first components on the DOM and on Skia: the same text,
// the same presses, and a new theme or scheme restyling in place.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active } from 'ren-core';
import {
  BASE_THEME, themeOf, colorOf, variantColors, styleProps, alpha, shade, isLight, channels,
  Rui, Clock, manualClock, $motion, Pressable, Surface, Stack, Row, Heading, Text, Button, Tiles, Spacer, Center, Container, Flex, Box,
} from 'rui-core';
import { both } from './harness.jsx';

describe('rui-core theme', () => {
  it('resolves colors: names at the accent shade, name.shade, hex through', () => {
    assert.equal(colorOf(BASE_THEME, 'light', 'blue'), '#006bc1');
    assert.equal(colorOf(BASE_THEME, 'dark', 'blue'), '#006bc1', 'one accent shade, 6, in both schemes');
    assert.equal(colorOf(BASE_THEME, 'light', 'red.3'), '#ffa098');
    assert.equal(colorOf(BASE_THEME, 'light', '#123456'), '#123456');
    assert.equal(colorOf(BASE_THEME, 'light', undefined), '#4b5ec8', 'the accent: indigo');
    assert.deepEqual(Object.keys(BASE_THEME.colors), ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'purple', 'magenta', 'gray', 'night'], 'the wheel, then the neutrals');
    assert.deepEqual([BASE_THEME.accent, { ...BASE_THEME.accentShade }, BASE_THEME.corner, BASE_THEME.contrastThreshold], ['indigo', { light: 6, dark: 6 }, 'md', 0.179]);
    assert.equal(Object.getPrototypeOf(BASE_THEME.accentShade), null, 'a table without a prototype: own keys only');
    assert.deepEqual({ ...BASE_THEME.gradient }, { colors: ['teal', 'indigo'], angle: 120 });
    assert.equal(BASE_THEME.headings.weight, 700);
    assert.deepEqual(BASE_THEME.headings.levels.map(l => l.size), [36, 29, 23, 19, 17, 15]);
  });

  it('computes color arithmetic on hex', () => {
    assert.equal(alpha('#4b5ec8', 0.1), '#4b5ec81a');
    assert.equal(shade('#ffffff', 0.5), '#808080');
    assert.equal(shade('#000000', -1), '#ffffff');
    assert.equal(isLight('#f3eac8'), true);
    assert.equal(isLight('#006bc1'), false, 'blue.6 takes white text (luminance 0.144 < 0.179)');
    assert.equal(isLight('#c0a10b'), true, 'yellow.4 takes black (0.367)');
    assert.equal(isLight('#006bc1', 0.1), true, 'a lower threshold');
  });

  it('reads channels from hex only: null for anything else', () => {
    const table = /** @type {const} */ ([
      ['#f00', [255, 0, 0, 1]],
      ['#f008', [255, 0, 0, 0x88 / 255]],
      ['#00ff00', [0, 255, 0, 1]],
      ['#00FF0080', [0, 255, 0, 0x80 / 255]],
      ['#ff00zz', null],
      ['#0f0x', null],
      ['#fff ', null],
      ['# fff', null],
      ['#-12345', null],
      ['#+12345', null],
      ['#0x1234', null],
      ['#ff', null],
      ['fff', null],
      ['', null],
    ]);
    for (const [hex, want] of table) assert.deepEqual(channels(hex), want, JSON.stringify(hex));
  });

  it('gives each variant its colors', () => {
    const solid = variantColors(BASE_THEME, 'light', 'solid', 'blue');
    assert.deepEqual(solid, { background: '#006bc1', hover: '#00579f', color: '#ffffff', hoverColor: '#ffffff', border: 'transparent' });
    assert.equal(variantColors(BASE_THEME, 'dark', 'solid', 'blue').hover, '#2f8ae4', 'dark: the hover lightens (shade 5)');
    assert.deepEqual(variantColors(BASE_THEME, 'light', undefined, 'blue'), solid, 'solid by default');
    assert.equal(variantColors(BASE_THEME, 'light', 'solid', 'yellow.4').color, '#ffffff', 'white text');
    assert.equal(variantColors(themeOf({ contrast: true }), 'light', 'solid', 'yellow.4').color, '#000000', 'contrast: dark text on a fill past .179');
    const soft = variantColors(BASE_THEME, 'light', 'soft', 'teal');
    assert.deepEqual([soft.background, soft.hover, soft.color], ['#079e8824', '#079e8838', '#025044'], 'shade 5 at .14 and .22, the deep text (8)');
    assert.equal(variantColors(BASE_THEME, 'dark', 'soft', 'teal').color, '#55d7be', 'dark: deep is shade 3');
    const outline = variantColors(BASE_THEME, 'light', 'outline', 'purple');
    assert.deepEqual([outline.border, outline.color, outline.hover], ['#9044a7', '#9044a7', '#9044a714']);
    assert.equal(variantColors(BASE_THEME, 'light', 'ghost', 'purple').background, 'transparent');
    assert.equal(variantColors(BASE_THEME, 'light', 'ghost', 'purple').color, '#78348b', 'shade 7');
    const plain = variantColors(BASE_THEME, 'light', 'plain', 'purple');
    assert.deepEqual([plain.hover, plain.color, plain.hoverColor], ['transparent', '#78348b', '#5f266f'], 'plain: the text deepens under the pointer');
    const inverse = variantColors(BASE_THEME, 'light', 'inverse', 'purple');
    assert.deepEqual([inverse.background, inverse.hover, inverse.color], [BASE_THEME.white, BASE_THEME.colors.gray[1], '#78348b']);
    assert.equal(variantColors(BASE_THEME, 'dark', 'neutral').background, BASE_THEME.colors.night[6]);
  });

  it('merges a theme deeply and refuses a broken one', () => {
    const t = themeOf({ accent: 'purple', spacing: { md: 20 } });
    assert.equal(t.accent, 'purple');
    assert.equal(t.spacing.md, 20);
    assert.equal(t.spacing.xs, 8, 'the rest stays');
    assert.throws(() => themeOf({ accent: 'nope' }), /RUI: accent/);
    assert.equal(themeOf({ corner: 'lg' }).corner, 'lg');
    assert.deepEqual({ ...themeOf({ extra: { brand: 1 } }).extra }, { brand: 1 });
    const extra = themeOf({ extra: { brand: 1, deep: { mark: 'x' } } }).extra;
    assert.equal(Object.getPrototypeOf(extra), Object.prototype, "extra is the application's own data: its prototype kept");
    assert.equal(Object.getPrototypeOf(extra.deep), Object.prototype, 'and inside it');
    assert.equal(extra.hasOwnProperty('brand'), true);
    assert.equal(Object.getPrototypeOf(BASE_THEME.extra), Object.prototype, "BASE_THEME's extra too");
    assert.equal(Object.getPrototypeOf(themeOf({ spacing: { xxl: 48 } }).spacing), null, 'while the theme tables have none');
    assert.throws(() => themeOf({ colors: { brand: ['#000'] } }), /10 shades/);
  });

  it('turns style props into the portable style', () => {
    const s = styleProps(BASE_THEME, 'light', { p: 'md', mx: 4, w: 120, bg: 'red.1', fg: 'quiet', fontSize: 'lg', textTransform: 'uppercase', minWidth: 40, fontWeight: 600 });
    assert.deepEqual(s.padding, [16, 16, 16, 16]);
    assert.deepEqual(s.margin, [0, 4, 0, 4]);
    assert.equal(s.width, 120);
    assert.equal(s.background, '#fee2df');
    assert.equal(s.color, BASE_THEME.colors.gray[7], 'quiet: gray.7');
    assert.equal(s.fontSize, 17);
    assert.equal(s.textTransform, 'uppercase');
    assert.equal(s.minWidth, 40);
    assert.equal(s.fontWeight, 600);
    assert.deepEqual(styleProps(BASE_THEME, 'light', { tint: 'red', huge: 40 }), {}, 'a key that is no style prop means nothing');
  });
});

describe('rui-core components on the DOM and on Skia', () => {
  it('show the same text and answer the same presses', () => {
    // Each renderer's root owns its state (roots are isolated).
    /** @type {any[]} */
    const counts = [];
    const view = () => {
      const count = $signal($active(), 0);
      counts.push(count);
      return (
      <Rui>
        <Container size="xs">
          <Surface p="md" bordered shadow="sm">
            <Stack gap="sm">
              <Heading level={3}>Counter</Heading>
              <Text fg="quiet" size="sm">{() => `pressed ${$read(count)} times`}</Text>
              <Row>
                <Button onPress={() => $write(count, $read(count) + 1)}>Add</Button>
                <Button variant="soft" color="red" onPress={() => $write(count, 0)}>Reset</Button>
                <Button disabled onPress={() => $write(count, 99)}>Off</Button>
              </Row>
              <Tiles columns={2}>
                <Text>one</Text>
                <Text>two</Text>
              </Tiles>
              <Spacer h="md" />
              <Center><Text fontWeight="bold">centered</Text></Center>
              <Flex gap="xs"><Box p={4}><Text>a</Text></Box><Box p={4}><Text>b</Text></Box></Flex>
            </Stack>
          </Surface>
        </Container>
      </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const total = () => counts.reduce((n, c) => n + $read(c), 0);
    const shown = 'Counter pressed 0 times Add Reset Off one two centered a b';
    assert.equal(dom.text(), shown);
    assert.equal(skia.text(), shown);
    dom.press('Add');
    skia.press('Add');
    assert.equal(total(), 2, 'a press on each renderer');
    assert.equal(dom.text(), shown.replace('0', '1'));
    assert.equal(skia.text(), shown.replace('0', '1'));
    dom.press('Off');
    skia.press('Off');
    assert.equal(total(), 2, 'a disabled button does nothing');
    dom.press('Reset');
    assert.equal($read(counts[0]), 0);
    assert.equal($read(counts[1]), 1);
    dispose();
  });

  it("a padding or margin style prop for some sides keeps the component's own on the others", () => {
    const { xs, sm, md } = BASE_THEME.spacing;
    const view = () => (
      <Rui>
        <Container size={260} py="xs">
          <Text>one</Text>
        </Container>
        <Container size={260} pt="sm" mx={4}>
          <Text>two</Text>
        </Container>
        <Container size={260} p="xs">
          <Text>three</Text>
        </Container>
        <Box py="xs">
          <Text>four</Text>
        </Box>
        <Container size={260} py="xs" px={null}>
          <Text>five</Text>
        </Container>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const outer = (/** @type {string} */ t) => dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === t).parentElement;
    const pad = (/** @type {string} */ t) => ['Top', 'Right', 'Bottom', 'Left'].map(k => outer(t).style[`padding${k}`]);
    assert.deepEqual(pad('one'), [`${xs}px`, `${md}px`, `${xs}px`, `${md}px`], 'py: the sides keep their own');
    assert.deepEqual(pad('two'), [`${sm}px`, `${md}px`, '0px', `${md}px`], 'pt: only the top');
    assert.deepEqual(outer('two').style.marginLeft, '4px');
    assert.deepEqual(pad('three'), [`${xs}px`, `${xs}px`, `${xs}px`, `${xs}px`], 'p: every side');
    assert.deepEqual(pad('four'), [`${xs}px`, '0px', `${xs}px`, '0px'], 'no own padding: only what is given');
    assert.deepEqual(pad('five'), [`${xs}px`, `${md}px`, `${xs}px`, `${md}px`], 'a null side is left out, as styleProps reads it');
    // Skia: the text sits the same way inside.
    const inset = (/** @type {string} */ t) => {
      skia.skia.present();
      /** @type {any} */
      let label = null;
      const walk = (/** @type {any} */ n) => {
        for (let c = n.first; c !== null && label === null; c = c.next) (c.kind === 3 && c.caption === t ? (label = c) : walk(c));
      };
      walk(skia.skia.root);
      const a = label.getBoundingClientRect();
      const b = label.parent.getBoundingClientRect();
      return [Math.round(a.top - b.top), Math.round(a.left - b.left)];
    };
    assert.deepEqual(inset('one'), [xs, md]);
    assert.deepEqual(inset('two'), [sm, md]);
    assert.deepEqual(inset('five'), [xs, md]);
    dispose();
  });

  it('restyle in place when the scheme or theme changes', () => {
    /** @type {{ scheme: any, theme: any }[]} */
    const state = [];
    const view = () => {
      const R = $active();
      const scheme = $signal(R, 'light');
      const theme = $signal(R, BASE_THEME);
      state.push({ scheme, theme });
      return (
      <Rui theme={theme} scheme={scheme}>
        <Surface p="md">
          <Button>Go</Button>
        </Surface>
      </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const set = (/** @type {'scheme' | 'theme'} */ key, /** @type {any} */ value) => {
      for (const s of state) $write(s[key], value);
      $flush(dom.root);
      $flush(skia.root);
    };
    const surface = () => dom.nodes('View')[0];
    const button = () => dom.nodes('Action')[0];
    const before = { surface: surface(), button: button() };
    const bg = (/** @type {any} */ n) => n.style.background || n.style.backgroundColor;
    const light = bg(surface());
    const blue = bg(button());
    /** The fill colors Skia painted, as ARGB. */
    const fills = () => {
      skia.text();
      return skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'rect' || c[0] === 'round').map((/** @type {any[]} */ c) => JSON.stringify(c));
    };
    const skiaLight = fills();
    set('scheme', 'dark');
    assert.notEqual(bg(surface()), light, 'the Surface takes the dark body');
    assert.equal(bg(button()), blue, 'the solid button keeps its shade: 6 in both schemes');
    assert.equal(surface(), before.surface, 'the same nodes');
    assert.equal(button(), before.button);
    assert.ok(skiaLight.length > 0, 'Skia painted fills');
    assert.notDeepEqual(fills(), skiaLight, 'Skia repaints in the dark scheme');
    const dark = bg(button());
    set('theme', themeOf({ accent: 'purple' }));
    assert.notEqual(bg(button()), dark, 'a new accent');
    dispose();
  });

  it('animate on the Clock: frames while the step asks, none after the owner goes', () => {
    const clock = manualClock();
    /** @type {number[]} */
    const seen = [];
    const Ticker = () => {
      const t = $signal($active(), 0);
      $motion((_, elapsed) => {
        $write(t, elapsed);
        seen.push(elapsed);
        return elapsed < 64;
      });
      return <Text>{() => `t ${$read(t)}`}</Text>;
    };
    const { dom, dispose } = both(() => (
      <Clock value={clock}>
        <Ticker />
      </Clock>
    ));
    assert.equal(dom.text(), 't 0');
    clock.advance(32);
    assert.equal(dom.text(), 't 32');
    clock.advance(200);
    assert.equal(seen.at(-1), 64, 'stops once the step says so');
    const frames = seen.length;
    clock.advance(100);
    assert.equal(seen.length, frames, 'no more frames');
    dispose();
    assert.equal(clock.pending(), 0, 'nothing waits after disposal');
  });

  it('clip Text with lines and truncate, and Heading with lines, the same on both', () => {
    const long = 'The quick brown fox jumps over the lazy dog '.repeat(6).trim();
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack w={160}>
          <Text lines={2}>{long}</Text>
          <Text truncate>{long}</Text>
          <Heading level={4} lines={1}>{long}</Heading>
          <Text>plain</Text>
        </Stack>
      </Rui>
    ));
    const [clamped, cut, title, plain] = dom.nodes('Label');
    assert.equal(clamped.style.getPropertyValue('line-clamp'), '2');
    assert.equal(cut.style.textOverflow, 'ellipsis');
    assert.equal(cut.style.whiteSpace, 'pre', 'truncate keeps one line');
    assert.equal(title.style.getPropertyValue('line-clamp'), '1');
    assert.equal(plain.style.textOverflow, '', 'no clip unless asked');
    skia.text();
    const rows = skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'text').map((/** @type {any[]} */ c) => String(c[1]));
    assert.equal(rows.length, 5, 'two rows, one, one, and the plain text');
    assert.ok(rows[1].endsWith('…') && rows[2].endsWith('…') && rows[3].endsWith('…'), 'each clip ends with an ellipsis');
    assert.equal(rows[4], 'plain');
    dispose();
  });

  it('wrap Text and Heading as paragraphs and headings, the same on both', () => {
    const long = 'The quick brown fox jumps over the lazy dog '.repeat(3).trim();
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack w={160}>
          <Text>{long}</Text>
          <Heading level={4}>{long}</Heading>
          <Text style={{ wrap: false }}>{long}</Text>
        </Stack>
      </Rui>
    ), { width: 480, height: 800 });
    const [text, title, one] = dom.nodes('Label');
    assert.equal(text.style.whiteSpace, 'pre-wrap', 'Text wraps');
    assert.equal(title.style.whiteSpace, 'pre-wrap', 'Heading wraps');
    assert.equal(one.style.whiteSpace, 'pre', 'a style keeps it on one line');
    skia.text();
    const rows = skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'text');
    const lines = new Set(rows.map((/** @type {any[]} */ c) => c[3]));
    assert.ok(lines.size > 4, `the text and the title in several lines on Skia (${lines.size} baselines)`);
    assert.ok(rows.some((/** @type {any[]} */ c) => c[1] === long), 'the unwrapped one in one line');
    dispose();
  });

  it('write only the props the caller set, and give Pressable the page\'s text color', () => {
    const { dom, dispose } = both(() => (
      <Rui scheme="dark">
        <Box p={4}><Pressable>plain</Pressable></Box>
      </Rui>
    ));
    const box = dom.nodes('View')[0];
    assert.equal(box.hasAttribute('aria-label'), false, 'no empty aria-label');
    assert.equal(box.hasAttribute('hidden'), false);
    const button = dom.nodes('Action')[0];
    assert.equal(button.style.color, BASE_THEME.colors.gray[1], 'the dark scheme\'s text');
    dispose();
  });

  it('pass a caller\'s data-* props on, as a Box does', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Box data-page="home" data-count={3}><Text>in</Text></Box>
        <Stack data-part="list"><Text>out</Text></Stack>
      </Rui>
    ));
    assert.equal(dom.document.querySelector('[data-page]')?.getAttribute('data-page'), 'home');
    assert.equal(dom.document.querySelector('[data-page]')?.getAttribute('data-count'), '3');
    assert.equal(dom.document.querySelector('[data-part]')?.getAttribute('data-part'), 'list');
    assert.equal(skia.text(), dom.text());
    dispose();
  });
});


describe('font weights', () => {
  it('reach both renderers as given: Button and labels at the theme\'s strong weight, fontWeight props', async () => {
    const { TextInput } = await import('rui-core');
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Button>Save</Button>
        <TextInput label="Name" />
        <Text fontWeight={600}>semi</Text>
        <Text fontWeight={300}>light</Text>
      </Rui>
    ));
    const weight = (/** @type {string} */ t) => {
      let node = [...dom.nodes('Label'), ...dom.nodes('Action')].find((/** @type {any} */ n) => n.textContent === t);
      // Inherited, as CSS's: the nearest that sets it.
      while (node.style.fontWeight === '') node = node.parentElement;
      return String(node.style.fontWeight);
    };
    const strong = String(BASE_THEME.weights.strong);
    assert.deepEqual(['Save', 'Name', 'semi', 'light'].map(weight), [strong, strong, '600', '300'], 'the DOM gets them as given');
    skia.text();
    /** @type {any[]} */
    const all = [];
    const walk = (/** @type {any} */ n) => {
      for (let c = n.first; c !== null; c = c.next) (all.push(c), walk(c));
    };
    walk(skia.skia.root);
    const drawn = (/** @type {string} */ t) => all.find(n => n.text === t)?.style.fontWeight;
    assert.deepEqual([drawn('Save'), drawn('semi'), drawn('light')], [BASE_THEME.weights.strong, 600, 300], 'so does Skia (it draws the nearest face)');
    dispose();
  });
});

describe('rui-core page colors', () => {
  it('pick by contrast: every role in both schemes', async () => {
    const { pageColors } = await import('rui-core');
    const light = pageColors(BASE_THEME, 'light');
    const dark = pageColors(BASE_THEME, 'dark');
    const g = BASE_THEME.colors.gray;
    const n = BASE_THEME.colors.night;
    assert.deepEqual([light.text, light.quiet, light.border, light.rule, light.neutral], [g[9], g[7], g[5], g[2], BASE_THEME.white]);
    assert.deepEqual([dark.body, dark.text, dark.quiet, dark.border, dark.rule, dark.neutral], [n[8], g[1], n[1], n[3], n[5], n[6]]);
    assert.deepEqual([light.edge, light.sunken, light.raised, light.track, light.stripe, light.hover], [g[4], g[1], BASE_THEME.white, g[2], alpha(g[2], BASE_THEME.opacity.soft), g[0]], 'the surface roles, light: sunken gray.1, stripe gray.2 washed, hover gray.0');
    assert.deepEqual([dark.edge, dark.sunken, dark.raised, dark.track, dark.stripe], [n[4], n[9], n[7], n[5], n[7]], 'the surface roles, dark: raised lighter than the body, sunken darker');
    const keys = ['body', 'text', 'quiet', 'placeholder', 'border', 'rule', 'edge', 'neutral', 'hover', 'field', 'sunken', 'raised', 'track', 'stripe', 'disabled', 'disabledText'].sort();
    assert.deepEqual([Object.keys(light).sort(), Object.keys(dark).sort()], [keys, keys], 'exactly the page keys');
  });
});
