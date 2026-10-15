// Feedback on the DOM and on Skia: Alert, Notification, EmptyState, Loader,
// Progress (segments, stripes), Ring, Arc and
// Skeleton, with the same text, presses and animation frames on both.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush, $root, $dispose } from 'rrx-core';
import { Window } from 'happy-dom';
import { render as renderDom } from 'ren-dom';
import { $active, View } from 'ren-core';
import {
  Rui, Clock, manualClock, Button, Text, CheckIcon,
  Alert, Notification, EmptyState, Loader, Progress, Ring, Arc, Skeleton, BASE_THEME, variantColors, alpha,
} from 'rui-core';
import { arcBox, arcFigures } from '../src/core/feedback/progress.jsx';
import { mount } from 'ren-core/host';
import { Flow } from 'ren-canv';
import { $dom } from 'ren-dom';
import { Container } from 'rui-core';
import { both, onDom, closeWindow, disposeAfter } from './harness.jsx';
import { items, KIND } from './scene.js';

/** The Skia commands of one kind. @param {any} skia @param {string} kind */
const painted = (skia, kind) => {
  skia.text();
  return skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === kind);
};

/** The DOM's shapes: each SVG's children as tag names. @param {any} dom */
const svgs = dom => [...dom.host.querySelectorAll('[data-ren="Shape"]')].map((/** @type {any} */ s) => [...s.children].map((/** @type {any} */ c) => c.tagName.toLowerCase()).join(','));

