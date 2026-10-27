// Buttons on the DOM and on Skia: IconButton (variants, sizes, loading),
// CloseButton and CopyButton, with the same text, presses and state on both.

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active } from 'ren-core';
import {
  Rui, Clock, manualClock, themeOf, Button, Text, IconButton, CloseButton, CopyButton, MOTION, Row,
  CloseIcon, CheckIcon, ChevronIcon, DotsIcon,
} from 'rui-core';
import { Window } from 'happy-dom';
import { mount } from 'ren-core/host';
import { Flow } from 'ren-canv';
import { $dom } from 'ren-dom';
import { both, closeWindow } from './harness.jsx';
import { items, KIND } from './scene.js';

/** Presses a ref'd item: a click on the DOM, a press and release at its center on Skia. @param {any} side @param {any} node */
function pressNode(side, node) {
  if (side.skia === undefined) node.dispatchEvent(new side.window.MouseEvent('click', { bubbles: true }));
  else {
    side.skia.present();
    const r = node.getBoundingClientRect();
    side.skia.press(r.x + r.width / 2, r.y + r.height / 2);
    side.skia.release(r.x + r.width / 2, r.y + r.height / 2);
  }
  $flush(side.root);
}

/** Every Skia figure command painted. @param {any} skia */
const figures = skia => {
  skia.text();
  return skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'line' || c[0] === 'path' || c[0] === 'oval');
};

