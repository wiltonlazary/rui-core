// The overlays on the DOM and on Skia: the same text, the same presses and
// keys, the same state, content placed over the page and against its
// trigger, painted over what follows.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active, View, Action, Edit, Scroll, Show, Root } from 'ren-core';
import {
  Rui, Clock, manualClock, Button, Pressable, Text, Box, BASE_THEME, MOTION as BASE_MOTION,
  Backdrop, Busy, Modal, Drawer, Dialog, Popover, HoverCard, Tooltip, Menu,
  Pin, ActionBar, Glider, Floater, Select,
} from 'rui-core';
import { both, onDom } from './harness.jsx';
import { pair, states, css, styledBy, painted, lend, fixedOf, tinted, round, app, layer, viewport, menuWalk } from './overlay-harness.jsx';

describe('Backdrop and Busy', () => {
  it('cover their parent and take presses; Busy shows a loader while shown', () => {
    const clock = manualClock();
    const st = states();
    const loading = states();
    const view = app(clock, () => {
      const hits = st.add($signal($active(), 0));
      const busy = loading.add($signal($active(), false));
      return (
        <>
          <Box h={100} w={200}>
            <Text>under</Text>
            <Backdrop color="#000" opacity={0.5} onPress={() => $write(hits, $read(hits) + 1)} />
          </Box>
          <Box h={100} w={200}>
            <Text>content</Text>
            <Busy shown={busy} />
          </Box>
        </>
      );
    });
    const { d, s, flush, dispose } = pair(view);
    const overlay = styledBy(d.find('under'), 'box-sizing')?.parentElement?.querySelectorAll('[data-ren="View"]')[0];
    assert.equal(css(overlay).position, 'absolute');
    assert.equal(css(overlay)['z-index'], '20', 'the sheet layer');
    assert.match(css(overlay).background, /#00000080|rgba\(0, 0, 0, 0\.5/);
    assert.ok(css(overlay).opacity === undefined || css(overlay).opacity === '' || css(overlay).opacity === '1', `the shade is in the color only, not faded again: ${css(overlay).opacity}`);
    // Skia keeps colors as 0xAARRGGBB: black at half alpha, the View itself not faded.
    const shade = s.items().find(i => i.style.background === 0x80000000);
    assert.ok(shade !== undefined, 'Skia: the color at half alpha');
    assert.ok(!(shade.style.opacity < 1), 'Skia: the View itself not faded');
    d.tap(overlay);
    const box = s.box(s.find('under').parent);
    s.at(box.x + 100, box.y + 50);
    assert.deepEqual(st.list.map(x => $read(x)), [1, 1], 'the overlay takes the press on both');
    const shapes = () => [d.nodes('Shape').length, s.items().filter(i => Array.isArray(i.shapes)).length];
    assert.deepEqual(shapes(), [0, 0]);
    for (const b of loading.list) $write(b, true);
    flush();
    assert.deepEqual(shapes(), [1, 1], 'a loader on both');
    const cover = s.box(s.items().find(i => Array.isArray(i.shapes)).parent.parent);
    const parent = s.box(s.find('content').parent);
    assert.deepEqual(round(cover), round(parent), 'the loading overlay covers its parent on Skia');
    for (const b of loading.list) $write(b, false);
    flush();
    assert.deepEqual(shapes(), [0, 0]);
    dispose();
  });

  it("Busy's backdrop fades its color once, not its View again", () => {
    const view = () => (
      <Rui>
        <Box h={100} w={200}>
          <Text>under</Text>
          <Busy shown backdrop={{ color: '#000', opacity: 0.5 }} />
        </Box>
      </Rui>
    );
    const { d, s, dispose } = pair(view);
    const shade = d.nodes('View').find((/** @type {any} */ n) => /#00000080|rgba\(0, 0, 0, 0\.5/.test(css(n).background ?? ''));
    assert.ok(shade !== undefined, 'the DOM: the color at half alpha');
    assert.ok(!(Number(css(shade).opacity) < 1), `the DOM: the View not faded again: ${css(shade).opacity}`);
    const drawn = s.items().find(i => i.style.background === 0x80000000);
    assert.ok(drawn !== undefined, 'Skia: the color at half alpha');
    assert.ok(!(drawn.style.opacity < 1), 'Skia: the View not faded again');
    dispose();
  });

  it('Backdrop: a gradient in place of its color; fixed over the viewport', () => {
    const view = () => (
      <Rui>
        <Box h={100} w={200}>
          <Text>under</Text>
          <Backdrop gradient={{ linear: 160, stops: [[0, '#101218e6'], [1, '#10121800']] }} />
        </Box>
        <Backdrop fixed gradient={{ colors: ['teal', 'indigo'], angle: 120 }} />
        <Box h={100} w={200}>
          <Backdrop opacity={0.5} gradient={{ linear: 90, stops: [[0, '#000000'], [1, '#ffffff80']] }} />
        </Box>
      </Rui>
    );
    const { d, s, dispose } = pair(view);
    const overlays = d.nodes('View').filter((/** @type {any} */ n) => css(n)['z-index'] === '20');
    assert.equal(overlays.length, 3);
    assert.match(css(overlays[0]).background, /^linear-gradient\(160deg/);
    assert.equal(css(overlays[0]).position, 'absolute');
    assert.match(css(overlays[1]).background, /^linear-gradient\(120deg, #/, '{ colors, angle } too');
    assert.equal(css(overlays[1]).position, 'fixed');
    const drawn = s.items().filter(i => i.style.background?.angle !== undefined);
    assert.deepEqual(drawn.map(i => [i.style.background.angle, i.style.position]), [[160, 1], [120, 3], [90, 1]], 'on Skia: absolute, then fixed');
    // `opacity` fades a gradient's stops as it fades a color: the View itself stays whole.
    assert.deepEqual(drawn[2].style.background.stops, [0, 0x80000000, 1, 0x40ffffff]);
    assert.ok(!(drawn[2].style.opacity < 1));
    dispose();
  });
});

describe('Modal', () => {
  /** @param {Record<string, any>} [extra] */
  const setup = extra => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const open = st.add($signal($active(), false));
      return (
        <>
          <Button onPress={() => $write(open, true)}>Open</Button>
          <Modal open={open} onOpenChange={(/** @type {boolean} */ v) => $write(open, v)} title="Hello" size="xs" {...extra}>
            <Text>Inside</Text>
          </Modal>
          <Text>after</Text>
        </>
      );
    });
    const p = pair(view);
    const open = () => {
      p.d.press('Open');
      p.s.press('Open');
      clock.advance(250);
      p.flush();
    };
    const isOpen = () => st.list.map(x => $read(x));
    return { ...p, clock, open, isOpen };
  };

  it('opens by press with its title, content and focus on the close button; Escape closes', () => {
    const { d, s, clock, open, isOpen, flush, dispose } = setup();
    assert.equal(d.text(), 'Open after');
    assert.equal(s.text(), 'Open after');
    open();
    assert.deepEqual(isOpen(), [true, true]);
    assert.equal(d.text(), 'Open after Hello Inside');
    assert.equal(s.text(), 'Open after Hello Inside');
    assert.equal(d.focused().getAttribute('aria-label'), 'Close', 'focus moved in on the DOM');
    assert.equal(css(styledBy(d.find('Hello'), 'min-height'))['min-height'], '56px', 'the header is at least 56 high');
    assert.equal(s.focused()?.label, 'Close', 'and on Skia');
    d.key('Escape');
    s.key('Escape');
    assert.deepEqual(isOpen(), [false, false]);
    clock.advance(250);
    flush();
    assert.equal(d.text(), 'Open after');
    assert.equal(s.text(), 'Open after');
    dispose();
  });

  it('keeps the focus when the focused control inside it is removed, so Escape still closes it', () => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const open = st.add($signal($active(), true));
      const swapped = $signal($active(), false);
      return (
        <Modal open={open} onOpenChange={(/** @type {boolean} */ v) => $write(open, v)} title="Hello" size="xs">
          {() => ($read(swapped) ? <Text>Swapped</Text> : <Button onPress={() => $write(swapped, true)}>Swap</Button>)}
        </Modal>
      );
    });
    const { d, s, flush, dispose } = pair(view);
    clock.advance(250);
    flush();
    d.find('Swap').focus();
    d.press('Swap');
    s.find('Swap').focus();
    s.press('Swap');
    flush();
    assert.equal(d.text(), 'Hello Swapped');
    assert.equal(s.text(), 'Hello Swapped');
    assert.equal(d.focused().getAttribute('aria-label'), 'Close', 'the focus back on its first focusable on the DOM');
    assert.equal(s.focused()?.label, 'Close', 'and on Skia');
    d.key('Escape');
    s.key('Escape');
    assert.deepEqual(st.list.map(x => $read(x)), [false, false]);
    dispose();
  });

  it("moves by its motion's easing on the way in and its exit on the way out", () => {
    const { d, s, clock, flush, dispose } = setup({ motion: { effect: 'fade', duration: 200, exit: 50, easing: 'linear' } });
    d.press('Open');
    s.press('Open');
    clock.advance(96);
    flush();
    // Linear: 96 of 200 ms is 0.48 in (the default ease-out would be past 0.85).
    const opacity = Number(css(styledBy(d.find('Inside'), 'box-shadow')).opacity);
    assert.ok(Math.abs(opacity - 0.48) < 0.02, `linear on the DOM: ${opacity}`);
    const drawn = Number(s.find('Hello').parent.parent.style.opacity);
    assert.ok(Math.abs(drawn - 0.48) < 0.02, `linear on Skia: ${drawn}`);
    clock.advance(200);
    flush();
    d.key('Escape');
    s.key('Escape');
    // The exit takes 50 ms, not the 200 of the way in.
    clock.advance(64);
    flush();
    assert.equal(d.text(), 'Open after');
    assert.equal(s.text(), 'Open after');
    dispose();
  });

  it('grows in on the Clock, takes its size, keeps Tab inside and closes by its button', () => {
    const { d, s, dom, clock, isOpen, flush, dispose } = setup();
    d.press('Open');
    s.press('Open');
    clock.advance(96);
    flush();
    const content = styledBy(d.find('Inside'), 'box-shadow');
    const opacity = Number(css(content).opacity);
    assert.ok(opacity > 0 && opacity < 1, `half way in: ${opacity}`);
    assert.match(css(content).scale ?? '', /^0\.9\d*/, 'grow: from a little smaller by a transform');
    assert.equal(css(content).top, undefined, 'not an offset');
    const drawn = s.find('Hello').parent.parent;
    assert.ok(drawn.style.scaleX < 1, 'by a transform on Skia too');
    clock.advance(200);
    flush();
    assert.equal(css(content).opacity, undefined, 'in place at the end');
    assert.equal(css(content).width, '320px', 'size xs');
    assert.equal(Math.round(s.box(s.find('Hello').parent.parent).width), 320, 'size xs on Skia');
    // Tab from the last focusable wraps to the first (the guards), in Skia's tab order.
    s.key('Tab');
    s.key('Tab');
    assert.equal(s.focused()?.label, 'Close');
    d.tap(dom.document.querySelector('[aria-label="Close"]'));
    const close = s.focused();
    s.at(s.box(close).x + 5, s.box(close).y + 5);
    assert.deepEqual(isOpen(), [false, false]);
    dispose();
  });

  it('traps Tab inside (the trap), and gives the focus back where it was on close', () => {
    const { d, s, dom, clock, isOpen, flush, dispose } = setup();
    d.find('Open').focus();
    s.find('Open').focus();
    d.press('Open');
    s.press('Open');
    clock.advance(250);
    flush();
    assert.equal(d.focused().getAttribute('aria-label'), 'Close');
    assert.equal(s.focused()?.label, 'Close');
    const content = s.focused().parent.parent;
    assert.equal(content.trap, true, 'the content traps the focus on Skia');
    d.focused().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    $flush(dom.root);
    assert.equal(d.focused().getAttribute('aria-label'), 'Close', 'Shift+Tab wraps inside on the DOM: the close button, the only focusable (no hidden holder)');
    assert.equal(dom.document.querySelectorAll('[data-ren="Action"][role="none"]').length, 0, 'no holder beside a focusable');
    for (let i = 0; i < 3; i++) s.key('Tab');
    assert.equal(s.focused()?.label, 'Close', 'Tab cycles inside on Skia: the close button alone');
    d.key('Escape');
    s.key('Escape');
    assert.deepEqual(isOpen(), [false, false]);
    assert.equal(d.focused().textContent, 'Open', 'focus back on the DOM');
    assert.equal(s.focused()?.text, 'Open', 'and on Skia');
    clock.advance(250);
    flush();
    dispose();
  });

  it('trap false: the focus stays put on open, yet refocus gives it back on close', () => {
    const { d, s, dom, clock, isOpen, flush, dispose } = setup({ trap: false });
    d.find('Open').focus();
    s.find('Open').focus();
    d.press('Open');
    s.press('Open');
    clock.advance(250);
    flush();
    assert.deepEqual(isOpen(), [true, true]);
    assert.equal(d.focused().textContent, 'Open', 'untrapped: no focus moved in on the DOM');
    // Something inside takes the focus, as a Launcher's search does.
    dom.document.querySelector('[aria-label="Close"]').focus();
    s.items().find(i => i.label === 'Close').focus();
    assert.equal(s.focused()?.label, 'Close');
    d.key('Escape');
    s.key('Escape');
    assert.deepEqual(isOpen(), [false, false]);
    assert.equal(d.focused().textContent, 'Open', 'focus back on the DOM');
    assert.equal(s.focused()?.text, 'Open', 'and on Skia');
    clock.advance(250);
    flush();
    dispose();
  });

  it('without a close button its first field takes the focus ($focus), before the holder', () => {
    const clock = manualClock();
    const view = app(clock, () => (
      <Modal open onOpenChange={() => {}} title="Form" closable={false} motion={{ duration: 0 }}>
        <Text>Name</Text>
        <Edit label="name" />
      </Modal>
    ));
    const { d, s, flush, dispose } = pair(view);
    clock.advance(50);
    flush();
    assert.equal(d.focused()?.getAttribute('data-ren'), 'Edit', 'the DOM: the field');
    assert.equal(s.focused()?.label, 'name', 'Skia: the field');
    dispose();
  });

  it('closes by a press on the backdrop, not on its content (DOM)', () => {
    const { d, dom, open, isOpen, dispose } = setup();
    open();
    d.tap(d.find('Inside'));
    assert.equal(isOpen()[0], true, 'a press on the content keeps it');
    d.tap(layer(dom));
    assert.equal(isOpen()[0], false, 'a press on the backdrop closes it');
    dispose();
  });

  it('closes by a press on the backdrop (Skia)', () => {
    const { s, open, isOpen, dispose } = setup();
    open();
    s.at(5, 300);
    assert.equal(isOpen()[1], false);
    dispose();
  });

  it('a press on the backdrop gives the focus back and keeps it through the press, the backdrop still there on its way out', () => {
    const { d, s, dom, open, isOpen, flush, clock, dispose } = setup();
    d.find('Open').focus();
    s.find('Open').focus();
    open();
    assert.equal(d.focused().getAttribute('aria-label'), 'Close');
    assert.equal(s.focused()?.label, 'Close');
    // The DOM, as a browser presses: pointerdown, then (unless it was prevented) the mousedown that takes the focus
    // to what is under the pointer (the backdrop: nothing focusable, so the body), then pointerup and click.
    const w = dom.window;
    const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 };
    const target = layer(dom);
    const down = new w.PointerEvent('pointerdown', at);
    target.dispatchEvent(down);
    flush();
    if (!down.defaultPrevented) dom.document.activeElement?.blur();
    target.dispatchEvent(new w.PointerEvent('pointerup', { ...at, buttons: 0 }));
    target.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    flush();
    // Skia: a press and release on the backdrop.
    s.at(5, 300);
    flush();
    assert.deepEqual(isOpen(), [false, false]);
    assert.equal(d.focused().textContent, 'Open', 'the DOM: the focus back on the button');
    assert.equal(s.focused()?.text, 'Open', 'Skia: back on the button');
    clock.advance(250);
    flush();
    assert.equal(d.focused().textContent, 'Open', 'the DOM: still there once the backdrop has gone');
    assert.equal(s.focused()?.text, 'Open', 'Skia: still there');
    dispose();
  });

  it('dismiss sets what closes it: neither with false; the backdrop only without escape', () => {
    const a = setup({ dismiss: false });
    a.open();
    a.d.key('Escape');
    a.s.key('Escape');
    a.d.tap(layer(a.dom));
    a.s.at(5, 300);
    assert.deepEqual(a.isOpen(), [true, true], 'dismiss false: it stays');
    a.dispose();
    const b = setup({ dismiss: { escape: false } });
    b.open();
    b.d.key('Escape');
    b.s.key('Escape');
    assert.deepEqual(b.isOpen(), [true, true], 'Escape keeps it');
    b.d.tap(layer(b.dom));
    b.s.at(5, 300);
    assert.deepEqual(b.isOpen(), [false, false], 'a press outside closes it');
    b.dispose();
  });

  it('keeps its own open state from defaultOpen, telling onOpenChange', () => {
    const clock = manualClock();
    /** @type {boolean[]} */
    const heard = [];
    const view = app(clock, () => (
      <Modal defaultOpen onOpenChange={(/** @type {boolean} */ v) => heard.push(v)} title="Own" motion={{ duration: 0 }}>
        <Text>Inside</Text>
      </Modal>
    ));
    const { d, s, flush, dispose } = pair(view);
    clock.advance(50);
    flush();
    assert.equal(d.text(), 'Own Inside');
    assert.equal(s.text(), 'Own Inside');
    d.key('Escape');
    s.key('Escape');
    clock.advance(50);
    flush();
    assert.deepEqual(heard, [false, false]);
    assert.equal(d.text(), '');
    assert.equal(s.text(), '');
    dispose();
  });

  it('without a close button focus goes to the dialog itself; at center and full place its content', () => {
    const a = setup({ closable: false, at: 'center' });
    a.open();
    assert.equal(a.d.text(), 'Open after Hello Inside');
    assert.equal(a.s.text(), 'Open after Hello Inside');
    assert.equal(a.s.focused()?.label, 'Hello', 'a holder named by the title');
    assert.equal(a.d.focused().getAttribute('aria-label'), 'Hello');
    const inner = styledBy(a.d.find('Inside'), 'min-height');
    assert.equal(css(inner)['justify-content'], 'center');
    assert.equal(css(inner)['min-height'], '100%');
    a.dispose();
    const b = setup({ full: true });
    b.open();
    assert.equal(Math.round(b.s.box(b.s.find('Hello').parent.parent).width), 480, 'the full width on Skia');
    b.dispose();
  });
});

