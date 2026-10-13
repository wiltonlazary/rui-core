// Drags under a touch, on every renderer: every drag surface tells the
// browser not to pan the page under it (the portable style's
// `touchAction`: CSS's on the DOM, the canvas's own touch handling on
// Skia), or a touch drags a few pixels before the page scrolls and the
// browser takes the pointer back. A carousel keeps the page's scroll along
// the other axis. And a press the browser takes back anyway ends with
// `onPointerCancel` and no `pointerup`: the drag ends where its last move
// left it (the cancel's point is not the pointer's).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';
import { Rui, Text, Slider, RangeSlider, AngleSlider, HueSlider, ColorPicker, Floater, Panes } from 'rui-core';
import { Carousel } from 'rui-core/carousel';
import { Compare, Window, Gantt } from 'rui-core/more';
import { onDom, onSkia } from './harness.jsx';

/** The primitives with a touch-action on the DOM, as `role value`, in document order. @param {() => any} view */
const touched = view => {
  const dom = onDom(() => <Rui>{view()}</Rui>);
  $flush(dom.root);
  const out = [...dom.document.querySelectorAll('[data-ren]')].filter(n => n.style.getPropertyValue('touch-action') !== '').map(n => `${n.getAttribute('data-ren')} ${n.style.getPropertyValue('touch-action')}`);
  dom.dispose();
  return out;
};