describe('Alert, Notification and EmptyState', () => {
  it('show the same text and close on both', () => {
    /** @type {any[]} */
    const closed = [];
    const view = () => {
      const s = $signal($active(), 0);
      closed.push(s);
      const close = () => $write(s, $read(s) + 1);
      return (
        <Rui>
          <Alert title="Heads up" color="red" icon={<CheckIcon />} closable onClose={close}>Something happened</Alert>
          <Alert variant="solid" title="Solid">{() => `closed ${$read(s)}`}</Alert>
          <Notification title="Saved" onClose={close}>Your file is saved</Notification>
          <Notification color="teal" closable={false} icon={<CheckIcon />}>Done</Notification>
          <EmptyState heading="No results" note="Try another search" tinted mark={<CheckIcon />}>
            <EmptyState.Buttons>
              <Button onPress={close}>Reset</Button>
            </EmptyState.Buttons>
          </EmptyState>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view, { height: 600 });
    const shown = 'Heads up Something happened Solid closed 0 Saved Your file is saved Done No results Try another search Reset';
    assert.equal(dom.text(), shown);
    assert.equal(skia.text(), shown);
    dom.press('Reset');
    skia.press('Reset');
    assert.deepEqual(closed.map(s => $read(s)), [1, 1]);
    // The close buttons: the Alert's, then the Notification's (the second has none).
    const closes = dom.nodes('Action').filter((/** @type {any} */ n) => n.getAttribute('aria-label') === 'Close');
    assert.equal(closes.length, 2);
    closes[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    closes[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    $flush(dom.root);
    assert.equal($read(closed[0]), 3);
    assert.equal(dom.text(), shown.replace('closed 0', 'closed 3'));
    // The Skia X is the pair of crossing lines; press both close buttons at their lines' centers.
    const xs = painted(skia, 'line');
    assert.ok(xs.length >= 4, 'two drawn Xs');
    for (const pair of [xs.slice(0, 2), xs.slice(2, 4)]) {
      const [, x0, y0, x1, y1] = pair[0];
      skia.skia.press((x0 + x1) / 2, (y0 + y1) / 2);
      skia.skia.release((x0 + x1) / 2, (y0 + y1) / 2);
    }
    $flush(skia.root);
    assert.equal($read(closed[1]), 3);
    assert.equal(skia.text(), shown.replace('closed 0', 'closed 3'));
    dispose();
  });

  it('take closable as options or a node of their own', () => {
    /** @type {string[]} */
    const heard = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Alert closable={{ label: 'Dismiss' }} onClose={() => heard.push('alert')}>A</Alert>
        <Notification closable={{ label: 'Hide' }} onClose={() => heard.push('note')}>B</Notification>
        <Notification closable={<Text>mine</Text>}>C</Notification>
      </Rui>
    ));
    assert.equal(dom.text(), 'A B C mine');
    assert.equal(skia.text(), 'A B C mine');
    const labels = dom.nodes('Action').map((/** @type {any} */ n) => n.getAttribute('aria-label'));
    assert.deepEqual(labels, ['Dismiss', 'Hide'], 'the options\' label');
    for (const n of dom.nodes('Action')) n.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(heard, ['alert', 'note']);
    dispose();
  });

  it('Notification: a strong title, the message a step below in the text color, dimmed under a title. EmptyState: sized by the theme', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Notification title="Saved" closable={false}>Your file is saved</Notification>
        <Notification closable={false}>Alone</Notification>
        <EmptyState size="xs" heading="Tiny" note="small note" mark={<Text>i</Text>} />
        <EmptyState size="xl" heading="Huge" note="big note" />
      </Rui>
    ), { height: 600 });
    const page = { quiet: BASE_THEME.colors.gray[7], text: BASE_THEME.colors.gray[9] };
    const label = (/** @type {string} */ t) => dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === t);
    assert.deepEqual([label('Saved').style.fontSize, label('Saved').style.fontWeight], ['15px', '600'], 'the title: md, strong');
    assert.equal(label('Your file is saved').style.fontSize, '13px', 'the message: a font step below');
    assert.deepEqual([label('Saved').style.color, label('Your file is saved').style.color, label('Alone').style.color], [page.text, page.text, page.text], 'the text role throughout, never the quiet one');
    assert.deepEqual([label('Your file is saved').style.opacity, label('Alone').style.opacity], [String(BASE_THEME.opacity.muted), ''], 'dimmed by opacity.muted under a title only');
    assert.equal(label('Saved').parentElement.style.rowGap || label('Saved').parentElement.style.gap, '4px', 'half an xs step between them');
    assert.deepEqual([label('Tiny').style.fontSize, label('Huge').style.fontSize], ['15px', '29px'], 'EmptyState headings: headings six to two');
    assert.deepEqual([label('small note').style.fontSize, label('big note').style.fontSize], ['12px', '19px'], 'notes: the font size of its size');
    const drawn = (/** @type {string} */ t) => items(skia, KIND.Label).find(n => n.text === t).style;
    assert.deepEqual([drawn('Saved').fontSize, drawn('Huge').fontSize], [15, 29], 'the same on Skia');
    assert.deepEqual([drawn('Your file is saved').color === drawn('Alone').color, drawn('Your file is saved').opacity, drawn('Alone').opacity < 1], [true, BASE_THEME.opacity.muted, false], 'the text role, dimmed under a title, on Skia too');
    dispose();
  });

  it('EmptyState: the parts Mark, Heading, Note and Buttons, lined up at the start by default', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <EmptyState>
          <EmptyState.Mark><Text>m</Text></EmptyState.Mark>
          <EmptyState.Heading>Nothing yet</EmptyState.Heading>
          <EmptyState.Note>Add a first item</EmptyState.Note>
          <EmptyState.Buttons><Button>Add</Button></EmptyState.Buttons>
        </EmptyState>
        <EmptyState align="center" heading="Centered" note="In the middle" />
      </Rui>
    ), { height: 600 });
    assert.equal(dom.text(), 'm Nothing yet Add a first item Add Centered In the middle');
    assert.equal(skia.text(), dom.text());
    const label = (/** @type {string} */ t) => dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === t);
    const frame = label('Nothing yet').parentElement;
    assert.equal(frame.style.alignItems, 'flex-start', 'start by default');
    assert.deepEqual([label('Nothing yet').style.textAlign, label('Add a first item').style.textAlign], ['start', 'start']);
    assert.equal(label('Centered').parentElement.style.alignItems, 'center', 'align center');
    assert.equal(label('Centered').style.textAlign, 'center');
    const buttons = frame.lastElementChild;
    assert.equal(buttons.style.justifyContent, 'flex-start', 'the buttons on the same side');
    dispose();
  });

  it('Notification: a tone dot beside the first line (or the icon in the tone), on a raised surface with a 1 px edge', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Notification title="Saved" color="teal">Your file is saved</Notification>
        <Notification closable={false}>Alone</Notification>
        <Notification title="Checked" closable={false} icon={<CheckIcon />} />
      </Rui>
    ), { height: 600 });
    const t = BASE_THEME;
    const teal = t.colors.teal[6];
    const [saved, alone, checked] = dom.nodes('View').filter((/** @type {any} */ n) => n.getAttribute('role') === 'status');
    // The surface: raised, the theme's corner, shadow md, the edge role, spacing sm by md, the icon gap.
    assert.deepEqual(
      [saved.style.backgroundColor || saved.style.background, saved.style.borderWidth || saved.style.borderTopWidth, saved.style.borderColor || saved.style.borderTopColor, saved.style.paddingTop, saved.style.paddingLeft, saved.style.columnGap || saved.style.gap],
      [t.white, '1px', t.colors.gray[4], `${t.spacing.sm}px`, `${t.spacing.md}px`, `${t.control.iconGap}px`],
    );
    assert.ok(saved.style.boxShadow.startsWith(`${t.shadows.md.x}px ${t.shadows.md.y}px ${t.shadows.md.blur}px`), 'shadow md');
    // The mark: its box one line of the first text tall, the dot ratios.mark of that line, round, in the tone.
    const mark = (/** @type {any} */ n) => n.firstElementChild;
    const line = t.fontSizes.md * t.lineHeights.sm;
    const px = (/** @type {number} */ v) => `${Math.round(v * 1000) / 1000}px`;
    assert.equal(mark(saved).getAttribute('aria-hidden'), 'true', 'the mark is decoration');
    assert.equal(mark(saved).style.height, px(line));
    const dot = mark(saved).firstElementChild;
    assert.deepEqual([dot.style.width, dot.style.height, dot.style.backgroundColor || dot.style.background], [px(line * t.ratios.mark), px(line * t.ratios.mark), teal]);
    assert.equal(mark(alone).style.height, px(t.fontSizes.sm * t.lineHeights.sm), 'alone: the message\'s line');
    // The icon: ratios.icon of the line, in the tone, no ground behind it.
    const icon = mark(checked).firstElementChild;
    assert.deepEqual([icon.style.width, icon.style.backgroundColor || icon.style.background || ''], [px(line * t.ratios.icon), '']);
    assert.equal(mark(checked).style.color, t.colors[t.accent][t.accentShade.light], 'the icon in the accent tone');
    // The close button: size xs.
    const close = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === 'Close');
    assert.equal(close.style.width, '20px', 'a CloseButton at xs');
    // The same on Skia: three marks, one of them the icon.
    const views = items(skia, KIND.View);
    const near = (/** @type {any} */ v, /** @type {number} */ side) => Math.abs(v.style.width - side) < 1e-6 && Math.abs(v.style.height - side) < 1e-6;
    assert.equal(views.filter(v => near(v, line * t.ratios.mark)).length, 1, 'the titled dot on Skia');
    assert.equal(views.filter(v => near(v, line * t.ratios.icon)).length, 1, 'the icon\'s box on Skia');
    dispose();
  });

  it('Alert: the tone mark in the variant\'s ink beside the first line, surface and edge by variant, a quiet body under a title', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Alert title="Low disk" color="orange">Clear some room</Alert>
        <Alert variant="solid" color="green" title="Synced">All caught up</Alert>
        <Alert variant="outline" color="violet" icon={<CheckIcon />}>Plain note</Alert>
        <Alert variant="plain">Bare</Alert>
      </Rui>
    ), { height: 600 });
    const t = BASE_THEME;
    const [soft, solid, outline, plain] = dom.nodes('View').filter((/** @type {any} */ n) => n.getAttribute('role') === 'alert');
    const px = (/** @type {number} */ v) => `${Math.round(v * 1000) / 1000}px`;
    const bg = (/** @type {any} */ n) => n.style.backgroundColor || n.style.background || '';
    const edge = (/** @type {any} */ n) => n.style.borderColor || n.style.borderTopColor;
    const soft6 = variantColors(t, 'light', 'soft', 'orange');
    // The surface: spacing sm by md, the icon gap, the theme's corner; ground and edge by variant.
    assert.deepEqual([soft.style.paddingTop, soft.style.paddingLeft, soft.style.columnGap || soft.style.gap], [`${t.spacing.sm}px`, `${t.spacing.md}px`, `${t.control.iconGap}px`]);
    assert.deepEqual([bg(soft), edge(soft)], [soft6.background, alpha(soft6.color, t.opacity.soft)], 'soft: a tinted ground, the ink\'s soft edge');
    assert.equal(bg(solid), t.colors.green[t.accentShade.light], 'solid: the tone\'s fill');
    assert.deepEqual([bg(outline), edge(outline)], ['transparent', variantColors(t, 'light', 'outline', 'violet').border], 'outline: an edge of the ink, no ground');
    assert.equal(bg(plain), 'transparent', 'plain: neither');
    // The mark: a dot ratios.mark of the first line (the title's), in the ink; the icon at ratios.icon of the message's line.
    const line = t.fontSizes.md * t.lineHeights.sm;
    const mark = (/** @type {any} */ n) => n.firstElementChild;
    assert.equal(mark(soft).getAttribute('aria-hidden'), 'true', 'the mark is decoration');
    const dot = mark(soft).firstElementChild;
    assert.deepEqual([mark(soft).style.height, dot.style.width, bg(dot)], [px(line), px(line * t.ratios.mark), soft6.color]);
    assert.equal(mark(outline).firstElementChild.style.width, px(t.fontSizes.sm * t.lineHeights.sm * t.ratios.icon), 'the icon: its share of the message\'s line');
    // The text: a strong md title in the ink, the message a step below on the quiet role (the ink at muted on solid).
    const label = (/** @type {string} */ s) => dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === s);
    assert.deepEqual([label('Low disk').style.fontSize, label('Low disk').style.fontWeight, label('Low disk').style.color], [`${t.fontSizes.md}px`, '600', soft6.color]);
    assert.deepEqual([label('Clear some room').style.fontSize, label('Clear some room').style.color], ['13px', t.colors.gray[7]], 'the quiet role');
    assert.equal(label('All caught up').style.color, alpha(t.white, t.opacity.muted), 'solid: the ink at muted');
    assert.equal(label('Plain note').style.color, t.colors.gray[9], 'alone: the text color');
    assert.equal(dom.nodes('Action').length, 0, 'not closable by default');
    // The same on Skia: the titled dot and the icon's box.
    const views = items(skia, KIND.View);
    const near = (/** @type {any} */ v, /** @type {number} */ side) => Math.abs(v.style.width - side) < 1e-6 && Math.abs(v.style.height - side) < 1e-6;
    assert.equal(views.filter(v => near(v, line * t.ratios.mark)).length, 2, 'the two titled dots on Skia');
    dispose();
  });

  it('a loading Notification: busy, with a rule along its bottom edge sweeping on the clock; the dot stays', () => {
    const clock = manualClock();
    const { dom, skia, dispose } = both(() => (
      <Clock value={clock}>
        <Rui>
          <Notification loading title="Uploading" closable={false}>Please wait</Notification>
        </Rui>
      </Clock>
    ));
    assert.equal(dom.text(), 'Uploading Please wait');
    assert.equal(skia.text(), 'Uploading Please wait');
    const root = dom.nodes('View').find((/** @type {any} */ n) => n.getAttribute('role') === 'status');
    assert.equal(root.getAttribute('aria-busy'), 'true');
    assert.deepEqual(svgs(dom), [], 'no loader drawn: a rule of views');
    const rule = root.lastElementChild;
    assert.deepEqual([rule.style.position, rule.style.height, rule.style.bottom, rule.getAttribute('aria-hidden')], ['absolute', '2px', '0px', 'true']);
    assert.equal(rule.children.length, 2, 'the lead and the moving segment');
    assert.equal(root.firstElementChild.firstElementChild.style.width !== '', true, 'the dot stays');
    const segment = () => [rule.children[0].style.width, rule.children[1].style.width];
    const before = segment();
    const fills = () => JSON.stringify([...painted(skia, 'rect'), ...painted(skia, 'round')]);
    const drawn = fills();
    clock.advance(400);
    $flush(dom.root);
    assert.notDeepEqual(segment(), before, 'it sweeps on the DOM');
    assert.notEqual(fills(), drawn, 'and on Skia');
    dispose();
  });

  it('a loading Notification holds its rule still when the user asks for reduced motion', t => {
    const clock = manualClock();
    const window = new Window({ url: 'http://localhost/', width: 480, height: 360, settings: { device: { prefersReducedMotion: 'reduce' } } });
    const host = window.document.createElement('main');
    window.document.body.appendChild(host);
    const root = $root('dom');
    const stop = renderDom(() => (
      <Clock value={clock}>
        <Rui>
          <Notification loading title="Uploading" closable={false}>Please wait</Notification>
        </Rui>
      </Clock>
    ), host, { root });
    // Closed after the test, failing or not; the hook's slot lets the window go once run.
    disposeAfter(t, () => {
      stop();
      $dispose(root);
      closeWindow(window);
    });
    $flush(root);
    const rule = /** @type {any} */ (host.querySelector('[role="status"]')).lastElementChild;
    const segment = () => [rule.children[0].style.width, rule.children[1].style.width];
    const share = BASE_THEME.ratios.mark * 100;
    assert.deepEqual(segment(), [`${(100 - share) / 2}%`, `${share}%`], 'in the middle');
    assert.equal(clock.pending(), 0, 'no frames asked for');
    clock.advance(400);
    $flush(root);
    assert.deepEqual(segment(), [`${(100 - share) / 2}%`, `${share}%`], 'still');
  });
});