describe('Modal and Drawer parts', () => {
  it('Modal.Frame composes the backdrop, content, header, title, close button and body', () => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const open = st.add($signal($active(), false));
      return (
        <>
          <Button onPress={() => $write(open, true)}>Open</Button>
          <Modal.Frame open={open} onOpenChange={(/** @type {boolean} */ v) => $write(open, v)} size="xs">
            <Modal.Backdrop opacity={0.3} />
            <Modal.Content>
              <Modal.Header>
                <Modal.Title>Compose</Modal.Title>
                <Modal.Close />
              </Modal.Header>
              <Modal.Body>
                <Text>Body text</Text>
              </Modal.Body>
            </Modal.Content>
          </Modal.Frame>
        </>
      );
    });
    const { d, s, dom, flush, dispose } = pair(view);
    const open = () => {
      d.press('Open');
      s.press('Open');
      clock.advance(250);
      flush();
    };
    open();
    assert.equal(d.text(), 'Open Compose Body text');
    assert.equal(s.text(), 'Open Compose Body text');
    assert.equal(d.focused().getAttribute('aria-label'), 'Close', 'the close button takes the focus on the DOM');
    assert.equal(s.focused()?.label, 'Close', 'and on Skia');
    assert.equal(Math.round(s.box(s.find('Compose').parent.parent).width), 320, 'the root\'s size on the content (Skia)');
    assert.equal(css(styledBy(d.find('Body text'), 'box-shadow')).width, '320px', 'and on the DOM');
    const backdrop = [...dom.document.body.querySelectorAll('[data-ren="View"]')].find(n => tinted(css(n).background, 0.3));
    assert.ok(backdrop !== undefined, 'the backdrop at its opacity on the DOM');
    const body = styledBy(d.find('Body text'), 'padding');
    assert.equal(css(body).padding, `${BASE_THEME.spacing.xs}px 24px 24px`, 'under the header: spacing xs above, padding lg around');
    d.tap(dom.document.querySelector('[aria-label="Close"]'));
    s.at(5, 300);
    assert.deepEqual(st.list.map(x => $read(x)), [false, false], 'the close button (DOM) and the backdrop (Skia) close it');
    clock.advance(250);
    flush();
    open();
    d.key('Escape');
    s.key('Escape');
    assert.deepEqual(st.list.map(x => $read(x)), [false, false], 'Escape closes it');
    dispose();
  });

  it('Drawer.Frame slides its content in from its edge', () => {
    const clock = manualClock();
    const view = app(clock, () => (
      <Drawer.Frame open onOpenChange={() => {}} at="end" size={200} motion={{ duration: 0 }}>
        <Drawer.Backdrop />
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Side</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body>
            <Text>Links</Text>
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Frame>
    ));
    const { d, s, flush, dispose } = pair(view);
    clock.advance(50);
    flush();
    assert.equal(d.text(), 'Side Links');
    assert.equal(s.text(), 'Side Links');
    const panel = s.box(s.find('Side').parent.parent);
    assert.deepEqual([Math.round(panel.x), Math.round(panel.width)], [280, 200], 'against the right edge on Skia');
    assert.equal(s.focused()?.label, 'Side', 'no close button: the holder named by the title');
    const edge = styledBy(d.find('Links'), 'right');
    assert.deepEqual([css(edge).right, css(edge).width], ['0px', '200px']);
    dispose();
  });

});

