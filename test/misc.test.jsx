// Miscellaneous components and the remaining layout on the DOM and on Skia:
// Divider, VisuallyHidden, Collapse, Transition, ScrollBox, ScrollRow,
// Marquee, Grid, AspectRatio and Shell, with the same text, the
// same answers to input and, animated, the same states frame by frame.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush, $untrack } from 'rrx-core';
import { $active, View } from 'ren-core';
import {
  Rui, Clock, manualClock, Divider, VisuallyHidden, Collapse, Transition, EFFECTS, ScrollBox, ScrollRow, Marquee, Text, Button, Stack, Row,
  Grid, AspectRatio, Shell, FocusTrap, Tiles, BASE_THEME, LAYERS, themeOf, pageColors, colorOf,
} from 'rui-core';
import { atWidth, breakpointOf, isResponsive } from '../src/theme/breakpoints.js';
import { $tween, $follow, insetsOf } from '../src/core/misc/tween.js';
import { both, onDom, onSkia } from './harness.jsx';
import { items, KIND } from './scene.js';

/**
 * Gives happy-dom boxes (it lays nothing out): a clipped View is `clip` wide,
 * anything else as wide as its text (8 px a character) and 20 px a Label high.
 * @param {any} dom @param {{ clip?: number }} [o]
 */
function boxes(dom, o = {}) {
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    const clipped = this.style.overflow === 'hidden' && o.clip !== undefined;
    const width = clipped ? o.clip : this.textContent.length * 8;
    const labels = this.getAttribute('data-ren') === 'Label' ? 1 : this.querySelectorAll('[data-ren="Label"]').length;
    return { x: 0, y: 0, left: 0, top: 0, width, height: labels * 20, right: width, bottom: labels * 20 };
  };
}

/** Flushes both roots. @param {any} dom @param {any} skia */
const flush = (dom, skia) => ($flush(dom.root), $flush(skia.root));

