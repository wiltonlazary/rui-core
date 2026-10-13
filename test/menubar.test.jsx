// Menubar on the DOM and on Skia: one menu open at a time, presses and the
// pointer, the keys on its triggers and inside its menus, controlled state,
// menus that come and go, placement, look and meaning.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write } from 'rrx-core';
import { $active, View, Show } from 'ren-core';
import { Rui, Clock, manualClock, Menu, Menubar, themeOf } from 'rui-core';
import { pair, states, css, placeOf } from './overlay-harness.jsx';

/** The first item of each menu, by its trigger's name. */
const FIRST = /** @type {const} */ ({ Board: 'New board', Cards: 'Add card', Share: 'Invite', Settings: 'Profile', Help: 'Guide' });

/**
 * A bar of Board, Cards (with a Sort branch), Share, Settings and Help.
 * @param {Record<string, any> | (() => Record<string, any>)} [bar] the Menubar's props (a function: made per renderer)
 * @param {{ menu?: Record<string, Record<string, any>>, theme?: any, around?: (menu: any) => any }} [o]
 */
function setup(bar = {}, o = {}) {
  const clock = manualClock();
  const own = (/** @type {string} */ name) => o.menu?.[name] ?? {};
  const around = o.around ?? ((/** @type {any} */ m) => m);
  const content = () => (
    <Menubar {...(typeof bar === 'function' ? bar() : bar)}>
      <Menubar.Menu {...own('Board')}>
        <Menubar.Trigger>Board</Menubar.Trigger>
        <Menubar.Panel>
          <Menu.Item>New board</Menu.Item>
          <Menu.Item>Rename board</Menu.Item>
        </Menubar.Panel>
      </Menubar.Menu>
      {around(
        <Menubar.Menu {...own('Cards')}>
          <Menubar.Trigger>Cards</Menubar.Trigger>
          <Menubar.Panel>
            <Menu.Item>Add card</Menu.Item>
            <Menu.Branch label="Sort">
              <Menu.Item>By date</Menu.Item>
              <Menu.Item>By name</Menu.Item>
            </Menu.Branch>
            <Menu.Item>Archive</Menu.Item>
          </Menubar.Panel>
        </Menubar.Menu>,
      )}
      <Menubar.Menu {...own('Share')}>
        <Menubar.Trigger>Share</Menubar.Trigger>
        <Menubar.Panel>
          <Menu.Item>Invite</Menu.Item>
          <Menu.Item>Copy link</Menu.Item>
        </Menubar.Panel>
      </Menubar.Menu>
      <Menubar.Menu {...own('Settings')}>
        <Menubar.Trigger>Settings</Menubar.Trigger>
        <Menubar.Panel>
          <Menu.Item>Profile</Menu.Item>
        </Menubar.Panel>
      </Menubar.Menu>
      <Menubar.Menu {...own('Help')}>
        <Menubar.Trigger>Help</Menubar.Trigger>
        <Menubar.Panel>
          <Menu.Item>Guide</Menu.Item>
          <Menu.Item>Shortcuts</Menu.Item>
        </Menubar.Panel>
      </Menubar.Menu>
    </Menubar>
  );
  const view = () => (
    <Clock value={clock}>
      <Rui theme={o.theme}>
        <View style={{ padding: 20 }}>{content()}</View>
      </Rui>
    </Clock>
  );
  const p = pair(view);
  const settle = () => {
    clock.advance(200);
    p.flush();
  };
  settle();
  /** A key on both renderers. @param {string} k */
  const key = k => {
    p.d.key(k);
    p.s.key(k);
    clock.advance(50);
    p.flush();
  };
  /** A press on the text on both renderers. @param {string} t */
  const press = t => {
    p.d.press(t);
    p.s.press(t);
    settle();
  };
  /** The pointer onto a trigger on both renderers. @param {string} t */
  const hover = t => {
    p.d.enter(p.d.find(t));
    const b = p.s.box(p.s.find(t));
    p.s.move(b.x + b.width / 2, b.y + b.height / 2);
    settle();
  };
  /** The menus shown, by trigger, on each renderer. */
  const shown = () => {
    const d = p.d.text();
    const s = p.s.text();
    const of = (/** @type {string} */ text) => Object.entries(FIRST).filter(([, first]) => text.includes(first)).map(([name]) => name).join(',');
    return [of(d), of(s)];
  };
  /** The focused node's text on each renderer. */
  const at = () => {
    const f = p.s.focused();
    return [p.d.focused()?.textContent, f?.text || f?.first?.first?.text];
  };
  /** Focuses a trigger on both renderers. @param {string} t */
  const start = t => {
    p.d.find(t).focus();
    p.s.find(t).focus();
    p.flush();
  };
  return { ...p, clock, key, press, hover, shown, at, start, settle };
}