describe('Overlay defaults', () => {
  it('a Modal or a Drawer taller than its layer scrolls in it: the whole content within reach, none past the screen', () => {
    const clock = manualClock();
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`);
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Modal open title="Long" motion={{ duration: 0 }}>
            {lines.map(l => (
              <Text>{l}</Text>
            ))}
          </Modal>
        </Rui>
      </Clock>
    );
    // a phone's screen, shorter than thirty lines
    const a = pair(view, { width: 390, height: 400 });
    clock.advance(50);
    a.flush();
    const scroller = a.s.items().find((/** @type {any} */ i) => i.kind === 2 && Math.round(a.s.box(i).height) === 400);
    assert.ok(scroller !== undefined, 'a scroller as high as the layer (Skia)');
    assert.throws(() => a.s.find('Line 30'), /no "Line 30"/, 'the last line below the screen, clipped');
    // scrolled to its end, the last line is within the screen
    scroller.scrollTop = 10_000;
    a.flush();
    const last = a.s.box(a.s.find('Line 30'));
    assert.ok(last.y + last.height <= 400, `the last line within reach: ${last.y}`);
    assert.ok(a.d.nodes('Scroll').length > 0, 'and a scroller on the DOM');
    a.dispose();
    const clock2 = manualClock();
    const drawer = () => (
      <Clock value={clock2}>
        <Rui>
          <Drawer open title="Filters" motion={{ duration: 0 }}>
            {lines.map(l => (
              <Text>{l}</Text>
            ))}
          </Drawer>
        </Rui>
      </Clock>
    );
    const b = pair(drawer, { width: 390, height: 400 });
    clock2.advance(50);
    b.flush();
    const body = b.s.items().find((/** @type {any} */ i) => i.kind === 2);
    assert.ok(body !== undefined && Math.round(b.s.box(body).y + b.s.box(body).height) <= 400, 'the drawer\'s body ends at the screen\'s end (Skia)');
    b.dispose();
  });

  it('a Modal sits 64 from the top at 560 wide; a Drawer at the end at 360; a wrapping Tooltip at its width', () => {
    const clock = manualClock();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Modal open title="Plan" motion={{ duration: 0 }} portal={false}>
            <Text>Steps</Text>
          </Modal>
        </Rui>
      </Clock>
    );
    const a = pair(view, { width: 800, height: 600 });
    clock.advance(50);
    a.flush();
    const content = a.s.box(a.s.find('Plan').parent.parent);
    assert.deepEqual([Math.round(content.y), Math.round(content.width)], [64, 560], 'on Skia');
    a.dispose();
    const clock2 = manualClock();
    const drawer = () => (
      <Clock value={clock2}>
        <Rui>
          <Drawer open title="Filters" motion={{ duration: 0 }}>
            <Text>Price</Text>
          </Drawer>
        </Rui>
      </Clock>
    );
    const b = pair(drawer, { width: 800, height: 600 });
    clock2.advance(50);
    b.flush();
    const panel = b.s.box(b.s.find('Filters').parent.parent);
    assert.deepEqual([Math.round(panel.right), Math.round(panel.width)], [800, 360], 'against the end edge on Skia');
    b.dispose();
    const clock3 = manualClock();
    const tip = () => (
      <Clock value={clock3}>
        <Rui>
          <View style={{ padding: 80 }}>
            <Tooltip label="A longer hint that wraps across lines" wrap w={140} defaultOpen open>
              <Button>Hint</Button>
            </Tooltip>
          </View>
        </Rui>
      </Clock>
    );
    const c = pair(tip);
    clock3.advance(200);
    c.flush();
    const box = c.s.box(c.s.find('A longer hint that wraps across lines').parent);
    assert.ok(box.width <= 140, `at most its width: ${box.width}`);
    c.dispose();
  });
});

describe('Drawer and Dialog', () => {
  it('Drawer slides in from its edge at its size and closes by Escape', () => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const open = st.add($signal($active(), false));
      return (
        <>
          <Button onPress={() => $write(open, true)}>Menu</Button>
          <Drawer open={open} onOpenChange={(/** @type {boolean} */ v) => $write(open, v)} title="Navigation" at="end" size={300}>
            <Text>Links</Text>
          </Drawer>
        </>
      );
    });
    const { d, s, flush, dispose } = pair(view);
    d.press('Menu');
    s.press('Menu');
    clock.advance(100);
    flush();
    const moving = s.box(s.find('Navigation').parent.parent).x;
    assert.ok(moving > 180 && moving < 480, `sliding in: ${moving}`);
    assert.match(css(styledBy(d.find('Links'), 'right')).translate ?? '', /^\d+(\.\d+)?% 0px$/, 'slide-end: its own width off the edge, by a transform');
    clock.advance(200);
    flush();
    assert.equal(d.text(), 'Menu Navigation Links');
    assert.equal(s.text(), 'Menu Navigation Links');
    const panel = s.box(s.find('Navigation').parent.parent);
    assert.equal(Math.round(panel.x), 180, 'against the right edge on Skia');
    assert.equal(Math.round(panel.width), 300);
    const edge = styledBy(d.find('Links'), 'right');
    assert.equal(css(edge).right, '0px');
    assert.equal(css(edge).width, '300px');
    d.key('Escape');
    s.key('Escape');
    assert.deepEqual(st.list.map(x => $read(x)), [false, false]);
    dispose();
  });

  it('Dialog sits in a corner, not modal, and closes by its button', () => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const open = st.add($signal($active(), true));
      return (
        <>
          <Button>Page</Button>
          <Dialog open={open} closable onOpenChange={(/** @type {boolean} */ v) => $write(open, v)} at={{ top: 20, left: 20 }} size="sm">
            <Text>Reminder</Text>
          </Dialog>
        </>
      );
    });
    const { d, s, dom, flush, dispose } = pair(view);
    assert.equal(d.text(), 'Page Reminder');
    assert.equal(s.text(), 'Page Reminder');
    // Fixed against the viewport: its rect is where it is placed, on Skia too.
    const box = round(s.box(fixedOf(s.find('Reminder'))));
    assert.deepEqual([box.x, box.y, box.width], [20, 20, 260], 'in the corner at 20, 20 on Skia, size sm');
    assert.equal(Math.round(s.box(s.find('Reminder')).x), 44, 'its padding (lg) inside');
    // The close is part of the first row: at its end, level with the content, inside the padding.
    const closer = round(s.box(s.items().find(i => i.label === 'Close')));
    assert.deepEqual([closer.x + closer.width, closer.y], [20 + 260 - 24, 20 + 24], 'the close inside the padding at the row\'s end');
    assert.equal(Math.round(s.box(s.find('Reminder')).y), 44, 'the content level with it');
    const dialog = styledBy(d.find('Reminder'), 'top');
    assert.deepEqual([css(dialog).position, css(dialog).top, css(dialog).left], ['fixed', '20px', '20px'], 'fixed on the DOM');
    d.tap(dom.document.querySelector('[aria-label="Close"]'));
    const close = s.items().find(i => i.label === 'Close');
    close.focus();
    s.key('Enter');
    assert.deepEqual(st.list.map(x => $read(x)), [false, false]);
    clock.advance(250);
    flush();
    assert.equal(d.text(), 'Page');
    assert.equal(s.text(), 'Page');
    dispose();
  });

  it('Dialog in its default corner on Skia', () => {
    const view = () => (
      <Rui>
        <Dialog open motion={{ duration: 0 }}>
          <Text>Corner</Text>
        </Dialog>
      </Rui>
    );
    const { d, s, dispose } = pair(view);
    const corner = styledBy(d.find('Corner'), 'bottom');
    assert.deepEqual([css(corner).bottom, css(corner).right], ['24px', '24px'], 'bottom right, lg in, by default on the DOM');
    assert.equal(css(corner).position, 'fixed');
    const box = s.box(fixedOf(s.find('Corner')));
    assert.deepEqual([Math.round(box.right), Math.round(box.bottom)], [480 - 24, 360 - 24], 'bottom right by default on Skia');
    dispose();
  });

  /** A Dialog open over a page button, with `dismiss` as given. @param {any} dismiss */
  const dialogWith = dismiss => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const open = st.add($signal($active(), true));
      return (
        <>
          <Button>Page</Button>
          <Dialog open={open} onOpenChange={(/** @type {boolean} */ v) => $write(open, v)} dismiss={dismiss} closable at={{ top: 20, left: 200 }} size="sm" motion={{ duration: 0 }}>
            <Text>Note</Text>
          </Dialog>
        </>
      );
    });
    const p = pair(view);
    /** Escape from its close button, on both. */
    const escape = () => {
      p.dom.document.querySelector('[aria-label="Close"]').focus();
      p.d.key('Escape');
      p.s.items().find(i => i.label === 'Close').focus();
      p.s.key('Escape');
    };
    return { ...p, escape, isOpen: () => st.list.map(x => $read(x)) };
  };

  it('Dialog: Escape closes it and a press on the page does not, by default', () => {
    const { d, s, escape, isOpen, dispose } = dialogWith(undefined);
    d.press('Page');
    s.press('Page');
    assert.deepEqual(isOpen(), [true, true], 'not modal: the page stays in use');
    escape();
    assert.deepEqual(isOpen(), [false, false]);
    dispose();
  });

  it('Dialog: dismiss false keeps it open on Escape', () => {
    const { escape, isOpen, dispose } = dialogWith(false);
    escape();
    assert.deepEqual(isOpen(), [true, true]);
    dispose();
  });

  it('Dialog: dismiss.outside closes it by a press outside, taken by a layer under it', () => {
    const { d, s, dom, isOpen, dispose } = dialogWith({ outside: true, escape: false });
    d.tap(layer(dom));
    s.at(20, 340);
    assert.deepEqual(isOpen(), [false, false]);
    dispose();
    const kept = dialogWith({ outside: true, escape: false });
    kept.escape();
    assert.deepEqual(kept.isOpen(), [true, true], 'escape false: Escape leaves it');
    kept.s.press('Note');
    assert.deepEqual(kept.isOpen(), [true, true], 'a press inside leaves it');
    kept.dispose();
  });
});

describe('Popover', () => {
  /** @param {Record<string, any>} options */
  const setup = options => {
    const clock = manualClock();
    const hits = states();
    const view = app(clock, () => {
      const hit = hits.add($signal($active(), ''));
      return (
        <>
          <Popover offset={8} {...options}>
            <Popover.Trigger>
              <Button>Toggle</Button>
            </Popover.Trigger>
            <Popover.Panel>
              <Button onPress={() => $write(hit, 'drop')}>Drop</Button>
            </Popover.Panel>
          </Popover>
          <Button onPress={() => $write(hit, 'later')}>Later</Button>
        </>
      );
    });
    const p = pair(view);
    const toggle = () => {
      p.d.press('Toggle');
      p.s.press('Toggle');
      clock.advance(200);
      p.flush();
    };
    return { ...p, clock, hits, toggle };
  };

  it('Popover.Panel gives its node to ref', () => {
    /** @type {any[]} */
    const got = [];
    const view = () => (
      <Rui>
        <Popover defaultOpen motion={{ duration: 0 }}>
          <Popover.Trigger>
            <Button>Toggle</Button>
          </Popover.Trigger>
          <Popover.Panel ref={(/** @type {any} */ n) => got.push(n)}>
            <Text>Inside</Text>
          </Popover.Panel>
        </Popover>
      </Rui>
    );
    const { d, s, dispose } = pair(view);
    assert.ok(d.text().includes('Inside') && s.text().includes('Inside'));
    const nodes = got.filter(n => n != null);
    assert.equal(nodes.length, 2, 'the panel on each renderer');
    assert.ok(nodes.some(n => n.textContent?.trim() === 'Inside'), 'the DOM panel holding its content');
    dispose();
  });

  for (const within of [true, false]) {
    it(`opens below its trigger, paints over later siblings and stays open for presses in it (${within ? 'in the portal layer' : 'inline'})`, () => {
      const { d, s, hits, toggle, dispose } = setup({ portal: within, at: 'bottom-start' });
      assert.equal(d.text(), 'Toggle Later');
      toggle();
      assert.ok(d.text().includes('Drop') && s.text().includes('Drop'), `${d.text()} | ${s.text()}`);
      const trigger = s.box(s.find('Toggle'));
      const drop = s.box(s.find('Drop').parent);
      assert.equal(Math.round(drop.y), Math.round(trigger.bottom + 8), 'offset below the trigger on Skia');
      assert.equal(Math.round(drop.x), Math.round(trigger.x), 'start-aligned');
      // The placement on the DOM: below the anchor box by the offset.
      const place = styledBy(d.find('Drop'), 'top');
      assert.equal(css(place).top, '100%');
      assert.equal(css(place).padding, '8px 0px 0px');
      assert.equal(css(place)['justify-content'], 'flex-start');
      const later = s.box(s.find('Later'));
      assert.ok(later.bottom > drop.y && later.y < drop.bottom, 'the panel overlaps the later button');
      s.at(drop.x + 4, Math.max(drop.y, later.y) + 4);
      assert.equal($read(hits.list[1]), '', 'a press on the panel itself does not reach the button under it');
      const button = s.box(s.find('Drop'));
      assert.ok(button.y < later.bottom, 'the Drop button overlaps it too');
      s.at(button.x + 4, button.y + 4);
      d.press('Drop');
      assert.deepEqual(hits.list.map(x => $read(x)), ['drop', 'drop'], 'the panel takes the press where they overlap');
      assert.ok(d.text().includes('Drop') && s.text().includes('Drop'), 'a press in the panel does not toggle it through the trigger');
      dispose();
    });
  }

  it('places on each side, with an arrow, and as wide as the trigger', () => {
    for (const [position, check] of /** @type {const} */ ([
      ['top', (/** @type {any} */ t, /** @type {any} */ r) => Math.round(r.bottom) === Math.round(t.y - 8)],
      ['right', (/** @type {any} */ t, /** @type {any} */ r) => Math.round(r.x) === Math.round(t.right + 8)],
      ['left', (/** @type {any} */ t, /** @type {any} */ r) => Math.round(r.right) === Math.round(t.x - 8)],
    ])) {
      const clock = manualClock();
      const view = () => (
        <Clock value={clock}>
          <Rui>
            <View style={{ padding: 120 }}>
              <Popover at={position} offset={8} arrow defaultOpen>
                <Popover.Trigger>
                  <Button>T</Button>
                </Popover.Trigger>
                <Popover.Panel>
                  <Text>Tip</Text>
                </Popover.Panel>
              </Popover>
            </View>
          </Rui>
        </Clock>
      );
      const { d, s, dispose } = pair(view);
      clock.advance(200);
      const t = s.box(s.find('T'));
      const r = s.box(s.find('Tip').parent);
      assert.ok(check(t, r), `${position}: ${JSON.stringify(round(t))} ${JSON.stringify(round(r))}`);
      assert.equal(d.nodes('Shape').length, 1, 'the arrow on the DOM');
      assert.equal(s.items().filter(i => Array.isArray(i.shapes)).length, 1, 'and on Skia');
      dispose();
    }
    const { s, toggle, dispose } = setup({ width: 'trigger' });
    toggle();
    assert.equal(Math.round(s.box(s.find('Drop').parent).width), Math.round(s.box(s.find('Toggle')).width));
    dispose();
  });

  it('closes by Escape and by its trigger; opens by ArrowDown; controlled by open and onOpenChange', () => {
    const { d, s, toggle, clock, flush, dispose } = setup({});
    toggle();
    d.find('Drop').focus();
    s.find('Drop').focus();
    d.key('Escape');
    s.key('Escape');
    clock.advance(200);
    flush();
    assert.equal(d.text(), 'Toggle Later');
    assert.equal(s.text(), 'Toggle Later');
    d.find('Toggle').focus();
    s.find('Toggle').focus();
    d.key('ArrowDown');
    s.key('ArrowDown');
    clock.advance(200);
    flush();
    assert.ok(d.text().includes('Drop') && s.text().includes('Drop'));
    toggle();
    assert.equal(d.text(), 'Toggle Later', 'the trigger closes it');
    assert.equal(s.text(), 'Toggle Later');
    dispose();

    const clock2 = manualClock();
    const st = states();
    /** @type {boolean[]} */
    const changes = [];
    const view = app(clock2, () => {
      const open = st.add($signal($active(), false));
      return (
        <Popover open={open} onOpenChange={(/** @type {boolean} */ v) => (changes.push(v), $write(open, v))}>
          <Popover.Trigger>
            <Button>C</Button>
          </Popover.Trigger>
          <Popover.Panel>
            <Text>Shown</Text>
          </Popover.Panel>
        </Popover>
      );
    });
    const c = pair(view);
    for (const o of st.list) $write(o, true);
    c.flush();
    clock2.advance(200);
    assert.ok(c.d.text().includes('Shown') && c.s.text().includes('Shown'), 'open from outside');
    c.d.press('C');
    c.s.press('C');
    assert.deepEqual(changes, [false, false], 'the trigger asks to close');
    c.dispose();
  });

  it('a function child gets the trigger props and its wrapper stretches with the style passed', () => {
    const clock = manualClock();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <View style={{ padding: 20, width: 300 }}>
            <Popover portal={false}>
              <Popover.Trigger style={{ align: 'stretch' }}>
                {(/** @type {any} */ trigger) => <Edit ref={trigger.ref} value="" onKey={trigger.onKey} onPointerUp={trigger.onPress} style={{ minWidth: 0 }} />}
              </Popover.Trigger>
              <Popover.Panel>
                <Button>Inside</Button>
              </Popover.Panel>
            </Popover>
          </View>
        </Rui>
      </Clock>
    );
    const { d, s, skia, dispose } = pair(view);
    skia.text();
    const edit = s.items().find(i => i.kind === 4);
    assert.equal(Math.round(s.box(edit.parent).width), 260, 'the wrapper fills its row on Skia');
    edit.focus();
    s.key('ArrowDown');
    clock.advance(200);
    assert.ok(s.text().includes('Inside'), s.text());
    s.press('Inside');
    assert.ok(s.text().includes('Inside'), 'still open after a press inside');
    void d;
    dispose();
  });

  it('trap moves focus into the panel and keeps Tab there', () => {
    const { d, s, toggle, clock, flush, dispose } = setup({ trap: true });
    toggle();
    clock.advance(32);
    flush();
    assert.equal(s.focused()?.text, 'Drop', 'its first focusable takes the focus on Skia ($focus)');
    assert.equal(d.focused()?.textContent, 'Drop', 'and on the DOM');
    s.key('Tab');
    assert.equal(s.focused()?.text, 'Drop', 'Tab past the last wraps to the first inside the panel');
    dispose();
  });

  it('closes by a press outside (DOM)', () => {
    const { d, dom, toggle, hits, clock, flush, dispose } = setup({});
    toggle();
    d.tap(layer(dom));
    clock.advance(200);
    flush();
    assert.equal(d.text(), 'Toggle Later');
    assert.equal($read(hits.list[0]), '', 'the press went to the backdrop');
    dispose();
  });

  it('closes by a press outside (Skia)', () => {
    const { s, toggle, clock, flush, dispose } = setup({});
    toggle();
    s.at(400, 300);
    clock.advance(200);
    flush();
    assert.equal(s.text(), 'Toggle Later');
    dispose();
  });
});

describe('Popover against the viewport', () => {
  it('follows its trigger as an ancestor scrolls ($scrolls), measuring no Clock frame', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const scrolls = [];
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Scroll ref={(/** @type {any} */ n) => scrolls.push(n)} style={{ height: 300 }}>
            <View style={{ padding: [60, 20], height: 900, shrink: 0 }}>
              <Popover offset={8} defaultOpen>
                <Popover.Trigger>
                  <Button>Toggle</Button>
                </Popover.Trigger>
                <Popover.Panel>
                  <Text>Drop</Text>
                </Popover.Panel>
              </Popover>
            </View>
          </Scroll>
        </Rui>
      </Clock>
    );
    const { d, s, dom, flush, dispose } = pair(view);
    clock.advance(200);
    flush();
    assert.equal(clock.pending(), 0, 'open and still: nothing waits for a frame');
    const before = s.box(s.find('Drop').parent).y;
    assert.equal(Math.round(before), Math.round(s.box(s.find('Toggle')).bottom + 8));
    scrolls[1].scrollTop = 40;
    flush();
    assert.equal(Math.round(s.box(s.find('Drop').parent).y), Math.round(before - 40), 'moved with the scroll on Skia');
    // The DOM: the trigger's box moves as its Scroll scrolls; the anchor box follows it.
    const boxes = lend(dom);
    const anchor = d.find('Toggle').parentElement;
    boxes.set(anchor, { getBoundingClientRect: () => ({ x: 20, y: 20, width: 80, height: 36 }) });
    scrolls[0].dispatchEvent(new dom.window.Event('scroll'));
    flush();
    const box = [...dom.document.body.querySelectorAll('[data-ren="View"]')].find(n => css(n)['z-index'] === '30' && css(n).width === '80px');
    assert.deepEqual([css(box).left, css(box).top], ['20px', '20px'], 'the anchor box follows on the DOM');
    dispose();
  });

  it('follows its trigger when it moves for another reason, a layout shift above it ($moves)', () => {
    const clock = manualClock();
    const above = states();
    const isOpen = states();
    const view = () => {
      const R = $active();
      const space = above.add($signal(R, 60));
      const open = isOpen.add($signal(R, false));
      return (
        <Clock value={clock}>
          <Rui>
            <View style={{ padding: [0, 20] }}>
              <View style={() => ({ height: $read(space), shrink: 0 })} />
              <Popover offset={8} open={open} onOpenChange={(/** @type {boolean} */ v) => $write(open, v)}>
                <Popover.Trigger>
                  <Button>Toggle</Button>
                </Popover.Trigger>
                <Popover.Panel>
                  <Text>Drop</Text>
                </Popover.Panel>
              </Popover>
            </View>
          </Rui>
        </Clock>
      );
    };
    const { d, s, dom, flush, dispose } = pair(view);
    // happy-dom lays nothing out and its observers report nothing: a box for the trigger and a stand-in observer, before the panel opens.
    const boxes = lend(dom);
    const anchor = d.find('Toggle').parentElement;
    const place = { x: 20, y: 60, width: 80, height: 36 };
    boxes.set(anchor, { getBoundingClientRect: () => ({ ...place }) });
    /** @type {any[]} */
    const observers = [];
    /** @type {any} */ (dom.window).IntersectionObserver = class {
      /** @param {(entries: any[]) => void} fn */
      constructor(fn) {
        this.fn = fn;
        this.live = true;
        observers.push(this);
      }
      /** @param {any} node */
      observe(node) {
        this.node = node;
      }
      disconnect() {
        this.live = false;
      }
    };
    for (const o of isOpen.list) $write(o, true);
    clock.advance(200);
    flush();
    const before = s.box(s.find('Drop').parent).y;
    assert.equal(Math.round(before), Math.round(s.box(s.find('Toggle')).bottom + 8));
    for (const a of above.list) $write(a, 100);
    flush();
    s.box(s.find('Toggle'));
    assert.equal(Math.round(s.box(s.find('Drop').parent).y), Math.round(before + 40), 'moved with its trigger on Skia');
    // The DOM: the trigger observed where it is; the content above grows and the observer reports it.
    const io = () => observers.filter(o => o.live && o.node === anchor);
    assert.equal(io().length, 1, 'the trigger is observed while its panel is open');
    io()[0].fn([{ target: anchor, intersectionRatio: 1 }]);
    place.y = 100;
    io()[0].fn([{ target: anchor, intersectionRatio: 0.2 }]);
    flush();
    const box = [...dom.document.body.querySelectorAll('[data-ren="View"]')].find(n => css(n)['z-index'] === '30' && css(n).width === '80px');
    assert.deepEqual([css(box).left, css(box).top], ['20px', '100px'], 'the anchor box follows on the DOM');
    for (const o of isOpen.list) $write(o, false);
    clock.advance(200);
    flush();
    assert.equal(io().length, 0, 'not observed once it closed');
    dispose();
  });

  it('arrow.at center points at the trigger\'s center; arrow on Menu and Combobox panels', () => {
    const { d, s, trigger, dispose } = viewport({ at: 'bottom-start', arrow: { at: 'center' } }, [20, 0, 0, 20], 200);
    const arrow = s.items().find(i => Array.isArray(i.shapes));
    const a = s.box(arrow);
    assert.ok(Math.abs(a.x + a.width / 2 - (trigger().x + trigger().width / 2)) <= 1.5, 'at the trigger\'s center on Skia (within the border)');
    const along = d.nodes('Shape')[0].parentElement;
    assert.equal(css(along).padding, `0px 0px 0px ${arrow.parent.style.paddingLeft}px`, "the same place on the DOM");
    dispose();
    const clock = manualClock();
    const view = app(clock, () => (
      <>
        <Menu arrow defaultOpen>
          <Menu.Trigger>
            <Button>Menu</Button>
          </Menu.Trigger>
          <Menu.Panel>
            <Menu.Item>One</Menu.Item>
          </Menu.Panel>
        </Menu>
        <Select data={['A', 'B']} popover={{ arrow: true }} defaultOpen />
      </>
    ));
    const m = pair(view);
    clock.advance(200);
    m.flush();
    assert.ok(m.d.nodes('Shape').length >= 2 && m.s.items().filter(i => Array.isArray(i.shapes)).length >= 2);
    m.dispose();
  });

  it('persistent keeps the panel built while closed, hidden', () => {
    for (const keep of [true, false]) {
      const clock = manualClock();
      let built = 0;
      const Counted = () => {
        built++;
        return <Text>Kept</Text>;
      };
      const view = app(clock, () => (
        <Popover persistent={keep}>
          <Popover.Trigger>
            <Button>Toggle</Button>
          </Popover.Trigger>
          <Popover.Panel>
            <Counted />
          </Popover.Panel>
        </Popover>
      ));
      const { d, s, flush, dispose } = pair(view);
      for (let i = 0; i < 2; i++) {
        d.press('Toggle');
        s.press('Toggle');
        clock.advance(200);
        flush();
        assert.equal(d.text(), 'Toggle Kept');
        assert.equal(s.text(), 'Toggle Kept');
        d.press('Toggle');
        s.press('Toggle');
        clock.advance(200);
        flush();
        assert.equal(d.text(), 'Toggle', 'hidden once closed on the DOM');
        assert.equal(s.text(), 'Toggle', 'and on Skia');
      }
      assert.equal(built, keep ? 2 : 4, keep ? 'built once on each renderer' : 'built at each opening');
      dispose();
    }
  });
});

describe('HoverCard and Tooltip', () => {
  it('a Popover panel pads spacing.xs by spacing.sm; a Tooltip control.labelGap / 2 by ratios.pad of its font', () => {
    const view = () => (
      <Rui>
        <Popover defaultOpen motion={{ duration: 0 }} portal={false}>
          <Popover.Trigger>
            <Button>Toggle</Button>
          </Popover.Trigger>
          <Popover.Panel>
            <Text>Inside</Text>
          </Popover.Panel>
        </Popover>
        <View style={{ padding: 80 }}>
          <Tooltip label="Saves the draft" open motion={{ duration: 0 }} portal={false}>
            <Button>Save</Button>
          </Tooltip>
        </View>
      </Rui>
    );
    const { d, s, dispose } = pair(view);
    assert.equal(css(styledBy(d.find('Inside'), 'padding')).padding, '8px 12px', 'the panel: 8 by 12 on the DOM');
    const panel = s.box(s.find('Inside').parent);
    const inside = s.box(s.find('Inside'));
    assert.deepEqual([Math.round(inside.x - panel.x), Math.round(inside.y - panel.y)], [13, 9], 'on Skia: the padding inside its 1 px edge');
    assert.equal(css(styledBy(d.find('Saves the draft'), 'padding')).padding, '3px 9px', 'the tooltip: 3 by 9 (12 × .75)');
    dispose();
  });

  it('Tooltip shows at once on keyboard focus of its trigger and hides as focus leaves', () => {
    const clock = manualClock();
    const view = app(clock, () => (
      <>
        <Tooltip label="Saves the draft">
          {(/** @type {any} */ t) => <Action ref={t.ref} text="Save" onKey={t.onKey} />}
        </Tooltip>
        <Action text="Next" />
      </>
    ));
    const { d, s, flush, dispose } = pair(view);
    d.find('Save').focus();
    s.find('Save').focus();
    clock.advance(200);
    flush();
    assert.equal(d.text(), 'Save Next Saves the draft', 'no hover delay on focus (DOM)');
    assert.equal(s.text(), 'Save Next Saves the draft', 'and on Skia');
    d.find('Next').focus();
    s.find('Next').focus();
    clock.advance(200);
    flush();
    assert.equal(d.text(), 'Save Next');
    assert.equal(s.text(), 'Save Next');
    dispose();
  });

  it('Tooltip shows at once when focus enters a plain child, stays while it moves inside, and hides as it leaves', () => {
    const clock = manualClock();
    /** @type {boolean[]} */
    const changes = [];
    const view = app(clock, () => (
      <>
        <Tooltip label="Saves the draft" onOpenChange={(/** @type {boolean} */ v) => changes.push(v)}>
          <View style={{ direction: 'row' }}>
            <Button>Save</Button>
            <Button>Keep</Button>
          </View>
        </Tooltip>
        <Action text="Next" />
      </>
    ));
    const { d, s, flush, dispose } = pair(view);
    d.find('Save').focus();
    s.find('Save').focus();
    clock.advance(200);
    flush();
    assert.equal(d.text(), 'Save Keep Next Saves the draft', 'focus bubbles to the trigger (DOM)');
    assert.equal(s.text(), 'Save Keep Next Saves the draft', 'and on Skia');
    d.find('Keep').focus();
    s.find('Keep').focus();
    clock.advance(200);
    flush();
    assert.equal(d.text(), 'Save Keep Next Saves the draft', 'focus moving inside keeps it (DOM)');
    assert.equal(s.text(), 'Save Keep Next Saves the draft', 'and on Skia');
    assert.deepEqual(changes, [true, true], 'shown once on each, never hidden while focus stayed inside');
    d.find('Next').focus();
    s.find('Next').focus();
    clock.advance(200);
    flush();
    assert.equal(d.text(), 'Save Keep Next');
    assert.equal(s.text(), 'Save Keep Next');
    assert.deepEqual(changes, [true, true, false, false]);
    dispose();
  });

  it('Tooltip closes when its focused child disappears', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const shown = [];
    /** @type {boolean[]} */
    const changes = [];
    const view = app(clock, () => {
      const here = $signal($active(), true);
      shown.push(here);
      return (
        <>
          <Tooltip label="Saves the draft" onOpenChange={(/** @type {boolean} */ v) => changes.push(v)}>
            <View style={{ direction: 'row' }}>
              <Show when={() => $read(here)}>
                <Button>Save</Button>
              </Show>
              <Text>Draft</Text>
            </View>
          </Tooltip>
          <Action text="Next" />
        </>
      );
    });
    const { d, s, flush, dispose } = pair(view);
    d.find('Save').focus();
    s.find('Save').focus();
    clock.advance(200);
    flush();
    assert.equal(s.text(), 'Save Draft Next Saves the draft');
    for (const h of shown) $write(h, false);
    clock.advance(200);
    flush();
    assert.equal(s.text(), 'Draft Next', 'the focused child went: the tip closes on Skia');
    assert.equal(d.text(), 'Draft Next', 'and on the DOM');
    assert.deepEqual(changes.slice(0, 2), [true, true]);
    assert.deepEqual(changes.slice(2).sort(), [false, false], 'each closed once');
    dispose();
  });

  it('a Tooltip built inside a computation (a Calendar\'s renderDay) sets its anchor without writing state there', async () => {
    const { Calendar } = await import('rui-core/dates');
    let tips = 0;
    const view = () => (
      <Rui>
        <Calendar defaultPeriod="2026-02-01" renderDay={(/** @type {string} */ date) => (date === '2026-02-14' ? (tips++, <Tooltip label="Holiday"><Text>14</Text></Tooltip>) : <Text>{String(Number(date.slice(8)))}</Text>)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(tips, 2, 'the day built its Tooltip, once on each renderer');
    assert.ok(dom.text().includes('14') && skia.text().includes('14'), 'the day renders with its tooltip on both');
    dispose();
  });

  it('HoverCard opens on hover after its delay (80) and closes after its close delay (240)', () => {
    const clock = manualClock();
    const view = app(clock, () => (
      <HoverCard>
        <HoverCard.Trigger>
          <Button>Profile</Button>
        </HoverCard.Trigger>
        <HoverCard.Panel>
          <Text>Card</Text>
        </HoverCard.Panel>
      </HoverCard>
    ));
    const { d, s, flush, dispose } = pair(view);
    const trigger = s.box(s.find('Profile'));
    d.enter(d.find('Profile').parentElement);
    s.move(trigger.x + 5, trigger.y + 5);
    clock.advance(64);
    flush();
    assert.equal(d.text(), 'Profile', 'not yet');
    assert.equal(s.text(), 'Profile');
    clock.advance(200);
    flush();
    assert.equal(d.text(), 'Profile Card');
    assert.equal(s.text(), 'Profile Card');
    d.leave(d.find('Profile').parentElement);
    s.move(470, 350);
    clock.advance(100);
    flush();
    assert.equal(s.text(), 'Profile Card', 'the close delay');
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'Profile');
    assert.equal(s.text(), 'Profile');
    dispose();
  });

  it("HoverCard held open by a Popover opened from its panel; closed by its delay once that one closes, it gives the focus back; focus elsewhere stays", () => {
    const clock = manualClock();
    const view = app(clock, () => (
      <>
        <Button>Elsewhere</Button>
        <HoverCard>
          <HoverCard.Trigger>
            <Button>Profile</Button>
          </HoverCard.Trigger>
          <HoverCard.Panel>
            <Popover>
              <Popover.Trigger>
                <Button>More</Button>
              </Popover.Trigger>
              <Popover.Panel>
                <Button>Inner</Button>
              </Popover.Panel>
            </Popover>
          </HoverCard.Panel>
        </HoverCard>
      </>
    ));
    const { d, s, flush, dispose } = pair(view);
    const hover = () => {
      const trigger = s.box(s.find('Profile'));
      d.enter(d.find('Profile').parentElement);
      s.move(trigger.x + 5, trigger.y + 5);
      clock.advance(300);
      flush();
    };
    const leave = () => {
      d.leave(d.find('Profile').parentElement);
      s.move(470, 350);
      clock.advance(300);
      flush();
      clock.advance(300);
      flush();
    };
    hover();
    assert.equal(d.text(), 'Elsewhere Profile More');
    assert.equal(s.text(), 'Elsewhere Profile More');
    d.press('More');
    const more = s.box(s.find('More'));
    s.move(more.x + 5, more.y + 5);
    s.press('More');
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'Elsewhere Profile More Inner');
    assert.equal(s.text(), 'Elsewhere Profile More Inner');
    d.find('Inner').focus();
    s.find('Inner').focus();
    flush();
    leave();
    // The pointer is on the inner panel or its backdrop: the open Popover holds the card.
    assert.equal(d.text(), 'Elsewhere Profile More Inner', 'the DOM: held open');
    assert.equal(s.text(), 'Elsewhere Profile More Inner', 'Skia: held open');
    // Escape closes the inner one (the focus back on More); the card, the pointer off it, closes by its delay.
    d.key('Escape');
    s.key('Escape');
    clock.advance(300);
    flush();
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'Elsewhere Profile');
    assert.equal(s.text(), 'Elsewhere Profile');
    assert.equal(d.focused() === d.find('Profile'), true, 'the DOM: the focus on the trigger, not a removed node');
    assert.equal(s.focused() === s.find('Profile'), true, 'Skia: the same');
    // Focus outside the card and its nested panels stays where it went.
    hover();
    assert.equal(d.text(), 'Elsewhere Profile More');
    d.find('Elsewhere').focus();
    s.find('Elsewhere').focus();
    flush();
    leave();
    assert.equal(s.text(), 'Elsewhere Profile');
    assert.equal(d.focused() === d.find('Elsewhere'), true, 'the DOM: focus elsewhere stays');
    assert.equal(s.focused() === s.find('Elsewhere'), true, 'Skia: the same');
    dispose();
  });

  it('HoverCard: a pointer on a nested panel keeps it; it closes after that one, and closing it closes the nested ones, persistent too', () => {
    for (const persistent of [false, true]) {
      const clock = manualClock();
      /** @type {any[]} */
      const cards = [];
      const view = app(clock, () => {
        const card = $signal($active(), false);
        cards.push(card);
        return (
          <HoverCard open={card} onOpenChange={(/** @type {boolean} */ v) => $write(card, v)} persistent={persistent}>
            <HoverCard.Trigger>
              <Button>Profile</Button>
            </HoverCard.Trigger>
            <HoverCard.Panel>
              <HoverCard persistent={persistent}>
                <HoverCard.Trigger>
                  <Button>Team</Button>
                </HoverCard.Trigger>
                <HoverCard.Panel>
                  <Button>Member</Button>
                </HoverCard.Panel>
              </HoverCard>
            </HoverCard.Panel>
          </HoverCard>
        );
      });
      const { d, s, flush, dispose } = pair(view);
      const settle = () => {
        for (let i = 0; i < 2; i++) {
          clock.advance(300);
          flush();
        }
      };
      const panelOf = (/** @type {string} */ text) => d.find(text).closest('[role="dialog"]');
      // The texts shown, in any order (each portaled panel goes where its renderer puts it).
      const shown = () => [d.text(), s.text()].map(t => t.split(' ').sort().join(' '));
      /** Opens the outer card by the pointer on its trigger, then the inner one by the pointer on Team. */
      const open = () => {
        d.enter(d.find('Profile').parentElement);
        const profile = s.box(s.find('Profile'));
        s.move(profile.x + 5, profile.y + 5);
        settle();
        d.leave(d.find('Profile').parentElement);
        d.enter(panelOf('Team'));
        d.enter(d.find('Team').parentElement);
        const team = s.box(s.find('Team'));
        s.move(team.x + 5, team.y + 5);
        settle();
        assert.deepEqual(shown(), ['Member Profile Team', 'Member Profile Team']);
      };
      open();
      // Onto the inner (portaled) panel: leaving the outer panel closes nothing.
      d.leave(d.find('Team').parentElement);
      d.leave(panelOf('Team'));
      d.enter(panelOf('Member'));
      const member = s.box(s.find('Member'));
      s.move(member.x + 5, member.y + 5);
      settle();
      assert.deepEqual(shown(), ['Member Profile Team', 'Member Profile Team'], `both stay (persistent ${persistent})`);
      // Off every panel, the focus in the inner one: the inner card closes by its delay, then the outer.
      d.find('Member').focus();
      s.find('Member').focus();
      d.leave(panelOf('Member'));
      s.move(470, 350);
      settle();
      settle();
      assert.equal(d.text(), 'Profile', `the DOM: both closed (persistent ${persistent})`);
      assert.equal(s.text(), 'Profile', `Skia: both closed (persistent ${persistent})`);
      assert.equal(d.focused() === d.find('Profile'), true, 'the DOM: the focus back on the trigger');
      assert.equal(s.focused() === s.find('Profile'), true, 'Skia: the same');
      // Both open again; the outer one closed by its owner (open false): the inner one goes too.
      open();
      for (const card of cards) $write(card, false);
      flush();
      settle();
      assert.equal(d.text(), 'Profile', `the DOM: no orphan panel (persistent ${persistent})`);
      assert.equal(s.text(), 'Profile', `Skia: no orphan panel (persistent ${persistent})`);
      dispose();
    }
  });

  it('HoverCard closed by Escape with the focus in its panel gives the focus back to its trigger', () => {
    const clock = manualClock();
    const view = app(clock, () => (
      <HoverCard>
        <HoverCard.Trigger>
          <Button>Profile</Button>
        </HoverCard.Trigger>
        <HoverCard.Panel>
          <Button>Follow</Button>
        </HoverCard.Panel>
      </HoverCard>
    ));
    const { d, s, flush, dispose } = pair(view);
    const trigger = s.box(s.find('Profile'));
    d.enter(d.find('Profile').parentElement);
    s.move(trigger.x + 5, trigger.y + 5);
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'Profile Follow');
    assert.equal(s.text(), 'Profile Follow');
    d.find('Follow').focus();
    s.find('Follow').focus();
    flush();
    d.key('Escape');
    s.key('Escape');
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'Profile');
    assert.equal(s.text(), 'Profile');
    assert.equal(d.focused() === d.find('Profile'), true, 'the DOM: the focus on the trigger, not a removed node');
    assert.equal(s.focused() === s.find('Profile'), true, 'Skia: the same');
    dispose();
  });

  for (const kind of ['HoverCard', 'Popover'])
    it(`${kind} closed from outside (open set false) with the focus in its panel gives the focus back to its trigger`, () => {
      const clock = manualClock();
      const opens = states();
      const Kind = kind === 'HoverCard' ? HoverCard : Popover;
      const view = app(clock, () => {
        const open = opens.add($signal($active(), true));
        return (
          <Kind open={() => $read(open)} onOpenChange={(/** @type {boolean} */ v) => $write(open, v)}>
            <Kind.Trigger>
              <Button>Profile</Button>
            </Kind.Trigger>
            <Kind.Panel>
              <Button>Follow</Button>
            </Kind.Panel>
          </Kind>
        );
      });
      const { d, s, flush, dispose } = pair(view);
      clock.advance(300);
      flush();
      assert.equal(d.text(), 'Profile Follow');
      assert.equal(s.text(), 'Profile Follow');
      d.find('Follow').focus();
      s.find('Follow').focus();
      flush();
      for (const open of opens.list) $write(open, false);
      flush();
      clock.advance(300);
      flush();
      assert.equal(d.text(), 'Profile');
      assert.equal(s.text(), 'Profile');
      assert.equal(d.focused() === d.find('Profile'), true, 'the DOM: the focus on the trigger, not a removed node');
      assert.equal(s.focused() === s.find('Profile'), true, 'Skia: the same');
      dispose();
    });

  it('Tooltip shows its label above the trigger on hover; Tooltip.Follow follows the pointer', () => {
    const clock = manualClock();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <View style={{ padding: 80, gap: 20 }}>
            <Tooltip label="Save file" arrow>
              <Button>Save</Button>
            </Tooltip>
            <Tooltip.Follow label="Here">
              <Box w={200} h={60}>
                <Text>Area</Text>
              </Box>
            </Tooltip.Follow>
          </View>
        </Rui>
      </Clock>
    );
    const { d, s, dom, flush, dispose } = pair(view);
    const trigger = s.box(s.find('Save'));
    d.enter(d.find('Save').parentElement);
    s.move(trigger.x + 5, trigger.y + 5);
    clock.advance(400);
    flush();
    assert.equal(d.text(), 'Save Area', 'not before its open delay (500)');
    assert.equal(s.text(), 'Save Area');
    clock.advance(300);
    flush();
    assert.equal(d.text(), 'Save Area Save file');
    assert.equal(s.text(), 'Save Area Save file');
    const tip = s.box(s.find('Save file').parent);
    assert.equal(Math.round(tip.bottom), Math.round(trigger.y - 6), 'above by the offset (6, as every panel)');
    d.leave(d.find('Save').parentElement);
    s.move(470, 350);
    clock.advance(250);
    flush();
    assert.equal(s.text(), 'Save Area', 'gone after its close delay (100) and its motion');
    assert.equal(d.text(), 'Save Area');
    const area = s.box(s.find('Area').parent);
    s.move(area.x + 30, area.y + 20);
    const node = d.find('Area').parentElement.parentElement;
    node.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, clientX: 130, clientY: 150 }));
    flush();
    assert.equal(s.text(), 'Save Area Here');
    assert.equal(d.text(), 'Save Area Here');
    const here = s.box(s.find('Here').parent);
    assert.deepEqual([Math.round(here.x), Math.round(here.y)], [Math.round(area.x + 30), Math.round(area.y + 32)], 'below the pointer by 12, reaching toward the end');
    const follow = styledBy(d.find('Here'), 'left');
    assert.deepEqual([css(follow).left, css(follow).top], ['130px', '162px']);
    dispose();
  });
});

/** Every Skia item under `n`, depth first. @param {any} n @returns {any[]} */
function walk(n) {
  /** @type {any[]} */
  const out = [];
  for (let c = n.first; c !== null; c = c.next) out.push(c, ...walk(c));
  return out;
}

describe('Menu', () => {
  it('Menu.Item starts its label, its start and end content in one row with it (DOM and Skia)', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <View style={{ padding: [0, 0, 0, 100] }}>
          <Menu defaultOpen width={200} portal={false}>
            <Menu.Trigger>
              <Button>M</Button>
            </Menu.Trigger>
            <Menu.Panel>
              <Menu.Item end={<Text>F</Text>}>Filter</Menu.Item>
            </Menu.Panel>
          </Menu>
        </View>
      </Rui>
    ), { width: 480, height: 300 });
    $flush(dom.root);
    const label = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === 'Filter');
    const key = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === 'F');
    // On the DOM an Action is a button: no flex row, its text centered. The row is a View inside it.
    const row = label.parentElement;
    assert.equal(row.getAttribute('data-ren'), 'View');
    assert.equal(row.style.flexDirection, 'row', 'label and end content in one row');
    assert.ok(row.contains(key), 'the end content in the same row');
    assert.equal(row.style.textAlign, 'start', 'the label started, not centered as a button\'s text');
    skia.skia.present();
    const text = (/** @type {string} */ t) => skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === t);
    let item = walk(skia.skia.root).find(i => i.kind === 3 && i.text === 'Filter');
    while (item.kind !== 5) item = item.parent;
    const box = item.getBoundingClientRect();
    assert.ok(text('Filter')[2] - box.left < 20, `Filter starts at the item's left (${text('Filter')[2]} vs ${box.left})`);
    assert.ok(text('F')[2] > box.left + box.width - 30, 'F at its right');
    dispose();
  });

  const setup = (/** @type {Record<string, any>} */ options = {}) => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const chosen = st.add($signal($active(), ''));
      return (
        <Menu {...options}>
          <Menu.Trigger>
            <Button>Actions</Button>
          </Menu.Trigger>
          <Menu.Panel>
            <Menu.Label>Document</Menu.Label>
            <Menu.Item onPress={() => $write(chosen, 'rename')}>Rename</Menu.Item>
            <Menu.Item disabled onPress={() => $write(chosen, 'off')}>Share</Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" onPress={() => $write(chosen, 'delete')}>Delete</Menu.Item>
          </Menu.Panel>
        </Menu>
      );
    });
    const p = pair(view);
    const settle = () => {
      clock.advance(200);
      p.flush();
    };
    const open = () => {
      p.d.press('Actions');
      p.s.press('Actions');
      settle();
    };
    return { ...p, clock, open, settle, chosen: () => st.list.map(x => $read(x)) };
  };

  it('opens by press and chooses by press, closing', () => {
    const { d, s, open, settle, chosen, dispose } = setup();
    open();
    assert.equal(d.text(), 'Actions Document Rename Share Delete');
    assert.equal(s.text(), 'Actions Document Rename Share Delete');
    d.press('Share');
    s.press('Share');
    assert.deepEqual(chosen(), ['', ''], 'a disabled item does nothing');
    d.press('Delete');
    s.press('Delete');
    settle();
    assert.deepEqual(chosen(), ['delete', 'delete']);
    assert.equal(d.text(), 'Actions');
    assert.equal(s.text(), 'Actions');
    dispose();
  });

  it('walks its items with the arrows (past disabled ones), chooses with Enter, and gives focus back to the trigger', () => {
    const { d, s, open, settle, chosen, dispose } = setup();
    d.find('Actions').focus();
    s.find('Actions').focus();
    open();
    d.key('ArrowDown');
    s.key('ArrowDown');
    assert.equal(d.focused().textContent, 'Rename');
    assert.equal(s.focused()?.first?.first?.text, 'Rename');
    d.key('ArrowDown');
    s.key('ArrowDown');
    assert.equal(d.focused().textContent, 'Delete', 'past the disabled one');
    assert.equal(s.focused()?.first?.first?.text, 'Delete');
    d.key('ArrowDown');
    s.key('ArrowDown');
    assert.equal(d.focused().textContent, 'Rename', 'it loops');
    assert.equal(s.focused()?.first?.first?.text, 'Rename');
    d.key('Enter');
    s.key('Enter');
    settle();
    assert.deepEqual(chosen(), ['rename', 'rename']);
    assert.equal(d.text(), 'Actions');
    assert.equal(s.text(), 'Actions');
    assert.equal(d.focused().textContent, 'Actions', 'focus back on the trigger');
    assert.equal(s.focused()?.text, 'Actions');
    dispose();
  });

  it('stays open while sticky; Escape closes', () => {
    const { d, s, open, settle, dispose } = setup({ sticky: true });
    open();
    d.press('Rename');
    s.press('Rename');
    settle();
    assert.equal(d.text(), 'Actions Document Rename Share Delete');
    assert.equal(s.text(), 'Actions Document Rename Share Delete');
    d.find('Rename').focus();
    d.key('Escape');
    s.key('Escape');
    settle();
    assert.equal(d.text(), 'Actions');
    assert.equal(s.text(), 'Actions');
    dispose();
  });

  it("a Button or Pressable spreading a function child's trigger props takes its keys: ArrowDown and Enter open with the focus in", () => {
    for (const Control of [Button, Pressable]) {
      const clock = manualClock();
      const view = app(clock, () => (
        <Menu>
          <Menu.Trigger>{(/** @type {any} */ t) => <Control {...t}>Actions</Control>}</Menu.Trigger>
          <Menu.Panel>
            <Menu.Item>Rename</Menu.Item>
            <Menu.Item>Delete</Menu.Item>
          </Menu.Panel>
        </Menu>
      ));
      const { d, s, dom, flush, dispose } = pair(view);
      const settle = () => {
        clock.advance(200);
        flush();
      };
      // A browser's Enter on a button: its keydown, then a click unless a handler prevented it.
      const enter = () => {
        const node = dom.document.activeElement;
        const e = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        node.dispatchEvent(e);
        if (!e.defaultPrevented) node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        $flush(dom.root);
      };
      const name = Control === Button ? 'Button' : 'Pressable';
      for (const open of ['ArrowDown', 'Enter']) {
        d.find('Actions').focus();
        s.find('Actions').focus();
        if (open === 'Enter') enter();
        else d.key(open);
        s.key(open);
        settle();
        assert.equal(d.text(), 'Actions Rename Delete', `${name}, the DOM: ${open} opens`);
        assert.equal(s.text(), 'Actions Rename Delete', `${name}, Skia: ${open} opens`);
        assert.equal(d.focused()?.textContent, 'Rename', `${name}, the DOM: ${open} moves the focus in`);
        assert.equal(s.focused()?.first?.first?.text, 'Rename', `${name}, Skia: ${open} moves the focus in`);
        d.key('Escape');
        s.key('Escape');
        settle();
        assert.equal(d.text(), 'Actions', `${name}, the DOM: Escape closes`);
        assert.equal(s.text(), 'Actions', `${name}, Skia: Escape closes`);
      }
      dispose();
    }
  });
});

