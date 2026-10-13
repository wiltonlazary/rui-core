// Modal.Stack and $modalStack on the DOM and on Skia: members layered in
// the order they opened, only the top one acting as a modal (backdrop,
// focus, Escape, a press outside), raises, members driven by their own
// `open`, and the hook's state.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write } from 'rrx-core';
import { $active, Show } from 'ren-core';
import { manualClock, Button, Text, Modal, Drawer, $modalStack } from 'rui-core';
import { pair, states, css, styledBy, tinted, app } from './overlay-harness.jsx';

/** The backdrops the DOM shows (the theme's opacity.disabled, light scheme). @param {any} dom */
const backdrops = dom => [...dom.document.body.querySelectorAll('[data-ren="View"]')].filter(n => tinted(css(n).background, 0.45));

/** The layer (its z-index) a text sits in on the DOM. @param {any} d @param {string} text */
const layerOf = (d, text) => css(styledBy(d.find(text), 'z-index'))['z-index'];

/** The z-index of the layer holding the one backdrop shown. @param {any} dom */
const shaded = dom => {
  const shown = backdrops(dom);
  assert.equal(shown.length, 1, 'one backdrop shown');
  return css(styledBy(shown[0].parentElement, 'z-index'))['z-index'];
};

/** The label of the item Skia focuses. @param {any} s */
const skiaFocus = s => s.focused()?.label;

/** Settings, confirm and help, driven by one $modalStack per root. */
function hooked() {
  const clock = manualClock();
  const hooks = states();
  const view = app(clock, () => {
    const stack = hooks.add($modalStack(['settings', 'confirm', 'help']));
    return (
      <Modal.Stack>
        <Button>Page</Button>
        <Modal {...stack.bind('settings')} title="Settings" closable={{ label: 'Close settings' }}>
          <Text>Settings body</Text>
        </Modal>
        <Modal {...stack.bind('confirm')} title="Confirm" closable={{ label: 'Close confirm' }}>
          <Text>Confirm body</Text>
        </Modal>
        <Modal {...stack.bind('help')} title="Help" closable={{ label: 'Close help' }}>
          <Text>Help body</Text>
        </Modal>
      </Modal.Stack>
    );
  });
  const p = pair(view);
  const settle = () => {
    clock.advance(400);
    p.flush();
  };
  /** Runs a command on each root's hook. @param {(h: any) => void} fn */
  const each = fn => {
    for (const h of hooks.list) fn(h);
    p.flush();
    settle();
  };
  return { ...p, clock, hooks: /** @type {any[]} */ (hooks.list), settle, each };
}

