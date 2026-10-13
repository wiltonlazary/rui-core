// rui-core/more, moving goodies: TextAnimate and Flip on a manual clock,
// Window, Onboarding, Parallax and Gantt with drags, presses and keys, the
// same on the DOM and on Skia.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush, $signal, $write, $read } from 'rrx-core';
import { $active } from 'ren-core';
import { Rui, Clock as Time, manualClock, Text, Button, Pressable, LAYERS } from 'rui-core';
import { TextAnimate, Flip, Window, Onboarding, Parallax, Gantt, Book, segmentsOf, rescheduled, bookSlots } from 'rui-core/more';
import { both } from './harness.jsx';
import { primitives, drag, mirror, center, pressLabel, keyOn, action, allText, domPress } from './more-harness.jsx';

/** A Skia Label item by its text. @param {any} skia @param {string} text */
const labelOf = (skia, text) => primitives(skia).find(i => i.kind === 3 && i.caption === text);
/** A DOM Label node by its text. @param {any} dom @param {string} text */
const domLabel = (dom, text) => [...dom.document.querySelectorAll('[data-ren="Label"]')].find(n => n.textContent === text);

describe('TextAnimate on the DOM and on Skia', () => {
  it('splits text into segments', () => {
    assert.deepEqual(segmentsOf('Hello big  world', 'words'), ['Hello', 'big', 'world']);
    assert.deepEqual(segmentsOf('ab c', 'chars'), ['a', 'b', ' ', 'c']);
    assert.deepEqual(segmentsOf('one\ntwo', 'lines'), ['one', 'two']);
    assert.deepEqual(segmentsOf('all', false), ['all']);
  });

  it('brings words in one after another, frame by frame, the same on both', () => {
    const clock = manualClock();
    let ended = 0;
    const view = () => (
      <Time value={clock}>
        <Rui>
          <TextAnimate effect="rise" duration={200} stagger={100} easing="linear" onEnd={() => ended++}>
            Portable text moves
          </TextAnimate>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Portable text moves');
    assert.equal(skia.text(), dom.text());
    const state = () => {
      $flush(dom.root);
      $flush(skia.root);
      return ['Portable', 'text', 'moves'].map(w => {
        const d = domLabel(dom, w).style;
        const s = labelOf(skia, w).style;
        assert.equal(Number(d.opacity || 1), s.opacity, `${w}: the same opacity`);
        // rise: the theme's spacing xs (8 px) below its place (EFFECTS), a transform on both.
        const y = parseFloat((d.translate || '0px 0px').split(' ')[1]);
        assert.equal(Math.round((s.translateY || 0) * 100) / 100, Math.round(y * 100) / 100, `${w}: the same move`);
        return [Math.round(s.opacity * 100) / 100, y];
      });
    };
    assert.deepEqual(state(), [[0, 8], [0, 8], [0, 8]]);
    clock.advance(96);
    assert.deepEqual(state(), [[0.48, 4.16], [0, 8], [0, 8]]);
    clock.advance(200);
    assert.deepEqual(state().map(s => s[0]), [1, 0.98, 0.48]);
    clock.advance(200);
    assert.deepEqual(state(), [[1, 0], [1, 0], [1, 0]]);
    assert.equal(ended, 2, 'each root ends once');
    assert.equal(clock.pending(), 0, 'no frames once done');
    dispose();
  });

  it('shows the text as it is with play false, and splits by chars or not at all', () => {
    const clock = manualClock();
    const view = () => (
      <Time value={clock}>
        <Rui>
          <TextAnimate play={false} split={false}>All at once</TextAnimate>
          <TextAnimate split="chars" effect="fade">Hi</TextAnimate>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    $flush(skia.root);
    assert.equal(labelOf(skia, 'All at once').style.opacity, 1, 'one segment, in place, no play');
    assert.deepEqual(['H', 'i'].map(c => labelOf(skia, c).style.opacity), [0, 0], 'a segment a character, waiting to play in');
    assert.equal(skia.text(), dom.text());
    dispose();
  });
});

/** Runs `write` from a timer, outside any handler or view being built. @param {() => void} write */
const fromTimer = write =>
  new Promise((resolve, reject) =>
    // timer: feature, the write under test comes from a timer, outside any handler
    setTimeout(() => {
      try {
        write();
        resolve(undefined);
      } catch (error) {
        reject(error);
      }
    }),
  );

describe('TextAnimate and Flip moved by a value written from a timer', () => {
  it('replays the text and turns the card on the clock, on the DOM and on Skia', async () => {
    const clock = manualClock();
    /** @type {any[]} */
    const words = [];
    /** @type {any[]} */
    const flipped = [];
    const view = () => {
      const R = $active();
      const text = $signal(R, 'One');
      const turned = $signal(R, false);
      words.push(text);
      flipped.push(turned);
      return (
        <Time value={clock}>
          <Rui>
            <TextAnimate effect="fade" duration={100} easing="linear" text={text} />
            <Flip w={200} h={120} duration={100} flipped={turned}>
              <Flip.Front>
                <Text>Front</Text>
              </Flip.Front>
              <Flip.Back>
                <Text>Back</Text>
              </Flip.Back>
            </Flip>
          </Rui>
        </Time>
      );
    };
    const { dom, skia, dispose } = both(view);
    clock.advance(200);
    await fromTimer(() => {
      for (const s of words) $write(s, 'Two');
      for (const s of flipped) $write(s, true);
      $flush(dom.root);
      $flush(skia.root);
    });
    $flush(skia.root);
    assert.equal(labelOf(skia, 'Two').style.opacity, 0, 'the new text waits to play in');
    clock.advance(200);
    $flush(dom.root);
    $flush(skia.root);
    assert.equal(labelOf(skia, 'Two').style.opacity, 1, 'and plays in on the clock');
    assert.equal(Number(domLabel(dom, 'Two').style.opacity || 1), 1);
    assert.match(allText(dom), /Back/, 'the card turned to its back on the DOM');
    assert.match(skia.text(), /Back/, 'and on Skia');
    assert.equal(clock.pending(), 0, 'no frames once done');
    dispose();
  });
});

describe('Flip on the DOM and on Skia', () => {
  it('turns the front away and the back in (a scale across through 0) on the clock, toggled by its trigger', () => {
    const clock = manualClock();
    /** @type {boolean[]} */
    const changes = [];
    const view = () => (
      <Time value={clock}>
        <Rui>
          <Flip w={200} h={120} duration={400} onFlippedChange={(/** @type {boolean} */ v) => changes.push(v)}>
            <Flip.Front>
              <Flip.Trigger>
                <Text>Front</Text>
              </Flip.Trigger>
            </Flip.Front>
            <Flip.Back>
              <Flip.Trigger>
                <Text>Back</Text>
              </Flip.Trigger>
            </Flip.Back>
          </Flip>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Front');
    assert.equal(skia.text(), 'Front');
    domPress(dom, 'Front');
    skia.press('Front');
    assert.deepEqual(changes, [true, true]);
    // The face's scale across on both, and the width Skia paints it at.
    const scaleOf = () => {
      $flush(dom.root);
      let item = labelOf(skia, allText(dom));
      while (Number.isNaN(item.style.scaleX)) item = item.parent;
      let node = domLabel(dom, allText(dom));
      while (!/scale:/.test(node.getAttribute('style') ?? '')) node = node.parentElement;
      assert.equal(/scale: ([^;]*);/.exec(node.getAttribute('style'))?.[1], `${item.style.scaleX} 1`, 'the same scale on the DOM');
      assert.equal(Math.round(item.w), 200, 'laid out whole: the scale is painted, not reflowed');
      assert.equal(Math.round(item.getBoundingClientRect().width), Math.round(200 * item.style.scaleX), 'its rect is as wide as painted, as the DOM\'s');
      return item.style.scaleX;
    };
    assert.equal(scaleOf(), 1);
    clock.advance(96);
    const s1 = scaleOf();
    assert.ok(s1 < 1 && s1 > 0.5, `narrowing: ${s1}`);
    const painted = () => {
      skia.text();
      const texts = skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'transform');
      return texts.map((/** @type {any[]} */ c) => Math.round(c[1] * 1000) / 1000);
    };
    assert.deepEqual(painted(), [s1], 'Skia paints the face scaled across');
    clock.advance(160);
    assert.equal(allText(dom), 'Back', 'past the half turn: the back');
    assert.equal(skia.text(), 'Back');
    clock.advance(200);
    assert.equal(scaleOf(), 1);
    dispose();
  });

  it('starts from defaultFlipped and turns in a MOTION preset by name', () => {
    const clock = manualClock();
    /** @type {boolean[]} */
    const changes = [];
    const view = () => (
      <Time value={clock}>
        <Rui>
          <Flip w={200} h={120} defaultFlipped duration="quick" onFlippedChange={(/** @type {boolean} */ v) => changes.push(v)}>
            <Flip.Front>
              <Text>Front</Text>
            </Flip.Front>
            <Flip.Back>
              <Flip.Trigger>
                <Text>Back</Text>
              </Flip.Trigger>
            </Flip.Back>
          </Flip>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(allText(dom), 'Back');
    domPress(dom, 'Back');
    skia.press('Back');
    assert.deepEqual(changes, [false, false]);
    // 'quick' is 110 ms: past it, the front is in place.
    clock.advance(60);
    clock.advance(60);
    $flush(dom.root);
    assert.equal(allText(dom), 'Front');
    assert.equal(skia.text(), 'Front');
    dispose();
  });
});

describe('Window on the DOM and on Skia', () => {
  it('drags by its title bar, resizes by its corner, minimizes and closes', () => {
    /** @type {any[]} */
    const moves = [];
    /** @type {any[]} */
    const sizes = [];
    let closed = 0;
    /** @type {boolean[]} */
    const folds = [];
    /** @type {string[]} */
    const phases = [];
    const view = () => (
      <Rui>
        <Window
          title="Notes"
          onCollapsedChange={(/** @type {boolean} */ c) => folds.push(c)}
          defaultPosition={{ x: 10, y: 10 }}
          defaultSize={{ width: 240, height: 160 }}
          bounds={{ min: { width: 200 } }}
          onMove={(/** @type {string} */ p) => phases.push(`move ${p}`)}
          onResize={(/** @type {string} */ p) => phases.push(`resize ${p}`)}
          onPositionChange={(/** @type {any} */ p) => moves.push(p)}
          onSizeChange={(/** @type {any} */ s) => sizes.push(s)}
          onOpenChange={(/** @type {boolean} */ open) => !open && closed++}
        >
          <Text>Body</Text>
        </Window>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 360 });
    assert.equal(dom.text(), 'Notes Body');
    assert.equal(skia.text(), dom.text());
    mirror(dom, skia);
    const title = labelOf(skia, 'Notes').getBoundingClientRect();
    drag(dom, skia, [[title.left + 5, title.top + 5], [title.left + 45, title.top + 25]]);
    assert.deepEqual(moves.slice(-2), [{ x: 50, y: 30 }, { x: 50, y: 30 }]);
    // The corner: 12 px at the bottom right of the window.
    const [cx, cy] = [50 + 240 - 4, 30 + 160 - 4];
    drag(dom, skia, [[cx, cy], [cx - 100, cy + 20]]);
    assert.deepEqual(sizes.slice(-2), [{ width: 200, height: 180 }, { width: 200, height: 180 }], 'the width kept at its minimum');
    assert.deepEqual(phases, ['move start', 'move start', 'move end', 'move end', 'resize start', 'resize start', 'resize end', 'resize end'], 'each phase once per renderer');
    pressLabel(dom, skia, 'Minimize');
    assert.equal(dom.text(), 'Notes');
    assert.equal(skia.text(), dom.text());
    pressLabel(dom, skia, 'Restore');
    assert.equal(dom.text(), 'Notes Body');
    assert.deepEqual(folds, [true, true, false, false], 'onCollapsedChange on each, minimized then restored');
    pressLabel(dom, skia, 'Close window');
    assert.equal(closed, 2);
    dispose();
  });

  it('brings a pressed window to the front, per root', () => {
    const view = () => (
      <Rui>
        <Window title="A" defaultPosition={{ x: 0, y: 0 }} defaultSize={{ width: 200, height: 120 }} />
        <Window title="B" defaultPosition={{ x: 100, y: 60 }} defaultSize={{ width: 200, height: 120 }} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 360 });
    mirror(dom, skia);
    const z = () => {
      $flush(dom.root);
      $flush(skia.root);
      const d = ['A', 'B'].map(t => Number(domLabel(dom, t).closest('[data-ren="View"][style*="z-index"]').style.zIndex));
      const s = ['A', 'B'].map(t => {
        let i = labelOf(skia, t);
        while (Number.isNaN(i.style.zIndex)) i = i.parent;
        return i.style.zIndex;
      });
      assert.deepEqual(s, d, 'the same order on both');
      return d;
    };
    const [a0, b0] = z();
    assert.ok(b0 > a0, 'the later window is above');
    drag(dom, skia, [[20, 60]]);
    const [a1, b1] = z();
    assert.ok(a1 > b1, 'A pressed: above B');
    assert.equal(a1, 22, 'each root orders its own windows: the sheet layer, 20, and A second of two');
    // Many presses, one after the other: the two windows keep to two steps above the sheet layer,
    // under the floating panels, tooltips, toasts and the top layer.
    for (let i = 0; i < 20; i++) drag(dom, skia, [i % 2 === 0 ? [250, 150] : [20, 20]]);
    const many = z();
    assert.deepEqual([...many].sort(), [21, 22], `still two steps above the sheet layer: ${many}`);
    assert.ok(Math.max(...many) < LAYERS.float && Math.max(...many) < LAYERS.tip, 'below a floating panel and a tooltip');
    assert.ok(many[0] > many[1], 'A pressed last: in front');
    dispose();
  });

  it('closes itself on Escape when uncontrolled (`closable` options), unless `dismiss` is off', () => {
    /** @type {boolean[]} */
    const seen = [];
    const view = () => (
      <Rui>
        <Window title="Log" closable={{ label: 'Dismiss log' }} onOpenChange={(/** @type {boolean} */ open) => seen.push(open)}>
          <Text>Lines</Text>
        </Window>
        <Window title="Pinned" defaultPosition={{ x: 200, y: 20 }} dismiss={false} collapsible={false}>
          <Text>Stays</Text>
        </Window>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 360 });
    assert.equal(dom.text(), 'Log Lines Pinned Stays');
    assert.equal(skia.text(), dom.text());
    keyOn(dom, skia, 'Close window', 'Escape');
    assert.equal(dom.text(), 'Log Lines Pinned Stays', 'dismiss={false}: Escape keeps it');
    assert.equal(skia.text(), dom.text());
    keyOn(dom, skia, 'Dismiss log', 'Escape');
    assert.deepEqual(seen, [false, false], 'Escape closes it');
    assert.equal(dom.text(), 'Pinned Stays');
    assert.equal(skia.text(), dom.text());
    dispose();
  });
});