describe('Loader', () => {
  it('draws ring, bars and dots, moving on the clock the same on both', () => {
    const clock = manualClock();
    const { dom, skia, dispose } = both(() => (
      <Clock value={clock}>
        <Loader />
        <Loader kind="bars" size="lg" color="red" />
        <Loader kind="dots" size={30} />
      </Clock>
    ));
    // The ring's track and arc, the meter's four bars, the wave's three dots.
    assert.deepEqual(svgs(dom), ['path,path', 'rect,rect,rect,rect', 'ellipse,ellipse,ellipse']);
    assert.equal(painted(skia, 'path').length, 2);
    assert.equal(painted(skia, 'rect').filter((/** @type {any[]} */ c) => c[5] === '#ffb63636').length, 4, 'four red bars');
    assert.equal(painted(skia, 'oval').length, 3);
    const frame = () => JSON.stringify([painted(skia, 'path'), painted(skia, 'oval')]);
    const domFrame = () => dom.host.innerHTML;
    const a = [frame(), domFrame()];
    clock.advance(160);
    const b = [frame(), domFrame()];
    assert.notEqual(b[0], a[0], 'Skia moved');
    assert.notEqual(b[1], a[1], 'the DOM moved');
    dispose();
    assert.equal(clock.pending(), 0);
  });
});