describe('drag surfaces under a touch', () => {
  it('keep the touch for their drag: sliders, pickers, pane handles, windows', () => {
    assert.deepEqual(touched(() => <Slider defaultValue={20} />), ['View none']);
    assert.deepEqual(touched(() => <RangeSlider defaultValue={[20, 60]} />), ['View none']);
    assert.deepEqual(touched(() => <AngleSlider defaultValue={90} />), ['Action none']);
    assert.deepEqual(touched(() => <HueSlider value={120} />), ['View none']);
    // The saturation panel, the hue and the alpha.
    assert.deepEqual(touched(() => <ColorPicker format="rgb" alpha defaultValue="rgba(10, 20, 30, 0.5)" />), ['View none', 'View none', 'View none']);
    assert.deepEqual(
      touched(() => (
        <Panes w={460} h={200} defaultSizes={[150]}>
          <Panes.Pane>
            <Text>Left</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>Right</Text>
          </Panes.Pane>
        </Panes>
      )),
      ['Action none'],
    );
    // The whole window without a handle; only the handle and the grip with them.
    assert.deepEqual(
      touched(() => (
        <Floater portal={false}>
          <Text>Window</Text>
        </Floater>
      )),
      ['View none'],
    );
    assert.deepEqual(
      touched(() => (
        <Floater portal={false} defaultSize={{ width: 200, height: 120 }}>
          <Floater.Handle>
            <Text>Title</Text>
          </Floater.Handle>
          <Floater.Grip />
        </Floater>
      )),
      ['View none', 'Action none'],
    );
    // The title bar and the three edges.
    assert.deepEqual(touched(() => <Window title="A" portal={false} defaultPosition={{ x: 0, y: 0 }} defaultSize={{ width: 200, height: 120 }} />).length, 4);
    // A bar and its two ends, while editable.
    const tasks = [{ id: 'a', name: 'Design', start: '2026-09-01', end: '2026-09-05' }];
    assert.deepEqual(touched(() => <Gantt tasks={tasks} dayWidth={30} labelWidth={100} />), ['View none', 'View none', 'View none']);
    assert.deepEqual(touched(() => <Gantt tasks={tasks} dayWidth={30} labelWidth={100} editable={false} />), []);
  });

  it('keep the page\'s scroll along the other axis where they drag along one: a carousel, a compare', () => {
    const slides = () => [
      <Carousel.Slide>
        <Text>one</Text>
      </Carousel.Slide>,
      <Carousel.Slide>
        <Text>two</Text>
      </Carousel.Slide>,
    ];
    assert.deepEqual(touched(() => <Carousel height={120}>{slides()}</Carousel>), ['View pan-y pinch-zoom']);
    assert.deepEqual(touched(() => <Carousel height={120} orientation="vertical">{slides()}</Carousel>), ['View pan-x pinch-zoom']);
    assert.deepEqual(touched(() => <Carousel height={120} draggable={false}>{slides()}</Carousel>), []);
    assert.deepEqual(touched(() => <Compare w={400} h={200} before={<Text>Before</Text>} after={<Text>After</Text>} />), ['View pan-y pinch-zoom']);
    assert.deepEqual(touched(() => <Compare w={400} h={200} mode="hover" before={<Text>Before</Text>} after={<Text>After</Text>} />), []);
  });

  it('keep the touch on the canvases too: the canvas answers the style\'s touch-action', () => {
    // The bits a touch at the point leaves to the browser: 1 pan-x, 2 pan-y, 4 pinch-zoom (-1: none set).
    const at = (/** @type {() => any} */ view, /** @type {(item: any) => boolean} */ pick) => {
      const skia = onSkia(() => <Rui>{view()}</Rui>);
      const item = primitives(skia).find(pick);
      const r = item.getBoundingClientRect();
      const bits = skia.skia.touchAction(r.left + r.width / 2, r.top + r.height / 2);
      skia.dispose();
      return bits;
    };
    assert.equal(
      at(
        () => <Slider defaultValue={20} />,
        n => n.pointers,
      ),
      0,
    );
    assert.equal(
      at(
        () => (
          <Carousel height={120}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
          </Carousel>
        ),
        n => n.pointers,
      ),
      2 | 4,
    );
  });

  it('end a drag the browser takes back where its last move left it: a Slider commits its value', () => {
    /** @type {number[]} */
    const ends = [];
    /** @type {number[]} */
    const values = [];
    const view = () => (
      <Rui>
        <Slider defaultValue={20} onChange={(/** @type {number} */ v) => values.push(v)} onCommit={(/** @type {number} */ v) => ends.push(v)} />
      </Rui>
    );
    const dom = onDom(view);
    $flush(dom.root);
    // The track area: the drag surface.
    const area = /** @type {any} */ ([...dom.document.querySelectorAll('[data-ren=View]')].find(n => n.style.getPropertyValue('touch-action') === 'none'));
    area.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 20, width: 200, height: 20, x: 0, y: 0 });
    const send = (/** @type {string} */ type, /** @type {number} */ x) => {
      area.dispatchEvent(new dom.window.PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: 10, pointerId: 2, pointerType: 'touch' }));
      $flush(dom.root);
    };
    send('pointerdown', 40);
    send('pointermove', 100);
    // Chrome's cancel carries no point.
    send('pointercancel', 0);
    assert.deepEqual(ends, [50]);
    // Ended: a later move changes nothing.
    send('pointermove', 180);
    assert.equal(values.at(-1), 50);
    dom.dispose();

    ends.length = 0;
    values.length = 0;
    const skia = onSkia(view);
    const r = primitives(skia)
      .find(n => n.pointers)
      .getBoundingClientRect();
    const y = r.top + r.height / 2;
    skia.skia.press(r.left + r.width * 0.2, y);
    skia.skia.move(r.left + r.width * 0.5, y);
    skia.skia.cancel(0, 0);
    $flush(skia.root);
    assert.deepEqual(ends, [50]);
    skia.skia.move(r.left + r.width * 0.9, y);
    $flush(skia.root);
    assert.equal(values.at(-1), 50);
    skia.dispose();
  });

  it('end every drag on a cancel: a window moved stays, a press taken back is no click', () => {
    /** @type {any[]} */
    const moves = [];
    /** @type {string[]} */
    const phases = [];
    /** @type {any[]} */
    const clicks = [];
    const tasks = [{ id: 'a', name: 'Design', start: '2026-09-01', end: '2026-09-05' }];
    const skia = onSkia(() => (
      <Rui>
        <Window title="A" portal={false} defaultPosition={{ x: 0, y: 0 }} defaultSize={{ width: 200, height: 120 }} onPositionChange={(/** @type {any} */ p) => moves.push(p)} onMove={(/** @type {string} */ phase) => phases.push(phase)} />
      </Rui>
    ));
    // The title bar: the widest item holding the pointer, at the top.
    const bar = primitives(skia)
      .filter(n => n.pointers)
      .map(n => n.getBoundingClientRect())
      .sort((a, b) => a.top - b.top || b.width - a.width)[0];
    skia.skia.press(bar.left + 60, bar.top + 10);
    skia.skia.move(bar.left + 90, bar.top + 30);
    skia.skia.cancel(0, 0);
    $flush(skia.root);
    assert.deepEqual(moves.at(-1), { x: 30, y: 20 }, 'the window stays where the last move left it');
    assert.deepEqual(phases, ['start', 'end'], 'the cancel ends the move');
    const seen = moves.length;
    skia.skia.move(bar.left + 150, bar.top + 60);
    $flush(skia.root);
    assert.equal(moves.length, seen, 'ended: a later move drags nothing');
    assert.deepEqual(phases, ['start', 'end']);
    skia.dispose();

    const gantt = onSkia(() => (
      <Rui>
        <Gantt tasks={tasks} dayWidth={30} labelWidth={100} onTaskPress={(/** @type {any} */ t) => clicks.push(t.id)} onTaskChange={(/** @type {any} */ t) => clicks.push(t)} />
      </Rui>
    ));
    const task = primitives(gantt)
      .filter(n => n.pointers)
      .map(n => n.getBoundingClientRect())
      .sort((a, b) => b.width - a.width)[0];
    gantt.skia.press(task.left + task.width / 2, task.top + task.height / 2);
    gantt.skia.cancel(0, 0);
    $flush(gantt.root);
    assert.deepEqual(clicks, []);
    gantt.dispose();
  });
});

/** Every primitive on the canvas, in tree order. @param {any} skia */
function primitives(skia) {
  skia.skia.present();
  /** @type {any[]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      if (c.kind <= 7) out.push(c);
      walk(c);
    }
  };
  walk(skia.skia.root);
  return out;
}
