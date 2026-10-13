// rui-core/launcher: the match, and <Launcher> on the DOM and on Skia:
// shown by its store or its shortcut, searched by typing, chosen with the
// keyboard or by press, the same text and state on each, per root.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';
import { View, Edit } from 'ren-core';
import { Rui, Clock, manualClock, Text, Button, BASE_THEME } from 'rui-core';
import { Launcher, $launcher, launcherMatch, firstActions } from 'rui-core/launcher';
import { both } from './harness.jsx';

/** Collapses whitespace. @param {string[]} parts */
const normalize = parts => parts.join(' ').replace(/\s+/g, ' ').trim();

/** True when the node or an ancestor is not displayed. @param {any} node */
function hidden(node) {
  for (let n = node; n != null && n.style !== undefined; n = n.parentElement) if (n.style.display === 'none') return true;
  return false;
}

/** The view on both renderers, seeing the portal layer, with keys and typing. @param {() => any} view */
function pair(view) {
  const { dom, skia, dispose } = both(view);
  const body = dom.document.body;
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
    /** @param {string} label */
    action: label => nodes('Action').find(n => n.getAttribute('aria-label') === label || n.textContent.trim() === label),
    /** @param {any} node */
    tap(node) {
      const w = dom.window;
      const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 };
      node.dispatchEvent(new w.PointerEvent('pointerdown', at));
      node.dispatchEvent(new w.PointerEvent('pointerup', { ...at, buttons: 0 }));
      node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      $flush(dom.root);
    },
    /** @param {string} key @param {Record<string, boolean>} [mods] */
    key(key, mods = {}) {
      const node = dom.document.activeElement ?? body;
      node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
      $flush(dom.root);
    },
    /** @param {string} text */
    type(text) {
      const node = /** @type {any} */ (dom.document.activeElement);
      for (const ch of text) {
        node.value = node.value + ch;
        node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        $flush(dom.root);
      }
    },
    focused: () => /** @type {any} */ (dom.document.activeElement),
  };
  const s = {
    text: () => skia.text(),
    /** @param {string} label */
    action(label) {
      skia.skia.present();
      /** @type {any[]} */
      const out = [];
      const walk = (/** @type {any} */ n) => {
        for (let c = n.first; c !== null; c = c.next) {
          out.push(c);
          walk(c);
        }
      };
      walk(skia.skia.root);
      walk(skia.skia.overlay);
      return out.find(i => i.label === label || i.text === label);
    },
    /** @param {any} item */
    tap(item) {
      skia.skia.present();
      const b = item.getBoundingClientRect();
      skia.skia.press(b.x + 4, b.y + b.height / 2);
      skia.skia.release(b.x + 4, b.y + b.height / 2);
      $flush(skia.root);
    },
    /** @param {string} key @param {Record<string, boolean>} [mods] */
    key(key, mods) {
      skia.skia.key(key, false, mods);
      $flush(skia.root);
    },
    /** @param {string} text */
    type(text) {
      for (const ch of text) skia.skia.key(ch);
      $flush(skia.root);
    },
    focused: () => skia.skia.focused,
  };
  return { dom, skia, d, s, dispose };
}

const ACTIONS = [
  { id: 'inbox', label: 'Inbox', hint: 'Open the new mail' },
  { id: 'calendar', label: 'Calendar', hint: 'See the week ahead', tags: ['agenda'] },
  { label: 'Settings', actions: [{ id: 'theme', label: 'Theme', hint: 'Colors and schemes' }, { id: 'account', label: 'Account', tags: 'profile' }] },
];

/**
 * A page inside a Launcher with the actions logging their presses, and
 * the store captured per root.
 * @param {Record<string, any>} [extra]
 */