describe('Menu: display order', () => {
  it('walks its items in the order shown: one shown later in first place is first for Home, type-ahead and the arrows', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const flags = [];
    const view = app(clock, () => {
      const extra = $signal($active(), false);
      flags.push(extra);
      return (
        <Menu>
          <Menu.Trigger>
            <Button>Open</Button>
          </Menu.Trigger>
          <Menu.Panel>
            <Show when={() => $read(extra)}>
              <Menu.Item>Alpha</Menu.Item>
            </Show>
            <Menu.Item>Beta</Menu.Item>
            <Menu.Item>Gamma</Menu.Item>
          </Menu.Panel>
        </Menu>
      );
    });
    const p = pair(view);
    p.d.find('Open').focus();
    p.s.find('Open').focus();
    p.d.key('ArrowDown');
    p.s.key('ArrowDown');
    clock.advance(200);
    p.flush();
    for (const f of flags) $write(f, true);
    clock.advance(50);
    p.flush();
    const key = (/** @type {string} */ k) => {
      p.d.key(k);
      p.s.key(k);
      clock.advance(50);
      p.flush();
    };
    const at = () => [p.d.focused().textContent, p.s.focused()?.first?.first?.text];
    key('Home');
    assert.deepEqual(at(), ['Alpha', 'Alpha'], 'Home: the first shown');
    key('End');
    assert.deepEqual(at(), ['Gamma', 'Gamma'], 'End: the last shown');
    key('ArrowDown');
    assert.deepEqual(at(), ['Alpha', 'Alpha'], 'ArrowDown past the last wraps to the first shown');
    key('ArrowDown');
    assert.deepEqual(at(), ['Beta', 'Beta']);
    key('g');
    assert.deepEqual(at(), ['Gamma', 'Gamma'], 'type-ahead: g is Gamma');
    clock.advance(1000);
    key('a');
    assert.deepEqual(at(), ['Alpha', 'Alpha'], 'type-ahead wraps to the first shown');
    p.dispose();
  });
});