describe('Onboarding on the DOM and on Skia', () => {
  it('follows its spot as it resizes, with no step change (Skia)', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const texts = [];
    const view = () => {
      const text = $signal($active(), 'Save');
      texts.push(text);
      return (
        <Time value={clock}>
          <Rui>
            <Onboarding steps={[{ spot: 'save', title: 'Save' }]} started cutout={8} style={{ width: 460, height: 320 }}>
              <Onboarding.Spot id="save" style={{ margin: [20, 0, 0, 20] }}>
                <Button label="Save doc">{() => $read(text)}</Button>
              </Onboarding.Spot>
            </Onboarding>
          </Rui>
        </Time>
      );
    };
    const { dom, skia, dispose } = both(view, { width: 480, height: 360 });
    const ring = () => {
      $flush(skia.root);
      skia.text();
      return primitives(skia).find(i => i.kind === 0 && i.style.borderTop === 2).getBoundingClientRect();
    };
    const spot = () => action(dom, skia, 'Save doc').item.getBoundingClientRect();
    skia.text();
    clock.advance(16);
    assert.equal(ring().width, spot().width + 16, 'the ring around the spot');
    const before = spot().width;
    for (const text of texts) $write(text, 'Save the whole document');
    skia.text();
    clock.advance(16);
    assert.ok(spot().width > before, 'the spot grew');
    assert.equal(ring().width, spot().width + 16, 'the ring follows it');
    assert.equal(dom.text(), skia.text());
    dispose();
  });

  it('shows each step’s spot, and goes on, back, and to the end', () => {
    /** @type {number[]} */
    const stepsSeen = [];
    let ended = 0;
    let skipped = 0;
    const clock = manualClock();
    const steps = [
      { spot: 'save', title: 'Save', content: 'Keeps your work' },
      { spot: 'share', title: 'Share', content: 'Sends it on' },
    ];
    const view = () => (
      <Time value={clock}>
        <Rui>
          <Onboarding steps={steps} started onChange={(/** @type {number} */ s) => stepsSeen.push(s)} onEnd={() => ended++} onSkip={() => skipped++} cutout={8} backdrop={{ color: '#ff0000', opacity: 0.25 }} style={{ width: 460, height: 320 }}>
            <Onboarding.Spot id="save" style={{ margin: [20, 0, 0, 20] }}>
              <Button label="Save doc">Save doc</Button>
            </Onboarding.Spot>
            <Onboarding.Spot id="share" style={{ margin: [40, 0, 0, 200] }}>
              <Button label="Share doc">Share doc</Button>
            </Onboarding.Spot>
          </Onboarding>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 360 });
    mirror(dom, skia);
    clock.advance(16);
    assert.equal(dom.text(), 'Save doc Share doc Save Keeps your work 1 / 2 Skip Next');
    assert.equal(skia.text(), dom.text());
    const ring = () => {
      $flush(skia.root);
      const item = primitives(skia).find(i => i.kind === 0 && i.style.borderTop === 2);
      return item.getBoundingClientRect();
    };
    const save = action(dom, skia, 'Save doc').item.getBoundingClientRect();
    const r1 = ring();
    assert.deepEqual([r1.left, r1.top, r1.width], [save.left - 8, save.top - 8, save.width + 16], 'the ring around the spot');
    const shades = [...dom.document.querySelectorAll('[data-ren="View"]')].filter(n => /background(-color)?: #ff000040/.test(n.getAttribute('style') ?? ''));
    assert.equal(shades.length, 4, 'four boxes dim around the hole in the backdrop color');
    dom.press('Next');
    skia.press('Next');
    mirror(dom, skia);
    clock.advance(16);
    assert.deepEqual(stepsSeen, [1, 1]);
    assert.equal(dom.text(), 'Save doc Share doc Share Sends it on 2 / 2 Skip Back Finish');
    assert.equal(skia.text(), dom.text());
    const share = action(dom, skia, 'Share doc').item.getBoundingClientRect();
    assert.equal(ring().left, share.left - 8);
    dom.press('Back');
    skia.press('Back');
    assert.deepEqual(stepsSeen.slice(2), [0, 0]);
    dom.press('Next');
    skia.press('Next');
    dom.press('Finish');
    skia.press('Finish');
    assert.equal(ended, 2);
    dom.press('Skip');
    skia.press('Skip');
    assert.equal(skipped, 2);
    dispose();
  });

  it('sets its own step back to the first when Finish ends it, so a restart begins there', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const runs = [];
    const steps = [
      { spot: 'save', title: 'Save', content: 'Keeps your work' },
      { spot: 'share', title: 'Share', content: 'Sends it on' },
    ];
    const view = () => {
      const on = $signal($active(), true);
      runs.push(on);
      return (
        <Time value={clock}>
          <Rui>
            <Onboarding steps={steps} started={on} onStartedChange={(/** @type {boolean} */ v) => $write(on, v)} style={{ width: 460, height: 320 }}>
              <Onboarding.Spot id="save">
                <Button label="Save doc">Save doc</Button>
              </Onboarding.Spot>
              <Onboarding.Spot id="share">
                <Button label="Share doc">Share doc</Button>
              </Onboarding.Spot>
            </Onboarding>
          </Rui>
        </Time>
      );
    };
    const { dom, skia, dispose } = both(view, { width: 480, height: 360 });
    mirror(dom, skia);
    clock.advance(16);
    dom.press('Next');
    skia.press('Next');
    assert.equal(dom.text(), 'Save doc Share doc Share Sends it on 2 / 2 Skip Back Finish');
    dom.press('Finish');
    skia.press('Finish');
    assert.equal(dom.text(), 'Save doc Share doc', 'ended');
    assert.equal(skia.text(), dom.text());
    for (const on of runs) $write(on, true);
    $flush(dom.root);
    $flush(skia.root);
    mirror(dom, skia);
    clock.advance(16);
    assert.equal(dom.text(), 'Save doc Share doc Save Keeps your work 1 / 2 Skip Next', 'started again at the first step');
    assert.equal(skia.text(), dom.text());
    dispose();
  });

  it('runs from defaultStarted until Finish or Skip ends it, telling onStartedChange', () => {
    const clock = manualClock();
    /** @type {boolean[]} */
    const told = [];
    const steps = [{ spot: 'save', title: 'Save', content: 'Keeps your work' }];
    const view = () => (
      <Time value={clock}>
        <Rui>
          <Onboarding steps={steps} defaultStarted onStartedChange={(/** @type {boolean} */ v) => told.push(v)} style={{ width: 460, height: 320 }}>
            <Onboarding.Spot id="save">
              <Button label="Save doc">Save doc</Button>
            </Onboarding.Spot>
          </Onboarding>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 360 });
    mirror(dom, skia);
    clock.advance(16);
    assert.equal(dom.text(), 'Save doc Save Keeps your work 1 / 1 Skip Finish');
    assert.equal(skia.text(), dom.text());
    const layer = [...dom.document.querySelectorAll('[data-ren="View"]')].find(n => /z-index: 30\b/.test(n.getAttribute('style') ?? ''));
    assert.ok(layer, 'the tour sits on the float layer, above sheets');
    dom.press('Skip');
    skia.press('Skip');
    assert.deepEqual(told, [false, false]);
    assert.equal(dom.text(), 'Save doc', 'skipped: the tour is gone');
    assert.equal(skia.text(), dom.text());
    dispose();
  });
});