describe('IconButton and CloseButton', () => {
  it('press, ignore presses while disabled or loading, and draw their icons', () => {
    const clock = manualClock();
    /** @type {{ n: any, loading: any, refs: any[] }[]} */
    const state = [];
    const view = () => {
      const R = $active();
      const s = { n: $signal(R, 0), loading: $signal(R, false), refs: /** @type {any[]} */ ([]) };
      state.push(s);
      return (
        <Clock value={clock}>
          <Rui>
            <Text>{() => `count ${$read(s.n)}`}</Text>
            <IconButton ref={(/** @type {any} */ n) => s.refs.push(n)} label="add" loading={s.loading} onPress={() => $write(s.n, $read(s.n) + 1)}>
              <CheckIcon />
            </IconButton>
            <IconButton ref={(/** @type {any} */ n) => s.refs.push(n)} variant="soft" disabled onPress={() => $write(s.n, 99)}>
              <DotsIcon />
            </IconButton>
            <CloseButton ref={(/** @type {any} */ n) => s.refs.push(n)} onPress={() => $write(s.n, 0)} />
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    const sides = [dom, skia];
    assert.equal(dom.text(), 'count 0');
    assert.equal(skia.text(), 'count 0');
    sides.forEach((side, i) => pressNode(side, state[i].refs[0]));
    assert.deepEqual(state.map(s => $read(s.n)), [1, 1]);
    sides.forEach((side, i) => pressNode(side, state[i].refs[1]));
    assert.deepEqual(state.map(s => $read(s.n)), [1, 1], 'disabled');
    const before = figures(skia).length;
    assert.ok(before >= 5, 'check (a path), dots (3 ovals) and the X (2 lines) drawn');
    assert.equal(dom.host.querySelectorAll('[data-ren="Shape"]').length, 3);
    for (const s of state) $write(s.loading, true);
    $flush(dom.root);
    $flush(skia.root);
    sides.forEach((side, i) => pressNode(side, state[i].refs[0]));
    assert.deepEqual(state.map(s => $read(s.n)), [1, 1], 'loading ignores presses');
    // The ring loader's arc: the last path (its track is drawn first and stays).
    const spin = () => figures(skia).filter((/** @type {any[]} */ c) => c[0] === 'path' && c.length > 8).at(-1);
    const a = JSON.stringify(spin());
    clock.advance(200);
    assert.notEqual(JSON.stringify(spin()), a, 'the loader turns on the clock');
    sides.forEach((side, i) => pressNode(side, state[i].refs[2]));
    assert.deepEqual(state.map(s => $read(s.n)), [0, 0], 'the close button pressed');
    const close = dom.nodes('Action')[2];
    assert.equal(close.getAttribute('aria-label'), 'Close');
    dispose();
    assert.equal(clock.pending(), 0, 'no frames after disposal');
  });

  it('size by named steps or pixels', () => {
    /** @type {any[]} */
    const refs = [];
    const { skia, dispose } = both(() => (
      <Rui>
        <IconButton ref={(/** @type {any} */ n) => refs.push(n)} size="xl"><CloseIcon /></IconButton>
        <IconButton ref={(/** @type {any} */ n) => refs.push(n)} size={40}><ChevronIcon rotate={-90} /></IconButton>
        <IconButton ref={(/** @type {any} */ n) => refs.push(n)} size="sm" field><ChevronIcon edge /></IconButton>
      </Rui>
    ));
    skia.text();
    assert.deepEqual(refs.slice(3).map(n => n.getBoundingClientRect().width), [44, 40, 30], 'xl, pixels, sm as tall as a field');
    assert.deepEqual(refs.slice(0, 3).map(n => n.style.width), ['44px', '40px', '30px']);
    dispose();
  });
});

describe('The gradient variant', () => {
  it('paints the default gradient (teal to indigo at 120 degrees) behind white text', () => {
    const view = () => (
      <Rui>
        <Button variant="gradient">Default</Button>
        <Button variant="gradient" gradient={{ colors: ['violet', 'orange.3'], angle: 90 }}>Custom</Button>
        <IconButton variant="gradient" label="icon" gradient={{ colors: ['indigo', 'green'], angle: 105 }}><CheckIcon /></IconButton>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(skia.text(), 'Default Custom');
    const actions = dom.nodes('Action');
    assert.match(actions[0].style.background, /linear-gradient\(120deg, #087c6a 0%, #4b5ec8 100%\)/);
    assert.match(actions[1].style.background, /linear-gradient\(90deg, #7251be 0%, #fda578 100%\)/);
    assert.match(actions[2].style.background, /linear-gradient\(105deg/);
    assert.equal(actions[0].style.color, '#ffffff');
    const drawn = items(skia, KIND.Action).map(n => n.style.background);
    assert.deepEqual(drawn.map(g => g?.angle), [120, 90, 105], 'a gradient on Skia too');
    assert.equal(drawn[0].stops.length, 4, 'two stops');
    dispose();
  });
});

describe('The theme gradient', () => {
  it('is the gradient variant\'s default', () => {
    const { dom, dispose } = both(() => (
      <Rui theme={themeOf({ gradient: { colors: ['red', 'teal'], angle: 10 } })}>
        <Button variant="gradient">Themed</Button>
      </Rui>
    ));
    assert.match(dom.nodes('Action')[0].style.background, /linear-gradient\(10deg, #b63636 0%, #087c6a 100%\)/);
    dispose();
  });
});

describe('CopyButton', () => {
  /** Runs `body` with a clipboard that records what it is given. @param {(written: string[]) => Promise<void>} body */
  const withClipboard = async body => {
    /** @type {string[]} */
    const written = [];
    const nav = /** @type {any} */ (globalThis.navigator);
    const had = Object.getOwnPropertyDescriptor(nav, 'clipboard');
    Object.defineProperty(nav, 'clipboard', { configurable: true, value: { writeText: async (/** @type {string} */ t) => void written.push(t) } });
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      await body(written);
    } finally {
      mock.timers.reset();
      if (had === undefined) delete nav.clipboard;
      else Object.defineProperty(nav, 'clipboard', had);
    }
  };

  it('a button that copies `value`, shows `done` for `hold`, then its `label` again', () =>
    withClipboard(async written => {
      /** @type {string[]} */
      const copies = [];
      /** @type {any[]} */
      const handles = [];
      const view = () => (
        <Rui>
          <CopyButton value="secret" label="Copy key" done="Key copied" hold={20} variant="soft" onCopy={(/** @type {string} */ t) => copies.push(t)} getHandle={(/** @type {any} */ h) => handles.push(h)} />
        </Rui>
      );
      const { dom, skia, dispose } = both(view);
      assert.equal(dom.text(), 'Copy key');
      dom.press('Copy key');
      skia.press('Copy key');
      // The copy resumes on the clipboard's promise.
      await Promise.resolve();
      await Promise.resolve();
      assert.deepEqual(written, ['secret', 'secret']);
      assert.deepEqual(copies, ['secret', 'secret']);
      assert.equal(dom.text(), 'Key copied');
      assert.equal(skia.text(), 'Key copied');
      assert.equal(handles[0].copied(), true, 'the handle reads it too');
      mock.timers.tick(19);
      assert.equal(dom.text(), 'Key copied', 'still done before the hold ends');
      mock.timers.tick(1);
      assert.equal(dom.text(), 'Copy key');
      assert.equal(skia.text(), 'Copy key');
      dispose();
    }));

  it('holds for MOTION.hold by default, and takes a MOTION name', () =>
    withClipboard(async () => {
      /** @type {any[]} */
      const handles = [];
      const { dom, skia, dispose } = both(() => (
        <Rui>
          <CopyButton value="a" getHandle={(/** @type {any} */ h) => handles.push(h)} />
          <CopyButton value="b" hold="calm" label="Other" getHandle={(/** @type {any} */ h) => handles.push(h)} />
        </Rui>
      ));
      assert.equal(dom.text(), 'Copy Other');
      assert.deepEqual(await Promise.all([handles[0].copy(), handles[1].copy()]), [true, true]);
      assert.equal(dom.text(), 'Done Done');
      mock.timers.tick(MOTION.calm);
      assert.equal(dom.text(), 'Done Other', 'calm has passed');
      mock.timers.tick(MOTION.hold - MOTION.calm);
      assert.equal(dom.text(), 'Copy Other');
      assert.equal(skia.text(), dom.text());
      dispose();
    }));

  it('reports a missing clipboard instead of faking a copy', async () => {
    /** @type {unknown[]} */
    const errors = [];
    /** @type {any[]} */
    const handles = [];
    const view = () => <CopyButton value="x" onError={(/** @type {unknown} */ e) => errors.push(e)} getHandle={(/** @type {any} */ h) => handles.push(h)} />;
    const { dom, skia, dispose } = both(view);
    const nav = /** @type {any} */ (globalThis.navigator);
    const had = Object.getOwnPropertyDescriptor(nav, 'clipboard');
    if (had !== undefined) delete nav.clipboard;
    try {
      assert.deepEqual(await Promise.all(handles.map(h => h.copy())), [false, false]);
    } finally {
      if (had !== undefined) Object.defineProperty(nav, 'clipboard', had);
    }
    assert.equal(errors.length, 2);
    assert.match(String(errors[0]), /no clipboard/);
    assert.match(String(handles[0].error()), /no clipboard/);
    assert.equal(dom.text(), 'Copy', 'the label stays');
    assert.equal(skia.text(), 'Copy');
    dispose();
  });

  it('a copy that fails after its root is disposed resolves false and reads nothing', async () => {
    /** @type {unknown[]} */
    const errors = [];
    /** @type {any[]} */
    const handles = [];
    /** @type {((e: Error) => void)[]} */
    const refusals = [];
    const nav = /** @type {any} */ (globalThis.navigator);
    const had = Object.getOwnPropertyDescriptor(nav, 'clipboard');
    Object.defineProperty(nav, 'clipboard', { configurable: true, value: { writeText: () => new Promise((_, no) => void refusals.push(no)) } });
    try {
      const { dispose } = both(() => <CopyButton value="x" onError={(/** @type {unknown} */ e) => errors.push(e)} getHandle={(/** @type {any} */ h) => handles.push(h)} />);
      const pending = handles.map(h => h.copy());
      dispose();
      for (const no of refusals) no(new Error('refused'));
      assert.deepEqual(await Promise.all(pending), [false, false], 'no RRX: disposed root');
      assert.deepEqual(errors, [], 'nothing left to hear it');
    } finally {
      if (had === undefined) delete nav.clipboard;
      else Object.defineProperty(nav, 'clipboard', had);
    }
  });
});

describe('Button modifiers', () => {
  it('dense lowers a button at its size; the close X in the page\'s quiet text', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Button size="md">Tall</Button>
        <Button size="md" dense>Low</Button>
        <CloseButton />
      </Rui>
    ));
    const [tall, low] = dom.nodes('Action');
    assert.deepEqual([tall.style.height, low.style.height], ['36px', '26px']);
    const x = dom.nodes('Shape').at(-1).querySelector('line');
    assert.equal(x.getAttribute('stroke'), '#52575d', 'the close X in the page\'s quiet text (gray.7)');
    dispose();
  });

  it('a loading button says it is busy, for assistive technology too', () => {
    /** @type {any[]} */
    const loading = [];
    const { dom, dispose } = both(() => {
      const busy = $signal($active(), false);
      loading.push(busy);
      return (
        <Rui>
          <Button loading={busy}>Save</Button>
          <Button loading={busy} start={<CheckIcon />}>Save all</Button>
          <IconButton label="add" loading={busy}><CheckIcon /></IconButton>
        </Rui>
      );
    });
    const busyOf = () => dom.nodes('Action').map((/** @type {any} */ n) => n.getAttribute('aria-busy'));
    assert.deepEqual(busyOf(), [null, null, null]);
    for (const busy of loading) $write(busy, true);
    $flush(dom.root);
    assert.deepEqual(busyOf(), ['true', 'true', 'true']);
    dispose();
  });

  it('heights from the theme: sizes.control, sizes.dense when dense, on both renderers', () => {
    const theme = themeOf({ sizes: { control: { md: 40 }, dense: { md: 20 } } });
    const { dom, skia, dispose } = both(() => (
      <Rui theme={theme}>
        <Button size="md">Tall</Button>
        <Button size="md" dense>Low</Button>
        <IconButton size="md" field label="square" />
      </Rui>
    ));
    const [tall, low, square] = dom.nodes('Action');
    assert.deepEqual([tall.style.height, low.style.height, square.style.height], ['40px', '20px', '40px']);
    const high = (/** @type {string} */ text) => items(skia, KIND.Action).find(n => n.text === text || n.label === text).getBoundingClientRect().height;
    assert.deepEqual([high('Tall'), high('Low'), high('square')], [40, 20, 40], 'on Skia too');
    dispose();
  });

  it('side padding from the theme: control.pad, control.densePad when dense', () => {
    const { dom, dispose } = both(() => (
      <Rui theme={themeOf({ control: { pad: { md: 21 }, densePad: { md: 7 } } })}>
        <Button size="md">Wide</Button>
        <Button size="md" dense>Tight</Button>
        <Button>Plain</Button>
      </Rui>
    ));
    const [wide, tight, plain] = dom.nodes('Action');
    assert.deepEqual([wide.style.paddingLeft, tight.style.paddingRight, plain.style.paddingLeft], ['21px', '7px', '12px'], 'the theme\'s md steps; sm keeps the base 12');
    dispose();
  });
});

describe('Copy and share icons', () => {
  it('draw their figures, the same on both', async () => {
    const { CopyIcon, ShareIcon } = await import('rui-core');
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <CopyIcon size={20} />
        <ShareIcon size={20} color="indigo" />
      </Rui>
    ));
    assert.deepEqual(dom.nodes('Shape').map((/** @type {any} */ s) => [...s.children].map((/** @type {any} */ c) => c.tagName.toLowerCase()).join(',')), ['path,path', 'line,line,ellipse,ellipse,ellipse']);
    skia.text();
    const kinds = skia.skia.commands().map((/** @type {any[]} */ c) => c[0]);
    assert.equal(kinds.filter((/** @type {string} */ k) => k === 'oval').length, 3, 'the share points on Skia');
    dispose();
  });
});

describe('Tag icon', () => {
  it('draws its body as an outline and its hole filled, the same on both', async () => {
    const { TagIcon } = await import('rui-core');
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <TagIcon size={24} />
      </Rui>
    ));
    const [shape] = dom.nodes('Shape');
    assert.deepEqual([...shape.children].map((/** @type {any} */ c) => [c.tagName.toLowerCase(), c.getAttribute('fill') === 'none']), [['path', true], ['ellipse', false]]);
    skia.text();
    const kinds = skia.skia.commands().map((/** @type {any[]} */ c) => c[0]);
    assert.equal(kinds.filter((/** @type {string} */ k) => k === 'oval').length, 1, 'the hole on Skia');
    dispose();
  });
});

describe('Camera icon', () => {
  it('draws its body and its lens as outlines, the same on both', async () => {
    const { CameraIcon } = await import('rui-core');
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <CameraIcon size={24} color="indigo" />
      </Rui>
    ));
    const [shape] = dom.nodes('Shape');
    assert.deepEqual([...shape.children].map((/** @type {any} */ c) => c.tagName.toLowerCase()), ['path', 'ellipse']);
    // outlines, not fills: the stroke grows with the size
    assert.deepEqual([...shape.children].map((/** @type {any} */ c) => [c.getAttribute('fill'), c.getAttribute('stroke-width')]), [['none', '3'], ['none', '3']]);
    skia.text();
    const kinds = skia.skia.commands().map((/** @type {any[]} */ c) => c[0]);
    assert.equal(kinds.filter((/** @type {string} */ k) => k === 'oval').length, 1, 'the lens on Skia');
    dispose();
  });
});