describe('rui-core misc on the DOM and on Skia', () => {
  it('Divider: a line, a labeled line, a vertical one', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack>
          <Text>above</Text>
          <Divider />
          <Divider label="or" labelAt="start" size="md" color="blue" />
          <Divider line="dashed" />
          <Divider line="dotted" size="lg" />
          <Row>
            <Text>a</Text>
            <Divider orientation="vertical" />
            <Text>b</Text>
          </Row>
        </Stack>
      </Rui>
    ));
    assert.equal(dom.text(), 'above or a b');
    assert.equal(skia.text(), 'above or a b');
    const lines = dom.nodes('View').filter(n => n.style.borderTopWidth === '2px');
    assert.equal(lines.length, 2, 'the labeled divider: a short line and a long one, 2 px (md)');
    const styles = dom.nodes('View').filter(n => n.style.borderTopWidth !== '' && n.style.borderTopWidth !== '0px').map(n => n.style.borderTopStyle);
    assert.deepEqual(styles, ['solid', 'solid', 'solid', 'dashed', 'dotted'], 'lines are borders, dashed and dotted too');
    const drawn = items(skia, KIND.View).filter(n => n.style.borderTop > 0 || n.style.borderLeft > 0);
    assert.deepEqual(drawn.map(n => [n.style.borderTop || n.style.borderLeft, n.style.borderStyle]), [[1, 0], [2, 0], [2, 0], [1, 1], [3, 2], [1, 0]], 'on Skia: solid, dashed (1), dotted (2); the vertical one on its left');
    dispose();
  });

  it('FocusTrap: focus moves in when active and Tab stays inside', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const actives = [];
    const view = () => {
      const on = $signal($active(), false);
      actives.push(on);
      return (
        <Clock value={clock}>
          <Rui>
            <Button>before</Button>
            <FocusTrap active={on}>
              <Button>A</Button>
              <Button>B</Button>
            </FocusTrap>
            <Button>after</Button>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'before A B after');
    assert.equal(skia.text(), 'before A B after');
    const focusedSkia = () => skia.skia.focused?.text;
    const tabSkia = () => (skia.skia.key('Tab'), $flush(skia.root));
    for (const a of actives) $write(a, true);
    flush(dom, skia);
    clock.advance(16);
    assert.equal(focusedSkia(), 'A', 'Skia: its first focusable takes the focus ($focus)');
    assert.equal(dom.document.activeElement.textContent, 'A', 'DOM: the same');
    assert.equal(dom.nodes('Action').length, 4, 'no hidden stop');
    tabSkia();
    assert.equal(focusedSkia(), 'B');
    tabSkia();
    assert.equal(focusedSkia(), 'A', 'from the last back to the first, not out');
    const b = dom.nodes('Action').find(n => n.textContent === 'B');
    b.focus();
    b.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(dom.document.activeElement.textContent, 'A', 'DOM: Tab from the last wraps to the first');
    for (const a of actives) $write(a, false);
    flush(dom, skia);
    tabSkia();
    assert.equal(focusedSkia(), 'B', 'inactive: Tab goes on');
    tabSkia();
    assert.equal(focusedSkia(), 'after');
    for (const a of actives) $write(a, true);
    flush(dom, skia);
    clock.advance(16);
    assert.deepEqual([dom.document.activeElement.textContent, focusedSkia()], ['A', 'A'], 'active again: the first again');
    dispose();
  });

  it('VisuallyHidden: out of sight, still in the view', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Text>shown</Text>
        <VisuallyHidden>
          <Text>for readers</Text>
        </VisuallyHidden>
      </Rui>
    ));
    assert.equal(dom.text(), 'shown for readers');
    const hidden = dom.nodes('View').find(n => n.style.position === 'absolute');
    assert.equal(hidden.style.width, '1px');
    assert.equal(hidden.style.overflow, 'hidden');
    assert.match(skia.text(), /^shown/);
    dispose();
  });

  it('VisuallyHidden: its text keeps to one line (nowrap)', () => {
    const words = 'read by screen readers only';
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Stack p="xl">
          <Text>{words}</Text>
          <VisuallyHidden>
            <Text>{words}</Text>
          </VisuallyHidden>
        </Stack>
      </Rui>
    ));
    const [shown, hidden] = dom.nodes('Label');
    assert.equal(hidden.style.whiteSpace, 'pre', 'no wrap in the 1 px box');
    assert.equal(shown.style.whiteSpace, 'pre-wrap', 'a paragraph outside wraps as ever');
    // One row painted for the hidden text on Skia, not a row per letter.
    const rows = skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'text');
    assert.equal(rows.filter((/** @type {any[]} */ c) => c[1] === words).length, 2, 'the hidden text in one line, and the shown');
    dispose();
  });

  it('Collapse: opens to its height and closes, frame by frame, the same on both', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const opens = [];
    /** @type {string[]} */
    const ends = [];
    const view = () => {
      const open = $signal($active(), false);
      opens.push(open);
      return (
        <Clock value={clock}>
          <Rui>
            <Button onPress={() => $write(open, !$read(open))}>Toggle</Button>
            <Collapse open={open} duration={100} onEntered={() => ends.push('open')} onExited={() => ends.push('closed')}>
              <Text>one</Text>
              <Text>two</Text>
            </Collapse>
            <Text>after</Text>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    boxes(dom);
    assert.equal(dom.text(), 'Toggle after', 'closed: hidden');
    assert.equal(skia.text(), 'Toggle after');
    dom.press('Toggle');
    skia.press('Toggle');
    assert.deepEqual(opens.map(o => $read(o)), [true, true]);
    clock.advance(16); // measured
    clock.advance(48); // half way
    flush(dom, skia);
    const outer = dom.nodes('View').find(n => n.style.overflow === 'hidden');
    assert.ok(outer !== undefined, 'clipped while it moves');
    const h = parseFloat(outer.style.height);
    assert.ok(h > 0 && h < 40, `between closed and open on the DOM: ${h}`);
    clock.advance(100);
    assert.equal(dom.text(), 'Toggle one two after');
    assert.equal(skia.text(), 'Toggle one two after');
    assert.deepEqual(ends, ['open', 'open']);
    assert.equal(dom.nodes('View').find(n => n.style.overflow === 'hidden'), undefined, 'open: its natural height');
    dom.press('Toggle');
    skia.press('Toggle');
    clock.advance(200);
    assert.equal(dom.text(), 'Toggle after');
    assert.equal(skia.text(), 'Toggle after');
    assert.deepEqual(ends, ['open', 'open', 'closed', 'closed']);
    dispose();
    assert.equal(clock.pending(), 0);
  });

  it('Collapse: opened and closed before the next frame stays closed, the same on both', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const opens = [];
    const view = () => {
      const open = $signal($active(), false);
      opens.push(open);
      return (
        <Clock value={clock}>
          <Rui>
            <Collapse open={open} duration={100}>
              <Text>inside</Text>
            </Collapse>
            <Text>after</Text>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    for (const open of opens) $write(open, true);
    for (const open of opens) $write(open, false);
    clock.advance(16);
    clock.advance(300);
    flush(dom, skia);
    assert.equal(dom.text(), 'after', 'the DOM: closed');
    assert.equal(skia.text(), 'after', 'Skia: closed');
    dispose();
    assert.equal(clock.pending(), 0);
  });

  it('Transition: mounts, fades in, fades out and unmounts, with its callbacks', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const mounted = [];
    /** @type {string[]} */
    const events = [];
    const view = () => {
      const on = $signal($active(), false);
      mounted.push(on);
      return (
        <Clock value={clock}>
          <Rui>
            <Text>top</Text>
            <Transition
              shown={on}
              effect="rise"
              duration={100}
              exit={50}
              onEnter={() => events.push('enter')}
              onEntered={() => events.push('entered')}
              onExit={() => events.push('exit')}
              onExited={() => events.push('exited')}
            >
              {(/** @type {() => any} */ style) => <Text style={style}>panel</Text>}
            </Transition>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'top');
    assert.equal(skia.text(), 'top');
    for (const m of mounted) $write(m, true);
    flush(dom, skia);
    assert.equal(dom.text(), 'top panel');
    assert.equal(skia.text(), 'top panel');
    clock.advance(48);
    const label = dom.nodes('Label').find(n => n.textContent === 'panel');
    const opacity = Number(label.style.opacity);
    assert.ok(opacity > 0 && opacity < 1, `half faded in: ${opacity}`);
    assert.ok(parseFloat(label.style.translate.split(' ')[1]) > 0, `below its place while it rises, by a transform: ${label.style.translate}`);
    clock.advance(100);
    assert.equal(label.style.opacity, '', 'in: no style of its own');
    assert.deepEqual(events, ['enter', 'enter', 'entered', 'entered']);
    for (const m of mounted) $write(m, false);
    flush(dom, skia);
    assert.equal(dom.text(), 'top panel', 'still there while it leaves');
    clock.advance(64);
    assert.equal(dom.text(), 'top');
    assert.equal(skia.text(), 'top');
    assert.deepEqual(events.slice(4), ['exit', 'exit', 'exited', 'exited']);
    dispose();
  });

  it('Transition: rises, sinks, moves in from a side, grows and slides by the style\'s transforms', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const mounted = [];
    const presets = ['rise', 'sink', 'from-start', 'from-end', 'grow', 'slide-top', 'slide-bottom', 'slide-start', 'slide-end'];
    assert.deepEqual(Object.keys(EFFECTS).sort(), ['fade', ...presets].sort(), 'the set, and nothing more');
    const view = () => {
      const on = $signal($active(), false);
      mounted.push(on);
      return (
        <Clock value={clock}>
          <Rui>
            <Stack align="start">
              {presets.map(t => (
                <Transition shown={on} effect={t} duration={100}>
                  {(/** @type {() => any} */ style) => <Text style={style}>{t}</Text>}
                </Transition>
              ))}
            </Stack>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    for (const m of mounted) $write(m, true);
    flush(dom, skia);
    clock.advance(48);
    const label = (/** @type {string} */ t) => dom.nodes('Label').find(n => n.textContent === t);
    const drawn = (/** @type {string} */ t) => items(skia, KIND.Label).find(n => n.text === t).style;
    /** The DOM's translate as [x, y] strings. @param {string} t */
    const moved = t => label(t).style.translate.split(' ');
    // Short moves: within spacing xs (8 px), from the side each enters from.
    const px = (/** @type {string} */ v) => parseFloat(v);
    assert.ok(px(moved('rise')[1]) > 0 && px(moved('rise')[1]) < 8, `rise: from below: ${label('rise').style.translate}`);
    assert.ok(drawn('rise').translateY > 0);
    assert.ok(px(moved('sink')[1]) < 0 && px(moved('sink')[1]) > -8, `sink: from above: ${label('sink').style.translate}`);
    assert.ok(drawn('sink').translateY < 0);
    assert.ok(px(moved('from-start')[0]) < 0 && px(moved('from-start')[0]) > -8, 'from-start: from the start side');
    assert.ok(drawn('from-start').translateX < 0);
    assert.ok(px(moved('from-end')[0]) > 0 && px(moved('from-end')[0]) < 8, 'from-end: from the end side');
    assert.ok(drawn('from-end').translateX > 0);
    assert.equal(label('rise').style.top, '', 'not an offset');
    // Each origin is the side it enters from, or the center.
    assert.equal(label('rise').style.transformOrigin, '50% 100%');
    assert.equal(label('sink').style.transformOrigin, '50% 0%');
    assert.equal(label('from-start').style.transformOrigin, '0% 50%');
    assert.equal(label('from-end').style.transformOrigin, '100% 50%');
    assert.equal(label('grow').style.transformOrigin, '', 'grow: about its center');
    const [gx, gy] = label('grow').style.scale.split(' ').map(Number);
    assert.ok(gx === gy && gx > EFFECTS.grow.scale && gx < 1, `grow: from smaller: ${label('grow').style.scale}`);
    assert.ok(drawn('grow').scaleX > 0 && drawn('grow').scaleX < 1, 'grows on Skia too');
    // Slides: by a percent of its own size, from that edge.
    assert.match(label('slide-top').style.translate, /^0px -\d+(\.\d+)?%$/);
    assert.match(label('slide-bottom').style.translate, /^0px \d+(\.\d+)?%$/);
    assert.match(label('slide-start').style.translate, /^-\d+(\.\d+)?% 0px$/);
    assert.match(label('slide-end').style.translate, /^\d+(\.\d+)?% 0px$/);
    assert.equal(typeof drawn('slide-top').translateY, 'string');
    // A slide's origin is the side it travels toward; its fade waits ratios.mark of the way.
    assert.equal(label('slide-start').style.transformOrigin, '100% 50%');
    assert.equal(label('slide-top').style.transformOrigin, '50% 100%');
    assert.ok(Number(label('slide-end').style.opacity) < Number(label('from-end').style.opacity), 'the slide shows later than a short move');
    clock.advance(100);
    for (const t of presets) {
      assert.equal(label(t).style.scale, '', `${t} in: no transform`);
      assert.equal(label(t).style.translate, '', `${t} in: in place`);
      assert.ok(Number.isNaN(drawn(t).scaleX));
    }
    dispose();
  });

  it('Transition: a move by a spacing step follows the theme in effect', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const on = [];
    const wrap = () => {
      const v = $signal($active(), false);
      on.push(v);
      return (
        <Clock value={clock}>
          <Rui theme={themeOf({ spacing: { xs: 40 } })}>
            <Transition shown={v} effect="rise" duration={100}>
              {(/** @type {() => any} */ style) => <Text style={style}>far</Text>}
            </Transition>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(wrap);
    for (const v of on) $write(v, true);
    flush(dom, skia);
    clock.advance(10);
    const y = parseFloat(dom.nodes('Label').find(n => n.textContent === 'far').style.translate.split(' ')[1]);
    assert.ok(y > 8 && y <= 40, `from the theme's xs (40 px) below: ${y}`);
    assert.ok(items(skia, KIND.Label).find(n => n.text === 'far').style.translateY > 8);
    dispose();
  });

  it('ScrollBox: scrolls its content and reports the position', () => {
    /** @type {any[]} */
    const viewports = [];
    /** @type {number[]} */
    const seen = [];
    const view = () => {
      const ref = $signal($active(), null);
      viewports.push(ref);
      return (
        <Rui>
          <ScrollBox h={60} ref={ref} onScroll={(/** @type {any} */ p) => seen.push(p.y)}>
            {Array.from({ length: 10 }, (_, i) => (
              <Text>{`row ${i}`}</Text>
            ))}
          </ScrollBox>
          <ScrollBox.Fit maxHeight={200}>
            <Text>short</Text>
          </ScrollBox.Fit>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.match(dom.text(), /^row 0 row 1 .* row 9 short$/);
    assert.match(skia.text(), /^row 0 row 1 .* short$/);
    const d = $read(viewports[0]);
    const s = $read(viewports[1]);
    assert.equal(d.getAttribute('data-ren'), 'Scroll');
    assert.equal(d.style.height, '60px');
    s.scrollTop = 30;
    $flush(skia.root);
    assert.equal(seen.at(-1), 30, 'Skia: the position');
    d.scrollTop = 30;
    d.dispatchEvent(new dom.window.Event('scroll'));
    $flush(dom.root);
    assert.equal(seen.at(-1), 30, 'DOM: the position');
    dispose();
  });

  it('ScrollBox onEnd: asks at the end, again after a page that did not fill it, and stops when there is nothing to read (Skia)', async () => {
    const clock = manualClock();
    /** @type {number[]} */
    const asked = [];
    /** @type {any} */
    let box = null;
    let left = 2;
    const view = () => {
      const R = $active();
      const rows = $signal(R, 1);
      // a page of one row first (the box still not full), then one of five; then nothing left to read
      const onEnd = () => {
        asked.push($untrack(R, () => $read(rows)));
        if (left === 0) return undefined;
        const page = left-- === 2 ? 1 : 5;
        return Promise.resolve().then(() => $write(rows, $untrack(R, () => $read(rows)) + page));
      };
      return (
        <Clock value={clock}>
          <Rui>
            <ScrollBox h={100} ref={(/** @type {any} */ n) => (box = n)} onEnd={onEnd} endGap={10}>
              {() => Array.from({ length: $read(rows) }, (_, i) => <View style={{ height: 40 }}><Text>{`row ${i}`}</Text></View>)}
            </ScrollBox>
          </Rui>
        </Clock>
      );
    };
    const skia = onSkia(view);
    const frame = async () => {
      await new Promise(done => setTimeout(done, 0)); // timer: turn, the pages' promises settle between jobs
      $flush(skia.root);
      skia.text();
      clock.advance(16);
      $flush(skia.root);
      skia.text();
    };
    for (let i = 0; i < 6; i++) await frame();
    // one row: the end shows, so a page; two rows still leave room, so another; seven fill the box
    assert.deepEqual(asked, [1, 2]);
    box.scrollTop = box.scrollHeight - box.clientHeight;
    $flush(skia.root);
    for (let i = 0; i < 4; i++) await frame();
    // scrolled to the end: asked once more, and nothing returned stops the asking
    assert.deepEqual(asked, [1, 2, 7]);
    box.scrollTop = 0;
    $flush(skia.root);
    for (let i = 0; i < 3; i++) await frame();
    assert.deepEqual(asked, [1, 2, 7], 'away from the end, nothing is asked');
    skia.dispose();
  });

  it('ScrollBox bars: the theme\'s bar in the page\'s border on its track, thin, none, or colors of their own', () => {
    const page = pageColors(BASE_THEME, 'light');
    const view = () => (
      <Rui>
        {[true, { thin: true }, false, { color: 'teal', track: 'teal.1' }].map(bars => (
          <ScrollBox h={40} bars={bars}>
            {Array.from({ length: 6 }, (_, i) => (
              <Text>{`row ${i}`}</Text>
            ))}
          </ScrollBox>
        ))}
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    dom.text();
    const css = dom.nodes('Scroll').map((/** @type {any} */ n) => ['--ren-bars', '--ren-bar-size', '--ren-thumb', '--ren-track'].map(k => n.style.getPropertyValue(k)));
    const [plain, thin, none, own] = css;
    assert.equal(plain[0], '', 'the DOM: the theme\'s bar');
    assert.deepEqual(thin.slice(0, 2), ['thin', 'calc(var(--ren-bar) / 2)'], 'half of it');
    assert.deepEqual(none.slice(0, 2), ['none', '0px'], 'none, no room kept');
    assert.ok(plain[2] !== '' && plain[3] !== '' && plain[2] !== plain[3], 'thumb and track colored by the theme');
    assert.deepEqual(thin.slice(2), plain.slice(2), 'thin keeps the colors');
    assert.ok(own[2] !== plain[2] && own[3] !== plain[3], 'colors of their own');
    const scrolls = items(skia, KIND.Scroll);
    assert.equal(scrolls.length, 4);
    const [a, b, c, d] = scrolls.map((/** @type {any} */ i) => i.r);
    assert.ok(a.bar > 0, `Skia: the theme's bar (${a.bar})`);
    assert.equal(b.bar, a.bar / 2, 'thin: half');
    assert.equal(c.bar, 0, 'none');
    assert.deepEqual([b.thumb, b.track], [a.thumb, a.track]);
    assert.ok(a.thumb !== -1 && a.track !== -1 && a.thumb !== a.track, 'colored by the theme');
    assert.ok(d.thumb !== a.thumb && d.track !== a.track, 'colors of their own');
    // The theme's roles: the page's border on its track; the colors given where given.
    const argb = (/** @type {string} */ hex) => (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0;
    assert.deepEqual([a.thumb >>> 0, a.track >>> 0], [argb(page.border), argb(page.track)]);
    assert.deepEqual([d.thumb >>> 0, d.track >>> 0], [argb(colorOf(BASE_THEME, 'light', 'teal')), argb(colorOf(BASE_THEME, 'light', 'teal.1'))]);
    assert.match(skia.text(), /^row 0/, 'it still scrolls its content');
    dispose();
  });

  it('ScrollBox tabIndex -1: focused from code (a skip link\'s target), out of the Tab order (DOM and Skia)', async () => {
    const { focusables } = await import('ren-core/host');
    /** @type {any[]} */
    const refs = [];
    const view = () => (
      <Rui>
        <Button>Before</Button>
        <ScrollBox h={40} tabIndex={-1} ref={(/** @type {any} */ n) => refs.push(n)}>
          <Text>content</Text>
        </ScrollBox>
        <Button>After</Button>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const [d, s] = refs;
    assert.equal(d.getAttribute('tabindex'), '-1');
    assert.deepEqual(focusables(dom.host).map((/** @type {any} */ n) => n.textContent), ['Before', 'After'], 'the DOM: out of the Tab order');
    d.focus();
    assert.equal(dom.document.activeElement, d, 'the DOM: focused from code');
    skia.text();
    assert.equal(s.tabIndex, -1);
    s.focus();
    $flush(skia.root);
    assert.equal(skia.skia.focused, s, 'Skia: focused from code');
    skia.skia.key('Tab');
    $flush(skia.root);
    assert.equal(skia.skia.focused?.text, 'After', 'Skia: Tab goes on from its place');
    skia.press('Before');
    skia.skia.key('Tab');
    $flush(skia.root);
    assert.equal(skia.skia.focused?.text, 'After', 'Skia: Tab passes it by');
    dispose();
  });

  it('ScrollBox: onScroll reports the offset across on an x axis', () => {
    /** @type {any[]} */
    const viewports = [];
    /** @type {{ x: number, y: number }[]} */
    const seen = [];
    const view = () => {
      const ref = $signal($active(), null);
      viewports.push(ref);
      return (
        <Rui>
          <ScrollBox axis="x" w={100} h={40} ref={ref} onScroll={(/** @type {any} */ p) => seen.push(p)}>
            <Row w={400} style={{ shrink: 0 }}>
              <Text>wide</Text>
            </Row>
          </ScrollBox>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const d = $read(viewports[0]);
    const s = $read(viewports[1]);
    s.scrollLeft = 25;
    $flush(skia.root);
    assert.deepEqual(seen.at(-1), { x: 25, y: 0 }, 'Skia: across, not 0');
    d.scrollLeft = 40;
    d.dispatchEvent(new dom.window.Event('scroll'));
    $flush(dom.root);
    assert.deepEqual(seen.at(-1), { x: 40, y: 0 }, 'DOM: across, not 0');
    dispose();
  });

  it('ScrollRow with bars false draws no bar and keeps no room for one; by default the renderer\'s bar stays', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <ScrollRow w={300} bars={false}>
          <Text>none</Text>
        </ScrollRow>
        <ScrollRow w={300}>
          <Text>default</Text>
        </ScrollRow>
      </Rui>
    ));
    const [none, plain] = dom.nodes('Scroll');
    assert.equal(none.style.getPropertyValue('--ren-bars'), 'none', 'no bar drawn');
    assert.equal(none.style.getPropertyValue('--ren-bar-size'), '0px', 'and no room for it');
    assert.equal(plain.style.getPropertyValue('--ren-bars'), '', 'the renderer\'s bar by default');
    dispose();
  });

  it('ScrollRow: a Scroll along x; controls while there is more, a press scrolls by step (by default the visible width times ratios.pad)', () => {
    for (const [step, by] of /** @type {[number | undefined, number][]} */ ([[100, 100], [undefined, 300 * BASE_THEME.ratios.pad]])) {
      const clock = manualClock();
      /** @type {any[]} */
      const strips = [];
      const view = () => (
        <Clock value={clock}>
          <Rui>
            <ScrollRow w={300} step={step} buttonSize="lg">
              {Array.from({ length: 12 }, (_, i) => (
                <Text mr={20} style={{ wrap: false }}>{`item ${i}`}</Text>
              ))}
            </ScrollRow>
          </Rui>
        </Clock>
      );
      const { dom, skia, dispose } = both(view);
      // happy-dom lays nothing out: the Scroll is 300 px wide, its content 8 px a character.
      const proto = dom.window.HTMLElement.prototype;
      const scroll = (/** @type {any} */ n) => n.getAttribute('data-ren') === 'Scroll';
      Object.defineProperty(proto, 'scrollWidth', { configurable: true, get() { return scroll(this) ? this.textContent.length * 8 : 0; } });
      Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return scroll(this) ? 300 : 0; } });
      const rect = proto.getBoundingClientRect;
      proto.getBoundingClientRect = function () {
        const w = scroll(this) ? 300 : this.textContent.length * 8;
        return { x: 0, y: 0, left: 0, top: 0, width: w, height: 20, right: w, bottom: 20 };
      };
      // Measured by the strip's and its content's onResize: a frame of the clock measures nothing.
      clock.advance(16);
      flush(dom, skia);
      assert.equal(dom.nodes('View').filter(n => /Scroll (back|forward)/.test(n.getAttribute('aria-label') ?? '')).length, 0, 'not reported yet: no controls');
      dom.report();
      flush(dom, skia);
      const strip = dom.nodes('Scroll')[0];
      assert.equal(strip.style.overflowX, 'auto', 'the DOM scrolls it across');
      // as high as its row (20 px here, no bar's room), never the theme's region
      assert.equal(strip.style.height, '20px', 'the DOM strip is as high as its row');
      assert.equal(strip.firstElementChild.style.minWidth, '100%', 'its row at least as wide as the strip');
      const across = items(skia, KIND.Scroll)[0];
      assert.equal(across.axis, 1, 'a Scroll along x on Skia');
      const high = across.getBoundingClientRect().height;
      const line = across.first.getBoundingClientRect().height;
      assert.ok(high >= line && high < line + 40, `Skia: the strip (${high}) as high as its row (${line}) and its bar`);
      const controls = () => dom.nodes('View').filter(n => /Scroll (back|forward)/.test(n.getAttribute('aria-label') ?? '')).map(n => n.getAttribute('aria-label'));
      assert.deepEqual(controls(), ['Scroll forward'], 'at the start: forward only');
      const forward = dom.nodes('View').find(n => n.getAttribute('aria-label') === 'Scroll forward');
      assert.equal(forward.style.width, '36px', 'buttonSize lg');
      assert.equal(parseFloat(forward.firstElementChild.style.width), 36 * BASE_THEME.ratios.icon, 'its chevron: ratios.icon of the control');
      forward.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      skia.skia.present();
      skia.skia.press(290, 10);
      skia.skia.release(290, 10);
      clock.advance(300);
      flush(dom, skia);
      assert.deepEqual(controls(), ['Scroll back', 'Scroll forward']);
      assert.equal(strip.scrollLeft, by, `the DOM scrolled by ${by}`);
      assert.equal(across.scrollLeft, by, 'Skia too');
      const x = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'item 2');
      assert.ok(x[2] < 150, `Skia moved the strip left: item 2 at ${x[2]}`);
      delete proto.scrollWidth;
      delete proto.clientWidth;
      proto.getBoundingClientRect = rect;
      dispose();
    }
  });

  it('Marquee: its content moves on the clock and loops', () => {
    const clock = manualClock();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Marquee w={300} duration={1000} fade>
            <Text>news</Text>
            <Text>more news</Text>
          </Marquee>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view, { width: 600 });
    boxes(dom);
    assert.equal(dom.text(), 'news more news news more news');
    assert.equal(skia.text(), 'news more news news more news');
    const inert = dom.nodes('View').filter(n => n.hasAttribute?.('inert') && /news/.test(n.textContent));
    assert.equal(inert.length, 1, 'the repeated copy is inert; the first is not');
    const at = () => skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'news')[2];
    skia.text();
    const x0 = at();
    clock.advance(160);
    skia.text();
    const x1 = at();
    assert.ok(x1 < x0, `Skia: moved left from ${x0} to ${x1}`);
    const track = dom.nodes('View').find(n => n.style.left !== '');
    assert.ok(parseFloat(track.style.left) < 0, 'DOM: moved left');
    clock.advance(10000);
    skia.text();
    assert.ok(at() <= x0 && at() > x0 - 200, 'loops within one copy');
    const fades = dom.nodes('View').filter(n => /linear-gradient/.test(n.style.background));
    assert.equal(fades.length, 2, 'fading edges: two gradients');
    assert.match(fades[0].style.background, /^linear-gradient\(90deg, #ffffff 0%, #ffffff4d 50%, #ffffff00 100%\)/, 'the page ground through alpha: solid, opacity.soft half way, clear');
    assert.match(fades[1].style.background, /^linear-gradient\(270deg/);
    assert.equal(fades[0].style.width, `${BASE_THEME.spacing.xl}px`, 'fadeSize xl');
    assert.deepEqual(items(skia, KIND.View).filter(n => n.style.background?.angle !== undefined).map(n => [n.style.background.angle, n.style.pointerEvents]), [[90, 0], [270, 0]], 'on Skia, letting the pointer through');
    dispose();
    assert.equal(clock.pending(), 0);
  });

  it('Marquee loops at its copy\'s new length when its content grows (Skia)', () => {
    const clock = manualClock();
    /** @type {any} */
    let text = null;
    const skia = onSkia(
      () => {
        text = $signal($active(), 'news');
        return (
          <Clock value={clock}>
            <Rui>
              <Marquee w={300} duration={1000} gap={0}>
                <Text>{() => $read(text)}</Text>
              </Marquee>
            </Rui>
          </Clock>
        );
      },
      { width: 600 },
    );
    /** The first copy's text: its x and its width. */
    const first = () => {
      skia.text();
      const label = items(skia, KIND.Label).find((/** @type {any} */ i) => i.caption === $read(text));
      const r = label.parent.getBoundingClientRect();
      return { x: r.x, width: r.width };
    };
    clock.advance(32);
    const small = first().width;
    $write(text, 'news and a good deal more of it');
    $flush(skia.root);
    clock.advance(16);
    const grown = first();
    assert.ok(grown.width > small * 2, `grown: ${small} to ${grown.width}`);
    // Over one loop the strip travels one copy: the new, longer one, not the old.
    let least = Infinity;
    for (let t = 0; t < 1000; t += 20) {
      clock.advance(20);
      least = Math.min(least, first().x);
    }
    assert.ok(least < -small - 1, `travels past the old length ${small}: to ${least}`);
    assert.ok(least > -grown.width - 1, `and loops within the new one ${grown.width}: ${least}`);
    skia.dispose();
  });

  it('Grid: spans, offsets, order and gaps in 12 columns', () => {
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <Grid w={480} gap={0}>
            <Grid.Col span={6}>
              <Text>half</Text>
            </Grid.Col>
            <Grid.Col span={3} offset={3}>
              <Text>quarter</Text>
            </Grid.Col>
            <Grid.Col span={4} order={2}>
              <Text>last</Text>
            </Grid.Col>
            <Grid.Col span={4} order={1}>
              <Text>first</Text>
            </Grid.Col>
          </Grid>
        </Rui>
      ),
      { width: 480 },
    );
    assert.equal(dom.text(), 'half quarter first last', 'order sorts the columns');
    assert.equal(skia.text(), 'half quarter first last');
    const at = (/** @type {string} */ t) => skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === t);
    assert.equal(at('half')[2], 0);
    assert.equal(Math.round(at('quarter')[2]), 360, 'offset 3 after span 6: at 9 of 12 columns');
    assert.equal(at('first')[3] > at('half')[3], true, 'the next row');
    assert.equal(Math.round(at('last')[2]), 160, 'span 4 after span 4');
    const widths = dom.nodes('View').map((/** @type {any} */ n) => n.style.width).filter((/** @type {string} */ w) => w.endsWith('%'));
    assert.deepEqual(widths, ['50%', '25%', '25%', '33.3333%', '33.3333%']);
    dispose();
  });

  it('Grid fill: a row\'s columns share out what their spans leave', () => {
    const { skia, dispose } = both(
      () => (
        <Rui>
          <Grid w={600} gap={0} fill>
            <Grid.Col span={4}>
              <Text>one</Text>
            </Grid.Col>
            <Grid.Col span={4}>
              <Text>two</Text>
            </Grid.Col>
          </Grid>
        </Rui>
      ),
      { width: 700 },
    );
    skia.text();
    const at = (/** @type {string} */ t) => skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === t);
    assert.ok(Math.abs(at('two')[2] - at('one')[2] - 300) < 1, `two spans of 4 fill the row in halves: ${at('two')[2] - at('one')[2]}`);
    dispose();
  });

  it('Grid: span 8 and span 4 share a 664 px row, as in Chrome', () => {
    // Chrome keeps span 8 and span 4 on one row of a 664 px grid; Skia does
    // too: ren-canv's layout takes the percents as they are, so their 32-bit
    // sum never comes past the row and wraps.
    const { skia, dispose } = both(
      () => (
        <Rui>
          <Grid w={664} gap={0}>
            <Grid.Col span={8}>
              <Text>eight</Text>
            </Grid.Col>
            <Grid.Col span={4}>
              <Text>four</Text>
            </Grid.Col>
          </Grid>
        </Rui>
      ),
      { width: 700 },
    );
    skia.text();
    const at = (/** @type {string} */ t) => skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === t);
    assert.equal(at('four')[3], at('eight')[3], 'one row');
    assert.ok(Math.abs(at('four')[2] - 442.66) < 0.02, 'span 4 starts two thirds across');
    dispose();
  });

  it('AspectRatio: its height follows its width, through resizes', () => {
    /** @type {any[]} */
    const widths = [];
    /** @type {any[]} */
    const refs = [];
    const view = () => {
      const w = $signal($active(), 320);
      widths.push(w);
      return (
        <Rui>
          <AspectRatio ref={(/** @type {any} */ n) => refs.push(n)} ratio={16 / 9} w={w}>
            <Text>video</Text>
          </AspectRatio>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view, { width: 480 });
    assert.equal(dom.text(), 'video');
    assert.equal(skia.text(), 'video');
    assert.match(refs[0].getAttribute('style'), /aspect-ratio: 1\.77/, 'the DOM\'s aspect-ratio');
    assert.equal(Math.round(refs[1].getBoundingClientRect().height), 180);
    for (const w of widths) $write(w, 160);
    flush(dom, skia);
    assert.equal(Math.round(refs[1].getBoundingClientRect().height), 90, 'no measuring: the layout keeps the ratio');
    dispose();
  });

  it('Shell: header, nav, main, side and footer in place; the nav collapses', () => {
    /** @type {any[]} */
    const opens = [];
    const view = () => {
      const open = $signal($active(), true);
      opens.push(open);
      return (
        <Rui>
          <Shell h={300} header={50} footer={30} nav={120} side={80} hide={() => ({ nav: !$read(open) })} padding="md">
            <Shell.Header>
              <Text>header</Text>
            </Shell.Header>
            <Shell.Nav>
              <Shell.Section fill>
                <Text>nav</Text>
              </Shell.Section>
            </Shell.Nav>
            <Shell.Main>
              <Button onPress={() => $write(open, !$read(open))}>main</Button>
            </Shell.Main>
            <Shell.Side>
              <Text>aside</Text>
            </Shell.Side>
            <Shell.Footer>
              <Text>footer</Text>
            </Shell.Footer>
          </Shell>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    assert.equal(dom.text(), 'header nav main aside footer');
    assert.equal(skia.text(), 'header nav main aside footer');
    const at = (/** @type {string} */ t) => skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === t);
    assert.ok(at('header')[3] < 50, 'the header on top');
    assert.equal(at('nav')[2], 0, 'the nav at the start');
    assert.ok(at('main')[2] > 120, 'main past the nav');
    assert.ok(at('aside')[2] >= 400, 'the side at the end');
    assert.ok(at('footer')[3] > 270, 'the footer at the bottom');
    const grid = dom.nodes('View')[0];
    assert.equal(grid.style.gridTemplateColumns, '120px minmax(0, 1fr) 80px');
    const part = (/** @type {string} */ t) => dom.nodes('View').find((/** @type {any} */ n) => n.textContent === t && n.style.gridRow !== '');
    assert.deepEqual(
      [part('header').style.borderBottomWidth, part('nav').style.borderRightWidth, part('aside').style.borderLeftWidth, part('footer').style.borderTopWidth],
      ['1px', '1px', '1px', '1px'],
      'each part\'s inner edge a border',
    );
    const edges = items(skia, KIND.View).filter(n => [n.style.borderTop, n.style.borderRight, n.style.borderBottom, n.style.borderLeft].filter(w => w === 1).length === 1);
    assert.equal(edges.length, 4, 'the same four borders on Skia');
    const before = at('main')[2];
    dom.press('main');
    skia.press('main');
    assert.deepEqual(opens.map(o => $read(o)), [false, false]);
    assert.equal(dom.text(), 'header main aside footer');
    assert.equal(skia.text(), 'header main aside footer');
    assert.equal(grid.style.gridTemplateColumns, '0px minmax(0, 1fr) 80px');
    skia.text();
    skia.text();
    assert.ok(Math.abs(before - at('main')[2] - 60) < 1, `main takes the nav's place (centered, half its width left): ${before} → ${at('main')[2]}`);
    dispose();
  });

  it('reads responsive values at the theme\'s breakpoints, mobile first', () => {
    assert.deepEqual({ ...BASE_THEME.breakpoints }, { xs: '32em', sm: '44em', md: '60em', lg: '72em', xl: '90em' });
    assert.equal(breakpointOf(BASE_THEME, 'sm'), 704);
    assert.equal(breakpointOf(BASE_THEME, '40rem'), 640);
    assert.equal(breakpointOf(BASE_THEME, 500), 500);
    assert.equal(isResponsive({ base: 1, md: 3 }), true);
    assert.equal(isResponsive({ width: 1 }), false, 'a config, not a responsive value');
    const cols = { base: 1, sm: 2, lg: 4 };
    assert.deepEqual([0, 703, 704, 1151, 1152].map(w => atWidth(cols, BASE_THEME, w)), [1, 1, 2, 2, 4]);
    assert.equal(atWidth({ md: 3 }, BASE_THEME, 500), undefined, 'no base: the default below');
    assert.equal(atWidth(5, BASE_THEME, 0), 5);
  });

  it('Grid and Tiles take responsive spans, columns and gaps, and follow a resize', () => {
    const view = () => (
      <Rui>
        <Grid gap={{ base: 0, sm: 20 }}>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Text>left</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Text>right</Text>
          </Grid.Col>
        </Grid>
        <Tiles columns={{ base: 1, sm: 3 }} gap={{ base: 0, sm: 'md' }}>
          <Text>a</Text>
          <Text>b</Text>
          <Text>c</Text>
        </Tiles>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 400 });
    const x = (/** @type {string} */ t) => skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === t);
    const widths = () => dom.nodes('View').map((/** @type {any} */ n) => n.style.width).filter((/** @type {string} */ w) => w.endsWith('%'));
    const grid = () => dom.nodes('View').find((/** @type {any} */ n) => n.style.display === 'grid');
    assert.deepEqual(widths(), ['100%', '100%'], 'below sm: the base span');
    assert.equal(grid().style.gridTemplateColumns, 'repeat(1, minmax(0, 1fr))');
    skia.text();
    assert.ok(x('right')[3] > x('left')[3] && x('right')[2] === x('left')[2], 'Skia: a column each row');
    assert.ok(x('b')[3] > x('a')[3], 'one column');
    dom.resize(900, 400);
    skia.resize(900, 400);
    assert.deepEqual(widths(), ['50%', '50%'], 'from sm: half each');
    assert.equal(grid().style.gridTemplateColumns, 'repeat(3, minmax(0, 1fr))');
    assert.equal(grid().style.columnGap, '16px');
    skia.text();
    assert.equal(x('right')[3], x('left')[3], 'Skia: side by side');
    assert.equal(Math.round(x('right')[2]), 460, 'Skia: past half the 900 px row and its 20 px gap');
    assert.equal(x('b')[3], x('a')[3], 'three columns');
    assert.equal(Math.round(x('b')[2]), Math.round((900 - 32) / 3 + 16), 'an md gap between them');
    dispose();
  });

  it('Shell: below its breakpoint the nav lies over main and collapses when narrow', () => {
    /** @type {any[]} */
    const opens = [];
    const view = () => {
      const open = $signal($active(), false);
      opens.push(open);
      return (
        <Rui>
          <Shell h={300} header={50} nav={{ base: 120, lg: 200 }} fold="sm" hide={() => ({ nav: $read(open) ? false : 'narrow' })} padding="md">
            <Shell.Header>
              <Button onPress={() => $write(open, !$read(open))}>Menu</Button>
            </Shell.Header>
            <Shell.Nav>
              <Text>nav</Text>
            </Shell.Nav>
            <Shell.Main>
              <Text>main</Text>
            </Shell.Main>
          </Shell>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    const shell = () => dom.nodes('View')[0];
    const at = (/** @type {string} */ t) => (skia.text(), skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === t));
    assert.equal(dom.text(), 'Menu main', 'narrow and collapsed: no nav');
    assert.equal(skia.text(), 'Menu main');
    assert.equal(shell().style.gridTemplateColumns, '0px minmax(0, 1fr) 0px', 'no column when narrow');
    dom.press('Menu');
    skia.press('Menu');
    assert.deepEqual(opens.map(o => $read(o)), [true, true]);
    assert.equal(dom.text(), 'Menu nav main');
    assert.equal(shell().style.gridTemplateColumns, '0px minmax(0, 1fr) 0px', 'over main, not beside it');
    const nav = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'nav' && n.style.gridRow !== '');
    assert.equal(nav.style.gridColumn, '1 / 4', 'the whole width');
    assert.equal(at('nav')[2], 0);
    const box = items(skia, KIND.View).find(n => n.style.zIndex === LAYERS.raised);
    assert.equal(Math.round(box.getBoundingClientRect().width), 480, 'Skia: the whole width, over main');
    dom.resize(1300, 300);
    skia.resize(1300, 300);
    assert.equal(shell().style.gridTemplateColumns, '200px minmax(0, 1fr) 0px', 'wide from sm: its lg width');
    assert.equal(skia.text(), 'Menu nav main');
    assert.ok(at('main')[2] > 200, 'main beside the nav');
    dom.resize(900, 300);
    skia.resize(900, 300);
    assert.equal(shell().style.gridTemplateColumns, '120px minmax(0, 1fr) 0px', 'its base width below lg');
    dispose();
  });
});