describe('Escape closes one layer', () => {
  /** A Modal opened by a button, holding `inner`; its open state per root. @param {() => any} inner */
  const inModal = inner => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const open = st.add($signal($active(), false));
      return (
        <>
          <Button onPress={() => $write(open, true)}>Open</Button>
          <Modal open={open} onOpenChange={(/** @type {boolean} */ v) => $write(open, v)} title="Hello">
            {inner()}
          </Modal>
        </>
      );
    });
    const p = pair(view);
    const settle = () => {
      clock.advance(250);
      p.flush();
    };
    p.d.press('Open');
    p.s.press('Open');
    settle();
    return { p, st, settle };
  };

  it('a Popover in a Modal: Escape on its trigger closes the popover only', () => {
    const pops = states();
    const { p, st, settle } = inModal(() => {
      const po = pops.add($signal($active(), false));
      return (
        <Popover open={po} onOpenChange={(/** @type {boolean} */ v) => $write(po, v)}>
          <Popover.Trigger>
            <Button>Pick</Button>
          </Popover.Trigger>
          <Popover.Panel>
            <Text>Panel text</Text>
          </Popover.Panel>
        </Popover>
      );
    });
    p.d.press('Pick');
    p.s.press('Pick');
    settle();
    assert.deepEqual(pops.list.map(x => $read(x)), [true, true]);
    p.d.find('Pick').focus();
    p.s.find('Pick').focus?.();
    p.d.key('Escape');
    p.s.key('Escape');
    settle();
    assert.deepEqual(pops.list.map(x => $read(x)), [false, false], 'the popover closed');
    assert.deepEqual(st.list.map(x => $read(x)), [true, true], 'the modal stays open');
    p.d.key('Escape');
    p.s.key('Escape');
    settle();
    assert.deepEqual(st.list.map(x => $read(x)), [false, false], 'a second Escape closes the modal');
    p.dispose();
  });

  it('a Select in a Modal: Escape in the open field closes the list only', () => {
    const { p, st, settle } = inModal(() => <Select aria-label="Fruit" options={['Apple', 'Pear']} />);
    const field = p.dom.document.querySelector('[role="combobox"]');
    field.focus();
    p.d.key('ArrowDown');
    settle();
    assert.equal(field.getAttribute('aria-expanded'), 'true', 'the list is open');
    p.d.key('Escape');
    settle();
    assert.equal(field.getAttribute('aria-expanded'), 'false', 'the list closed');
    assert.equal($read(st.list[0]), true, 'the modal stays open');
    p.dispose();
  });

  it('a Popover in a Popover, inline: Escape in the inner panel closes the inner one only', () => {
    const clock = manualClock();
    const outer = states();
    const inner = states();
    const view = app(clock, () => {
      const o = outer.add($signal($active(), false));
      const i = inner.add($signal($active(), false));
      return (
        <Popover open={o} onOpenChange={(/** @type {boolean} */ v) => $write(o, v)}>
          <Popover.Trigger>
            <Button>Outer</Button>
          </Popover.Trigger>
          <Popover.Panel>
            <Popover open={i} onOpenChange={(/** @type {boolean} */ v) => $write(i, v)}>
              <Popover.Trigger>
                <Button>Inner</Button>
              </Popover.Trigger>
              <Popover.Panel portal={false}>
                <Button>Deep</Button>
              </Popover.Panel>
            </Popover>
          </Popover.Panel>
        </Popover>
      );
    });
    const p = pair(view);
    const settle = () => {
      clock.advance(250);
      p.flush();
    };
    p.d.press('Outer');
    settle();
    p.d.press('Inner');
    settle();
    assert.deepEqual([$read(outer.list[0]), $read(inner.list[0])], [true, true]);
    p.d.find('Deep').focus();
    p.d.key('Escape');
    settle();
    assert.deepEqual([$read(outer.list[0]), $read(inner.list[0])], [true, false], 'the inner one closed, the outer stays');
    p.dispose();
  });
});