describe('Modal.Stack', () => {
  it('layers two open members, the later one above; one backdrop; the top holds the focus', () => {
    const { d, s, dom, each, dispose } = hooked();
    each(h => h.open('settings'));
    each(h => h.open('confirm'));
    assert.equal(layerOf(d, 'Settings body'), '20');
    assert.equal(layerOf(d, 'Confirm body'), '21', 'one layer above');
    assert.equal(shaded(dom), '21', 'only the top shows its backdrop');
    assert.equal(d.focused().getAttribute('aria-label'), 'Close confirm', 'the top holds the focus on the DOM');
    assert.equal(skiaFocus(s), 'Close confirm', 'and on Skia');
    assert.equal(d.text(), 'Page Settings Settings body Confirm Confirm body');
    assert.equal(s.text(), 'Page Settings Settings body Confirm Confirm body');
    dispose();
  });

  it('Escape closes only the top; the next shows its backdrop, takes the focus back and Escape', () => {
    const { d, s, dom, hooks, each, settle, dispose } = hooked();
    each(h => h.open('settings'));
    each(h => h.open('confirm'));
    d.key('Escape');
    s.key('Escape');
    settle();
    assert.deepEqual(hooks.map(h => $read(h.value)), [['settings'], ['settings']]);
    assert.equal(shaded(dom), '20', 'the next shows its backdrop at once');
    assert.equal(d.focused().getAttribute('aria-label'), 'Close settings', 'the focus back where it was on the DOM');
    assert.equal(skiaFocus(s), 'Close settings', 'and on Skia');
    d.key('Escape');
    s.key('Escape');
    settle();
    assert.deepEqual(hooks.map(h => $read(h.value)), [[], []], 'the next takes Escape');
    assert.equal(backdrops(dom).length, 0);
    dispose();
  });

  it('a press outside closes only the top', () => {
    const { d, s, dom, hooks, each, dispose } = hooked();
    each(h => h.open('settings'));
    each(h => h.open('help'));
    d.tap(backdrops(dom)[0]);
    s.at(5, 340);
    assert.deepEqual(hooks.map(h => $read(h.value)), [['settings'], ['settings']]);
    dispose();
  });

  it('opening a lower member raises it; value and top follow; reopening comes back on top', () => {
    const { d, dom, hooks, each, dispose } = hooked();
    each(h => h.open('settings'));
    each(h => h.open('confirm'));
    assert.deepEqual($read(hooks[0].value), ['settings', 'confirm']);
    assert.equal(hooks[0].top(), 'confirm');
    each(h => h.open('settings'));
    assert.deepEqual($read(hooks[0].value), ['confirm', 'settings'], 'raised in value');
    assert.equal(hooks[0].top(), 'settings');
    assert.equal(layerOf(d, 'Settings body'), '21', 'raised on the page');
    assert.equal(layerOf(d, 'Confirm body'), '20');
    assert.equal(shaded(dom), '21');
    each(h => h.close('confirm'));
    each(h => h.open('confirm'));
    assert.deepEqual($read(hooks[0].value), ['settings', 'confirm'], 'closed and opened again: on top');
    assert.equal(layerOf(d, 'Confirm body'), '21');
    dispose();
  });

  it('toggle, clear, isOpen, top; an id outside the list throws', () => {
    const { d, hooks, each, dispose } = hooked();
    each(h => h.toggle('help'));
    assert.equal(hooks[0].isOpen('help'), true);
    each(h => h.toggle('confirm'));
    each(h => h.toggle('help'));
    assert.deepEqual($read(hooks[1].value), ['confirm']);
    each(h => h.open('settings'));
    each(h => h.clear());
    assert.deepEqual(hooks.map(h => $read(h.value)), [[], []]);
    assert.equal(hooks[0].top(), null);
    assert.equal(d.text(), 'Page');
    assert.throws(() => hooks[0].open('about'), /RUI: \$modalStack has no modal "about"/);
    dispose();
  });

  it('any id opens when no list is given', () => {
    const clock = manualClock();
    const hooks = states();
    const view = app(clock, () => {
      const stack = hooks.add($modalStack());
      return (
        <Modal.Stack>
          <Modal {...stack.bind('anything')} title="Anything">
            <Text>Free</Text>
          </Modal>
        </Modal.Stack>
      );
    });
    const { d, s, flush, dispose } = pair(view);
    for (const h of hooks.list) h.open('anything');
    clock.advance(400);
    flush();
    assert.equal(d.text(), 'Anything Free');
    assert.equal(s.text(), 'Anything Free');
    dispose();
  });

  it('members driven by their own open prop stack too; a disposed member leaves the stack', () => {
    const clock = manualClock();
    const opens = states();
    const kept = states();
    const view = app(clock, () => {
      const R = $active();
      const a = opens.add($signal(R, false));
      const b = opens.add($signal(R, false));
      const keep = kept.add($signal(R, true));
      return (
        <Modal.Stack>
          <Modal stack="settings" open={a} onOpenChange={(/** @type {boolean} */ v) => $write(a, v)} title="Settings">
            <Text>Settings body</Text>
          </Modal>
          <Show when={keep}>
            <Modal stack="help" open={b} onOpenChange={(/** @type {boolean} */ v) => $write(b, v)} title="Help">
              <Text>Help body</Text>
            </Modal>
          </Show>
        </Modal.Stack>
      );
    });
    const { d, dom, flush, dispose } = pair(view);
    const settle = () => {
      flush();
      clock.advance(400);
      flush();
    };
    for (const [i, o] of opens.list.entries()) if (i % 2 === 1) $write(o, true);
    settle();
    for (const [i, o] of opens.list.entries()) if (i % 2 === 0) $write(o, true);
    settle();
    assert.equal(layerOf(d, 'Help body'), '20');
    assert.equal(layerOf(d, 'Settings body'), '21', 'the later one above');
    assert.equal(shaded(dom), '21');
    for (const k of kept.list) $write(k, false);
    settle();
    assert.equal(d.text(), 'Settings Settings body');
    assert.equal(layerOf(d, 'Settings body'), '20', 'the next is the top, alone');
    assert.equal(shaded(dom), '20');
    dispose();
  });

  it('a Drawer in Drawer.Stack stacks; a Modal without stack inside is plain', () => {
    const clock = manualClock();
    const hooks = states();
    const view = app(clock, () => {
      const stack = hooks.add($modalStack(['filters', 'sort']));
      return (
        <Drawer.Stack>
          <Drawer {...stack.bind('filters')} title="Filters">
            <Text>Filters body</Text>
          </Drawer>
          <Drawer {...stack.bind('sort')} title="Sort">
            <Text>Sort body</Text>
          </Drawer>
          <Modal defaultOpen title="Plain">
            <Text>Plain body</Text>
          </Modal>
        </Drawer.Stack>
      );
    });
    const { d, dom, flush, dispose } = pair(view);
    for (const h of hooks.list) h.open('filters');
    flush();
    for (const h of hooks.list) h.open('sort');
    clock.advance(400);
    flush();
    assert.equal(layerOf(d, 'Filters body'), '20');
    assert.equal(layerOf(d, 'Sort body'), '21');
    assert.equal(layerOf(d, 'Plain body'), '20', 'the plain modal keeps its own layer');
    assert.equal(backdrops(dom).length, 2, 'the plain one and the top member show backdrops');
    dispose();
  });

  it('a stack id outside any stack is a plain modal; two members with one id throw', () => {
    const clock = manualClock();
    const alone = app(clock, () => (
      <Modal stack="settings" defaultOpen title="Alone">
        <Text>Alone body</Text>
      </Modal>
    ));
    const a = pair(alone);
    clock.advance(400);
    a.flush();
    assert.equal(layerOf(a.d, 'Alone body'), '20');
    assert.equal(backdrops(a.dom).length, 1);
    a.dispose();
    const twice = app(manualClock(), () => (
      <Modal.Stack>
        <Modal stack="help" title="One" />
        <Modal stack="help" title="Two" />
      </Modal.Stack>
    ));
    assert.throws(() => pair(twice), /RUI: two stacked modals share the id "help"/);
  });
});