describe('rui-core misc: rui\'s own motion and layout words', () => {
  it('EFFECTS move by a spacing step, grow by a type step; MOTION names three durations; LAYERS name the stack', async () => {
    const { MOTION } = await import('rui-core');
    assert.deepEqual({ ...MOTION }, { quick: 110, base: 190, calm: 300, hold: 1500 });
    assert.equal(Object.getPrototypeOf(MOTION), null, 'no prototype: a preset is an own key');
    assert.deepEqual(LAYERS, { raised: 10, sheet: 20, float: 30, tip: 35, toast: 40, top: 50 });
    assert.deepEqual([EFFECTS.rise.y, EFFECTS.sink.y, EFFECTS['from-start'].x, EFFECTS['from-end'].x], ['xs', '-xs', '-xs', 'xs']);
    assert.equal(EFFECTS.grow.scale, BASE_THEME.fontSizes.md / BASE_THEME.fontSizes.lg, 'one step down the type scale');
    assert.deepEqual([EFFECTS['slide-top'].h, EFFECTS['slide-bottom'].h, EFFECTS['slide-start'].w, EFFECTS['slide-end'].w], [-1, 1, -1, 1]);
    assert.deepEqual(['slide-top', 'slide-bottom', 'slide-start', 'slide-end'].map(k => EFFECTS[k].lag), Array(4).fill(BASE_THEME.ratios.mark), 'a slide shows ratios.mark of the way in');
  });

  it('transitionStyle: a lag holds the fade back for its share of the way', async () => {
    const { transitionStyle } = await import('../src/core/misc/collapse.jsx');
    const slide = EFFECTS['slide-end'];
    const lag = BASE_THEME.ratios.mark;
    assert.equal(transitionStyle(lag / 2, slide).opacity, 0, 'unseen for the lag');
    assert.ok(Math.abs(transitionStyle(lag + (1 - lag) / 2, slide).opacity - 0.5) < 1e-9, 'half shown half way past the lag');
    assert.equal(transitionStyle(0.5, EFFECTS.fade).opacity, 0.5, 'no lag: the fade follows the way');
    assert.equal(transitionStyle(0.5, slide).translate[0], '50%', 'the move by its own size');
  });

  it('Collapse moves its height only unless fade, over base (190 ms) with a preset name', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const opens = [];
    const view = () => {
      const open = $signal($active(), false);
      opens.push(open);
      return (
        <Clock value={clock}>
          <Rui>
            <Collapse open={open}>
              <Text>plain</Text>
            </Collapse>
            <Collapse open={open} fade duration="quick">
              <Text>faded</Text>
            </Collapse>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    boxes(dom);
    for (const o of opens) $write(o, true);
    flush(dom, skia);
    clock.advance(16);
    clock.advance(48);
    const moving = dom.nodes('View').filter(n => n.style.overflow === 'hidden');
    assert.equal(moving.length, 2);
    assert.equal(moving[0].style.opacity, '', 'no fade by default');
    assert.notEqual(moving[1].style.opacity, '', 'fade');
    clock.advance(80);
    assert.equal(dom.nodes('View').filter(n => n.style.overflow === 'hidden').length, 1, 'quick (110 ms) is done, base (190 ms) still moving');
    clock.advance(100);
    assert.equal(dom.text(), 'plain faded');
    dispose();
  });

  it('Row and Flex take wrap as a boolean (Row wraps by default, Flex not); alignment takes rui\'s words only', async () => {
    const { Flex, flexWord } = await import('rui-core');
    const dom = onDom(() => (
      <Rui>
        <Row><Text>row</Text></Row>
        <Row wrap={false}><Text>one row</Text></Row>
        <Flex><Text>flex</Text></Flex>
        <Flex wrap justify="between"><Text>wrapped</Text></Flex>
      </Rui>
    ));
    const wraps = ['row', 'one row', 'flex', 'wrapped'].map(t => dom.nodes('View').find((/** @type {any} */ n) => n.textContent === t && n.style.flexDirection === 'row').style.flexWrap);
    assert.deepEqual(wraps.map(w => w === 'wrap'), [true, false, false, true]);
    assert.deepEqual(['start', 'end', 'between', 'around', 'evenly', 'stretch', 'center'].map(flexWord), ['start', 'end', 'between', 'around', 'evenly', 'stretch', 'center']);
    assert.deepEqual(['flex-start', 'flex-end', 'space-between', 'space-around', 'left', 'normal', null].map(flexWord), Array(7).fill(undefined), 'CSS\'s words are not rui\'s');
    dom.dispose();
  });

  it('Row fill: each child takes an equal share', () => {
    const { skia, dispose } = both(() => (
      <Rui>
        <Row w={300} gap={0} fill>
          <Text>a</Text>
          <Text>bbbbbb</Text>
        </Row>
      </Rui>
    ), { width: 400 });
    skia.text();
    const at = (/** @type {string} */ t) => skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === t);
    assert.equal(Math.round(at('bbbbbb')[2]), 150, 'the second starts half way');
    dispose();
  });
});