describe('loaderFigures', () => {
  it('draws rui\'s own loaders: a breathing arc on a track, a rising meter, a lifting wave', async () => {
    const { loaderFigures } = await import('../src/core/feedback/loader.jsx');
    const ring = loaderFigures('ring', 40, '#123456', 0);
    assert.equal(ring.length, 2);
    assert.equal(ring[0].stroke, 4, 'a tenth of the size');
    assert.equal(ring[0].color, '#12345629', 'the track at opacity.faint (0.16)');
    const { stripes } = await import('../src/core/feedback/progress.jsx');
    assert.equal(stripes(8, 0)[0].color, '#ffffff29', 'stripes: white at opacity.faint');
    // A quarter at the start of the cycle, three quarters half way (600 of 1200 ms).
    const sweep = (/** @type {any} */ f) => f.points.length / 2 - 1;
    assert.ok(sweep(loaderFigures('ring', 40, '#123456', 600)[1]) > sweep(ring[1]) * 2, 'the arc grows');
    const bars = loaderFigures('bars', 28, 'red', 0);
    assert.deepEqual(bars.map((/** @type {any} */ b) => [b.x, b.right, b.bottom]), [[0, 4, 28], [8, 12, 28], [16, 20, 28], [24, 28, 28]], 'four bars on a 7-unit row, standing on the baseline');
    assert.equal(bars[0].y, 28 - 28 * 0.3, 'the first at its lowest (30 %) as its cycle starts');
    const dots = loaderFigures('dots', 32, 'red', 300);
    assert.deepEqual(dots.map((/** @type {any} */ d) => d.right - d.x), [8, 8, 8], 'a quarter of the size');
    assert.ok(dots[0].y < dots[2].y, 'the wave lifts the first dot before the last');
  });
});