function setup(extra = {}, field = false) {
  const clock = manualClock();
  /** @type {string[]} */
  const log = [];
  /** @type {import('rui-core/launcher').LauncherStore[]} */
  const stores = [];
  const actions = ACTIONS.map(a => ('actions' in a ? { ...a, actions: a.actions.map(x => ({ ...x, onPress: () => log.push(x.id) })) } : { ...a, onPress: () => log.push(a.id) }));
  const Page = () => {
    const store = $launcher();
    stores.push(store);
    return (
      <View style={{ padding: 20 }}>
        <Button onPress={() => store.open()}>Search</Button>
        <Text>page</Text>
        {field ? <Edit label="Note" value="" /> : null}
      </View>
    );
  };
  const view = () => (
    <Clock value={clock}>
      <Rui>
        <Launcher actions={actions} {...extra}>
          <Page />
        </Launcher>
      </Rui>
    </Clock>
  );
  const p = pair(view);
  const settle = () => {
    clock.advance(250);
    $flush(p.dom.root);
    $flush(p.skia.root);
  };
  const open = () => {
    for (const store of stores) store.open();
    settle();
  };
  /** @param {string} key @param {Record<string, boolean>} [mods] */
  const key = (key, mods) => {
    p.d.key(key, mods);
    p.s.key(key, mods);
    settle();
  };
  /** @param {string} text */
  const type = text => {
    p.d.type(text);
    p.s.type(text);
    settle();
  };
  const texts = () => [p.d.text(), p.s.text()];
  return { ...p, clock, log, stores, open, key, type, texts, settle };
}

const ALL = 'Find an action Inbox Open the new mail Calendar See the week ahead Settings Theme Colors and schemes Account';

describe('launcher keys', () => {
  it('lists runs and actions that share a label: two ungrouped runs, one label twice, two groups of one label', () => {
    const cases = [
      [{ label: 'Alpha' }, { label: 'Tools', actions: [{ label: 'Beta' }] }, { label: 'Gamma' }],
      [{ label: 'Open', hint: 'a file' }, { label: 'Open', hint: 'a folder' }],
      [{ label: 'Tools', actions: [{ label: 'One' }] }, { label: 'Tools', actions: [{ label: 'Two' }] }],
    ];
    const want = ['Alpha Tools Beta Gamma', 'Open a file Open a folder', 'Tools One Tools Two'];
    cases.forEach((actions, i) => {
      const t = setup({ actions });
      t.open();
      for (const text of t.texts()) assert.ok(text.includes(want[i]), `case ${i + 1}: ${text}`);
      t.dispose();
    });
  });
});

describe('launcher match', () => {
  it('finds an action by its label, hint or tags, ignoring case; firstActions keeps groups', () => {
    const [inbox, calendar, settings] = /** @type {any[]} */ (ACTIONS);
    const [theme, account] = settings.actions;
    assert.deepEqual([inbox, calendar, theme, account].map(a => launcherMatch(a, '')), [true, true, true, true], 'an empty search matches all');
    assert.deepEqual([inbox, calendar, theme, account].map(a => launcherMatch(a, ' INBOX ')), [true, false, false, false]);
    assert.deepEqual([inbox, calendar, theme, account].map(a => launcherMatch(a, 'agenda')), [false, true, false, false], 'by a tag');
    assert.deepEqual([inbox, calendar, theme, account].map(a => launcherMatch(a, 'profile')), [false, false, false, true], 'by a single tag');
    assert.deepEqual([inbox, calendar, theme, account].map(a => launcherMatch(a, 'the')), [true, true, true, false], 'by the hint too');
    const labels = (/** @type {any[]} */ items) => items.flatMap(i => ('actions' in i ? [`[${i.label}]`, ...i.actions.map((/** @type {any} */ a) => a.label)] : [i.label]));
    assert.deepEqual(labels(firstActions(ACTIONS, 3)), ['Inbox', 'Calendar', '[Settings]', 'Theme']);
    assert.deepEqual(labels(firstActions(ACTIONS, 4)), ['Inbox', 'Calendar', '[Settings]', 'Theme', 'Account'], 'one group stays one group');
    assert.deepEqual(labels(firstActions(ACTIONS, 0)), []);
    assert.deepEqual(labels(firstActions(ACTIONS, Infinity)), labels(ACTIONS));
  });

  it('matches every word of the search in any order, across label, hint and tags', () => {
    const [inbox, calendar, settings] = /** @type {any[]} */ (ACTIONS);
    const [theme] = settings.actions;
    assert.equal(launcherMatch(inbox, 'mail open'), true, 'both words of the hint, in another order');
    assert.equal(launcherMatch(calendar, 'agenda  WEEK'), true, 'a tag and a hint word');
    assert.equal(launcherMatch(theme, 'theme mail'), false, 'every word must be found');
    assert.equal(launcherMatch(inbox, '   '), true, 'no words: every action');
  });
});

