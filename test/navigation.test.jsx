// Navigation on the DOM and on Skia: Link, Breadcrumbs, NavToggle, NavItem,
// Pagination, Tabs, Tree and Outline (Stepper has stepper.test.jsx), with
// the same text, presses, keys and state on both.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active, View, Show } from 'ren-core';
import {
  Rui, Clock, manualClock, Text, BASE_THEME, themeOf, variantColors,
  Link, Breadcrumbs, NavToggle, NavItem, Pagination, Tabs, Tree, $treeState, Outline, Button,
} from 'rui-core';
import { both, onDom } from './harness.jsx';
import { items, KIND } from './scene.js';

/** The DOM's Action with this accessible label or text. @param {any} dom @param {string} name */
const domAction = (dom, name) => {
  const node = [...dom.nodes('Action'), ...dom.host.querySelectorAll('[data-ren="View"][role="tab"]')].find((/** @type {any} */ n) => n.getAttribute('aria-label') === name || n.textContent.trim() === name);
  if (node === undefined) throw new Error(`no "${name}" on the DOM`);
  return node;
};

/** The Skia Action with this accessible label or text. @param {any} skia @param {string} name */
const skiaAction = (skia, name) => {
  skia.text();
  /** @type {any[]} */
  const stack = [skia.skia.root];
  while (stack.length > 0) {
    const item = stack.shift();
    if (isAction(item) && (item.label === name || textIn(item) === name)) return item;
    for (let n = item.first; n !== null; n = n.next) stack.push(n);
  }
  throw new Error(`no "${name}" on Skia`);
};
/** Skia's tabs in tree order, the Tab stop's Action and the other tabs' Views. @param {any} skia */
const skiaTabs = skia => items(skia, KIND.View).concat(items(skia, KIND.Action)).filter(i => i.get('role') === 'tab').sort((a, b) => order(skia, a) - order(skia, b));
/** An item's place in a walk of Skia's tree. @param {any} skia @param {any} item */
const order = (skia, item) => {
  let at = 0;
  let found = -1;
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null && found < 0; c = c.next) {
      if (c === item) found = at;
      at++;
      walk(c);
    }
  };
  walk(skia.skia.root);
  return found;
};
/** A pressable item: one with handlers (Labels have none). @param {any} item */
const isAction = item => item.events != null;
/** The text an item holds: its own, or its Labels'. @param {any} item @returns {string} */
const textIn = item => {
  if (item.first === null) return String(item.text ?? '');
  /** @type {string[]} */
  const out = [];
  for (let n = item.first; n !== null; n = n.next) out.push(textIn(n));
  return out.join('').trim();
};

/** Presses an Action on each side by its label or text. @param {any} dom @param {any} skia @param {string} name */
function pressBoth(dom, skia, name) {
  domAction(dom, name).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  $flush(dom.root);
  const item = skiaAction(skia, name);
  skia.skia.present();
  const r = item.getBoundingClientRect();
  skia.skia.press(r.x + r.width / 2, r.y + r.height / 2);
  skia.skia.release(r.x + r.width / 2, r.y + r.height / 2);
  $flush(skia.root);
}

/** Focuses the Action named `name` on each side. @param {any} dom @param {any} skia @param {string} name */
function focusBoth(dom, skia, name) {
  domAction(dom, name).focus();
  skiaAction(skia, name).focus();
}

/** A key on the focused item of each side. @param {any} dom @param {any} skia @param {string} key */
function keyBoth(dom, skia, key) {
  const focusedNode = dom.document.activeElement;
  focusedNode.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
  $flush(dom.root);
  skia.skia.key(key);
  $flush(skia.root);
}

/** The focused item's text on each side. @param {any} dom @param {any} skia */
const focused = (dom, skia) => [dom.document.activeElement.textContent.trim(), textIn(skia.skia.focused)];