describe('Progress', () => {
  it('fills segments by percent, labels them and moves stripes', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const roots = [];
    /** @type {any[]} */
    const values = [];
    const view = () => {
      const value = $signal($active(), 40);
      values.push(value);
      return (
        <Clock value={clock}>
          <Rui>
            <Progress ref={(/** @type {any} */ n) => roots.push(n)} value={value} w={200} />
            <Progress.Track size="xl" w={300}>
              <Progress.Segment value={35} color="green"><Progress.Text>Photos</Progress.Text></Progress.Segment>
              <Progress.Segment value={25} color="violet" striped moving><Progress.Text>Mail</Progress.Text></Progress.Segment>
            </Progress.Track>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Photos Mail');
    assert.equal(skia.text(), 'Photos Mail');
    // Labels: the largest type step inside the bar (1 px clear), inked by the fill's contrast.
    const photos = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === 'Photos');
    const high = parseFloat(photos.parentElement.parentElement.style.height);
    const steps = Object.values(BASE_THEME.fontSizes).sort((a, b) => a - b);
    assert.equal(parseFloat(photos.style.fontSize), steps.filter(f => f <= high - 2).at(-1) ?? steps[0]);
    assert.equal(photos.style.fontWeight, '600');
    const fill = () => roots[1].first.getBoundingClientRect().width;
    skia.text();
    assert.equal(fill(), 80, '40 % of 200 px');
    assert.equal(roots[0].firstChild.style.width, '40%');
    for (const v of values) $write(v, 75);
    $flush(dom.root);
    $flush(skia.root);
    clock.advance(150);
    skia.text();
    const midway = fill();
    assert.ok(midway > 80 && midway < 150, `following the new value (calm, 300 ms): ${midway}`);
    clock.advance(200);
    skia.text();
    assert.equal(fill(), 150);
    assert.equal(roots[0].firstChild.style.width, '75%');
    assert.ok(Number.isNaN(roots[1].first.style.radiusTopRight), 'the fill is square: the track\'s rounded clip shapes it');
    assert.equal(roots[0].firstChild.style.borderRadius, '', 'on the DOM too');
    assert.ok(skia.skia.commands().some((/** @type {any[]} */ c) => c[0] === 'rclip'), 'the track clips round on Skia');
    const stripes = () => JSON.stringify(painted(skia, 'path'));
    const before = stripes();
    assert.ok(painted(skia, 'path').length > 10, 'stripes painted');
    assert.deepEqual(svgs(dom).length, 1, 'one striped segment');
    clock.advance(200);
    assert.notEqual(stripes(), before, 'moving stripes run');
    dispose();
  });

  it('moving is its own: striped alone stands still, moving alone sweeps a sheen without stripes', () => {
    const clock = manualClock();
    const { dom, skia, dispose } = both(() => (
      <Clock value={clock}>
        <Rui>
          <Progress value={50} w={200} striped />
          <Progress value={50} w={200} moving />
        </Rui>
      </Clock>
    ));
    skia.text();
    assert.equal(svgs(dom).length, 1, 'stripes on the striped bar only');
    assert.equal(clock.pending(), 2, 'frames for the moving bar only, one per renderer');
    const sheen = () => dom.nodes('View').find((/** @type {any} */ n) => n.getAttribute('aria-hidden') === 'true' && n.style.position === 'absolute' && n.style.width === `${BASE_THEME.ratios.mark * 100}%`);
    assert.ok(sheen(), 'a sheen a mark of the fill wide');
    const at = sheen().style.left;
    const stripes = JSON.stringify(painted(skia, 'path'));
    clock.advance(300);
    assert.notEqual(sheen().style.left, at, 'the sheen sweeps');
    assert.equal(JSON.stringify(painted(skia, 'path')), stripes, 'the striped bar stands still');
    dispose();
  });

  it('draws rings and half rings with their labels', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Ring label="65%" round segments={[{ value: 45, color: 'violet' }, { value: 20, color: 'lime' }]} />
        <Arc value={30} label="30%" />
        <Arc value={60} start={90} label={{ at: 'end' }} />
      </Rui>
    ));
    assert.equal(dom.text(), '65% 30% 60%');
    assert.equal(skia.text(), '65% 30% 60%');
    // The ring: its track (an oval), two arcs and four round caps; each half ring: a track and a fill.
    assert.deepEqual(svgs(dom), ['ellipse,path,ellipse,ellipse,path,ellipse,ellipse', 'path,path', 'path,path']);
    assert.equal(painted(skia, 'path').length, 6);
    assert.equal(painted(skia, 'oval').length, 5);
    dispose();
  });
});