describe('Launcher', () => {
  it('opens by its store with the search focused, per root, and closes by Escape (onOpenChange)', () => {
    /** @type {boolean[]} */
    const changes = [];
    const t = setup({ onOpenChange: (/** @type {boolean} */ open) => changes.push(open) });
    assert.equal(t.stores.length, 2);
    assert.notEqual(t.stores[0], t.stores[1], 'one store per root');
    assert.deepEqual(t.texts(), ['Search page', 'Search page']);
    t.stores[0].open();
    t.settle();
    assert.deepEqual(t.texts(), [`Search page ${ALL}`, 'Search page']);
    t.stores[1].open();
    t.settle();
    assert.deepEqual(t.texts(), Array(2).fill(`Search page ${ALL}`));
    assert.equal(t.d.focused()?.getAttribute('data-ren'), 'Edit', 'the search has the focus');
    assert.equal(t.s.focused(), t.s.action('Find an action'), 'and on Skia');
    t.key('Escape');
    assert.deepEqual(t.stores.map(s => s.isOpen()), [false, false]);
    assert.deepEqual(t.texts(), ['Search page', 'Search page']);
    assert.deepEqual(changes, [true, true, false, false]);
    t.dispose();
  });

  it('matches as the search is typed, shows the empty text, and clears the search on close', () => {
    const t = setup();
    t.open();
    t.type('acc');
    assert.deepEqual(t.texts(), Array(2).fill('Search page acc Settings Account'));
    t.type('zz');
    assert.deepEqual(t.texts(), Array(2).fill('Search page acczz No matches'));
    assert.deepEqual(t.stores.map(s => s.search()), ['acczz', 'acczz']);
    t.key('Escape');
    assert.deepEqual(t.stores.map(s => s.search()), ['', '']);
    t.dispose();
  });

  it('keeps the search on close with keepSearch', () => {
    const t = setup({ keepSearch: true });
    t.open();
    t.type('acc');
    t.key('Escape');
    assert.deepEqual(t.stores.map(s => s.search()), ['acc', 'acc']);
    t.dispose();
  });

  it('starts from defaultSearch, reports onSearchChange, and takes its own match', () => {
    /** @type {string[]} */
    const searches = [];
    const t = setup({
      defaultSearch: 'a',
      onSearchChange: (/** @type {string} */ q) => searches.push(q),
      match: (/** @type {any} */ action, /** @type {string} */ search) => action.id.startsWith(search),
      empty: 'Try another word',
    });
    t.open();
    assert.deepEqual(t.texts(), Array(2).fill('Search page a Settings Account'), 'only the ids that start with the search');
    t.type('x');
    assert.deepEqual(t.texts(), Array(2).fill('Search page ax Try another word'));
    assert.deepEqual(searches, ['ax', 'ax']);
    t.dispose();
  });

  it('chooses with ArrowDown, ArrowUp and Enter, runs onPress and closes', () => {
    const t = setup();
    t.open();
    t.key('ArrowDown');
    t.key('ArrowDown');
    t.key('ArrowDown');
    t.key('ArrowUp');
    t.key('Enter');
    assert.deepEqual(t.log, ['calendar', 'calendar']);
    assert.deepEqual(t.stores.map(s => s.isOpen()), [false, false]);
    t.open();
    t.type('them');
    t.key('ArrowDown');
    t.key('Enter');
    assert.deepEqual(t.log.slice(2), ['theme', 'theme'], 'the only match');
    t.dispose();
  });

  it('runs an action by press', () => {
    const t = setup({ sticky: true });
    t.open();
    t.d.tap(t.d.action('Account'));
    t.s.tap(t.s.action('Account'));
    t.settle();
    assert.deepEqual(t.log, ['account', 'account']);
    assert.deepEqual(t.stores.map(s => s.isOpen()), [true, true], 'sticky keeps it open');
    t.dispose();
  });

  it('opens by its shortcut from a focus inside its children', () => {
    const t = setup({ shortcut: ['primary+K', 'primary + P'] });
    // A focus inside the application: the page's button.
    t.d.action('Search').focus();
    t.s.tap(t.s.action('Search'));
    for (const store of t.stores) store.close();
    t.settle();
    t.key('k', { ctrlKey: true });
    assert.deepEqual(t.stores.map(s => s.isOpen()), [true, true]);
    t.key('Escape');
    t.d.action('Search').focus();
    t.s.tap(t.s.action('Search'));
    for (const store of t.stores) store.close();
    t.settle();
    // `primary` is Ctrl off Apple platforms (the tests run on none).
    t.key('p', { ctrlKey: true });
    assert.deepEqual(t.stores.map(s => s.isOpen()), [true, true]);
    t.dispose();
  });

  it('gives the focus back on close: Escape returns it where the shortcut was pressed', () => {
    const t = setup();
    t.d.action('Search').focus();
    t.s.tap(t.s.action('Search'));
    for (const store of t.stores) store.close();
    t.settle();
    assert.ok(t.s.focused() === t.s.action('Search'), 'Skia: the page button has the focus');
    t.key('k', { ctrlKey: true });
    assert.deepEqual(t.stores.map(s => s.isOpen()), [true, true]);
    assert.equal(t.d.focused()?.getAttribute('data-ren'), 'Edit', 'the search has the focus');
    t.key('Escape');
    t.settle();
    assert.deepEqual(t.stores.map(s => s.isOpen()), [false, false]);
    assert.equal(t.d.focused()?.textContent, 'Search', 'the DOM: back on the button');
    assert.ok(t.s.focused() === t.s.action('Search'), `Skia: back on the button, not ${t.s.focused()?.label ?? 'none'}`);
    t.dispose();
  });

  it('leaves the focus where an action that closed it moved it', () => {
    /** @type {any[]} */
    const notes = [];
    let runs = 0;
    // The keys reach the DOM first, then Skia: each run focuses its own renderer's field.
    const t = setup({ actions: [{ id: 'note', label: 'Write a note', onPress: () => notes[runs++].focus() }] }, true);
    notes.push(t.dom.host.querySelector('input'), t.s.action('Note'));
    t.d.action('Search').focus();
    t.s.tap(t.s.action('Search'));
    for (const store of t.stores) store.close();
    t.settle();
    t.key('k', { ctrlKey: true });
    t.key('ArrowDown');
    t.key('Enter');
    t.settle();
    assert.deepEqual(t.stores.map(s => s.isOpen()), [false, false]);
    assert.equal(t.d.focused()?.getAttribute('aria-label') ?? t.d.focused()?.tagName, 'Note', 'the DOM: on the field the action focused');
    assert.ok(t.s.focused() === notes[1], `Skia: on the field the action focused, not ${t.s.focused()?.label ?? 'none'}`);
    t.dispose();
  });

  it('opens by its shortcut with nothing focused, heard root-wide', () => {
    const t = setup();
    assert.equal(t.d.focused(), t.dom.document.body, 'the DOM: nothing focused');
    assert.equal(t.s.focused(), null, 'Skia: nothing focused');
    t.key('k', { ctrlKey: true });
    assert.deepEqual(t.stores.map(s => s.isOpen()), [true, true]);
    t.key('Escape');
    t.settle();
    assert.deepEqual(t.stores.map(s => s.isOpen()), [false, false], 'Escape still closes it');
    t.dispose();
  });

  it('does not open from a text field unless fields is true', () => {
    for (const [extra, opens] of /** @type {const} */ ([[{}, false], [{ fields: true }, true]])) {
      const t = setup(extra, true);
      t.dom.host.querySelector('input').focus();
      t.s.tap(t.s.action('Note'));
      assert.ok(t.s.focused()?.label === 'Note', 'Skia: the field has the focus');
      t.key('k', { ctrlKey: true });
      assert.deepEqual(t.stores.map(s => s.isOpen()), [opens, opens], JSON.stringify(extra));
      t.dispose();
    }
  });

  it('highlights the search and shows at most `limit` actions', () => {
    const t = setup({ highlight: true, limit: 2 });
    t.open();
    assert.deepEqual(t.texts(), Array(2).fill('Search page Find an action Inbox Open the new mail Calendar See the week ahead'));
    t.type('in');
    assert.deepEqual(t.texts(), ['Search page in Inbox Open the new mail', 'Search page in In box Open the new mail'], 'one Label; the match its own run (Skia paints a piece a run)');
    t.dispose();
  });

  it('dims a disabled action by the theme and draws the field as tall as an xl field', () => {
    const t = setup({ actions: [{ id: 'off', label: 'Off', disabled: true }, { id: 'on', label: 'On' }] });
    t.open();
    assert.equal(t.d.action('Off').style.opacity, String(BASE_THEME.opacity.disabled));
    assert.equal(t.d.action('On').style.opacity, '');
    const field = t.dom.document.body.querySelector('[role="combobox"]');
    assert.equal(field.style.height, `${BASE_THEME.sizes.control.xl}px`);
    t.dispose();
  });
});