describe('Menu: order at scale', () => {
  it('keys a 1000-item menu in well under 100 ms: End, a type-ahead miss and a hit', () => {
    const clock = manualClock();
    const v = onDom(() => (
      <Rui>
        <Clock value={clock}>
          <Menu>
            <Menu.Trigger>
              <Button>Open</Button>
            </Menu.Trigger>
            <Menu.Panel>{Array.from({ length: 1000 }, (_, i) => <Menu.Item>{`Item ${i}`}</Menu.Item>)}</Menu.Panel>
          </Menu>
        </Clock>
      </Rui>
    ));
    const w = v.window;
    const key = (/** @type {string} */ k) => {
      (v.document.activeElement ?? v.document.body).dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      $flush(v.root);
    };
    [...v.host.querySelectorAll('[data-ren="Action"]')].find((/** @type {any} */ n) => n.textContent.trim() === 'Open').focus();
    key('ArrowDown');
    clock.advance(300);
    $flush(v.root);
    const timed = (/** @type {string} */ k) => {
      const t = performance.now();
      key(k);
      return performance.now() - t;
    };
    const end = timed('End');
    assert.equal(v.document.activeElement?.textContent, 'Item 999');
    const miss = timed('z');
    clock.advance(2000);
    const hit = timed('i');
    assert.equal(v.document.activeElement?.textContent, 'Item 0', 'the hit wraps to the first');
    for (const [name, ms] of /** @type {[string, number][]} */ ([['End', end], ['miss', miss], ['hit', hit]])) assert.ok(ms < 100, `${name}: ${ms.toFixed(1)} ms`);
    v.dispose();
  });

  it('orders items shown first by tree order, then those not built or detached, as they registered', async () => {
    const { inShownOrder } = await import('../src/core/shown.js');
    /** A drawn-scene-like node: parent, first, next. @param {any} parent */
    const node = parent => {
      const n = { parent, first: null, next: null };
      if (parent !== null) {
        if (parent.first === null) parent.first = n;
        else {
          let last = parent.first;
          while (last.next !== null) last = last.next;
          last.next = n;
        }
      }
      return /** @type {any} */ (n);
    };
    const root = node(null);
    const box = node(root);
    const [a, b] = [node(box), node(box)];
    const c = node(root);
    const detached = node(node(null));
    const recs = [{ name: 'c', node: c }, { name: 'none', node: null }, { name: 'detached', node: detached }, { name: 'b', node: b }, { name: 'a', node: a }, { name: 'none2', node: null }];
    const names = (/** @type {any[]} */ list) => list.map(r => r.name);
    assert.deepEqual(names(inShownOrder(recs)), ['a', 'b', 'c', 'none', 'detached', 'none2']);
    assert.deepEqual(names(inShownOrder([...recs].reverse())), ['a', 'b', 'c', 'none2', 'detached', 'none'], 'the unshown keep their registration order');
  });
});