describe('Skeleton', () => {
  it('pulses on the clock and shows its children once not loading', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const visible = [];
    const view = () => {
      const v = $signal($active(), true);
      visible.push(v);
      return (
        <Clock value={clock}>
          <Rui>
            <Skeleton height={36} round />
            <Skeleton height={12} radius="sm" />
            <Skeleton loading={v}><Text>Loaded content</Text></Skeleton>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    const first = () => dom.nodes('View')[0].style.opacity;
    const a = first();
    clock.advance(400);
    assert.notEqual(first(), a, 'the pulse on the DOM');
    // An empty skeleton paints its opacity in its fill's alpha (ren-canv folds it); one holding content, in a layer.
    const fills = () => JSON.stringify([...painted(skia, 'layer'), ...painted(skia, 'round'), ...painted(skia, 'rect')]);
    const s = fills();
    assert.ok(painted(skia, 'layer').length >= 1, 'the skeleton holding content paints in an opacity layer');
    clock.advance(400);
    assert.notEqual(fills(), s, 'the pulse on Skia');
    assert.equal(dom.text(), 'Loaded content', 'the covered children keep their room, painted transparent');
    assert.equal(skia.text(), 'Loaded content');
    assert.equal(clock.pending(), 6, 'three pulses on each renderer');
    for (const v of visible) $write(v, false);
    $flush(dom.root);
    $flush(skia.root);
    assert.equal(clock.pending(), 4, 'a skeleton no longer shown stops pulsing');
    assert.equal(dom.text(), 'Loaded content');
    assert.equal(skia.text(), 'Loaded content');
    dispose();
  });

  it('breathes between the disabled and dense opacity steps over four calm motions', () => {
    const clock = manualClock();
    const { dom, dispose } = both(() => (
      <Clock value={clock}>
        <Rui>
          <Skeleton height={20} />
        </Rui>
      </Clock>
    ));
    const opacity = () => Number(dom.nodes('View')[0].style.opacity);
    assert.equal(opacity(), 0.45, 'opacity.disabled at the start');
    clock.advance(600);
    assert.ok(Math.abs(opacity() - 0.88) < 0.01, 'opacity.dense half way (600 of 1200 ms)');
    dispose();
  });

  it('pulse false: a still skeleton at full opacity', () => {
    const clock = manualClock();
    const { dom, dispose } = both(() => (
      <Clock value={clock}>
        <Rui>
          <Skeleton height={20} pulse={false} />
        </Rui>
      </Clock>
    ));
    const opacity = () => Number(dom.nodes('View')[0].style.opacity || 1);
    assert.equal(opacity(), 1);
    clock.advance(600);
    assert.equal(opacity(), 1, 'no breathing');
    assert.equal(clock.pending(), 0, 'no frames asked');
    dispose();
  });
});

describe('Ring, Arc and Progress: rui\'s own geometry and motion', () => {
  it('size by default (Ring 112 by sizes.progress.lg, Arc 180 by sizes.progress.xl over 180 degrees, Progress md 6)', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Ring segments={[{ value: 50, color: 'teal' }]} />
        <Arc value={40} />
        <Progress value={10} />
      </Rui>
    ));
    const [ring, arcRoot, bar] = dom.nodes('View').filter((/** @type {any} */ n) => n.getAttribute('role') === 'progressbar');
    const box = arcRoot.firstElementChild;
    assert.deepEqual([ring.style.width, box.style.width, box.style.height], ['112px', '180px', '90px'], 'the half ring\'s box: its bounds');
    assert.equal(bar.parentElement.style.height, '6px', 'md: 6 px');
    assert.equal(arcRoot.querySelector('path').getAttribute('stroke-width'), String(BASE_THEME.sizes.progress.xl));
    assert.equal(ring.querySelector('ellipse').getAttribute('stroke-width'), String(BASE_THEME.sizes.progress.lg), 'the ring: a heavy bar\'s stroke (lg, 10)');
    dispose();
  });

  it('Arc: sweep and start set its figure; the fill runs from start along the sweep', () => {
    // The track and the fill, as points: [x, y] pairs.
    const pairs = (/** @type {number[]} */ p) => Array.from({ length: p.length / 2 }, (_, i) => [Math.round(p[i * 2] * 1000) / 1000, Math.round(p[i * 2 + 1] * 1000) / 1000]);
    // The default: from -90 (left) over the top to 90 (right), its center on the box's bottom edge.
    const half = arcFigures(180, 14, 50, -90, 180, 'gray', 'teal');
    assert.equal(half.length, 2);
    assert.deepEqual(arcBox(180, 14, -90, 180), { x: 0, y: 0, width: 180, height: 90 });
    const track = pairs(half[0].points);
    assert.deepEqual([track[0], track.at(-1)], [[7, 90], [173, 90]], 'the track: left end to right end at the radius (83)');
    const fill = pairs(half[1].points);
    assert.deepEqual([fill[0], fill.at(-1)], [[7, 90], [90, 7]], 'half the value: from the left end to the top');
    assert.deepEqual([half[0].stroke, half[1].color], [14, 'teal']);
    // A three-quarter gauge: 270 degrees from -135, opening at the bottom; its box the ring's side.
    const gauge = arcBox(180, 14, -135, 270);
    assert.deepEqual([gauge.x, gauge.y, gauge.width], [0, 0, 180]);
    assert.ok(Math.abs(gauge.height - (90 + 90 * Math.SQRT1_2)) < 1e-6, 'down to the ends\' outer corners');
    // A quarter from the right (90) to the bottom (180): the square's lower right quarter.
    assert.deepEqual(arcBox(180, 14, 90, 90), { x: 90, y: 90, width: 90, height: 90 });
    const quarter = pairs(arcFigures(180, 14, 100, 90, 90, 'gray', 'teal')[1].points);
    assert.deepEqual([quarter[0], quarter.at(-1)], [[83, 0], [0, 83]], 'the full fill, in the box: right end to bottom end');
    assert.equal(arcFigures(180, 14, 0, -90, 180, 'gray', 'teal').length, 1, 'no fill at 0');
    // A negative sweep runs counterclockwise: from 90 (right) back over the top to -90, the same half ring filled from its right end.
    assert.deepEqual(arcBox(180, 14, 90, -180), arcBox(180, 14, -90, 180), 'the same box either way round');
    const back = arcFigures(180, 14, 50, 90, -180, 'gray', 'teal');
    const backTrack = pairs(back[0].points);
    assert.deepEqual([backTrack[0], backTrack.at(-1)], [[173, 90], [7, 90]], 'the track: right end to left end');
    const backFill = pairs(back[1].points);
    assert.deepEqual([backFill[0], backFill.at(-1)], [[173, 90], [90, 7]], 'half the value: from the right end to the top');
  });

  it('Arc: sweep={-180} stands over the top as the default does and fills from the right', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Arc value={25} sweep={-180} />
        <Arc value={25} />
      </Rui>
    ));
    const [back, ahead] = dom.nodes('View').filter((/** @type {any} */ n) => n.getAttribute('role') === 'progressbar');
    assert.deepEqual([back.firstElementChild.style.width, back.firstElementChild.style.height], ['180px', '90px'], 'start -sweep / 2 = 90: the default half ring\'s box');
    const fillStart = (/** @type {any} */ root) => root.querySelectorAll('path')[1].getAttribute('d').split(/[ML ,]+/).filter(Boolean).slice(0, 2).map(Number);
    assert.ok(fillStart(back)[0] > 90 && fillStart(ahead)[0] < 90, 'the fill starts at the right end, not the left');
    dispose();
  });

  it('Arc: its label part in the center, under the arc, or beside it; a text label is its value text', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Arc value={25} label />
        <Arc value={50} label={{ at: 'bottom', text: 'Half' }} />
        <Arc value={75} label={{ at: 'end' }} sweep={90} />
        <Arc value={10} label={false} />
        <Arc value={5} label={<Text>mine</Text>} />
      </Rui>
    ), { height: 600, width: 480 });
    assert.equal(dom.text(), '25% Half 75% mine');
    assert.equal(skia.text(), '25% Half 75% mine');
    const [center, bottom, end, none, node] = dom.nodes('View').filter((/** @type {any} */ n) => n.getAttribute('role') === 'progressbar');
    assert.equal(center.children.length, 1, 'center: over the arc, inside its box');
    assert.equal(center.firstElementChild.lastElementChild.style.position, 'absolute');
    assert.deepEqual([bottom.style.flexDirection, bottom.children.length], ['column', 2], 'bottom: under the arc');
    assert.deepEqual([end.style.flexDirection, end.children.length], ['row', 2], 'end: beside it');
    assert.ok(Math.abs(parseFloat(end.firstElementChild.style.width) - 180 * Math.SQRT1_2) < 1e-3, 'a quarter centered on the top: its box as wide as its outer ends');
    assert.equal(none.children.length, 1, 'false: no label');
    assert.deepEqual([center.getAttribute('aria-valuetext'), bottom.getAttribute('aria-valuetext'), end.getAttribute('aria-valuetext')], [null, 'Half', null], 'a text of the caller\'s is the value text; the percent is the value');
    assert.equal(node.getAttribute('aria-valuetext'), null);
    const at = (/** @type {string} */ t) => items(skia, KIND.Label).find(n => n.text === t);
    const box = (/** @type {any} */ n) => n.getBoundingClientRect();
    skia.skia.present();
    const half = at('Half');
    assert.ok(box(half).y >= box(half.parent.parent.first).y + 90 - 1e-6, 'under the arc on Skia');
    dispose();
  });

  it('Ring follows a new value over the calm preset (300 ms)', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const values = [];
    const { skia, dispose } = both(() => {
      const v = $signal($active(), 20);
      values.push(v);
      return (
        <Clock value={clock}>
          <Rui>
            <Ring segments={() => [{ value: $read(v), color: 'teal' }]} />
          </Rui>
        </Clock>
      );
    });
    const arcs = () => JSON.stringify(painted(skia, 'path'));
    const before = arcs();
    for (const v of values) $write(v, 80);
    $flush(skia.root);
    clock.advance(150);
    const midway = arcs();
    clock.advance(200);
    const after = arcs();
    assert.ok(before !== midway && midway !== after, 'moving, then there');
    clock.advance(200);
    assert.equal(arcs(), after, 'settled');
    dispose();
  });
});