describe('tweening, one owner (core/misc/tween.js)', () => {
  it('$tween moves on the Clock, ease-out unless a curve is named; $follow follows its goal; both stop with their owner', () => {
    const clock = manualClock();
    /** @type {any} */
    let t = null;
    /** @type {any} */
    let lin = null;
    /** @type {any} */
    let goal = null;
    /** @type {any} */
    let followed = null;
    const Probe = () => {
      t = $tween(0);
      lin = $tween(0, 'linear');
      goal = $signal($active(), 0);
      followed = $follow(() => $read(goal), 100);
      return null;
    };
    const dom = onDom(() => (
      <Clock value={clock}>
        <Probe />
      </Clock>
    ));
    const near = (/** @type {number} */ a, /** @type {number} */ b, /** @type {string} */ what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);
    let done = 0;
    t.to(100, 100, () => done++);
    lin.to(10, 100);
    clock.advance(48);
    // 48 of 100 ms: ease-out is 1 - 0.52³, linear 0.48.
    near($read(t.value), 100 * (1 - 0.52 ** 3), 'ease-out by default');
    near($read(lin.value), 4.8, 'the named curve');
    assert.equal(t.running(), true);
    clock.advance(64);
    assert.deepEqual([$read(t.value), $read(lin.value), t.running(), done], [100, 10, false, 1]);
    // A move of 0 ms lands at once; a move names its own curve over the tween's.
    t.to(0, 0);
    assert.equal($read(t.value), 0);
    t.to(100, 100, undefined, 'linear');
    clock.advance(48);
    near($read(t.value), 48, 'the move\'s own curve');
    // $follow: each new goal, from where it is, ease-out over its duration.
    $write(goal, 50);
    $flush(dom.root);
    clock.advance(48);
    near(followed(), 50 * (1 - 0.52 ** 3), 'following');
    clock.advance(64);
    assert.equal(followed(), 50);
    t.to(0, 100);
    $write(goal, 0);
    $flush(dom.root);
    dom.dispose();
    assert.equal(clock.pending(), 0, 'no frame left once the owner is gone');
  });
});