describe('Back and forward icons', () => {
  it('draw a pointer each way, along the row or down and up, the same on both', async () => {
    const { BackIcon, ForwardIcon } = await import('rui-core');
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <BackIcon size={20} />
        <ForwardIcon size={20} />
        <BackIcon size={20} orientation="vertical" />
        <ForwardIcon size={20} orientation="vertical" />
      </Rui>
    ));
    const shapes = dom.nodes('Shape');
    assert.deepEqual(shapes.map((/** @type {any} */ s) => [...s.children].map((/** @type {any} */ c) => c.tagName.toLowerCase()).join(',')), Array(4).fill('path,path,ellipse'));
    assert.ok(shapes.every((/** @type {any} */ s) => !/rotate/.test(s.style.transform ?? '')), 'drawn each way, not turned');
    /** The tail dot's center: it sits opposite where the pointer points. @param {any} s */
    const tail = s => {
      const e = s.querySelector('ellipse');
      return [Number(e.getAttribute('cx')), Number(e.getAttribute('cy'))].map(Math.round);
    };
    const [back, forward, up, down] = shapes.map(tail);
    assert.ok(back[0] > 10 && forward[0] < 10, `back points to the start, forward to the end: ${back} ${forward}`);
    assert.ok(up[1] > 10 && down[1] < 10, `vertical: back points up, forward down: ${up} ${down}`);
    skia.text();
    const kinds = skia.skia.commands().map((/** @type {any[]} */ c) => c[0]);
    assert.equal(kinds.filter((/** @type {string} */ k) => k === 'oval').length, 4, 'the tail dots on Skia');
    dispose();
  });
});