describe('Link and Breadcrumbs', () => {
  it('Link: underlined by default (not told apart by color alone), \'hover\' under the pointer, false never', () => {
    const view = () => (
      <Rui>
        <Link>Plain</Link>
        <Link underlined="hover">Hover</Link>
        <Link underlined={false}>Never</Link>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const deco = (/** @type {string} */ t) => domAction(dom, t).style.textDecoration ?? '';
    assert.match(deco('Plain'), /underline/);
    assert.doesNotMatch(deco('Hover'), /underline/);
    assert.doesNotMatch(deco('Never'), /underline/);
    const under = (/** @type {string} */ t) => skiaAction(skia, t).style.underline === 1;
    assert.deepEqual(['Plain', 'Hover', 'Never'].map(under), [true, false, false], 'the same on Skia');
    dispose();
  });

  it('show links between separators and press them', () => {
    /** @type {any[]} */
    const hits = [];
    const view = () => {
      const s = $signal($active(), 0);
      hits.push(s);
      return (
        <Rui>
          <Breadcrumbs>
            <Link onPress={() => $write(s, $read(s) + 1)}>Home</Link>
            <Link underlined="hover">Docs</Link>
            <Text>Page</Text>
          </Breadcrumbs>
          <Breadcrumbs separator="·" separatorGap={6}>
            <Link>A</Link>
            <Link>B</Link>
          </Breadcrumbs>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Home › Docs › Page A · B');
    assert.equal(skia.text(), 'Home › Docs › Page A · B');
    dom.press('Home');
    skia.press('Home');
    assert.deepEqual(hits.map(h => $read(h)), [1, 1]);
    dispose();
  });
});

describe('NavToggle', () => {
  it('toggles and turns its lines into an X on the clock', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const open = [];
    const view = () => {
      const o = $signal($active(), false);
      open.push(o);
      return (
        <Clock value={clock}>
          <Rui>
            <NavToggle open={o} onPress={() => $write(o, !$read(o))} />
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    const lines = () => {
      skia.text();
      return skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'line');
    };
    assert.equal(lines().length, 3, 'three lines');
    assert.equal(dom.host.querySelectorAll('line').length, 3);
    pressBoth(dom, skia, 'Menu');
    assert.deepEqual(open.map(o => $read(o)), [true, true]);
    clock.advance(150);
    assert.equal(lines().length, 3, 'midway, the middle line fades');
    clock.advance(200);
    const x = lines();
    assert.equal(x.length, 2, 'an X');
    assert.equal(dom.host.querySelectorAll('line').length, 2);
    const [, x0, y0, x1, y1] = x[0];
    assert.ok(Math.abs(Math.abs(x1 - x0) - Math.abs(y1 - y0)) < 0.01, 'at 45 degrees');
    assert.equal(domAction(dom, 'Menu').getAttribute('aria-expanded'), 'true', 'the toggle says it is open');
    assert.equal(domAction(dom, 'Menu').getAttribute('aria-pressed'), null, 'not a pressed toggle as well');
    dispose();
    assert.equal(clock.pending(), 0);
  });
});

describe('NavToggle duration', () => {
  it('takes a MOTION preset by name: calm turns it over 300 ms', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const open = [];
    const view = () => {
      const o = $signal($active(), false);
      open.push(o);
      return (
        <Clock value={clock}>
          <Rui>
            <NavToggle open={o} duration="calm" />
          </Rui>
        </Clock>
      );
    };
    const { skia, dispose } = both(view);
    const lines = () => {
      skia.text();
      return skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'line').length;
    };
    for (const o of open) $write(o, true);
    $flush(skia.root);
    // Its lines follow over the preset's 300 ms, not at once.
    clock.advance(200);
    assert.equal(lines(), 3, 'still turning at 200 ms');
    clock.advance(200);
    assert.equal(lines(), 2, 'an X after 300 ms');
    dispose();
  });
});

describe('NavItem', () => {
  it('opens nested links, shows active and description, presses children', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const picked = [];
    const view = () => {
      const s = $signal($active(), '');
      picked.push(s);
      return (
        <Clock value={clock}>
          <Rui>
            <NavItem label="Dashboard" description="Overview" active />
            <NavItem label="Settings" indent="lg">
              <NavItem label="Security" onPress={() => $write(s, 'security')} />
              <NavItem label="Profile" variant="solid" active={() => $read(s) === 'profile'} onPress={() => $write(s, 'profile')} />
            </NavItem>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Dashboard Overview Settings');
    assert.equal(skia.text(), 'Dashboard Overview Settings');
    const chevron = () => [dom.nodes('Shape')[0].style.rotate, items(skia, KIND.Shape)[0].style.rotate];
    assert.deepEqual(chevron(), ['-90deg', -90], 'closed: the chevron turned to the side by the style');
    pressBoth(dom, skia, 'Settings');
    clock.advance(300);
    assert.deepEqual(chevron(), ['', NaN], 'open: pointing down, not turned');
    assert.equal(dom.text(), 'Dashboard Overview Settings Security Profile');
    assert.equal(skia.text(), 'Dashboard Overview Settings Security Profile');
    const security = skiaAction(skia, 'Security').getBoundingClientRect();
    const settings = skiaAction(skia, 'Settings').getBoundingClientRect();
    assert.equal(Math.round(security.left - settings.left), BASE_THEME.spacing.lg, 'nested rows indented by lg');
    pressBoth(dom, skia, 'Profile');
    assert.deepEqual(picked.map(s => $read(s)), ['profile', 'profile']);
    assert.equal(domAction(dom, 'Profile').getAttribute('aria-current'), 'page');
    pressBoth(dom, skia, 'Settings');
    assert.equal(dom.text(), 'Dashboard Overview Settings');
    assert.equal(skia.text(), 'Dashboard Overview Settings');
    dispose();
  });
});

describe('Pagination', () => {
  it('ranges pages with dots, presses pages and controls, and takes keys', () => {
    /** @type {any[]} */
    const pages = [];
    const view = () => {
      const p = $signal($active(), 1);
      pages.push(p);
      return (
        <Rui>
          <Pagination total={10} value={p} edges />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const text = () => [dom.text(), skia.text()];
    assert.deepEqual(text(), ['1 2 3 4 5 10', '1 2 3 4 5 10']);
    pressBoth(dom, skia, '5');
    assert.deepEqual(pages.map(p => $read(p)), [5, 5]);
    assert.deepEqual(text(), ['1 4 5 6 10', '1 4 5 6 10']);
    pressBoth(dom, skia, 'Next page');
    assert.deepEqual(pages.map(p => $read(p)), [6, 6]);
    focusBoth(dom, skia, '6');
    keyBoth(dom, skia, 'ArrowRight');
    assert.deepEqual(pages.map(p => $read(p)), [7, 7]);
    keyBoth(dom, skia, 'End');
    assert.deepEqual(text(), ['1 6 7 8 9 10', '1 6 7 8 9 10']);
    pressBoth(dom, skia, 'Next page');
    assert.deepEqual(pages.map(p => $read(p)), [10, 10], 'no page past the last');
    pressBoth(dom, skia, 'First page');
    assert.deepEqual(pages.map(p => $read(p)), [1, 1]);
    dispose();
  });

  it('shows a single page unless single is false; controls false drops previous and next', () => {
    const view = () => (
      <Rui>
        <Pagination total={1} />
        <Pagination total={1} single={false} />
        <Pagination total={3} controls={false} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), '1 1 2 3');
    assert.equal(skia.text(), '1 1 2 3');
    assert.equal(dom.nodes('Action').filter((/** @type {any} */ n) => n.getAttribute('aria-label') === 'Next page').length, 1, 'the first one only');
    dispose();
  });

  it('ghost controls; the current page a soft wash with a tone underline', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Pagination total={3} defaultValue={2} color="teal" />
      </Rui>
    ));
    // Previous, 1, 2, 3, Next.
    const [, one, two] = items(skia, KIND.Action).map(n => n.style);
    const soft = variantColors(BASE_THEME, 'light', 'soft', 'teal');
    const tone = variantColors(BASE_THEME, 'light', 'solid', 'teal').background;
    assert.deepEqual([two.borderBottom, two.borderTop, two.borderLeft], [BASE_THEME.sizes.divider.md, 0, 0], 'an underline only');
    assert.deepEqual([one.borderBottom, one.borderTop], [0, 0], 'ghosts: no edge');
    const page = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-current') === 'page');
    assert.equal(page.textContent, '2');
    assert.equal(page.style.borderBottomWidth, `${BASE_THEME.sizes.divider.md}px`);
    assert.equal(page.style.borderBottomColor.toLowerCase(), tone.toLowerCase(), 'in the tone');
    assert.equal(page.style.backgroundColor.toLowerCase(), soft.background.toLowerCase(), 'a soft wash');
    const ghost = dom.nodes('Action').find((/** @type {any} */ n) => n.textContent === '1');
    assert.ok(['', 'transparent'].includes(ghost.style.backgroundColor), 'a ghost: no ground');
    dispose();
  });

  it('shows `ends` pages at each end, as $pages does', () => {
    const view = () => (
      <Rui>
        <Pagination total={20} defaultValue={10} ends={2} controls={false} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), '1 2 9 10 11 19 20');
    assert.equal(skia.text(), '1 2 9 10 11 19 20');
    dispose();
  });
});

