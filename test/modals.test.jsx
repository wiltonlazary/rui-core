// rui-core/modals: the manager on the DOM and on Skia: content, question and
// named modals shown through $modals(), the same text, presses, keys and
// state on each, stacked modals, updates, and per-root managers.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';
import { View } from 'ren-core';
import { Rui, Clock, manualClock, Text, Button } from 'rui-core';
import { Modals, $modals } from 'rui-core/modals';
import { both } from './harness.jsx';

/** Collapses whitespace. @param {string[]} parts */
const normalize = parts => parts.join(' ').replace(/\s+/g, ' ').trim();

/** True when the node or an ancestor is not displayed. @param {any} node */
function hidden(node) {
  for (let n = node; n != null && n.style !== undefined; n = n.parentElement) if (n.style.display === 'none') return true;
  return false;
}

/** The view on both renderers, seeing the portal layer. @param {() => any} view */
function pair(view) {
  const { dom, skia, dispose } = both(view);
  const body = dom.document.body;
  const flush = () => {
    $flush(dom.root);
    $flush(skia.root);
  };
  /** @param {string} role */
  const nodes = role => /** @type {any[]} */ ([...body.querySelectorAll(`[data-ren="${role}"]`)]).filter(n => !hidden(n));
  const d = {
    text() {
      $flush(dom.root);
      /** @type {string[]} */
      const out = [];
      for (const node of body.querySelectorAll('[data-ren]')) {
        const role = node.getAttribute('data-ren');
        if ((role !== 'Label' && role !== 'Action' && role !== 'Edit') || hidden(node)) continue;
        if (role === 'Action' && node.querySelector('[data-ren]') !== null) continue;
        out.push(role === 'Edit' ? node.value || node.placeholder || '' : node.textContent);
      }
      return normalize(out);
    },
    /** Presses the last Action showing `text`, as a browser does. @param {string} text */
    press(text) {
      const node = nodes('Action').filter(n => n.textContent.trim() === text).at(-1);
      if (node === undefined) throw new Error(`no "${text}" on the DOM in: ${d.text()}`);
      const w = dom.window;
      const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 };
      node.dispatchEvent(new w.PointerEvent('pointerdown', at));
      node.dispatchEvent(new w.PointerEvent('pointerup', { ...at, buttons: 0 }));
      node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      $flush(dom.root);
    },
    /** @param {string} key */
    key(key) {
      const node = dom.document.activeElement ?? body;
      node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      $flush(dom.root);
    },
  };
  const s = {
    text: () => skia.text(),
    /** Presses the text painted last (the topmost). @param {string} text */
    press(text) {
      $flush(skia.root);
      skia.skia.present();
      const at = skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'text' && String(c[1]).trim() === text).at(-1);
      if (at === undefined) throw new Error(`no "${text}" painted on Skia in: ${skia.text()}`);
      skia.skia.press(at[2] + 2, at[3] - 3);
      skia.skia.release(at[2] + 2, at[3] - 3);
      $flush(skia.root);
    },
    /** @param {string} key */
    key(key) {
      skia.skia.key(key);
      $flush(skia.root);
    },
    focused: () => skia.skia.focused,
  };
  return { dom, skia, d, s, flush, dispose };
}

/**
 * A page with a <Modals>, its API captured per root, and a button
 * that runs `act(api)`.
 * @param {any} clock @param {Record<string, any>} host @param {(api: import('rui-core/modals').Modals) => void} act
 */
function setup(clock, host, act) {
  /** @type {import('rui-core/modals').Modals[]} */
  const apis = [];
  const Page = () => {
    const api = $modals();
    apis.push(api);
    return (
      <View style={{ padding: 20 }}>
        <Button onPress={() => act(api)}>Go</Button>
        <Text>page</Text>
      </View>
    );
  };
  const view = () => (
    <Clock value={clock}>
      <Rui>
        <Modals {...host}>
          <Page />
        </Modals>
      </Rui>
    </Clock>
  );
  const p = pair(view);
  const settle = () => {
    clock.advance(250);
    p.flush();
  };
  const go = () => {
    p.d.press('Go');
    p.s.press('Go');
    settle();
  };
  /** Both at once. @param {string} text */
  const press = text => {
    p.d.press(text);
    p.s.press(text);
    settle();
  };
  /** @param {string} key */
  const key = key => {
    p.d.key(key);
    p.s.key(key);
    settle();
  };
  const texts = () => [p.d.text(), p.s.text()];
  return { ...p, apis, go, press, key, texts, settle };
}