describe('Button reserve', () => {
  /** A text measure 0.6 of the font size wide per character. */
  const mono = {
    width: (/** @type {string} */ text, /** @type {number} */ size) => text.length * size * 0.6,
    metrics: (/** @type {number} */ size) => ({ ascent: size * 0.8, descent: size * 0.2 }),
    close() {},
  };
  /** Two Buttons side by side, the first's text switching; `reserve` its texts or none. @param {string[] | undefined} reserve @param {any[]} shown */
  const view = (reserve, shown) => () => {
    const on = $signal($active(), true);
    shown.push(on);
    return (
      <Rui>
        <Row>
          <Button reserve={reserve}>{() => ($read(on) ? 'Ativar' : 'Desativar')}</Button>
          <Button>Next</Button>
        </Row>
      </Rui>
    );
  };
  /** The second Button's left on the DOM laid out by the Flow, before and after the switch. @param {string[] | undefined} reserve */
  const lefts = reserve => {
    /** @type {any[]} */
    const shown = [];
    const window = new Window({ url: 'http://localhost/' });
    const host = window.document.createElement('main');
    Object.defineProperty(host, 'clientWidth', { value: 480 });
    window.document.body.appendChild(host);
    const flow = new Flow(mono);
    const stop = mount($dom(window.document, { layout: flow }), view(reserve, shown), host);
    const next = () => parseFloat(/** @type {any} */ ([...host.querySelectorAll('[data-ren="Action"]')].find(n => n.textContent === 'Next')).style.left);
    const before = next();
    $write(shown[0], false);
    flow.flush?.();
    const after = next();
    const first = /** @type {any} */ (host.querySelector('[data-ren="Action"]'));
    const name = first.getAttribute('aria-label');
    stop();
    flow.close();
    closeWindow(window);
    return { before, after, name };
  };

  it('keeps the width of the widest reserved text, so the next Button does not move (the DOM laid out by the Flow, and Skia)', () => {
    const plain = lefts(undefined);
    assert.ok(plain.after > plain.before, `without reserve the next Button moves: ${plain.before} to ${plain.after}`);
    const kept = lefts(['Ativar', 'Desativar']);
    assert.equal(kept.after, kept.before, 'with the texts reserved it stays');
    assert.equal(kept.name, 'Desativar', 'named by the text it shows');

    /** @type {any[]} */
    const shown = [];
    const { dom, skia, dispose } = both(view(['Ativar', 'Desativar'], shown), { width: 480, height: 120 });
    const nextLeft = () => {
      skia.text();
      return items(skia, KIND.Label).concat(items(skia, KIND.Action)).find(i => i.text === 'Next').getBoundingClientRect().left;
    };
    const before = nextLeft();
    for (const s of shown) $write(s, false);
    $flush(dom.root);
    $flush(skia.root);
    assert.equal(nextLeft(), before, 'on Skia too');
    assert.equal(skia.text(), 'Desativar Next', 'only the shown text is painted');
    assert.equal(dom.text().includes('Desativar Next'), true);
    dispose();
  });
});