describe('EmptyState in a narrow container', () => {
  const NOTE = 'Crie uma com Nova tag: seus livros-caixa podem usá-la.';
  const view = () => (
    <Rui>
      <View style={{ width: 390 }}>
        <Container px="md">
          <EmptyState heading="No tags yet" note={NOTE} />
        </Container>
      </View>
    </Rui>
  );
  /** A text measure 0.6 of the font size wide per character: the note (54 at 15 px) is 486 wide. */
  const mono = {
    width: (/** @type {string} */ text, /** @type {number} */ size) => text.length * size * 0.6,
    metrics: (/** @type {number} */ size) => ({ ascent: size * 0.8, descent: size * 0.2 }),
    close() {},
  };
  it('wraps the note within the room at 390 px on the DOM (laid out by the Flow), in the CSS and on Skia', () => {
    const window = new Window({ url: 'http://localhost/' });
    const host = window.document.createElement('main');
    Object.defineProperty(host, 'clientWidth', { value: 390 });
    window.document.body.appendChild(host);
    const flow = new Flow(mono);
    const stop = mount($dom(window.document, { layout: flow }), view, host);
    const note = /** @type {any} */ ([...host.querySelectorAll('[data-ren="Label"]')].find(n => n.textContent === NOTE));
    const px = (/** @type {any} */ el, /** @type {string} */ k) => parseFloat(el.style[k]);
    const room = px(note.parentElement, 'width');
    assert.ok(px(note, 'left') + px(note, 'width') <= room + 0.5, `within its column: ${px(note, 'left')} + ${px(note, 'width')} in ${room}`);
    assert.ok(px(note, 'height') > BASE_THEME.fontSizes.md * 1.9, `on two lines or more: ${px(note, 'height')}`);
    stop();
    flow.close();
    closeWindow(window);

    // The browser's layout: the note wraps, at most the theme's cap wide.
    const dom = onDom(view, { width: 390, height: 300 });
    const css = /** @type {any} */ ([...dom.host.querySelectorAll('[data-ren="Label"]')].find(n => n.textContent === NOTE)).style;
    assert.deepEqual([css.whiteSpace, css.overflowWrap, css.maxWidth], ['pre-wrap', 'break-word', `${BASE_THEME.sizes.box.empty}px`]);
    dom.dispose();

    const { skia, dispose } = both(view, { width: 390, height: 300 });
    skia.text();
    const label = items(skia, KIND.Label).find(i => i.text === NOTE);
    const r = label.getBoundingClientRect();
    assert.ok(r.right <= 390 - BASE_THEME.spacing.md + 0.5, `within the room on Skia: ${r.right}`);
    dispose();
  });
});