describe('the page roles gate', () => {
  it('no component outside src/theme names a gray or night shade: they read pageColors roles', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = fileURLToPath(new URL('../src/', import.meta.url));
    /** @type {string[]} */
    const hits = [];
    const walk = (/** @type {string} */ dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (path !== join(src, 'theme')) walk(path);
        } else if (/\.jsx?$/.test(entry.name)) {
          readFileSync(path, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              // A gray or night shade, or the bare names (a color="gray" is a raw neutral too).
              if (/colors\.(gray|night)\b|['"](gray|night)(\.\d)?['"]/.test(line)) hits.push(`${path.slice(src.length)}:${i + 1}`);
            });
        }
      }
    };
    walk(src);
    assert.deepEqual(hits, [], 'raw shades: use a pageColors role (or TINTS for a tinted ground)');
  });
});

describe('rui-core layout and motion defaults', () => {
  it('Shell: a 56 px header and a 280 px nav for true; Grid: an lg gap, span auto hugs its content', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Shell h={400} header nav>
          <Shell.Header><Text>top</Text></Shell.Header>
          <Shell.Nav><Text>nav</Text></Shell.Nav>
          <Shell.Main><Text>main</Text></Shell.Main>
        </Shell>
        <Grid>
          <Grid.Col span="auto"><Text>hug</Text></Grid.Col>
          <Grid.Col span={6}><Text>half</Text></Grid.Col>
        </Grid>
      </Rui>
    ), { width: 800, height: 600 });
    const shell = dom.nodes('View')[0];
    assert.equal(shell.style.gridTemplateColumns, '280px minmax(0, 1fr) 0px');
    assert.equal(shell.style.gridTemplateRows, '56px minmax(0, 1fr) 0px');
    const hug = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'hug' && n.style.padding !== '');
    assert.equal(hug.style.width, '', 'auto: no width of its own');
    assert.equal(hug.style.paddingLeft, '12px', 'half the lg gap');
    dispose();
  });

  it('Marquee: a control in its content is one Tab stop; its copies are inert (DOM and Skia)', async () => {
    const { focusables } = await import('ren-core/host');
    const clock = manualClock();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Button>Before</Button>
          <Marquee w={300} repeat={3}>
            <Button>Read</Button>
          </Marquee>
          <Button>After</Button>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view, { width: 600 });
    assert.equal(dom.text(), 'Before Read Read Read After', 'three copies shown');
    assert.deepEqual(focusables(dom.host).map((/** @type {any} */ n) => n.textContent), ['Before', 'Read', 'After'], 'the DOM: one Tab stop in the content');
    const copies = dom.nodes('View').filter((/** @type {any} */ n) => n.textContent === 'Read' && n.querySelector('[data-ren="View"]') === null);
    assert.deepEqual(copies.map((/** @type {any} */ n) => n.hasAttribute('inert')), [false, true, true], 'the first copy live, the others inert');
    skia.press('Before');
    /** @type {string[]} */
    const reached = [];
    for (let i = 0; i < 3; i++) {
      skia.skia.key('Tab');
      $flush(skia.root);
      reached.push(String(skia.skia.focused?.text));
    }
    assert.deepEqual(reached, ['Read', 'After', 'Before'], 'Skia: Tab reaches the content once, then goes on');
    const reads = items(skia, KIND.Action).filter((/** @type {any} */ n) => n.text === 'Read');
    assert.deepEqual(reads.map((/** @type {any} */ n) => n.r.inert), [false, true, true], 'Skia: the copies are inert');
    dispose();
  });

  it('Marquee: two copies lg apart and no fade by default', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Marquee w={300}>
          <Text>news</Text>
        </Marquee>
      </Rui>
    ));
    assert.equal(dom.text(), 'news news');
    assert.equal(dom.nodes('View').filter((/** @type {any} */ n) => /linear-gradient/.test(n.style.background)).length, 0);
    const track = dom.nodes('View').find((/** @type {any} */ n) => n.style.left !== '');
    assert.equal(track.style.columnGap || track.style.gap, `${BASE_THEME.spacing.lg}px`, 'the copies a spacing lg apart');
    dispose();
  });

  it('Marquee holds still while the user asks for reduced motion (WCAG 2.2.2), as Carousel does not play itself', async t => {
    const { Window } = await import('happy-dom');
    const { render: renderDom } = await import('ren-dom');
    const { $root, $dispose } = await import('rrx-core');
    const { closeWindow, disposeAfter } = await import('./harness.jsx');
    const clock = manualClock();
    const window = new Window({ url: 'http://localhost/', width: 600, height: 360, settings: { device: { prefersReducedMotion: 'reduce' } } });
    const host = window.document.createElement('main');
    window.document.body.appendChild(host);
    boxes({ window });
    const root = $root('dom');
    const stop = renderDom(() => (
      <Clock value={clock}>
        <Rui>
          <Marquee w={300} duration={1000}>
            <Text>news</Text>
          </Marquee>
        </Rui>
      </Clock>
    ), host, { root });
    disposeAfter(t, () => {
      stop();
      $dispose(root);
      closeWindow(window);
    });
    $flush(root);
    clock.advance(160);
    $flush(root);
    clock.advance(400);
    $flush(root);
    const track = [...host.querySelectorAll('[data-ren="View"]')].find((/** @type {any} */ n) => n.style.left !== '');
    assert.equal(parseFloat(track.style.left), 0, 'the strip has not moved');
  });
});