describe('Action icons', () => {
  it('trash, edit, eye, image, ban, undo, merge, mail, exit, shield and settings draw the same figures on both, outlined in the color given', async () => {
    const rui = await import('rui-core');
    const names = ['TrashIcon', 'EditIcon', 'EyeIcon', 'ImageIcon', 'BanIcon', 'UndoIcon', 'MergeIcon', 'MailIcon', 'ExitIcon', 'ShieldIcon', 'SettingsIcon'];
    for (const name of names) {
      const Icon = /** @type {any} */ (rui)[name];
      const { dom, skia, dispose } = both(() => (
        <Rui>
          <Icon size={24} color="red" />
        </Rui>
      ));
      const [shape] = dom.nodes('Shape');
      const figures = [...shape.children];
      assert.ok(figures.length >= 1, `${name} draws`);
      // outlined: at least one figure stroked, none of them black (the color given)
      assert.ok(figures.some((/** @type {any} */ c) => c.getAttribute('fill') === 'none'), `${name} outlined`);
      assert.ok(figures.every((/** @type {any} */ c) => !/^(#000|black)/i.test(c.getAttribute('stroke') ?? c.getAttribute('fill') ?? '')), `${name} in its color`);
      skia.text();
      assert.ok(skia.skia.commands().length >= figures.length, `${name} painted on Skia`);
      dispose();
    }
  });
});

describe('Disabled without a fill', () => {
  it('a disabled ghost or plain Button and IconButton keep no fill, their text dimmed; a solid one is filled', async () => {
    const { Button, IconButton, CloseIcon } = await import('rui-core');
    const { dom, dispose } = both(() => (
      <Rui>
        <Button variant="ghost" disabled>
          Ghost
        </Button>
        <Button variant="plain" disabled>
          Plain
        </Button>
        <Button disabled>Solid</Button>
        <IconButton variant="ghost" label="Close it" disabled>
          <CloseIcon />
        </IconButton>
      </Rui>
    ));
    const [ghost, plain, solid, icon] = dom.nodes('Action');
    for (const n of [ghost, plain, icon]) assert.match(n.style.background || n.style.backgroundColor, /transparent|rgba\(0, 0, 0, 0\)/, `${n.textContent || n.getAttribute('aria-label')} unfilled`);
    assert.doesNotMatch(solid.style.background || solid.style.backgroundColor, /transparent/, 'a solid one filled');
    dispose();
  });
});