describe('Menu: branches, checkbox and radio items, triggers and keys', () => {
  const branch = (within = true) => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const chosen = st.add($signal($active(), ''));
      return (
        <Menu portal={within}>
          <Menu.Trigger>
            <Button>Actions</Button>
          </Menu.Trigger>
          <Menu.Panel>
            <Menu.Item onPress={() => $write(chosen, 'new')}>New</Menu.Item>
            <Menu.Branch label="Export">
              <Menu.Item onPress={() => $write(chosen, 'pdf')}>PDF</Menu.Item>
              <Menu.Item onPress={() => $write(chosen, 'png')}>PNG</Menu.Item>
            </Menu.Branch>
            <Menu.Item onPress={() => $write(chosen, 'delete')}>Delete</Menu.Item>
          </Menu.Panel>
        </Menu>
      );
    });
    const p = pair(view);
    const settle = () => {
      clock.advance(200);
      p.flush();
    };
    p.d.find('Actions').focus();
    p.s.find('Actions').focus();
    p.d.press('Actions');
    p.s.press('Actions');
    settle();
    return { ...p, clock, settle, chosen: () => st.list.map(x => $read(x)) };
  };

  it('Menu.Branch opens beside its item on hover, and a choice in it closes every menu', () => {
    const { d, s, settle, chosen, dispose, clock, flush } = branch();
    assert.equal(d.text(), 'Actions New Export Delete');
    assert.equal(s.text(), 'Actions New Export Delete');
    const item = s.box(s.find('Export'));
    d.enter(d.find('Export').parentElement);
    s.move(item.x + 10, item.y + 5);
    clock.advance(BASE_MOTION.quick / 2);
    flush();
    assert.equal(d.text(), 'Actions New Export Delete', 'not yet: it opens after MOTION quick');
    settle();
    assert.equal(d.text(), 'Actions New Export Delete PDF PNG');
    assert.equal(s.text(), 'Actions New Export Delete PDF PNG');
    const drop = s.box(s.find('PDF').parent.parent.parent);
    const anchor = s.find('Export').parent.parent.parent;
    const menu = s.box(anchor.parent);
    assert.equal(Math.round(drop.x), Math.round(s.box(anchor).right + BASE_THEME.control.panelPad / 2), 'right of its item on Skia, half a panel pad off');
    assert.ok(drop.right > menu.right);
    assert.equal(Math.round(drop.y), Math.round(s.box(anchor).y), 'its top level with the item (right-start)');
    d.press('PNG');
    s.press('PNG');
    settle();
    assert.deepEqual(chosen(), ['png', 'png']);
    assert.equal(d.text(), 'Actions');
    assert.equal(s.text(), 'Actions');
    dispose();
  });

  for (const within of [true, false])
  it(`Menu.Branch: ArrowRight opens it on its first item, ArrowLeft and Escape close it back to its item (${within ? 'in the portal layer' : 'inline'})`, () => {
    const { d, s, settle, dispose } = branch(within);
    // Inline, the branch's menu follows its item in the DOM's tree; Skia paints it over the menu (its layer) either way.
    const open = 'Actions New Export Delete PDF PNG';
    const openDom = within ? open : 'Actions New Export PDF PNG Delete';
    for (const key of ['ArrowDown', 'ArrowDown']) {
      d.key(key);
      s.key(key);
    }
    assert.equal(d.focused().textContent, 'Export');
    d.key('ArrowRight');
    s.key('ArrowRight');
    settle();
    assert.equal(d.text(), openDom);
    assert.equal(s.text(), open);
    assert.equal(d.focused().textContent, 'PDF', 'on its first item on the DOM');
    assert.equal(s.focused()?.first?.first?.text, 'PDF', 'and on Skia');
    d.key('ArrowDown');
    s.key('ArrowDown');
    assert.equal(d.focused().textContent, 'PNG', 'the arrows walk the branch');
    assert.equal(s.focused()?.first?.first?.text, 'PNG');
    d.key('ArrowLeft');
    s.key('ArrowLeft');
    settle();
    assert.equal(d.text(), 'Actions New Export Delete', 'ArrowLeft closes only the branch');
    assert.equal(s.text(), 'Actions New Export Delete');
    assert.equal(d.focused().textContent, 'Export');
    assert.equal(s.focused()?.first?.first?.text, 'Export');
    d.key('Enter');
    s.key('Enter');
    settle();
    assert.ok(d.text() === openDom && s.text() === open, 'Enter opens it too');
    d.key('Escape');
    s.key('Escape');
    settle();
    assert.equal(d.text(), 'Actions New Export Delete', 'Escape closes only the branch');
    assert.equal(s.text(), 'Actions New Export Delete');
    dispose();
  });

  it('checkbox and radio items toggle their groups and keep the menu open', () => {
    const clock = manualClock();
    const cols = states();
    const sorts = states();
    const alone = states();
    const view = app(clock, () => {
      const columns = cols.add($signal($active(), ['name']));
      const sort = sorts.add($signal($active(), 'newest'));
      const wrap = alone.add($signal($active(), false));
      return (
        <Menu defaultOpen>
          <Menu.Trigger>
            <Button>View</Button>
          </Menu.Trigger>
          <Menu.Panel>
            <Menu.CheckboxGroup value={columns} onChange={(/** @type {string[]} */ v) => $write(columns, v)}>
              <Menu.CheckboxItem value="name">Name</Menu.CheckboxItem>
              <Menu.CheckboxItem value="email">Email</Menu.CheckboxItem>
            </Menu.CheckboxGroup>
            <Menu.Divider />
            <Menu.RadioGroup value={sort} onChange={(/** @type {string} */ v) => $write(sort, v)}>
              <Menu.RadioItem value="newest">Newest</Menu.RadioItem>
              <Menu.RadioItem value="oldest">Oldest</Menu.RadioItem>
            </Menu.RadioGroup>
            <Menu.CheckboxItem checked={wrap} onChange={(/** @type {boolean} */ v) => $write(wrap, v)}>Wrap</Menu.CheckboxItem>
          </Menu.Panel>
        </Menu>
      );
    });
    const { d, s, flush, dispose } = pair(view);
    clock.advance(200);
    flush();
    const marks = () => s.items().filter(i => Array.isArray(i.shapes) && i.shapes.length > 0).length;
    assert.equal(marks(), 2, 'a check and a dot on Skia');
    for (const t of ['Email', 'Name', 'Oldest', 'Wrap']) {
      d.press(t);
      s.press(t);
    }
    flush();
    assert.deepEqual(cols.list.map(x => $read(x)), [['email'], ['email']]);
    assert.deepEqual(sorts.list.map(x => $read(x)), ['oldest', 'oldest']);
    assert.deepEqual(alone.list.map(x => $read(x)), [true, true]);
    assert.equal(d.text(), 'View Name Email Newest Oldest Wrap', 'still open');
    assert.equal(s.text(), 'View Name Email Newest Oldest Wrap');
    assert.equal(marks(), 3, 'email, oldest and wrap marked');
    assert.equal(d.nodes('Shape').filter(n => n.querySelector('path, ellipse, circle') !== null).length, 3, 'and on the DOM');
    dispose();
  });

  it('openOn hover opens by hovering and closes on leaving; both opens both ways', () => {
    for (const openOn of ['hover', 'both']) {
      const clock = manualClock();
      const view = app(clock, () => (
        <Menu openOn={openOn} openDelay={50} closeDelay={100}>
          <Menu.Trigger>
            <Button>Hover</Button>
          </Menu.Trigger>
          <Menu.Panel>
            <Menu.Item>Inside</Menu.Item>
          </Menu.Panel>
        </Menu>
      ));
      const { d, s, flush, dispose } = pair(view);
      const t = s.box(s.find('Hover'));
      d.enter(d.find('Hover').parentElement);
      s.move(t.x + 5, t.y + 5);
      clock.advance(200);
      flush();
      assert.equal(d.text(), 'Hover Inside', openOn);
      assert.equal(s.text(), 'Hover Inside', openOn);
      d.leave(d.find('Hover').parentElement);
      s.move(470, 350);
      clock.advance(300);
      flush();
      assert.equal(d.text(), 'Hover', openOn);
      assert.equal(s.text(), 'Hover', openOn);
      if (openOn === 'both') {
        d.press('Hover');
        s.press('Hover');
        clock.advance(200);
        flush();
        assert.equal(d.text(), 'Hover Inside', 'a press opens it too');
        assert.equal(s.text(), 'Hover Inside');
      }
      dispose();
    }
  });

  it('loop false stops at the ends', () => {
    const a = menuWalk({ loop: false });
    assert.deepEqual(a.at(), ['Copy', 'Copy']);
    a.key('End');
    a.key('ArrowDown');
    assert.deepEqual(a.at(), ['Duplicate', 'Duplicate'], 'no wrap past the last');
    a.key('Home');
    a.key('ArrowUp');
    assert.deepEqual(a.at(), ['Copy', 'Copy'], 'nor before the first');
    a.dispose();
  });

  it('Tab closes the menu; tabbable it stays open', () => {
    const a = menuWalk({});
    a.key('Tab');
    a.clock.advance(200);
    a.flush();
    assert.equal(a.d.text(), 'Open');
    assert.equal(a.s.text(), 'Open');
    a.dispose();
    const b = menuWalk({ tabbable: true });
    b.key('Tab');
    b.clock.advance(200);
    b.flush();
    assert.equal(b.d.text(), 'Open Copy Cut Delete Duplicate');
    assert.equal(b.s.text(), 'Open Copy Cut Delete Duplicate');
    b.dispose();
  });

});