describe('Menubar', () => {
  it('a press opens a menu and closes it; one menu is open at a time', () => {
    const m = setup();
    assert.deepEqual(m.shown(), ['', '']);
    m.press('Board');
    assert.deepEqual(m.shown(), ['Board', 'Board']);
    m.press('Share');
    assert.deepEqual(m.shown(), ['Share', 'Share'], 'the other closed');
    m.press('Share');
    assert.deepEqual(m.shown(), ['', '']);
    m.dispose();
  });

  it("'press': entering another trigger switches only while a menu is open; leaving closes nothing", () => {
    const m = setup();
    m.hover('Cards');
    assert.deepEqual(m.shown(), ['', ''], 'none open: entering does nothing');
    m.press('Board');
    m.hover('Share');
    assert.deepEqual(m.shown(), ['Share', 'Share']);
    m.d.leave(m.d.find('Share'));
    m.s.move(1, 1);
    m.settle();
    assert.deepEqual(m.shown(), ['Share', 'Share'], 'leaving the bar keeps it');
    m.dispose();
  });

  it("'hover': entering any trigger opens its menu", () => {
    const m = setup({ openOn: 'hover' });
    m.hover('Cards');
    assert.deepEqual(m.shown(), ['Cards', 'Cards']);
    m.hover('Help');
    assert.deepEqual(m.shown(), ['Help', 'Help']);
    m.dispose();
  });

  it('ArrowRight and ArrowLeft move between closed triggers, wrapping; loop={false} stops at the ends', () => {
    const m = setup();
    m.start('Board');
    m.key('ArrowRight');
    assert.deepEqual(m.at(), ['Cards', 'Cards']);
    m.key('ArrowLeft');
    m.key('ArrowLeft');
    assert.deepEqual(m.at(), ['Help', 'Help'], 'wraps to the last');
    m.key('ArrowRight');
    assert.deepEqual(m.at(), ['Board', 'Board'], 'and back to the first');
    assert.deepEqual(m.shown(), ['', ''], 'nothing opened');
    m.dispose();
    const n = setup({ loop: false });
    n.start('Board');
    n.key('ArrowLeft');
    assert.deepEqual(n.at(), ['Board', 'Board']);
    n.key('End');
    n.key('ArrowRight');
    assert.deepEqual(n.at(), ['Help', 'Help']);
    n.dispose();
  });

  it('with a menu open, the arrows open the neighbor with the focus on its first item', () => {
    const m = setup();
    m.start('Board');
    m.press('Board');
    m.start('Board');
    m.key('ArrowRight');
    m.settle();
    assert.deepEqual(m.shown(), ['Cards', 'Cards']);
    assert.deepEqual(m.at(), ['Add card', 'Add card']);
    m.dispose();
  });

  it('Home and End: the first and last trigger', () => {
    const m = setup();
    m.start('Share');
    m.key('End');
    assert.deepEqual(m.at(), ['Help', 'Help']);
    m.key('Home');
    assert.deepEqual(m.at(), ['Board', 'Board']);
    m.dispose();
  });

  it('ArrowDown, Enter and Space open on the first item; ArrowUp on the last; Escape closes to the trigger', () => {
    for (const k of ['ArrowDown', 'Enter', ' ']) {
      const m = setup();
      m.start('Help');
      m.key(k);
      assert.deepEqual(m.shown(), ['Help', 'Help'], k);
      assert.deepEqual(m.at(), ['Guide', 'Guide'], k);
      m.dispose();
    }
    const m = setup();
    m.start('Help');
    m.key('ArrowUp');
    assert.deepEqual(m.at(), ['Shortcuts', 'Shortcuts']);
    m.key('Escape');
    m.settle();
    assert.deepEqual(m.shown(), ['', '']);
    assert.deepEqual(m.at(), ['Help', 'Help'], 'the focus back on the trigger');
    m.start('Board');
    m.press('Board');
    m.start('Board');
    m.key('Escape');
    m.settle();
    assert.deepEqual(m.shown(), ['', ''], 'Escape on an open menu\'s trigger');
    assert.deepEqual(m.at(), ['Board', 'Board']);
    m.dispose();
  });

  it('typing on the triggers finds them: one letter, the same letter again, several letters', () => {
    const m = setup();
    m.start('Board');
    m.key('s');
    assert.deepEqual(m.at(), ['Share', 'Share']);
    m.key('s');
    assert.deepEqual(m.at(), ['Settings', 'Settings'], 'the same letter steps on');
    m.clock.advance(800);
    m.key('h');
    assert.deepEqual(m.at(), ['Help', 'Help']);
    m.clock.advance(800);
    m.key('s');
    m.key('e');
    assert.deepEqual(m.at(), ['Settings', 'Settings'], '"se"');
    assert.deepEqual(m.shown(), ['', ''], 'typing opens nothing');
    m.dispose();
  });

  it('inside a root panel ArrowRight and ArrowLeft move between menus; a branch keeps its own', () => {
    const m = setup();
    m.start('Board');
    m.key('ArrowDown');
    assert.deepEqual(m.at(), ['New board', 'New board']);
    m.key('ArrowRight');
    m.settle();
    assert.deepEqual(m.shown(), ['Cards', 'Cards']);
    assert.deepEqual(m.at(), ['Add card', 'Add card']);
    m.key('ArrowDown');
    assert.deepEqual(m.at(), ['Sort', 'Sort']);
    m.key('ArrowRight');
    m.settle();
    assert.deepEqual(m.at(), ['By date', 'By date'], 'the branch opened');
    assert.deepEqual(m.shown(), ['Cards', 'Cards']);
    m.key('ArrowLeft');
    m.settle();
    assert.deepEqual(m.at(), ['Sort', 'Sort'], 'only the branch closed');
    assert.deepEqual(m.shown(), ['Cards', 'Cards']);
    m.key('ArrowLeft');
    m.settle();
    assert.deepEqual(m.shown(), ['Board', 'Board']);
    assert.deepEqual(m.at(), ['New board', 'New board']);
    m.key('ArrowLeft');
    m.settle();
    assert.deepEqual(m.shown(), ['Help', 'Help'], 'wraps');
    m.dispose();
  });

  it('a choice closes the menu and the value goes to null', () => {
    /** @type {any[]} */
    const heard = [];
    const m = setup({ onChange: (/** @type {any} */ v) => heard.push(v) });
    m.press('Share');
    m.press('Invite');
    assert.deepEqual(m.shown(), ['', '']);
    assert.deepEqual(heard, [2, 2, null, null], 'each renderer once per change');
    m.dispose();
  });

  it('value/onChange controlled, and defaultValue', () => {
    const st = states();
    /** @type {any[]} */
    const heard = [];
    const m = setup(() => {
      const v = st.add($signal($active(), /** @type {number | null} */ (1)));
      return {
        value: v,
        onChange: (/** @type {number | null} */ x) => {
          heard.push(x);
          $write(v, x);
        },
      };
    });
    assert.deepEqual(m.shown(), ['Cards', 'Cards'], 'the value opens its menu');
    m.press('Help');
    assert.deepEqual(m.shown(), ['Help', 'Help']);
    m.press('Help');
    assert.deepEqual(m.shown(), ['', '']);
    assert.deepEqual(heard, [4, 4, null, null]);
    for (const v of st.list) $write(v, 0);
    m.settle();
    assert.deepEqual(m.shown(), ['Board', 'Board'], 'the value from outside');
    m.dispose();
    const fixed = setup({ value: 1 });
    fixed.press('Help');
    assert.deepEqual(fixed.shown(), ['Cards', 'Cards'], 'a fixed value holds');
    fixed.dispose();
    const d = setup({ defaultValue: 3 });
    assert.deepEqual(d.shown(), ['Settings', 'Settings']);
    d.press('Board');
    assert.deepEqual(d.shown(), ['Board', 'Board']);
    d.dispose();
  });

  it('a menu removed while built leaves the indices consistent', () => {
    const st = states();
    /** @type {any[]} */
    const heard = [];
    const m = setup(
      { onChange: (/** @type {any} */ v) => heard.push(v) },
      {
        around: menu => {
          const on = st.add($signal($active(), true));
          return <Show when={() => $read(on)}>{menu}</Show>;
        },
      },
    );
    m.press('Share');
    assert.deepEqual(heard, [2, 2]);
    for (const on of st.list) $write(on, false);
    m.settle();
    assert.deepEqual(heard, [2, 2, 1, 1], 'Share moved down to 1');
    assert.deepEqual(m.shown(), ['Share', 'Share'], 'still open');
    m.start('Board');
    m.key('ArrowRight');
    assert.deepEqual(m.at(), ['Invite', 'Invite'], 'Board now neighbors Share');
    m.press('Board');
    assert.deepEqual(heard.slice(-2), [0, 0]);
    m.dispose();
  });

  it('at: bottom-start by default, a menu\'s own wins', () => {
    const m = setup({}, { menu: { Help: { at: 'top-end' } } });
    m.press('Board');
    const board = css(placeOf(m.d.find('New board')));
    assert.equal(board.top, '100%');
    assert.equal(board['justify-content'], 'flex-start');
    m.press('Help');
    const help = css(placeOf(m.d.find('Guide')));
    assert.equal(help.bottom, '100%');
    assert.equal(help['justify-content'], 'flex-end');
    m.dispose();
    const top = setup({ at: 'top' });
    top.press('Board');
    assert.equal(css(placeOf(top.d.find('New board'))).bottom, '100%', 'the bar\'s at');
    top.dispose();
  });

  it('look: a trigger reads the item tokens; its ground while open', () => {
    const theme = themeOf({ control: { optionPad: [3, 21] } });
    const m = setup({}, { theme });
    const board = m.d.find('Board');
    const b = board.style;
    assert.deepEqual([b.paddingTop, b.paddingLeft, b.paddingBottom, b.paddingRight], ['3px', '21px', '3px', '21px']);
    const closed = board.style.backgroundColor;
    m.press('Board');
    const open = m.d.find('Board').style.backgroundColor;
    assert.notEqual(open, closed, 'the hover ground while open');
    const skia = m.s.box(m.s.find('Board'));
    const plain = setup();
    const base = plain.s.box(plain.s.find('Board'));
    assert.ok(skia.width > base.width, 'Skia: the wider side padding');
    plain.dispose();
    m.dispose();
  });

  it('meaning: a menubar of menuitems with aria-haspopup and aria-expanded', () => {
    const m = setup();
    const bar = m.d.nodes('View').find((/** @type {any} */ n) => n.getAttribute('role') === 'menubar');
    assert.ok(bar, 'the bar is a menubar');
    const board = m.d.find('Board');
    assert.deepEqual([board.getAttribute('role'), board.getAttribute('aria-haspopup'), board.getAttribute('aria-expanded')], ['menuitem', 'menu', 'false']);
    m.press('Board');
    assert.equal(m.d.find('Board').getAttribute('aria-expanded'), 'true');
    const panel = m.d.nodes('View').find((/** @type {any} */ n) => n.getAttribute('role') === 'menu');
    assert.ok(panel, 'the panel keeps Menu\'s meaning');
    m.dispose();
  });
});