describe('Parallax on the DOM and on Skia', () => {
  it('moves layers against the pointer by their depth', () => {
    /** @type {any[]} */
    const offsets = [];
    const view = () => (
      <Rui>
        <Parallax w={400} h={200} strength={20} tilt={6} onOffsetChange={(/** @type {any} */ o) => offsets.push(o)}>
          <Parallax.Layer depth={0.2}>
            <Text>Far</Text>
          </Parallax.Layer>
          <Parallax.Layer depth={1} style={{ top: 50, left: 50, width: 100, height: 40 }}>
            <Text>Near</Text>
          </Parallax.Layer>
        </Parallax>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Far Near');
    mirror(dom, skia);
    const node = dom.document.querySelector('[data-ren="View"]');
    node.dispatchEvent(new dom.window.PointerEvent('pointermove', { clientX: 400, clientY: 100, bubbles: true, pointerId: 1 }));
    skia.skia.move(399.99, 100);
    $flush(skia.root);
    assert.equal(offsets[0].x, 1);
    assert.ok(Math.abs(offsets[1].x - 1) < 0.001);
    // Moved and tilted by transforms: laid out where they were.
    const near = labelOf(skia, 'Near').parent;
    const box = near.getBoundingClientRect();
    assert.equal(Math.round(box.left + box.width / 2), 100 - 20, 'its rect is its layout box moved 20 px left, as the DOM\'s');
    assert.ok(box.width > 100, 'and turned: its bounds are wider than the box');
    assert.deepEqual([Math.round(near.style.translateX), Math.round(near.style.translateY), Math.round(near.style.rotate * 10) / 10], [-20, 0, 6], 'the near layer moved 20 px left and turned 6°');
    const css = (/** @type {string} */ t) => domLabel(dom, t).parentElement.getAttribute('style');
    assert.match(css('Near'), /left: 50px; translate: -20px 0px; rotate: 6deg/);
    assert.match(css('Far'), /translate: -4px 0px; rotate: 1.2deg/);
    dispose();
  });

  it('moves layers with the scroll in scroll mode', () => {
    const view = () => (
      <Rui>
        <Parallax m={20} source="scroll" h={200} contentHeight={600}>
          <Parallax.Layer depth={0.5} style={{ top: 100, height: 40 }}>
            <Text>Slow</Text>
          </Parallax.Layer>
        </Parallax>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const scroll = dom.nodes('Scroll')[0];
    scroll.scrollTop = 100;
    scroll.dispatchEvent(new dom.window.Event('scroll'));
    primitives(skia).find(i => i.kind === 2).scrollTop = 100;
    $flush(dom.root);
    $flush(skia.root);
    assert.match(domLabel(dom, 'Slow').parentElement.getAttribute('style'), /top: 100px;.*translate: 0px 50px/);
    assert.deepEqual([labelOf(skia, 'Slow').parent.style.top, labelOf(skia, 'Slow').parent.style.translateY], [100, 50]);
    dispose();
  });
});

describe('Gantt on the DOM and on Skia', () => {
  it('scrolls a long timeline across under the task names, which stay', () => {
    const tasks = [{ id: 'a', name: 'Design', start: '2026-09-01', end: '2026-09-20' }];
    const view = () => (
      <Rui>
        <Gantt tasks={tasks} dayWidth={30} labelWidth={100} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 300, height: 200 });
    const scroll = dom.nodes('Scroll')[0];
    assert.match(scroll.getAttribute('style'), /overflow-x: auto/);
    assert.match(domLabel(dom, 'Design').parentElement.getAttribute('style'), /position: sticky;.*left: 0px/);
    const item = primitives(skia).find(i => i.kind === 2);
    assert.equal(item.getBoundingClientRect().height, 40 + 1 + 36, 'as high as the header and the row');
    assert.ok(item.scrollWidth > item.clientWidth + 300, 'the timeline is wider than the chart');
    const at = (/** @type {string} */ t) => {
      skia.text();
      return Math.round(skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === t)[2]);
    };
    const [name, day] = [at('Design'), at('3')];
    item.scrollLeft = 60;
    $flush(skia.root);
    assert.equal(at('3'), day - 60, 'the days scroll across');
    assert.equal(at('Design'), name, 'the name stays');
    dispose();
  });

  it('reschedules a pure step', () => {
    assert.deepEqual(rescheduled({ start: 10, end: 12 }, 3, 'move'), { start: 13, end: 15 });
    assert.deepEqual(rescheduled({ start: 10, end: 12 }, 5, 'start'), { start: 12, end: 12 });
    assert.deepEqual(rescheduled({ start: 10, end: 12 }, -5, 'end'), { start: 10, end: 10 });
  });

  it('draws tasks and dependencies, moves a bar and resizes its end by whole days', () => {
    /** @type {any[]} */
    const changes = [];
    const tasks = [
      { id: 'a', name: 'Design', start: '2026-09-01', end: '2026-09-03', progress: 50 },
      { id: 'b', name: 'Build', start: '2026-09-04', end: '2026-09-06', dependencies: ['a'], color: 'teal' },
    ];
    const view = () => (
      <Rui>
        <Gantt tasks={tasks} dayWidth={30} rowHeight={36} labelWidth={100} onTaskChange={(/** @type {any} */ t) => changes.push(`${t.id} ${t.start} ${t.end}`)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    assert.equal(dom.text(), 'Task Aug 31 Sep 1 2 3 4 5 6 7 Design Build');
    // Skia paints the sticky names (a stacking context each) after the timeline.
    assert.equal(skia.text(), 'Aug 31 Sep 1 2 3 4 5 6 7 Task Design Build');
    const shapes = primitives(skia).filter(i => i.kind === 7);
    assert.equal(shapes[0].shapes.length, 2, 'one dependency: a line and its head');
    assert.equal(dom.nodes('Shape')[0].children.length, 2);
    // Bar a: day 1 from Aug 31, 3 days, at x = 101 + 30 + 1 in its row.
    mirror(dom, skia);
    const row = labelOf(skia, 'Design').getBoundingClientRect();
    const y = row.top + row.height / 2;
    const x0 = 101 + 30 + 45;
    drag(dom, skia, [[x0, y], [x0 + 20, y], [x0 + 62, y]]);
    assert.deepEqual(changes, ['a 2026-09-03 2026-09-05', 'a 2026-09-03 2026-09-05']);
    // Its end now at day 5: x = 101 + 5 * 30 + 30 - 3.
    const xe = 101 + 6 * 30 - 4;
    drag(dom, skia, [[xe, y], [xe + 31, y]]);
    assert.deepEqual(changes.slice(2), ['a 2026-09-03 2026-09-06', 'a 2026-09-03 2026-09-06']);
    dispose();
  });

  it('editable false: a press on a bar or its ends is still a task press; a drag moves nothing', () => {
    /** @type {any[]} */
    const heard = [];
    const tasks = [{ id: 'a', name: 'Design', start: '2026-09-01', end: '2026-09-03' }];
    const view = () => (
      <Rui>
        <Gantt tasks={tasks} dayWidth={30} rowHeight={36} labelWidth={100} editable={false} onTaskPress={(/** @type {any} */ t) => heard.push(`press ${t.id}`)} onTaskChange={(/** @type {any} */ t) => heard.push(`change ${t.id}`)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    mirror(dom, skia);
    const row = labelOf(skia, 'Design').getBoundingClientRect();
    const y = row.top + row.height / 2;
    const x0 = 101 + 30 + 45;
    drag(dom, skia, [[x0, y]]);
    assert.deepEqual(heard, ['press a', 'press a'], 'the bar');
    const xe = 101 + 4 * 30 - 4;
    drag(dom, skia, [[xe, y]]);
    assert.deepEqual(heard.slice(2), ['press a', 'press a'], 'its end');
    const before = dom.nodes('View').map((/** @type {any} */ n) => n.getAttribute('style')).join();
    drag(dom, skia, [[x0, y], [x0 + 62, y]]);
    assert.deepEqual(heard.slice(4), [], 'a drag: no press, no change');
    assert.equal(dom.nodes('View').map((/** @type {any} */ n) => n.getAttribute('style')).join(), before, 'the bar stays');
    dispose();
  });
});

describe('Book on the DOM and on Skia', () => {
  /** Six pages P1 to P6. */
  const pages = () => ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => (
    <Book.Page>
      <Text>{p}</Text>
    </Book.Page>
  ));

  it('knows which pages lie where at rest and through a turn', () => {
    assert.deepEqual(bookSlots(0, null, false), { leftPage: 0, rightPage: 1, front: -1, back: -1, leafRight: true });
    assert.deepEqual(bookSlots(0, { dir: 1, t: 0.2 }, false), { leftPage: 0, rightPage: 3, front: 1, back: -1, leafRight: true }, 'the right page lifts, the next right one under it');
    assert.deepEqual(bookSlots(0, { dir: 1, t: 0.7 }, false), { leftPage: 0, rightPage: 3, front: -1, back: 2, leafRight: false }, 'its back lands on the left');
    assert.deepEqual(bookSlots(2, { dir: -1, t: 0.2 }, false), { leftPage: 0, rightPage: 3, front: 2, back: -1, leafRight: false });
    assert.deepEqual(bookSlots(2, { dir: -1, t: 0.7 }, false), { leftPage: 0, rightPage: 3, front: -1, back: 1, leafRight: true });
    assert.deepEqual(bookSlots(1, { dir: 1, t: 0.5 }, true), { leftPage: -1, rightPage: 2, front: 1, back: -1, leafRight: true });
  });

  it('turns a leaf about the spine on the clock: its front narrows away, its back widens on the left', () => {
    const clock = manualClock();
    /** @type {number[]} */
    const changes = [];
    /** @type {number[]} */
    const flips = [];
    const view = () => (
      <Time value={clock}>
        <Rui>
          <Book w={100} h={140} duration={400} onChange={(/** @type {number} */ p) => changes.push(p)} onFlip={(/** @type {number} */ p) => flips.push(p)}>
            {pages()}
          </Book>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    const texts = () => {
      const d = allText(dom);
      assert.equal(skia.text(), d, 'the same text');
      return d;
    };
    assert.equal(texts(), 'P1 P2');
    domPress(dom, 'P2');
    skia.press('P2');
    assert.deepEqual(changes, [2, 2]);
    clock.advance(96);
    assert.equal(texts(), 'P1 P4 P2', 'the next right page shows under the lifting leaf');
    // The leaf: scaled across about its left edge, the spine at x 100.
    let leaf = labelOf(skia, 'P2');
    while (Number.isNaN(leaf.style.scaleX)) leaf = leaf.parent;
    const r = leaf.getBoundingClientRect();
    assert.ok(leaf.style.scaleX < 1 && leaf.style.scaleX > 0, `narrowing: ${leaf.style.scaleX}`);
    assert.equal(Math.round(r.left), 100, 'held at the spine');
    assert.equal(Math.round(r.width), Math.round(100 * leaf.style.scaleX));
    let node = [...dom.document.querySelectorAll('[data-ren="Label"]')].find(n => n.textContent === 'P2');
    while (!/scale:/.test(node.getAttribute('style') ?? '')) node = node.parentElement;
    assert.match(node.getAttribute('style'), new RegExp(`scale: ${leaf.style.scaleX} 1`), 'the same scale on the DOM');
    assert.match(node.getAttribute('style'), /transform-origin: 0px 70px/);
    domPress(dom, 'P1');
    skia.press('P1');
    assert.deepEqual(changes, [2, 2], 'no press while turning');
    clock.advance(160);
    assert.equal(texts(), 'P1 P4 P3', 'past the half turn: its back, on the left');
    leaf = labelOf(skia, 'P3');
    while (Number.isNaN(leaf.style.scaleX)) leaf = leaf.parent;
    assert.equal(Math.round(leaf.getBoundingClientRect().right), 100, 'widening from the spine to the left');
    clock.advance(200);
    assert.equal(texts(), 'P3 P4');
    assert.deepEqual(flips, [2, 2]);
    assert.equal(clock.pending(), 0, 'no frames at rest');
    // Back: a press on the left page.
    domPress(dom, 'P3');
    skia.press('P3');
    clock.advance(500);
    assert.equal(texts(), 'P1 P2');
    assert.deepEqual(changes, [2, 2, 0, 0]);
    dispose();
  });

  it('a page set from outside turns leaf by leaf; one page at a time with `single`', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const pagesOf = [];
    const view = () => {
      const page = $signal($active(), 0);
      pagesOf.push(page);
      return (
        <Time value={clock}>
          <Rui>
            <Book w={100} h={140} duration={200} value={page}>
              {pages()}
            </Book>
          </Rui>
        </Time>
      );
    };
    const { dom, skia, dispose } = both(view);
    for (const p of pagesOf) $write(p, 5);
    $flush(dom.root);
    $flush(skia.root);
    clock.advance(250);
    assert.equal(allText(dom), 'P3 P6 P4', 'one leaf turned, the next lifting at once');
    clock.advance(250);
    assert.equal(allText(dom), 'P5 P6', 'then the next: page 5 is the spread of 4 and 5');
    assert.equal(skia.text(), 'P5 P6');
    dispose();

    const one = both(() => (
      <Time value={clock}>
        <Rui>
          <Book w={100} h={140} duration={200} single defaultValue={1}>
            {pages()}
          </Book>
        </Rui>
      </Time>
    ));
    assert.equal(allText(one.dom), 'P2');
    assert.equal(one.skia.text(), 'P2');
    // The right half turns forward; the left half back.
    mirror(one.dom, one.skia);
    const page = [...one.dom.document.querySelectorAll('[data-ren="View"]')].filter(n => n.textContent.trim() === 'P2').pop();
    page.dispatchEvent(new one.dom.window.MouseEvent('click', { bubbles: true, clientX: 80, clientY: 50 }));
    one.skia.skia.press(80, 50);
    one.skia.skia.release(80, 50);
    $flush(one.dom.root);
    $flush(one.skia.root);
    clock.advance(100);
    assert.equal(allText(one.dom), 'P3 P2', 'the page going lies over the next');
    assert.equal(one.skia.text(), 'P3 P2');
    clock.advance(150);
    assert.equal(allText(one.dom), 'P3');
    mirror(one.dom, one.skia);
    const back = [...one.dom.document.querySelectorAll('[data-ren="View"]')].filter(n => n.textContent.trim() === 'P3').pop();
    back.dispatchEvent(new one.dom.window.MouseEvent('click', { bubbles: true, clientX: 20, clientY: 50 }));
    one.skia.skia.press(20, 50);
    one.skia.skia.release(20, 50);
    $flush(one.dom.root);
    $flush(one.skia.root);
    clock.advance(250);
    assert.equal(allText(one.dom), 'P2');
    assert.equal(one.skia.text(), 'P2');
    one.dispose();
  });
});

describe('Parallax passes its meaning props on', () => {
  it('pointer and scroll alike: aria-label and data-* reach its element (DOM)', async () => {
    const { onDom } = await import('./harness.jsx');
    for (const source of ['pointer', 'scroll']) {
      const dom = onDom(() => (
        <Rui>
          <Parallax source={source} data-probe="p" aria-label="Hills">
            <Parallax.Layer depth={0.2}>
              <Text>x</Text>
            </Parallax.Layer>
          </Parallax>
        </Rui>
      ));
      assert.equal(dom.document.querySelector('[data-probe="p"]')?.getAttribute('aria-label'), 'Hills', source);
      dom.dispose();
    }
  });
});

describe('Flip.Trigger is a button', () => {
  it('focusable and pressed from the keyboard on the DOM and on Skia, its look unchanged', () => {
    /** @type {boolean[]} */
    const changes = [];
    const view = () => (
      <Rui>
        <Flip w={200} h={120} duration={0} onFlippedChange={(/** @type {boolean} */ v) => changes.push(v)}>
          <Flip.Front>
            <Flip.Trigger aria-label="Turn over">
              <Text>Front</Text>
            </Flip.Trigger>
          </Flip.Front>
          <Flip.Back>
            <Text>Back</Text>
          </Flip.Back>
        </Flip>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const { node } = action(dom, skia, 'Turn over');
    assert.equal(node.getAttribute('data-ren'), 'Action', 'an Action: in the Tab order');
    assert.match(node.getAttribute('style') ?? '', /background(?:-color)?: transparent/, 'no fill of its own');
    // The DOM's is a button element, which the browser presses on Enter and Space; Skia presses an Action on them.
    assert.equal(node.tagName, 'BUTTON', 'a button on the DOM');
    keyOn(dom, skia, 'Turn over', 'Enter');
    assert.deepEqual(changes, [true], 'Enter turns it on Skia');
    dispose();
  });
});

describe('Flip.Trigger with a function child', () => {
  it('renders the caller\'s Button alone, handed the press, the name and the pressed state, on the DOM and on Skia', () => {
    /** @type {boolean[]} */
    const changes = [];
    const view = () => (
      <Rui>
        <Flip w={200} h={120} duration={0} onFlippedChange={(/** @type {boolean} */ v) => changes.push(v)}>
          <Flip.Front>
            <Flip.Trigger aria-label="Turn over">{(/** @type {Record<string, any>} */ p) => <Button {...p}>Turn</Button>}</Flip.Trigger>
          </Flip.Front>
          <Flip.Back>
            <Text>Back</Text>
          </Flip.Back>
        </Flip>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Turn');
    assert.equal(skia.text(), dom.text());
    assert.equal(dom.nodes('Action').length, 1, 'the DOM: the Button\'s Action only, no button around it');
    assert.equal(primitives(skia).filter(i => i.kind === 5).length, 1, 'Skia: the Button\'s Action only');
    const { node, item } = action(dom, skia, 'Turn over');
    const pressed = () => {
      $flush(skia.root);
      const v = item.other?.get?.('aria-pressed');
      return [node.getAttribute('aria-pressed'), typeof v === 'function' ? v() : v];
    };
    assert.deepEqual(pressed(), ['false', 'false']);
    pressLabel(dom, skia, 'Turn over');
    assert.deepEqual(changes, [true, true], 'the Button\'s press turns the Flip on both');
    assert.deepEqual(pressed(), ['true', 'true']);
    dispose();
  });
});

describe('Flip.Trigger draws its content in the page\'s text color', () => {
  it('as a Pressable does, on Skia and on the DOM', () => {
    const view = () => (
      <Rui>
        <Pressable>
          <Text>Outside</Text>
        </Pressable>
        <Flip w={200} h={100}>
          <Flip.Front>
            <Flip.Trigger aria-label="Turn">
              <Text>Front</Text>
            </Flip.Trigger>
          </Flip.Front>
          <Flip.Back>
            <Text>Back</Text>
          </Flip.Back>
        </Flip>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    skia.text();
    const ink = (/** @type {string} */ text) => skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === text)?.[5];
    assert.notEqual(ink('Front'), '#ffffffff', 'Skia: not the paper color');
    assert.equal(ink('Front'), ink('Outside'), 'Skia: the page text, as a Pressable\'s');
    const { node } = action(dom, skia, 'Turn');
    assert.doesNotMatch(node.getAttribute('style') ?? '', /(?:^|;\s*)color: (?:#fff|white|rgb\(255, 255, 255\))/i, 'the DOM: not white');
    assert.match(node.getAttribute('style') ?? '', /(?:^|;\s*)color:/, 'the DOM: its own text color');
    dispose();
  });
});

describe('a Flip keeps the keyboard focus through its turn', () => {
  it('the focus on one face\'s trigger moves to the other face\'s, on the DOM and on Skia', () => {
    const clock = manualClock();
    const view = () => (
      <Time value={clock}>
        <Rui>
          <Flip w={200} h={120}>
            <Flip.Front>
              <Flip.Trigger aria-label="Turn over">
                <Text>Front</Text>
              </Flip.Trigger>
            </Flip.Front>
            <Flip.Back>
              <Flip.Trigger aria-label="Turn back">
                <Text>Back</Text>
              </Flip.Trigger>
            </Flip.Back>
          </Flip>
        </Rui>
      </Time>
    );
    const { dom, skia, dispose } = both(view);
    const settle = () => {
      for (let i = 0; i < 60; i++) {
        clock.advance(16);
        $flush(dom.root);
        $flush(skia.root);
      }
    };
    const { node, item } = action(dom, skia, 'Turn over');
    node.focus();
    node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    item.focus();
    skia.skia.key('Enter');
    $flush(dom.root);
    $flush(skia.root);
    settle();
    assert.equal(dom.document.activeElement?.getAttribute('aria-label'), 'Turn back', 'the DOM: on the back\'s trigger, not the page');
    assert.equal(skia.skia.focused?.label, 'Turn back', 'Skia: on the back\'s trigger');
    dispose();
  });
});

describe('a Flip leaves the caller\'s focus alone', () => {
  /** A Flip on a clock, flipped by `sg`, with `extra` beside it (outside) or inside it. @param {(sg: any) => any} outside @param {(sg: any) => any} within */
  const make = (outside, within) => {
    const clock = manualClock();
    const view = () => {
      const sg = $signal($active(), false);
      return (
        <Time value={clock}>
          <Rui>
            {outside(sg)}
            <Flip w={200} h={120} flipped={() => $read(sg)} onFlippedChange={(/** @type {boolean} */ v) => $write(sg, v)}>
              <Flip.Front>
                <Flip.Trigger aria-label="Turn over">
                  <Text>Front</Text>
                </Flip.Trigger>
              </Flip.Front>
              <Flip.Back>
                <Flip.Trigger aria-label="Turn back">
                  <Text>Back</Text>
                </Flip.Trigger>
              </Flip.Back>
              {within(sg)}
            </Flip>
          </Rui>
        </Time>
      );
    };
    const { dom, skia, dispose } = both(view);
    const step = (/** @type {number} */ n) => {
      for (let i = 0; i < n; i++) {
        clock.advance(16);
        $flush(dom.root);
        $flush(skia.root);
      }
    };
    const click = (/** @type {any} */ n) => {
      n.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      $flush(dom.root);
    };
    const button = (/** @type {string} */ text) => [...dom.document.querySelectorAll('button')].find(n => n.textContent === text);
    return { dom, dispose, step, click, button };
  };
  const toggle = (/** @type {any} */ sg) => () => $write(sg, !$read(sg));

  it('a turn reversed half way, then one from a Button outside: the focus stays on the Button (DOM)', () => {
    const t = make(sg => <Button onPress={toggle(sg)}>Outside</Button>, () => null);
    const trigger = t.dom.document.querySelector('[aria-label="Turn over"]');
    trigger.focus();
    t.click(trigger);
    t.step(2);
    t.click(trigger);
    t.step(60);
    const outside = t.button('Outside');
    outside.focus();
    t.click(outside);
    t.step(60);
    assert.ok(t.dom.document.activeElement === outside, 'the outside Button keeps the focus');
    t.dispose();
  });

  it('a Button of the caller\'s inside the Flip, off the faces, keeps the focus (DOM)', () => {
    const t = make(() => null, sg => <Button onPress={toggle(sg)}>Mine</Button>);
    const mine = t.button('Mine');
    mine.focus();
    t.click(mine);
    t.step(60);
    assert.ok(t.dom.document.activeElement === mine, 'its own Button keeps the focus');
    t.dispose();
  });
});

describe('Onboarding rings its spot inside a bordered root', () => {
  it('the ring sits a cutout around the spot, bordered or not (Skia)', () => {
    for (const border of [0, 20]) {
      const clock = manualClock();
      const steps = [{ spot: 'save', title: 'Save', content: 'Keeps' }];
      const view = () => (
        <Time value={clock}>
          <Rui>
            <Onboarding steps={steps} started cutout={8} style={{ width: 460, height: 320, border }}>
              <Onboarding.Spot id="save" style={{ margin: [20, 0, 0, 20] }}>
                <Button label="Save doc">Save doc</Button>
              </Onboarding.Spot>
            </Onboarding>
          </Rui>
        </Time>
      );
      const { dom, skia, dispose } = both(view, { width: 480, height: 360 });
      mirror(dom, skia);
      clock.advance(16);
      $flush(skia.root);
      const ring = primitives(skia).find((/** @type {any} */ i) => i.kind === 0 && i.style.borderTop === 2).getBoundingClientRect();
      const save = action(dom, skia, 'Save doc').item.getBoundingClientRect();
      assert.deepEqual([ring.left, ring.top], [save.left - 8, save.top - 8], `border ${border}`);
      dispose();
    }
  });
});