describe('Pin, ActionBar, Glider, Floater', () => {
  it('Pin sits at its place in the layer', () => {
    const view = () => (
      <Rui>
        <Pin at={{ top: 'sm', left: 16 }}>
          <Button>Up</Button>
        </Pin>
        <Pin>
          <Button>Corner</Button>
        </Pin>
      </Rui>
    );
    const { d, s, dispose } = pair(view);
    const at = round(s.box(fixedOf(s.find('Up'))));
    assert.deepEqual([at.x, at.y], [16, 12], 'at 16 px and sm (12) on Skia');
    const corner = s.box(fixedOf(s.find('Corner')));
    assert.deepEqual([Math.round(corner.right), Math.round(corner.bottom)], [480 - 24, 360 - 24], 'lg in from the bottom right corner on Skia');
    assert.ok(corner.width > 40 && corner.height > 20, 'as big as its button');
    const up = styledBy(d.find('Up'), 'top');
    assert.deepEqual([css(up).position, css(up).top, css(up).left, css(up)['z-index']], ['fixed', '12px', '16px', '10'], 'the raised layer');
    const fixed = styledBy(d.find('Corner'), 'bottom');
    assert.deepEqual([css(fixed).bottom, css(fixed).right], ['24px', '24px']);
    dispose();
  });

  const actionBar = () => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const open = st.add($signal($active(), true));
      return (
        <ActionBar open={open} onOpenChange={(/** @type {boolean} */ v) => $write(open, v)} at={{ bottom: 20 }}>
          <Text>3 selected</Text>
          <ActionBar.Divider />
          <Button>Archive</Button>
          <ActionBar.Close />
        </ActionBar>
      );
    });
    const p = pair(view);
    clock.advance(250);
    p.flush();
    return { ...p, clock, st };
  };

  it('ActionBar shows while open, centered at the bottom; its close button closes it (DOM)', () => {
    const { d, dom, clock, st, flush, dispose } = actionBar();
    assert.equal(d.text(), '3 selected Archive');
    const holder = styledBy(d.find('3 selected'), 'bottom');
    assert.deepEqual([css(holder).bottom, css(holder)['justify-content']], ['20px', 'center']);
    d.tap(dom.document.querySelector('[aria-label="Close"]'));
    assert.equal($read(st.list[0]), false);
    clock.advance(250);
    flush();
    assert.equal(d.text(), '');
    dispose();
  });

  it('ActionBar: Escape closes it by default; its Divider is a spacing gap, no line', () => {
    const { dom, st, flush, dispose } = actionBar();
    const divider = [...dom.document.querySelectorAll('[aria-hidden="true"]')].find((/** @type {any} */ n) => css(n).width === `${BASE_THEME.spacing.sm}px`);
    assert.ok(divider, 'a spacing sm gap');
    assert.ok(!css(divider)['background-color'] || css(divider)['background-color'] === 'transparent', 'no line');
    dom.document.querySelector('[role="toolbar"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flush();
    assert.equal($read(st.list[0]), false, 'Escape closed it');
    dispose();
  });

  it('ActionBar at the bottom of the canvas (Skia)', () => {
    const { s, st, dispose } = actionBar();
    assert.equal(s.text(), '3 selected Archive');
    const close = s.items().find(i => i.label === 'Close');
    s.at(s.box(close).x + 4, s.box(close).y + 4);
    assert.equal($read(st.list[1]), false);
    dispose();
  });

  it('Glider moves over the element it goes to on the Clock', () => {
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const R = $active();
      const parent = $signal(R, /** @type {any} */ (null));
      const a = $signal(R, /** @type {any} */ (null));
      const b = $signal(R, /** @type {any} */ (null));
      const on = st.add($signal(R, 'a'));
      return (
        <View ref={parent} style={{ direction: 'row', gap: 10, padding: 5 }}>
          <Action ref={a} text="First" style={{ width: 100 }} />
          <Action ref={b} text="Second" style={{ width: 150 }} />
          <Glider to={() => ($read(on) === 'a' ? $read(a) : $read(b))} within={parent} bg="blue.1" duration={160} />
        </View>
      );
    });
    const { d, s, flush, dispose } = pair(view);
    s.box(s.find('First'));
    clock.advance(32);
    flush();
    const row = () => s.find('First').parent;
    const indicator = () => s.items().filter(i => i.parent === row()).at(-1);
    assert.deepEqual([Math.round(s.box(indicator()).x - s.box(row()).x), Math.round(s.box(indicator()).width)], [5, 100], 'over the first');
    for (const o of st.list) $write(o, 'b');
    flush();
    clock.advance(16 + 80);
    flush();
    const mid = s.box(indicator());
    assert.ok(mid.width > 100 && mid.width < 150, `moving: ${mid.width}`);
    clock.advance(200);
    flush();
    assert.equal(Math.round(s.box(indicator()).width), 150, 'over the second');
    assert.equal(Math.round(s.box(indicator()).x), Math.round(s.box(s.find('Second')).x));
    assert.equal(css(d.nodes('View').at(-1)).position, 'absolute', 'placed absolutely on the DOM');
    dispose();
  });

  it('Glider follows the element it is on growing, as a font loading widens it', () => {
    // rui-show's demo on the DOM: measured before the page's font loaded, 3.5 px narrower than its button.
    const clock = manualClock();
    const st = states();
    const view = app(clock, () => {
      const R = $active();
      const parent = $signal(R, /** @type {any} */ (null));
      const a = $signal(R, /** @type {any} */ (null));
      const wide = st.add($signal(R, 100));
      return (
        <View ref={parent} style={{ direction: 'row', gap: 10, padding: 5 }}>
          <Action ref={a} text="First" style={() => ({ width: $read(wide) })} />
          <Glider to={a} within={parent} bg="blue.1" />
        </View>
      );
    });
    const { s, flush, dispose } = pair(view);
    s.box(s.find('First'));
    clock.advance(32);
    flush();
    const indicator = () => s.items().filter(i => i.parent === s.find('First').parent).at(-1);
    assert.equal(Math.round(s.box(indicator()).width), 100);
    for (const w of st.list) $write(w, 130);
    flush();
    s.box(s.find('First'));
    clock.advance(16 + 300);
    flush();
    assert.equal(Math.round(s.box(indicator()).width), 130, 'as wide as that element again');
    dispose();
  });

  it('Floater drags by its handle with the pointer', () => {
    const st = states();
    const view = () => (
      <Rui>
        <Floater defaultPosition={{ top: 40, left: 40 }} w={160} onPositionChange={(/** @type {any} */ p) => st.add(p)}>
          <Floater.Handle>
            <Text>Title bar</Text>
          </Floater.Handle>
          <Text>Body</Text>
        </Floater>
      </Rui>
    );
    const { d, s, dom, skia, flush, dispose } = pair(view);
    // Its handle drags it, not its body: only the handle shows the move cursor (the Handle says so after the window is made).
    const bar = styledBy(d.find('Title bar'), 'cursor');
    assert.equal(css(bar).cursor, 'move');
    assert.equal(css(styledBy(bar.parentElement, 'top')).cursor, undefined);
    const start = s.box(s.find('Title bar'));
    const x = start.x + 5;
    const y = start.y + 5;
    skia.skia.press(x, y);
    skia.skia.move(x + 30, y + 20);
    skia.skia.release(x + 30, y + 20);
    flush();
    const moved = s.box(s.find('Title bar'));
    assert.deepEqual([Math.round(moved.x - start.x), Math.round(moved.y - start.y)], [30, 20], 'dragged on Skia');
    const body = s.box(s.find('Body'));
    skia.skia.press(body.x + 2, body.y + 2);
    skia.skia.move(body.x + 60, body.y + 60);
    skia.skia.release(body.x + 60, body.y + 60);
    flush();
    assert.equal(Math.round(s.box(s.find('Title bar')).x - start.x), 30, 'the body does not drag it');
    const handle = styledBy(d.find('Title bar'), 'cursor');
    const w = dom.window;
    handle.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50, pointerId: 1, button: 0 }));
    handle.dispatchEvent(new w.PointerEvent('pointermove', { bubbles: true, clientX: 80, clientY: 70, pointerId: 1 }));
    handle.dispatchEvent(new w.PointerEvent('pointerup', { bubbles: true, clientX: 80, clientY: 70, pointerId: 1 }));
    flush();
    const win = styledBy(handle.parentElement, 'top');
    assert.deepEqual([css(win).top, css(win).left], ['60px', '70px'], 'dragged on the DOM');
    assert.deepEqual(st.list.at(-1), { top: 60, left: 70 });
    dispose();
  });
  it('Floater stays inside the viewport while dragged (contained, margin)', () => {
    for (const contained of [true, false]) {
      const st = states();
      const view = () => (
        <Rui>
          <Floater defaultPosition={{ top: 40, left: 40 }} w={160} contained={contained} margin={10} onPositionChange={(/** @type {any} */ p) => st.add(p)}>
            <Text>Window</Text>
          </Floater>
        </Rui>
      );
      const { d, s, dom, skia, flush, dispose } = pair(view);
      const start = s.box(s.find('Window'));
      skia.skia.press(start.x + 2, start.y + 2);
      skia.skia.move(start.x + 600, start.y + 600);
      skia.skia.release(start.x + 600, start.y + 600);
      flush();
      const win = s.box(s.find('Window').parent);
      if (contained) assert.deepEqual([Math.round(win.right), Math.round(win.bottom)], [470, 350], 'at the corner less the offset on Skia');
      else assert.ok(win.x > 480, 'past the edge when not contained');
      const boxes = lend(dom);
      const node = styledBy(d.find('Window'), 'top');
      boxes.set(node, { getBoundingClientRect: () => ({ x: 40, y: 40, width: 160, height: Math.round(win.height) }) });
      const w = dom.window;
      node.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50, pointerId: 1, button: 0 }));
      node.dispatchEvent(new w.PointerEvent('pointermove', { bubbles: true, clientX: 650, clientY: 650, pointerId: 1 }));
      node.dispatchEvent(new w.PointerEvent('pointerup', { bubbles: true, clientX: 650, clientY: 650, pointerId: 1 }));
      flush();
      if (contained) {
        assert.deepEqual([css(node).left, css(node).top], [`${480 - 160 - 10}px`, `${360 - Math.round(win.height) - 10}px`], 'the same on the DOM');
        assert.deepEqual(st.list.at(-1), st.list.at(-2), 'the same position reported on both');
      } else assert.equal(css(node).left, '640px');
      dispose();
    }
  });

  // happy-dom lays nothing out: the page is lent a 480 by 800 viewport, the
  // nested root's host a frame 120 px high near its bottom, and the window's box.
  it('Floater in a nested DOM root stays inside its host while dragged', () => {
    const st = states();
    const view = () => (
      <Root id="frame">
        {() => (
          <Rui>
            <Floater defaultPosition={{ top: 40, left: 40 }} w={160} margin={10} onPositionChange={(/** @type {any} */ p) => st.add(p)}>
              <Text>Window</Text>
            </Floater>
          </Rui>
        )}
      </Root>
    );
    const dom = onDom(view, { width: 480, height: 800 });
    const boxes = lend(dom, { width: 480, height: 800 });
    const host = dom.document.querySelector('[data-ren-root="frame"]');
    const room = [...host.children].find(n => {
      const c = css(n);
      return c.position === 'absolute' && c.top === '0px' && c.bottom === '0px' && c['pointer-events'] === 'none';
    });
    if (room !== undefined) boxes.set(room, { getBoundingClientRect: () => ({ x: 0, y: 600, width: 480, height: 120 }) });
    const label = [...host.querySelectorAll('[data-ren="Label"]')].find(n => n.textContent === 'Window');
    const node = styledBy(label, 'top');
    boxes.set(node, { getBoundingClientRect: () => ({ x: 40, y: 640, width: 160, height: 40 }) });
    const w = dom.window;
    node.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 650, pointerId: 1, button: 0 }));
    node.dispatchEvent(new w.PointerEvent('pointermove', { bubbles: true, clientX: 650, clientY: 1250, pointerId: 1 }));
    node.dispatchEvent(new w.PointerEvent('pointerup', { bubbles: true, clientX: 650, clientY: 1250, pointerId: 1 }));
    assert.deepEqual(st.list.at(-1), { top: 120 - 40 - 10, left: 480 - 160 - 10 }, "the host's bottom right corner less the margin, in its own coordinates");
    dom.dispose();
  });

  it('Floater resizes by its Grip within its bounds', () => {
    const st = states();
    /** @type {string[]} */
    const heard = [];
    const view = () => (
      <Rui>
        <Floater
          defaultPosition={{ top: 40, left: 40 }}
          defaultSize={{ width: 200, height: 120 }}
          bounds={{ min: { width: 150, height: 100 }, max: { width: 260 } }}
          onSizeChange={(/** @type {any} */ v) => st.add(v)}
          onResize={(/** @type {string} */ phase) => heard.push(phase)}
        >
          <Text>Sized</Text>
          <Floater.Grip />
        </Floater>
      </Rui>
    );
    const { d, s, dom, skia, flush, dispose } = pair(view);
    const win = () => s.box(s.find('Sized').parent);
    assert.deepEqual([Math.round(win().width), Math.round(win().height)], [200, 120]);
    const corner = win();
    skia.skia.press(corner.right - 6, corner.bottom - 6);
    skia.skia.move(corner.right + 94, corner.bottom + 24);
    skia.skia.release(corner.right + 94, corner.bottom + 24);
    flush();
    assert.deepEqual([Math.round(win().width), Math.round(win().height)], [260, 150], 'wider up to bounds.max.width, higher on Skia');
    assert.deepEqual(heard, ['start', 'end'], 'onResize hears each phase once a drag');
    assert.equal(Math.round(win().x), Math.round(corner.x), 'the window did not move');
    const handle = [...dom.document.body.querySelectorAll('[data-ren="Action"]')].find(n => css(n).cursor === 'nwse-resize');
    const w = dom.window;
    handle.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, clientX: 230, clientY: 150, pointerId: 1, button: 0 }));
    handle.dispatchEvent(new w.PointerEvent('pointermove', { bubbles: true, clientX: 330, clientY: 180, pointerId: 1 }));
    handle.dispatchEvent(new w.PointerEvent('pointerup', { bubbles: true, clientX: 330, clientY: 180, pointerId: 1 }));
    flush();
    const node = styledBy(d.find('Sized'), 'top');
    assert.deepEqual([css(node).width, css(node).height, css(node).left], ['260px', '150px', '40px'], 'the same on the DOM, not dragged');
    assert.deepEqual(st.list.at(-1), { width: 260, height: 150 });
    dispose();
  });

  it('Floater resizes from the keyboard: its Grip takes focus, arrows step spacing.xs, Shift spacing.xl', () => {
    const st = states();
    /** @type {string[]} */
    const heard = [];
    const view = () => (
      <Rui>
        <Floater
          defaultPosition={{ top: 40, left: 40 }}
          defaultSize={{ width: 200, height: 120 }}
          bounds={{ min: { width: 150, height: 100 }, max: { width: 230 } }}
          onSizeChange={(/** @type {any} */ v) => st.add(v)}
          onResize={(/** @type {string} */ phase) => heard.push(phase)}
        >
          <Text>Keyed</Text>
          <Floater.Grip />
        </Floater>
      </Rui>
    );
    const { d, s, dom, skia, flush, dispose } = pair(view);
    const win = () => s.box(s.find('Keyed').parent);
    // Skia: Tab reaches the handle, the window's one focusable.
    s.key('Tab');
    assert.equal(s.focused()?.label, 'Drag to resize', 'the handle takes focus');
    s.key('ArrowRight');
    s.key('ArrowDown');
    assert.deepEqual([Math.round(win().width), Math.round(win().height)], [208, 128], 'spacing.xs (8 px) a press');
    skia.skia.key('ArrowRight', true);
    skia.skia.key('ArrowUp', true);
    flush();
    assert.deepEqual([Math.round(win().width), Math.round(win().height)], [230, 100], 'Shift: spacing.xl (32 px), within bounds.max.width and bounds.min.height');
    assert.deepEqual(heard.slice(0, 2), ['start', 'end'], 'a resize of its own each press');
    // The DOM: the handle is a focusable button with its name.
    const handle = [...dom.document.body.querySelectorAll('[data-ren="Action"]')].find(n => css(n).cursor === 'nwse-resize');
    assert.equal(handle.getAttribute('aria-label') ?? handle.textContent, 'Drag to resize');
    handle.focus();
    assert.equal(d.focused(), handle);
    d.key('ArrowLeft');
    handle.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
    flush();
    const node = styledBy(d.find('Keyed'), 'top');
    assert.deepEqual([css(node).width, css(node).height], ['192px', '152px'], 'the same steps on the DOM');
    d.key('Enter');
    assert.deepEqual([css(node).width, css(node).height], ['192px', '152px'], 'other keys leave it');
    assert.deepEqual(st.list.at(-1), { width: 192, height: 152 });
    dispose();
  });

  it('Floater takes a controlled size: it shows `size` and asks onSizeChange for the next', () => {
    /** @type {any[]} */
    const asked = [];
    const view = () => (
      <Rui>
        <Floater defaultPosition={{ top: 40, left: 40 }} size={{ width: 200, height: 120 }} onSizeChange={(/** @type {any} */ v) => asked.push(v)}>
          <Text>Held</Text>
          <Floater.Grip />
        </Floater>
      </Rui>
    );
    const { s, flush, dispose } = pair(view);
    const win = () => s.box(s.find('Held').parent);
    assert.deepEqual([Math.round(win().width), Math.round(win().height)], [200, 120]);
    s.key('Tab');
    s.key('ArrowRight');
    flush();
    assert.deepEqual(asked, [{ width: 208, height: 120 }], 'the next size asked for');
    assert.deepEqual([Math.round(win().width), Math.round(win().height)], [200, 120], 'held until the owner sets it');
    dispose();
  });
});


describe('Tooltip.Follow sits beside the pointer', () => {
  it('on its side, never over the pointer, and reaching by its alignment (Skia)', () => {
    /** @type {Record<string, (tip: any, px: number, py: number) => boolean>} */
    const where = {
      'bottom-end': (t, px, py) => t.y >= py && Math.abs(t.x - px) < 1,
      'bottom-start': (t, px, py) => t.y >= py && Math.abs(t.x + t.width - px) < 1,
      bottom: (t, px, py) => t.y >= py && Math.abs(t.x + t.width / 2 - px) < 1,
      top: (t, px, py) => t.y + t.height <= py && Math.abs(t.x + t.width / 2 - px) < 1,
      'top-start': (t, px, py) => t.y + t.height <= py && Math.abs(t.x + t.width - px) < 1,
      left: (t, px, py) => t.x + t.width <= px && Math.abs(t.y + t.height / 2 - py) < 1,
      'left-end': (t, px, py) => t.x + t.width <= px && Math.abs(t.y - py) < 1,
      right: (t, px, py) => t.x >= px && Math.abs(t.y + t.height / 2 - py) < 1,
    };
    for (const [at, placed] of Object.entries(where)) {
      const view = () => (
        <Clock value={manualClock()}>
          <Rui>
            <View style={{ padding: 80 }}>
              <Tooltip.Follow label="Here" at={at}>
                <Box w={200} h={60}>
                  <Text>Area</Text>
                </Box>
              </Tooltip.Follow>
            </View>
          </Rui>
        </Clock>
      );
      const { s, flush, dispose } = pair(view);
      const area = s.box(s.find('Area').parent);
      const px = area.x + 100;
      const py = area.y + 30;
      s.move(px, py);
      flush();
      const tip = s.box(s.find('Here').parent);
      const covers = px >= tip.x && px <= tip.x + tip.width && py >= tip.y && py <= tip.y + tip.height;
      assert.ok(!covers, `${at}: not over the pointer`);
      assert.ok(placed(tip, px, py), `${at}: placed by its side and alignment: ${JSON.stringify({ x: tip.x, y: tip.y, w: tip.width, h: tip.height })} for ${px}, ${py}`);
      dispose();
    }
  });
});

describe('Glider inside a bordered box', () => {
  it('lands over its element, a border around it or none (Skia)', () => {
    for (const border of [0, 10]) {
      const clock = manualClock();
      const view = app(clock, () => {
        const R = $active();
        const parent = $signal(R, null);
        const a = $signal(R, null);
        return (
          <View ref={parent} style={{ direction: 'row', gap: 10, padding: 5, border }}>
            <Action ref={a} text="First" style={{ width: 100 }} />
            <Glider to={() => $read(a)} within={parent} bg="blue.1" />
          </View>
        );
      });
      const { s, flush, dispose } = pair(view);
      clock.advance(32);
      flush();
      const row = s.find('First').parent;
      const glider = s.items().filter((/** @type {any} */ i) => i.parent === row).at(-1);
      const g = s.box(glider);
      const f = s.box(s.find('First'));
      assert.deepEqual([Math.round(g.x), Math.round(g.y), Math.round(g.width)], [Math.round(f.x), Math.round(f.y), Math.round(f.width)], `border ${border}`);
      dispose();
    }
  });
});