describe('Tabs', () => {
  it('pill tabs sit half of spacing.xs apart; line tabs touch', () => {
    const gapOf = (/** @type {string} */ variant, /** @type {any} */ theme) => {
      const { dom, dispose } = both(() => (
        <Rui theme={theme}>
          <Tabs defaultValue="inbox" variant={variant}>
            <Tabs.List>
              <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
              <Tabs.Tab value="drafts">Drafts</Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </Rui>
      ));
      const list = dom.document.querySelector('[role="tablist"]');
      const gap = list.style.columnGap || list.style.gap;
      dispose();
      return gap;
    };
    assert.equal(gapOf('pill', BASE_THEME), `${BASE_THEME.spacing.xs / 2}px`);
    assert.equal(gapOf('pill', themeOf({ spacing: { xs: 20 } })), '10px', 'from the theme');
    assert.ok(['', '0px'].includes(gapOf('line', BASE_THEME)), 'line tabs: no gap');
  });

  for (const variant of ['line', 'outline', 'pill'])
    it(`switches panels by press and by arrow keys (${variant})`, () => {
      /** @type {any[]} */
      const values = [];
      const view = () => {
        const v = $signal($active(), 'inbox');
        values.push(v);
        return (
          <Rui>
            <Tabs value={v} variant={variant}>
              <Tabs.List>
                <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
                <Tabs.Tab value="drafts">Drafts</Tabs.Tab>
                <Tabs.Tab value="spam" disabled>Spam</Tabs.Tab>
                <Tabs.Tab value="archive">Archive</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="inbox">Inbox content</Tabs.Panel>
              <Tabs.Panel value="drafts">Drafts content</Tabs.Panel>
              <Tabs.Panel value="archive">Archive content</Tabs.Panel>
            </Tabs>
          </Rui>
        );
      };
      const { dom, skia, dispose } = both(view);
      const tabs = 'Inbox Drafts Spam Archive';
      const text = () => [dom.text(), skia.text()];
      assert.deepEqual(text(), [`${tabs} Inbox content`, `${tabs} Inbox content`]);
      pressBoth(dom, skia, 'Drafts');
      assert.deepEqual(values.map(v => $read(v)), ['drafts', 'drafts']);
      assert.deepEqual(text(), [`${tabs} Drafts content`, `${tabs} Drafts content`]);
      pressBoth(dom, skia, 'Spam');
      assert.deepEqual(values.map(v => $read(v)), ['drafts', 'drafts'], 'a disabled tab');
      focusBoth(dom, skia, 'Drafts');
      keyBoth(dom, skia, 'ArrowRight');
      assert.deepEqual(values.map(v => $read(v)), ['archive', 'archive'], 'the disabled tab skipped');
      assert.deepEqual(focused(dom, skia), ['Archive', 'Archive']);
      keyBoth(dom, skia, 'ArrowRight');
      assert.deepEqual(values.map(v => $read(v)), ['inbox', 'inbox'], 'looping');
      keyBoth(dom, skia, 'End');
      assert.deepEqual(text(), [`${tabs} Archive content`, `${tabs} Archive content`]);
      dispose();
    });

  it('is one Tab stop, the active tab; the arrows, Home and End move it (wrapping, past a disabled tab); Tab leaves at once', async () => {
    const { focusables } = await import('ren-core/host');
    /** @type {any[]} */
    const values = [];
    const view = () => {
      const v = $signal($active(), 'drafts');
      values.push(v);
      return (
        <Rui>
          <Tabs value={v}>
            <Tabs.List>
              <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
              <Tabs.Tab value="drafts">Drafts</Tabs.Tab>
              <Tabs.Tab value="spam" disabled>Spam</Tabs.Tab>
              <Tabs.Tab value="archive">Archive</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Button>After</Button>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const stops = () => focusables(dom.host).map((/** @type {any} */ n) => n.textContent.trim());
    assert.deepEqual(stops(), ['Drafts', 'After'], 'the DOM: the active tab, then what follows the list');
    focusBoth(dom, skia, 'Drafts');
    /** @param {string} key */
    const step = key => {
      keyBoth(dom, skia, key);
      return [...focused(dom, skia), ...values.map(v => $read(v))];
    };
    assert.deepEqual(step('ArrowRight'), ['Archive', 'Archive', 'archive', 'archive'], 'past the disabled tab, chosen and focused');
    assert.deepEqual(stops(), ['Archive', 'After'], 'still one stop: the active tab');
    assert.deepEqual(step('ArrowRight'), ['Inbox', 'Inbox', 'inbox', 'inbox'], 'wrapping');
    assert.deepEqual(step('ArrowLeft'), ['Archive', 'Archive', 'archive', 'archive'], 'back, wrapping');
    assert.deepEqual(step('Home'), ['Inbox', 'Inbox', 'inbox', 'inbox']);
    assert.deepEqual(step('End'), ['Archive', 'Archive', 'archive', 'archive']);
    // A value from outside while the active tab has the focus: the stop, and the focus, follow.
    for (const v of values) $write(v, 'drafts');
    $flush(dom.root);
    $flush(skia.root);
    assert.deepEqual(focused(dom, skia), ['Drafts', 'Drafts']);
    assert.deepEqual(stops(), ['Drafts', 'After']);
    skia.skia.key('Tab');
    $flush(skia.root);
    assert.equal(textIn(skia.skia.focused), 'After', 'Skia: Tab leaves the list at once');
    dispose();
  });

  it('every tab an Action, the stop in the Tab order (tabIndex 0), the others -1; Tab and Shift+Tab reach the stop', () => {
    /** @type {any[]} */
    const values = [];
    const view = () => {
      const v = $signal($active(), 'drafts');
      values.push(v);
      return (
        <Rui>
          <Button>Before</Button>
          <Tabs value={v}>
            <Tabs.List>
              <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
              <Tabs.Tab value="drafts">Drafts</Tabs.Tab>
              <Tabs.Tab value="archive">Archive</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Button>After</Button>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const domTabs = () => [...dom.host.querySelectorAll('[role="tab"]')].map((/** @type {any} */ n) => [n.getAttribute('data-ren'), n.getAttribute('tabindex'), n.getAttribute('aria-selected')]);
    assert.deepEqual(domTabs(), [['Action', '-1', 'false'], ['Action', '0', 'true'], ['Action', '-1', 'false']]);
    skia.text();
    assert.deepEqual(skiaTabs(skia).map(t => [t.kind, t.tabIndex, t.get('aria-selected')]), [[KIND.Action, -1, 'false'], [KIND.Action, 0, 'true'], [KIND.Action, -1, 'false']]);
    skia.press('Before');
    skia.skia.key('Tab');
    $flush(skia.root);
    assert.equal(textIn(skia.skia.focused), 'Drafts', 'Tab: the active tab');
    assert.equal(skia.skia.ring, true, 'Skia: the keyboard focus rings it');
    skia.skia.key('Tab');
    $flush(skia.root);
    assert.equal(textIn(skia.skia.focused), 'After');
    skia.skia.key('Tab', true);
    $flush(skia.root);
    assert.equal(textIn(skia.skia.focused), 'Drafts', 'Shift+Tab: back to the active tab');
    focusBoth(dom, skia, 'Drafts');
    keyBoth(dom, skia, 'ArrowLeft');
    assert.deepEqual(values.map(v => $read(v)), ['inbox', 'inbox']);
    assert.deepEqual(domTabs().map(t => t[1]), ['0', '-1', '-1']);
    assert.deepEqual(skiaTabs(skia).map(t => t.tabIndex), [0, -1, -1]);
    assert.deepEqual(focused(dom, skia), ['Inbox', 'Inbox']);
    dispose();
  });

  it('the Tab stop moves to the first enabled tab when the active tab goes', async () => {
    const { focusables } = await import('ren-core/host');
    /** @type {any[]} */
    const shown = [];
    const view = () => {
      const on = $signal($active(), true);
      shown.push(on);
      return (
        <Rui>
          <Tabs defaultValue="c">
            <Tabs.List>
              <Tabs.Tab value="a" disabled>A</Tabs.Tab>
              <Tabs.Tab value="b">B</Tabs.Tab>
              <Show when={() => $read(on)}>
                <Tabs.Tab value="c">C</Tabs.Tab>
              </Show>
            </Tabs.List>
          </Tabs>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const stops = () => focusables(dom.host).map((/** @type {any} */ n) => n.textContent.trim());
    assert.deepEqual(stops(), ['C']);
    for (const on of shown) $write(on, false);
    $flush(dom.root);
    $flush(skia.root);
    assert.deepEqual(stops(), ['B'], 'none active: the first enabled tab');
    assert.deepEqual(skiaTabs(skia).map(t => [t.kind, t.tabIndex]), [[KIND.Action, -1], [KIND.Action, 0]], 'Skia: every tab an Action, the stop in the Tab order');
    assert.deepEqual([...dom.host.querySelectorAll('[role="tab"]')].map((/** @type {any} */ n) => [n.getAttribute('data-ren'), n.getAttribute('tabindex')]), [['Action', '-1'], ['Action', '0']], 'the DOM too');
    dispose();
  });

  it('with followFocus false the arrows move the focus and the Tab stop, choosing nothing; a press on a tab chooses it and focuses it', async () => {
    const { focusables } = await import('ren-core/host');
    /** @type {any[]} */
    const values = [];
    const view = () => {
      const v = $signal($active(), 'inbox');
      values.push(v);
      return (
        <Rui>
          <Tabs value={v} followFocus={false}>
            <Tabs.List>
              <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
              <Tabs.Tab value="drafts">Drafts</Tabs.Tab>
              <Tabs.Tab value="archive">Archive</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="inbox">Inbox content</Tabs.Panel>
            <Tabs.Panel value="drafts">Drafts content</Tabs.Panel>
          </Tabs>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    const stops = () => focusables(dom.host).map((/** @type {any} */ n) => n.textContent.trim());
    focusBoth(dom, skia, 'Inbox');
    keyBoth(dom, skia, 'ArrowRight');
    assert.deepEqual([...focused(dom, skia), ...values.map(v => $read(v))], ['Drafts', 'Drafts', 'inbox', 'inbox'], 'focused, not chosen');
    assert.deepEqual(stops(), ['Drafts'], 'the focused tab is the stop');
    assert.deepEqual(
      skiaTabs(skia).map(t => [t.kind, t.tabIndex, t.get('aria-selected')]),
      [
        [KIND.Action, -1, 'true'],
        [KIND.Action, 0, 'false'],
        [KIND.Action, -1, 'false'],
      ],
      'Skia: the active tab still selected, out of the Tab order; the focused one the stop',
    );
    pressBoth(dom, skia, 'Archive');
    assert.deepEqual(values.map(v => $read(v)), ['archive', 'archive'], 'a press chooses');
    assert.deepEqual(focused(dom, skia), ['Archive', 'Archive'], 'and the pressed tab has the focus');
    assert.deepEqual(stops(), ['Archive']);
    dispose();
  });

  it('rounds tabs away from the list; the active outline tab is raised with a top tone edge and no side borders', () => {
    const view = () => (
      <Rui>
        <Tabs defaultValue="a" variant="outline">
          <Tabs.List>
            <Tabs.Tab value="a">Alpha</Tabs.Tab>
            <Tabs.Tab value="b">Beta</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <Tabs defaultValue="a" orientation="vertical">
          <Tabs.List>
            <Tabs.Tab value="a">Gamma</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const tabs = skiaTabs(skia);
    const corners = (/** @type {any} */ n) => [n.style.radiusTopLeft, n.style.radiusTopRight, n.style.radiusBottomRight, n.style.radiusBottomLeft];
    // The theme's corner, md: 10 px.
    assert.deepEqual(tabs.map(corners), [[10, 10, 0, 0], [10, 10, 0, 0], [10, 0, 0, 10]]);
    assert.deepEqual([tabs[0].style.borderTop, tabs[0].style.borderBottom, tabs[0].style.borderLeft, tabs[0].style.borderRight], [BASE_THEME.sizes.divider.md, 0, 0, 0], 'a top edge only');
    assert.equal(tabs[1].style.borderTop, 0, 'an inactive tab: no edge');
    assert.equal(tabs[0].style.fontWeight, BASE_THEME.weights.strong);
    const alpha = dom.nodes('Action')[0];
    assert.equal(alpha.style.borderBottomWidth, '0px');
    assert.equal(alpha.style.borderTopWidth, `${BASE_THEME.sizes.divider.md}px`);
    assert.equal(alpha.style.borderTopColor.toLowerCase(), BASE_THEME.colors.indigo[BASE_THEME.accentShade.light].toLowerCase(), 'the tone');
    assert.ok(/px/.test(alpha.style.boxShadow), 'raised: a shadow');
    assert.equal(alpha.style.borderBottomLeftRadius, '0px');
    assert.equal(alpha.style.borderTopLeftRadius, '10px');
    dispose();
  });

  it('takes its spacing, weights and opacity from the theme\'s tokens', () => {
    const view = () => (
      <Rui>
        <Tabs defaultValue="a">
          <Tabs.List>
            <Tabs.Tab value="a">Alpha</Tabs.Tab>
            <Tabs.Tab value="b" disabled>
              Beta
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <Pagination total={3} value={1} />
      </Rui>
    );
    const { skia, dispose } = both(view);
    const T = BASE_THEME;
    const [alpha, beta] = skiaTabs(skia);
    assert.deepEqual([alpha.style.paddingTop, alpha.style.paddingLeft], [T.control.optionPad[0], T.control.pad.sm], 'a tab: an option\'s height, a small button\'s sides');
    assert.equal(alpha.style.fontSize, T.fontSizes.md, 'a tab: body-size text');
    assert.equal(beta.style.opacity, T.opacity.disabled, 'a disabled tab');
    const previous = skiaAction(skia, 'Previous page');
    assert.equal(previous.style.opacity, T.opacity.disabled, 'no page before the first');
    dispose();
  });

  it('fill shares the list\'s width among the tabs', () => {
    const view = () => (
      <Rui>
        <View style={{ width: 300 }}>
          <Tabs defaultValue="a">
            <Tabs.List fill>
              <Tabs.Tab value="a">Alpha</Tabs.Tab>
              <Tabs.Tab value="b">Beta</Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </View>
      </Rui>
    );
    const { skia, dispose } = both(view);
    assert.deepEqual([skiaAction(skia, 'Alpha'), skiaAction(skia, 'Beta')].map(t => Math.round(t.getBoundingClientRect().width)), [150, 150]);
    dispose();
  });

  it('justify places the tabs with the portable words: end, between', () => {
    const view = (/** @type {string} */ justify) => () => (
      <Rui>
        <View style={{ width: 300 }}>
          <Tabs defaultValue="a">
            <Tabs.List justify={justify}>
              <Tabs.Tab value="a">Alpha</Tabs.Tab>
              <Tabs.Tab value="b">Beta</Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </View>
      </Rui>
    );
    const end = both(view('end'));
    assert.equal(Math.round(skiaAction(end.skia, 'Beta').getBoundingClientRect().right), 300, 'end: against the right edge');
    end.dispose();
    const between = both(view('between'));
    const [a, b] = [skiaAction(between.skia, 'Alpha'), skiaAction(between.skia, 'Beta')].map(t => t.getBoundingClientRect());
    assert.deepEqual([Math.round(a.left), Math.round(b.right)], [0, 300], 'between: at both edges');
    between.dispose();
  });

  it('moves with the up and down keys when vertical, keeping hidden panels', () => {
    const view = () => (
      <Rui>
        <Tabs defaultValue="a" orientation="vertical" persistent>
          <Tabs.List>
            <Tabs.Tab value="a">Alpha</Tabs.Tab>
            <Tabs.Tab value="b">Beta</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">First panel</Tabs.Panel>
          <Tabs.Panel value="b">Second panel</Tabs.Panel>
        </Tabs>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Alpha Beta First panel');
    assert.equal(skia.text(), 'Alpha Beta First panel');
    focusBoth(dom, skia, 'Alpha');
    keyBoth(dom, skia, 'ArrowRight');
    assert.equal(dom.text(), 'Alpha Beta First panel', 'right does nothing when vertical');
    keyBoth(dom, skia, 'ArrowDown');
    assert.equal(dom.text(), 'Alpha Beta Second panel');
    assert.equal(skia.text(), 'Alpha Beta Second panel');
    dispose();
  });
});

describe('Tree', () => {
  it('expands, collapses and selects by press and by keys', () => {
    const data = [
      { value: 'soups', label: 'Soups', children: [{ value: 'miso-soup', label: 'Miso' }, { value: 'stews', label: 'Stews', children: [{ value: 'lentil-stew', label: 'Lentil' }] }] },
      { value: 'bread', label: 'Bread' },
    ];
    /** @type {any[]} */
    const trees = [];
    const clock = manualClock();
    const view = () => {
      const tree = $treeState();
      trees.push(tree);
      return (
        <Clock value={clock}>
          <Rui>
            <Tree data={data} store={tree} press="both" />
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    const text = () => [dom.text(), skia.text()];
    assert.deepEqual(text(), ['Soups Bread', 'Soups Bread']);
    pressBoth(dom, skia, 'Soups');
    assert.deepEqual(text(), ['Soups Miso Stews Bread', 'Soups Miso Stews Bread']);
    assert.deepEqual(trees.map(t => t.selected()), [['soups'], ['soups']]);
    focusBoth(dom, skia, 'Soups');
    keyBoth(dom, skia, 'ArrowDown');
    assert.deepEqual(focused(dom, skia), ['Miso', 'Miso']);
    keyBoth(dom, skia, 'ArrowDown');
    keyBoth(dom, skia, 'ArrowRight');
    assert.deepEqual(text(), ['Soups Miso Stews Lentil Bread', 'Soups Miso Stews Lentil Bread']);
    keyBoth(dom, skia, 'ArrowRight');
    assert.deepEqual(focused(dom, skia), ['Lentil', 'Lentil'], 'right on an open item goes to its first child');
    keyBoth(dom, skia, 'ArrowLeft');
    assert.deepEqual(focused(dom, skia), ['Stews', 'Stews'], 'left on a leaf goes to its parent');
    keyBoth(dom, skia, 'ArrowLeft');
    assert.deepEqual(text(), ['Soups Miso Stews Bread', 'Soups Miso Stews Bread']);
    keyBoth(dom, skia, 'End');
    assert.deepEqual(focused(dom, skia), ['Bread', 'Bread']);
    for (const t of trees) t.expandAll();
    $flush(dom.root);
    assert.deepEqual(text(), ['Soups Miso Stews Lentil Bread', 'Soups Miso Stews Lentil Bread']);
    for (const t of trees) t.collapseAll();
    $flush(dom.root);
    assert.deepEqual(text(), ['Soups Bread', 'Soups Bread']);
    dispose();
  });
});

describe('Tree: press, defaultExpanded, deselectAll', () => {
  it('$treeState: expandAll and collapseAll tell onExpandedChange of each item they change', () => {
    const data = [
      { value: 'a', label: 'A', children: [{ value: 'a1', label: 'A1' }] },
      { value: 'b', label: 'B', children: [{ value: 'b1', label: 'B1' }] },
    ];
    /** @type {any[]} */
    const heard = [];
    /** @type {any[]} */
    const trees = [];
    const view = () => {
      const tree = $treeState({ onExpandedChange: (/** @type {string} */ v, /** @type {boolean} */ open) => heard.push([v, open]) });
      trees.push(tree);
      return (
        <Rui>
          <Tree data={data} store={tree} />
        </Rui>
      );
    };
    const dom = onDom(view);
    const tree = trees[0];
    tree.expand('a');
    tree.expandAll();
    tree.collapseAll();
    $flush(dom.root);
    assert.deepEqual(heard, [['a', true], ['b', true], ['a', false], ['b', false]]);
    dom.dispose();
  });

  it('press "select" selects without opening; the handle starts open and deselects all', () => {
    const data = [
      { value: 'soups', label: 'Soups', children: [{ value: 'miso-soup', label: 'Miso' }] },
      { value: 'salads', label: 'Salads', children: [{ value: 'slaw', label: 'Slaw' }] },
    ];
    /** @type {any[]} */
    const trees = [];
    const view = () => {
      const tree = $treeState({ defaultExpanded: ['soups'] });
      trees.push(tree);
      return (
        <Rui>
          <Tree data={data} store={tree} press="select" />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.deepEqual([dom.text(), skia.text()], ['Soups Miso Salads', 'Soups Miso Salads'], 'soups open from the start');
    assert.deepEqual(trees.map(t => t.expanded()), [['soups'], ['soups']]);
    for (const t of trees) t.expand('salads');
    for (const t of trees) t.expand('salads');
    assert.deepEqual(trees.map(t => t.expanded()), [['soups', 'salads'], ['soups', 'salads']], 'a set of values: once each, in the order opened');
    for (const t of trees) t.collapse('salads');
    pressBoth(dom, skia, 'Salads');
    assert.deepEqual([dom.text(), skia.text()], ['Soups Miso Salads', 'Soups Miso Salads'], 'select only: it stays closed');
    assert.deepEqual(trees.map(t => t.selected()), [['salads'], ['salads']]);
    for (const t of trees) t.deselectAll();
    assert.deepEqual(trees.map(t => t.selected()), [[], []]);
    dispose();
  });
});

describe('Tree: renderItem and onExpandedChange', () => {
  it('renders each row by renderItem and tells each expand and collapse', () => {
    const data = [{ value: 'drinks', label: 'Drinks', children: [{ value: 'chai', label: 'Chai' }] }];
    /** @type {any[]} */
    const heard = [];
    const view = () => (
      <Rui>
        <Tree
          data={data}
          onExpandedChange={(/** @type {string} */ value, /** @type {boolean} */ expanded) => heard.push([value, expanded])}
          renderItem={(/** @type {any} */ p) => <Text>{() => `${p.item.label} ${p.depth}${p.branch ? ' +' : ''}${p.open() ? ' open' : ''}${p.chosen() ? ' chosen' : ''}${p.handle === undefined ? ' no handle' : ''}`}</Text>}
        />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Drinks 1 +');
    assert.equal(skia.text(), 'Drinks 1 +');
    pressBoth(dom, skia, 'Drinks 1 +');
    assert.equal(dom.text(), 'Drinks 1 + open Chai 2', 'the payload: open (and chosen) as accessors, the handle');
    assert.equal(skia.text(), 'Drinks 1 + open Chai 2');
    pressBoth(dom, skia, 'Drinks 1 + open');
    assert.deepEqual(heard, [['drinks', true], ['drinks', true], ['drinks', false], ['drinks', false]]);
    dispose();
  });
});

describe('Outline', () => {
  it('marks the active heading and presses others', () => {
    /** @type {any[]} */
    const actives = [];
    /** @type {number[]} */
    const changes = [];
    const data = [
      { label: 'Intro', level: 1, id: 'intro' },
      { label: 'Setup', level: 2, id: 'setup' },
      { label: 'Tuning', level: 2, id: 'tuning' },
    ];
    const view = () => {
      const a = $signal($active(), 0);
      actives.push(a);
      return (
        <Rui>
          <Outline data={data} value={a} onChange={(/** @type {number} */ i) => changes.push(i)} variant="soft" />
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Intro Setup Tuning');
    assert.equal(skia.text(), 'Intro Setup Tuning');
    pressBoth(dom, skia, 'Tuning');
    assert.deepEqual(actives.map(a => $read(a)), [2, 2]);
    assert.deepEqual(changes, [2, 2], 'onChange hears each press');
    assert.equal(domAction(dom, 'Tuning').getAttribute('aria-current'), 'location');
    assert.equal(domAction(dom, 'Intro').getAttribute('aria-current'), null);
    assert.equal(domAction(dom, 'Setup').getAttribute('href'), '#setup', 'a heading with an id links to it');
    // Level 2 sits one md step (16) further in.
    const pad = (/** @type {string} */ name) => parseFloat(domAction(dom, name).style.paddingLeft);
    assert.equal(pad('Setup') - pad('Intro'), 16);
    const left = (/** @type {string} */ name) => skiaAction(skia, name);
    assert.ok(left('Setup') !== undefined);
    dispose();
  });
});

describe('Tabs listAt, Link href', () => {
  it('Tabs listAt="end": the list at the end of the panels, its line and rounding on its start', () => {
    const view = () => (
      <Rui>
        <Tabs defaultValue="a" orientation="vertical" listAt="end" w={300}>
          <Tabs.List>
            <Tabs.Tab value="a">Alpha</Tabs.Tab>
            <Tabs.Tab value="b">Beta</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">First panel</Tabs.Panel>
          <Tabs.Panel value="b">Second panel</Tabs.Panel>
        </Tabs>
        <Tabs defaultValue="a" orientation="vertical" listAt="end" variant="outline">
          <Tabs.List>
            <Tabs.Tab value="a">Gamma</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'Alpha Beta First panel Gamma');
    assert.equal(skia.text(), 'Alpha Beta First panel Gamma');
    const box = (/** @type {string} */ name) => skiaAction(skia, name).getBoundingClientRect();
    const panel = items(skia, KIND.Label).find(i => i.text === 'First panel').getBoundingClientRect();
    assert.ok(box('Alpha').left >= panel.right, 'the list after the panel');
    assert.equal(Math.round(box('Alpha').right), 300, 'at the right edge');
    const tabs = skiaTabs(skia);
    const corners = (/** @type {any} */ n) => [n.style.radiusTopLeft, n.style.radiusTopRight, n.style.radiusBottomRight, n.style.radiusBottomLeft];
    assert.deepEqual(tabs.map(corners), [[0, 10, 10, 0], [0, 10, 10, 0], [0, 10, 10, 0]]);
    assert.deepEqual([tabs[2].style.borderLeft, tabs[2].style.borderRight], [0, BASE_THEME.sizes.divider.md], 'outline: the tone edge on the side away from the panels');
    // The active tab's mark on its left edge.
    const mark = tabs[0].last.getBoundingClientRect();
    assert.deepEqual([Math.round(mark.left), Math.round(mark.width)], [Math.round(box('Alpha').left), BASE_THEME.sizes.divider.lg]);
    assert.equal(dom.nodes('View')[0].style.display, 'grid');
    pressBoth(dom, skia, 'Beta');
    assert.equal(skia.text(), 'Alpha Beta Second panel Gamma');
    assert.equal(dom.text(), 'Alpha Beta Second panel Gamma');
    dispose();
  });

  it('Link href opens the platform’s navigation where it exists, after onPress, inert elsewhere', () => {
    const g = /** @type {any} */ (globalThis);
    /** @type {string[]} */
    const went = [];
    const view = () => (
      <Rui>
        <Link href="https://example.com">Site</Link>
        <Link href="/docs" target="_blank">Docs</Link>
        <Link href="/kept" onPress={(/** @type {any} */ e) => e.preventDefault()}>Kept</Link>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    // No platform navigation (node): nothing happens.
    pressBoth(dom, skia, 'Site');
    g.location = { assign: (/** @type {string} */ href) => went.push(`go ${href}`) };
    g.open = (/** @type {string} */ href, /** @type {string} */ target) => went.push(`open ${href} ${target}`);
    try {
      pressBoth(dom, skia, 'Site');
      pressBoth(dom, skia, 'Docs');
      // A browser's click is cancelable (the harness's pressBoth dispatches one that is not).
      domAction(dom, 'Kept').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      $flush(dom.root);
      const kept = skiaAction(skia, 'Kept').getBoundingClientRect();
      skia.skia.press(kept.x + 4, kept.y + 4);
      skia.skia.release(kept.x + 4, kept.y + 4);
      $flush(skia.root);
      assert.deepEqual(went, ['go https://example.com', 'go https://example.com', 'open /docs _blank', 'open /docs _blank']);
    } finally {
      delete g.location;
      delete g.open;
    }
    dispose();
  });

});

describe('a Link follows only a safe address', () => {
  it('javascript:, data: and vbscript:, however cased, spaced or prefixed, are neither followed nor shown', t => {
    const g = /** @type {any} */ (globalThis);
    const bad = ['javascript:alert(document.cookie)', ' JaVa\tScRiPt:alert(1)', '\u0001javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,hi', 'vbscript:x'];
    const good = ['https://rui.example/a', 'http://rui.example', 'mailto:ada@rui.example', 'tel:+1555', '/docs', 'page.html', '#top', '?q=1', '&#106;avascript:alert(1)'];
    const view = () => (
      <Rui>
        <View style={{ direction: 'row', wrap: true, gap: 4 }}>
          {[...bad, ...good].map((href, i) => (
            <Link href={href}>{`L${i}`}</Link>
          ))}
          {bad.map((href, i) => (
            <Link href={href} target="_blank">{`B${i}`}</Link>
          ))}
        </View>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    /** @type {string[]} */
    const went = [];
    g.location = { assign: (/** @type {string} */ href) => went.push(href) };
    g.open = (/** @type {string} */ href) => went.push(href);
    t.after(() => {
      delete g.location;
      delete g.open;
    });
    try {
      for (let i = 0; i < bad.length; i++) {
        pressBoth(dom, skia, `L${i}`);
        pressBoth(dom, skia, `B${i}`);
        assert.equal(domAction(dom, `L${i}`).getAttribute('href'), null, `${JSON.stringify(bad[i])}: no href shown`);
      }
      assert.deepEqual(went, [], 'no unsafe address followed');
      for (let i = 0; i < good.length; i++) pressBoth(dom, skia, `L${bad.length + i}`);
      // The entity-looking one is a literal relative path (no HTML decodes a prop): harmless, followed as given.
      assert.deepEqual(went, good.flatMap(h => [h, h]), 'each safe address followed, once per renderer');
    } finally {
      dispose();
    }
  });
});

describe('rui\'s own navigation looks', () => {
  it('NavToggle: a control-high square, lines as thick as a Divider of the step', () => {
    const view = () => (
      <Rui>
        <NavToggle />
        <NavToggle size="xl" label="Big" />
        <NavToggle size={30} label="Px" />
      </Rui>
    );
    const { skia, dispose } = both(view);
    const T = BASE_THEME;
    const boxes = items(skia, KIND.Action).map((/** @type {any} */ a) => a.style.width);
    assert.deepEqual(boxes, [T.sizes.control.md, T.sizes.control.xl, Math.round(30 / T.ratios.icon)]);
    const widths = skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'line').map((/** @type {any[]} */ c) => c[6]);
    // 30 px reaches the lg toggle (30), so it takes lg's Divider.
    assert.deepEqual(widths, [T.sizes.divider.md, T.sizes.divider.xl, T.sizes.divider.lg].flatMap(w => [w, w, w]));
    dispose();
  });

  it('NavItem: an option row at the body size, ghost by default, a tone edge on the active row', () => {
    const view = () => (
      <Rui>
        <NavItem label="Inbox" description="12 new" active />
        <NavItem label="Sent" />
        <NavItem label="Drafts" description="2 saved" variant="solid" active />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const T = BASE_THEME;
    const [inbox, sent] = items(skia, KIND.Action);
    assert.deepEqual([inbox.style.paddingTop, inbox.style.paddingLeft], [T.control.optionPad[0], T.control.optionPad[1]]);
    assert.deepEqual([inbox.style.borderLeft, sent.style.borderLeft], [T.sizes.divider.md, T.sizes.divider.md], 'the edge is always there, so rows line up');
    const label = items(skia, KIND.Label).find((/** @type {any} */ l) => l.text === 'Inbox');
    const note = items(skia, KIND.Label).find((/** @type {any} */ l) => l.text === '12 new');
    assert.deepEqual([inbox.style.fontSize, note.style.fontSize], [T.fontSizes.md, T.fontSizes.sm], 'the label at md, its description a step below');
    assert.equal(label.text, 'Inbox');
    const row = domAction(dom, 'Inbox12 new');
    assert.equal(row.style.backgroundColor || 'transparent', 'transparent', 'ghost: no ground when active');
    assert.notEqual(row.style.borderLeftColor, 'transparent', 'the active row\'s tone edge');
    assert.equal(domAction(dom, 'Sent').style.borderLeftColor, 'transparent');
    const muted = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === '2 saved');
    assert.match(muted.style.color, /rgba\(255, 255, 255, 0\.7\)|#ffffffb3/, 'on the solid fill: its text at opacity.muted');
    dispose();
  });
});