describe('Modals', () => {
  it('shows a modal with its title and content; Escape hides it (onOpenChange), per root', () => {
    const clock = manualClock();
    /** @type {string[]} */
    const log = [];
    const t = setup(clock, {}, api => api.show({ title: 'Terms', children: 'Read them', onOpenChange: (/** @type {boolean} */ open) => log.push(open ? 'open' : 'close') }));
    assert.equal(t.apis.length, 2);
    assert.notEqual(t.apis[0], t.apis[1], 'one manager per root');
    t.d.press('Go');
    t.settle();
    assert.deepEqual(t.texts(), ['Go page Terms Read them', 'Go page'], 'the DOM root only');
    t.s.press('Go');
    t.settle();
    assert.deepEqual(t.texts(), ['Go page Terms Read them', 'Go page Terms Read them']);
    assert.deepEqual(t.apis.map(a => a.modals().length), [1, 1]);
    assert.equal(t.s.focused()?.label, 'Close', 'focus moved in');
    t.key('Escape');
    assert.deepEqual(log, ['close', 'close']);
    assert.deepEqual(t.texts(), ['Go page', 'Go page']);
    assert.deepEqual(t.apis.map(a => a.modals().length), [0, 0]);
    t.dispose();
  });

  it('ask: a question whose Promise says yes or no; Escape, a hide and no say false', async () => {
    const clock = manualClock();
    /** @type {Promise<boolean>[]} */
    const asked = [];
    const t = setup(clock, { labels: { yes: 'Go ahead', no: 'Keep it' } }, api =>
      asked.push(api.ask({ title: 'Remove the draft?', text: 'It goes for good', labels: { yes: 'Remove' }, tone: 'red' })),
    );
    t.go();
    assert.deepEqual(t.texts(), Array(2).fill('Go page Remove the draft? It goes for good Remove Keep it'));
    t.press('Remove');
    assert.deepEqual(await Promise.all(asked), [true, true]);
    assert.deepEqual(t.texts(), ['Go page', 'Go page']);
    t.go();
    t.press('Keep it');
    assert.deepEqual(await Promise.all(asked.slice(2)), [false, false]);
    t.go();
    t.key('Escape');
    assert.deepEqual(await Promise.all(asked.slice(4)), [false, false], 'Escape answers no');
    t.go();
    for (const api of t.apis) api.clear();
    t.settle();
    assert.deepEqual(await Promise.all(asked.slice(6)), [false, false], 'a hide answers no');
    assert.deepEqual(t.texts(), ['Go page', 'Go page']);
    t.dispose();
  });

  it('ask labels its buttons Yes and No by default, yes over no', () => {
    const clock = manualClock();
    const t = setup(clock, {}, api => void api.ask({ title: 'Leave now?' }));
    t.go();
    assert.deepEqual(t.texts(), Array(2).fill('Go page Leave now? Yes No'));
    t.skia.skia.present();
    const at = (/** @type {string} */ word) => t.skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'text' && String(c[1]).trim() === word).at(-1);
    const [yes, no] = [at('Yes'), at('No')];
    assert.ok(no[3] > yes[3], 'the answers stack: no under yes');
    t.dispose();
  });

  it('an id used again builds its modal anew: a show, then an ask of that id, has the ask\'s buttons', () => {
    const clock = manualClock();
    const t = setup(clock, {}, api => void api.show({ id: 'q', title: 'Note', children: 'first' }));
    t.go();
    assert.deepEqual(t.texts(), Array(2).fill('Go page Note first'));
    for (const api of t.apis) void api.ask({ id: 'q', title: 'Sure?' });
    t.settle();
    assert.deepEqual(t.texts(), Array(2).fill('Go page Sure? Yes No'));
    t.apis.forEach(a => a.clear());
    t.settle();
    t.dispose();
  });

  it('<Modals defaults> fill what a show, an ask or a named modal leaves out', () => {
    const clock = manualClock();
    const Named = (/** @type {any} */ p) => <Text>{`named ${String(p.data)}`}</Text>;
    const defaults = { title: 'Notice', children: 'Default body', text: 'Sure?', data: 'D', labels: { yes: 'Fine' } };
    /** @type {string[]} */
    const kinds = ['show', 'ask', 'named'];
    let at = 0;
    const t = setup(clock, { defaults, named: { n: Named } }, api => {
      const kind = kinds[Math.floor(at++ / 2)];
      if (kind === 'show') api.show({});
      else if (kind === 'ask') void api.ask({});
      else api.showNamed('n', undefined, {});
    });
    const seen = [];
    for (let i = 0; i < 3; i++) {
      t.go();
      seen.push(t.texts()[0]);
      assert.equal(t.texts()[1], t.texts()[0], 'the same on Skia');
      t.apis.forEach(a => a.clear());
      t.settle();
    }
    assert.deepEqual(seen, ['Go page Notice Default body', 'Go page Notice Sure? Fine No', 'Go page Notice named D']);
    t.dispose();
  });

  it('an own prop given as undefined leaves the default: the title and the size', () => {
    const clock = manualClock();
    const t = setup(clock, { defaults: { title: 'T', size: 'lg' } }, api => void api.show({ title: undefined, size: undefined, children: 'body' }));
    t.go();
    assert.deepEqual(t.texts(), Array(2).fill('Go page T body'));
    const widths = [...t.dom.document.body.querySelectorAll('[data-ren="View"]')].map((/** @type {any} */ n) => n.style.width || n.style.maxWidth);
    assert.ok(widths.includes('640px'), `the lg size (640) from the defaults: ${widths.filter(Boolean).join(' ')}`);
    t.apis.forEach(a => a.clear());
    t.settle();
    t.dispose();
  });

  it("a default onOpenChange hears each hide, a modal's own wins", () => {
    const clock = manualClock();
    /** @type {string[]} */
    const heard = [];
    const defaults = { onOpenChange: (/** @type {boolean} */ open) => heard.push(`default ${open}`) };
    let at = 0;
    const t = setup(clock, { defaults }, api => {
      if (at++ < 2) api.show({ title: 'Plain', children: 'x' });
      else api.show({ title: 'Own', children: 'y', onOpenChange: (/** @type {boolean} */ open) => heard.push(`own ${open}`) });
    });
    t.go();
    t.key('Escape');
    t.settle();
    assert.deepEqual(heard, ['default false', 'default false']);
    t.go();
    t.apis.forEach(a => a.clear());
    t.settle();
    assert.deepEqual(heard.slice(2), ['own false', 'own false']);
    t.dispose();
  });

  it('a named modal gets its id, its data and hide, and follows update', () => {
    const clock = manualClock();
    /** @param {{ id: string, data: { body: string }, hide: () => void }} props */
    const Demo = props => (
      <View>
        <Text>{props.data.body}</Text>
        <Button onPress={props.hide}>Done</Button>
      </View>
    );
    /** @type {string[]} */
    const ids = [];
    const t = setup(clock, { named: { demo: Demo } }, api => ids.push(api.showNamed('demo', { body: 'first' }, { title: 'Demo' })));
    t.go();
    assert.deepEqual(t.texts(), Array(2).fill('Go page Demo first Done'));
    for (const [i, api] of t.apis.entries()) api.update(ids[i], { data: { body: 'second' }, title: 'Changed' });
    t.flush();
    assert.deepEqual(t.texts(), Array(2).fill('Go page Changed second Done'));
    t.press('Done');
    assert.deepEqual(t.texts(), ['Go page', 'Go page']);
    t.dispose();
  });

  it('stacks modals: the later one over the earlier, Escape hides the top one, clear the rest', () => {
    const clock = manualClock();
    const t = setup(clock, {}, api => {

      api.show({ title: 'First', children: 'under', id: 'a' });
      api.show({ title: 'Second', children: 'over', id: 'b' });
    });
    t.go();
    assert.deepEqual(t.texts(), Array(2).fill('Go page First under Second over'));
    const z = (/** @type {string} */ title) => {
      const label = [...t.dom.document.body.querySelectorAll('[data-ren="Label"]')].find(l => l.textContent === title);
      for (let e = /** @type {any} */ (label); e != null; e = e.parentElement) if (e.style?.zIndex) return Number(e.style.zIndex);
      return NaN;
    };
    assert.ok(z('Second') > z('First'), 'the later one is over');
    assert.equal(t.s.focused()?.label, 'Close');
    t.key('Escape');
    assert.deepEqual(t.texts(), Array(2).fill('Go page First under'));
    assert.deepEqual(t.apis.map(a => a.modals().map(m => m.id).join()), ['a', 'a']);
    for (const api of t.apis) api.update('a', { title: 'Renamed' });
    t.flush();
    assert.deepEqual(t.texts(), Array(2).fill('Go page Renamed under'));
    for (const api of t.apis) api.clear();
    t.settle();
    assert.deepEqual(t.texts(), ['Go page', 'Go page']);
    t.dispose();
  });

  it("each record names its kind: 'plain' from show, 'ask' from ask, 'named' from showNamed", () => {
    const clock = manualClock();
    const Demo = () => <Text>demo</Text>;
    const t = setup(clock, { named: { demo: Demo } }, api => {
      api.show({ title: 'Shown', children: 'body' });
      void api.ask({ title: 'Asked?' });
      api.showNamed('demo');
    });
    t.go();
    assert.deepEqual(
      t.apis.map(a => a.modals().map(m => [m.kind, m.modal])),
      Array(2).fill([
        ['plain', null],
        ['ask', null],
        ['named', 'demo'],
      ]),
    );
    t.apis.forEach(a => a.clear());
    t.settle();
    t.dispose();
  });

  it('$modals() outside a <Modals> says so', () => {
    const Lost = () => {
      $modals();
      return null;
    };
    assert.throws(() => both(() => <Lost />), /<Modals>/);
  });
});