describe('insetsOf', () => {
  it('reads padding as CSS shorthand, and a side\'s border over border', () => {
    assert.deepEqual(insetsOf({ padding: 4 }), { top: 4, right: 4, bottom: 4, left: 4 });
    assert.deepEqual(insetsOf({ padding: [2, 6] }), { top: 2, right: 6, bottom: 2, left: 6 });
    assert.deepEqual(insetsOf({ padding: [1, 2, 3, 4], border: 1, borderLeft: 3 }), { top: 2, right: 3, bottom: 4, left: 7 });
    assert.deepEqual(insetsOf({ padding: 'auto', border: 'thin' }), { top: 0, right: 0, bottom: 0, left: 0 });
  });
});

describe('a padded Collapse opens to its whole height', () => {
  it('no jump as it settles: its padding and border move with it', () => {
    for (const extra of [{ p: 20 }, { style: { border: 12 } }]) {
      const clock = manualClock();
      /** @type {any} */
      let open = null;
      const skia = onSkia(() => {
        open = $signal($active(), false);
        return (
          <Clock value={clock}>
            <Rui>
              <Collapse open={open} duration={160} {...extra}>
                <Text>one</Text>
                <Text>two</Text>
              </Collapse>
              <Text>after</Text>
            </Rui>
          </Clock>
        );
      });
      skia.text();
      const after = () => {
        skia.text();
        return Math.round(items(skia, KIND.Label).find((/** @type {any} */ i) => i.caption === 'after').getBoundingClientRect().y);
      };
      $write(open, true);
      $flush(skia.root);
      /** @type {number[]} */
      const ys = [];
      for (let i = 0; i < 16; i++) {
        clock.advance(16);
        ys.push(after());
      }
      const steps = ys.slice(1).map((y, i) => y - ys[i]).filter(d => d !== 0);
      assert.ok(Math.abs(steps.at(-1) ?? 0) < 10, `${JSON.stringify(extra)}: the last step is a small one, not the insets at once: ${ys}`);
      skia.dispose();
    }
  });
});
