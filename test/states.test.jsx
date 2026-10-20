// The states rui's controls say, read through ren-json: disabled, invalid
// and multiselectable on the controls that show them.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $json } from 'ren-json';
import * as ui from 'rui-core';
import * as dates from 'rui-core/dates';
import { $signal, $read, $write, $active } from 'ren-core';
import { disposeAfter } from './harness.jsx';

const { Rui } = ui;

/** Every node, depth first. @param {any[]} nodes @param {any[]} [out] */
const all = (nodes, out = []) => {
  for (const n of nodes) {
    if (typeof n === 'string') continue;
    out.push(n);
    if (n.children) all(n.children, out);
  }
  return out;
};
/** The nodes of a view in a Rui. @param {() => any} view */
const nodes = async view => all(await $json(() => <Rui>{view()}</Rui>));
const opts = ['Alpha', 'Beta'];

describe('disabled controls say so', () => {
  /** @type {[string, string, () => any][]} */
  const cases = [
    ['Select', 'combobox', () => <ui.Select data={opts} disabled />],
    ['PlainSelect', 'combobox', () => <ui.PlainSelect data={opts} disabled />],
    ['MultiSelect', 'combobox', () => <ui.MultiSelect data={opts} disabled />],
    ['TagInput', 'combobox', () => <ui.TagInput disabled />],
    ['TreeSelect', 'combobox', () => <ui.TreeSelect data={[{ value: 'a', label: 'A' }]} disabled />],
    ['Cascader', 'combobox', () => <ui.Cascader data={[{ value: 'a', label: 'A' }]} disabled />],
    ['FileInput', 'button', () => <ui.FileInput disabled />],
    ['DateSelect', 'button', () => <dates.DateSelect disabled />],
    ['MonthSelect', 'button', () => <dates.MonthSelect disabled />],
    ['YearSelect', 'button', () => <dates.YearSelect disabled />],
    ['DateTimeSelect', 'button', () => <dates.DateTimeSelect disabled />],
    ['TimePicker', 'spinbutton', () => <dates.TimePicker disabled />],
  ];
  for (const [name, role, make] of cases) {
    it(`${name}: its ${role} is disabled`, async () => {
      const found = (await nodes(make)).filter(n => n.role === role);
      assert.ok(found.length > 0, `a ${role}`);
      assert.ok(found.every(n => n.disabled === true), JSON.stringify(found.map(n => n.disabled)));
    });
  }
});

describe('choices with an error say they are invalid', () => {
  it('Checkbox, Switch and Radio, and the checkbox and radio groups', async () => {
    const out = await nodes(() => (
      <>
        <ui.Checkbox label="Agree" error="Required" />
        <ui.Switch label="On" invalid />
        <ui.Radio.Group label="Plan" error="Pick one">
          <ui.Radio value="a" label="A" />
        </ui.Radio.Group>
        <ui.Checkbox.Group label="Days" error="Pick one">
          <ui.Checkbox value="m" label="Mon" />
        </ui.Checkbox.Group>
        <ui.Radio value="x" label="Alone" error="No" />
      </>
    ));
    const invalid = (/** @type {string} */ role, /** @type {string} */ label) => out.find(n => n.role === role && n.label === label)?.invalid;
    assert.equal(invalid('checkbox', 'Agree'), true);
    assert.equal(invalid('switch', 'On'), true);
    assert.equal(invalid('radiogroup', 'Plan'), true);
    assert.equal(invalid('group', 'Days'), true);
    assert.equal(invalid('radio', 'Alone'), true);
  });
});

describe('a list that takes several picks says so', () => {
  it('MultiSelect, TagInput, a multiple Picker and a many-pick TreeSelect; a Select does not (DOM: ren-json keeps no multiselectable)', async () => {
    const { onDom } = await import('./harness.jsx');
    /** The first list's aria-multiselectable, the field opened. @param {() => any} make */
    const multi = make => {
      const v = onDom(() => <Rui>{make()}</Rui>);
      v.text();
      const field = v.document.querySelector('[role="combobox"]') ?? v.document.querySelector('[role="button"]');
      field?.focus?.();
      field?.dispatchEvent(new v.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      v.text();
      const list = v.document.querySelector('[role="listbox"], [role="tree"]');
      const out = list === null ? 'no list' : list.getAttribute('aria-multiselectable');
      v.dispose();
      return out;
    };
    assert.equal(multi(() => <ui.MultiSelect data={opts} />), 'true', 'MultiSelect');
    assert.equal(multi(() => <ui.TagInput data={opts} />), 'true', 'TagInput');
    assert.equal(
      multi(() => (
        <ui.Picker data={opts} multiple defaultOpen>
          <ui.Picker.Trigger>
            <ui.Button>Style</ui.Button>
          </ui.Picker.Trigger>
        </ui.Picker>
      )),
      'true',
      'Picker multiple',
    );
    assert.equal(multi(() => <ui.TreeSelect data={[{ value: 'a', label: 'A' }]} pick="many" />), 'true', 'TreeSelect many');
    assert.equal(multi(() => <ui.Select data={opts} />), null, 'Select: one pick');
  });
});

describe('the option under the keyboard is the field\'s active descendant', () => {
  it('a Select and the Launcher point at the active option by id', async () => {
    const { onDom } = await import('./harness.jsx');
    const key = (/** @type {any} */ v, /** @type {string} */ k) => {
      v.document.activeElement.dispatchEvent(new v.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      v.text();
    };
    const select = onDom(() => (
      <Rui>
        <ui.Select data={['Alpha', 'Beta', 'Gamma']} />
      </Rui>
    ));
    select.text();
    const field = select.document.querySelector('[role="combobox"]');
    field.focus();
    assert.equal(field.getAttribute('aria-activedescendant'), null, 'closed: none');
    key(select, 'ArrowDown');
    key(select, 'ArrowDown');
    const at = () => select.document.getElementById(field.getAttribute('aria-activedescendant'));
    assert.equal(at()?.getAttribute('role'), 'option');
    const first = at()?.textContent.trim();
    key(select, 'ArrowDown');
    const names = ['Alpha', 'Beta', 'Gamma'];
    assert.equal(at()?.textContent.trim(), names[names.indexOf(String(first)) + 1], 'it follows the keyboard to the next option');
    select.dispose();
    const { Launcher, $launcher } = await import('rui-core/launcher');
    /** @type {any} */
    let store = null;
    const launch = onDom(() => (
      <Rui>
        <Launcher actions={[{ label: 'Open' }, { label: 'Save' }]} portal={false}>
          {(() => {
            store = $launcher();
            return null;
          })()}
        </Launcher>
      </Rui>
    ));
    store.open();
    launch.text();
    const search = launch.document.querySelector('[role="combobox"]');
    search.focus();
    key(launch, 'ArrowDown');
    const on = launch.document.getElementById(search.getAttribute('aria-activedescendant'));
    assert.equal(on?.getAttribute('role'), 'option');
    assert.equal(on?.getAttribute('aria-selected'), 'true', "the Launcher's active action");
    launch.dispose();
  });
});

describe('a Menu.Trigger says it opens a menu', () => {
  it('a Button in it, and a function child, say aria-haspopup menu and aria-expanded', async () => {
    const { onDom } = await import('./harness.jsx');
    const { Action } = await import('ren-core');
    const v = onDom(() => (
      <Rui>
        <ui.Menu>
          <ui.Menu.Trigger>
            <ui.Button>Open</ui.Button>
          </ui.Menu.Trigger>
          <ui.Menu.Panel>
            <ui.Menu.Item>One</ui.Menu.Item>
          </ui.Menu.Panel>
        </ui.Menu>
        <ui.Menu>
          <ui.Menu.Trigger>{(/** @type {any} */ t) => <Action {...t} text="Own" />}</ui.Menu.Trigger>
          <ui.Menu.Panel>
            <ui.Menu.Item>Two</ui.Menu.Item>
          </ui.Menu.Panel>
        </ui.Menu>
      </Rui>
    ));
    v.text();
    const button = (/** @type {string} */ text) => [...v.document.querySelectorAll('[data-ren="Action"]')].find((/** @type {any} */ n) => n.textContent.trim() === text);
    for (const text of ['Open', 'Own']) {
      assert.equal(button(text)?.getAttribute('aria-haspopup'), 'menu', `${text}: a menu`);
      assert.equal(button(text)?.getAttribute('aria-expanded'), 'false', `${text}: closed`);
    }
    button('Open').dispatchEvent(new v.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    v.text();
    assert.equal(button('Open')?.getAttribute('aria-expanded'), 'true', 'open');
    v.dispose();
  });
});

describe('a dialog puts no hidden button in the Tab cycle', () => {
  it('the focus goes to its first focusable; the holder is there only when it has none', async () => {
    const { onDom } = await import('./harness.jsx');
    const clock = ui.manualClock();
    const open = (/** @type {() => any} */ inner, /** @type {Record<string, any>} */ extra = {}) => {
      const v = onDom(() => (
        <ui.Clock value={clock}>
          <Rui>
            <ui.Modal defaultOpen title="Hello" portal={false} motion={0} {...extra}>
              {inner()}
            </ui.Modal>
          </Rui>
        </ui.Clock>
      ));
      v.text();
      clock.advance(50);
      v.text();
      return v;
    };
    const withButton = open(() => <ui.Button>Save</ui.Button>);
    assert.equal(withButton.document.querySelectorAll('[data-ren="Action"][role="none"]').length, 0, 'no holder beside a focusable');
    assert.ok(['Close', 'Save'].includes(withButton.document.activeElement?.getAttribute('aria-label') ?? withButton.document.activeElement?.textContent.trim()), 'the focus on the first focusable');
    withButton.dispose();
    const bare = open(() => <ui.Text>Only text</ui.Text>, { closable: false });
    const holders = bare.document.querySelectorAll('[data-ren="Action"][role="none"]');
    assert.equal(holders.length, 1, 'nothing else to focus: the holder');
    assert.equal(bare.document.activeElement, holders[0], 'and it holds the focus');
    bare.dispose();
  });
});

describe('TreeSelect means a tree', () => {
  it('its parents say aria-expanded, and the expand controls are no extra buttons', async () => {
    const out = await nodes(() => (
      <ui.TreeSelect
        defaultOpen
        portal={false}
        defaultExpanded={['fruit']}
        data={[
          { value: 'fruit', label: 'Fruit', children: [{ value: 'apple', label: 'Apple' }] },
          { value: 'nuts', label: 'Nuts', children: [{ value: 'pecan', label: 'Pecan' }] },
          { value: 'salt', label: 'Salt' },
        ]}
      />
    ));
    const items = out.filter(n => n.role === 'treeitem').map(n => [n.text, n.expanded]);
    assert.deepEqual(items, [['Fruit', true], ['Apple', undefined], ['Nuts', false], ['Salt', undefined]]);
    assert.deepEqual(out.filter(n => n.role === 'button' && /^(Expand|Collapse) /.test(String(n.label))), [], 'no Expand buttons beside the items');
  });
});

describe('a sortable column keeps its name', () => {
  it('ren-json names the column by its title', async () => {
    const { DataTable } = await import('rui-core/more');
    const out = await nodes(() => <DataTable rows={[{ id: 1, name: 'Ann' }]} fields={{ name: { sort: true } }} />);
    assert.deepEqual(out.find(n => n.role === 'table')?.columns, ['Name']);
  });
  it('its columnheader says aria-sort and holds a button named by the title (DOM)', async t => {
    const { onDom } = await import('./harness.jsx');
    const { DataTable } = await import('rui-core/more');
    const v = onDom(() => <Rui><DataTable rows={[{ id: 1, name: 'Ann' }, { id: 2, name: 'Bo' }]} fields={{ name: { sort: true } }} /></Rui>);
    disposeAfter(t, () => v.dispose());
    v.text();
    const header = v.document.querySelector('[role="columnheader"][aria-sort]');
    assert.ok(header, 'a sortable columnheader');
    assert.equal(header.getAttribute('data-ren'), 'View', 'the header is a cell, not the button');
    assert.equal(header.getAttribute('aria-sort'), 'none');
    const button = header.querySelector('[data-ren="Action"]');
    assert.equal(button?.getAttribute('aria-label'), 'Name', 'the button inside, named by the title');
    button.click();
    v.text();
    assert.equal(header.getAttribute('aria-sort'), 'ascending');
  });
});

describe('a tooltip describes its trigger', () => {
  it('the button inside says aria-describedby, the shown tooltip\'s id (DOM)', async t => {
    const { onDom } = await import('./harness.jsx');
    const v = onDom(() => (
      <Rui>
        <ui.Tooltip label="Saves the draft" open>
          <ui.Button>Save</ui.Button>
        </ui.Tooltip>
        <ui.Tooltip label="Opens the list" open>
          <ui.Menu>
            <ui.Menu.Trigger>
              <ui.Button>More</ui.Button>
            </ui.Menu.Trigger>
            <ui.Menu.Panel>
              <ui.Menu.Item>One</ui.Menu.Item>
            </ui.Menu.Panel>
          </ui.Menu>
        </ui.Tooltip>
      </Rui>
    ));
    disposeAfter(t, () => v.dispose());
    v.text();
    const button = (/** @type {string} */ text) => [...v.document.querySelectorAll('[data-ren="Action"]')].find((/** @type {any} */ n) => n.textContent.trim() === text);
    for (const [text, tip] of [['Save', 'Saves the draft'], ['More', 'Opens the list']]) {
      const id = button(text)?.getAttribute('aria-describedby');
      assert.ok(id, `${text} is described`);
      assert.equal(v.document.getElementById(id)?.getAttribute('role'), 'tooltip', `${text}: its tooltip`);
      assert.equal(v.document.getElementById(id)?.textContent.trim(), tip);
    }
    assert.equal(button('More')?.getAttribute('aria-haspopup'), 'menu', 'the menu trigger keeps its own meaning');
  });
  it('a closed tooltip describes nothing', async t => {
    const { onDom } = await import('./harness.jsx');
    const v = onDom(() => (
      <Rui>
        <ui.Tooltip label="Saves the draft">
          <ui.Button>Save</ui.Button>
        </ui.Tooltip>
      </Rui>
    ));
    disposeAfter(t, () => v.dispose());
    v.text();
    assert.equal(v.document.querySelector('[data-ren="Action"]')?.getAttribute('aria-describedby'), null);
  });
});

describe('each role says its own state', () => {
  it('checked, selected and current come from the control, never a pressed button (ren-json)', async () => {
    const { Outline } = await import('rui-core');
    const out = await nodes(() => (
      <>
        <ui.Checkbox label="Box" defaultChecked />
        <ui.Switch label="Toggle" defaultChecked />
        <ui.Radio.Group label="Pick" defaultValue="a">
          <ui.Radio value="a" label="A" />
          <ui.Radio value="b" label="B" />
        </ui.Radio.Group>
        <ui.SegmentedControl aria-label="Seg" data={['One', 'Two']} defaultValue="One" />
        <ui.Tabs defaultValue="x">
          <ui.Tabs.List>
            <ui.Tabs.Tab value="x">X</ui.Tabs.Tab>
            <ui.Tabs.Tab value="y">Y</ui.Tabs.Tab>
          </ui.Tabs.List>
        </ui.Tabs>
        <ui.Pagination total={3} defaultValue={2} />
        <ui.NavItem label="Home" active />
        <Outline data={[{ label: 'Intro', level: 1 }, { label: 'Setup', level: 1 }]} value={0} />
      </>
    ));
    const find = (/** @type {string} */ role, /** @type {string} */ name) => out.find(n => n.role === role && (n.label ?? n.text) === name);
    assert.equal(find('checkbox', 'Box')?.checked, true, 'checkbox');
    assert.equal(find('switch', 'Toggle')?.checked, true, 'switch');
    assert.equal(find('radio', 'A')?.checked, true, 'radio');
    assert.equal(find('radio', 'B')?.checked, false, 'the other radio');
    assert.equal(find('radio', 'One')?.checked, true, 'a segment');
    assert.equal(find('tab', 'X')?.selected, true, 'tab');
    assert.equal(find('tab', 'Y')?.selected, false, 'the other tab');
    assert.equal(find('button', '2')?.current, 'page', 'the current page');
    assert.equal(find('link', 'Home')?.current, 'page', 'NavItem');
    assert.equal(find('link', 'Intro')?.current, 'location', 'Outline');
    assert.deepEqual(out.filter(n => n.pressed !== undefined).map(n => n.label ?? n.text), [], 'nothing says pressed');
  });
});

describe('a menubar and a snippet\'s tabs take their name', () => {
  it('aria-label and aria-labelledby reach the menubar and the tablist (ren-json)', async () => {
    const { SnippetTabs } = await import('rui-core/snippet');
    const files = [{ name: 'a.js', code: 'a' }, { name: 'b.js', code: 'b' }];
    const bar = (/** @type {Record<string, any>} */ p) => (
      <ui.Menubar {...p}>
        <ui.Menu>
          <ui.Menu.Trigger>
            <ui.Button>File</ui.Button>
          </ui.Menu.Trigger>
          <ui.Menu.Panel>
            <ui.Menu.Item>New</ui.Menu.Item>
          </ui.Menu.Panel>
        </ui.Menu>
      </ui.Menubar>
    );
    const out = await nodes(() => (
      <>
        {bar({ 'aria-label': 'Main' })}
        <ui.Text id="apps">Apps</ui.Text>
        {bar({ 'aria-labelledby': 'apps' })}
        <SnippetTabs files={files} aria-label="Sources" />
        <SnippetTabs files={files} />
      </>
    ));
    assert.deepEqual(out.filter(n => n.role === 'menubar').map(n => n.label), ['Main', 'Apps']);
    assert.deepEqual(out.filter(n => n.role === 'tablist').map(n => n.label), ['Sources', undefined], 'no default: rui has no snippet label');
  });
});

describe('a bare dialog keeps the focus each time it opens', () => {
  /** The focused node on each renderer, and whether it is the holder. @param {any} p */
  const where = p => {
    const d = p.d.focused();
    const s = p.s.focused();
    return [d?.getAttribute?.('role') === 'none' && d.isConnected === true, s?.other?.get?.('role') === 'none'];
  };
  it('a Modal and a Drawer, reopened: the holder has the focus (DOM and Skia)', async t => {
    const { pair, states, app } = await import('./overlay-harness.jsx');
    for (const Dialog of [ui.Modal, ui.Drawer]) {
      const clock = ui.manualClock();
      const hooks = states();
      const p = pair(app(clock, () => {
        const s = hooks.add($signal($active(), true));
        return (
          <>
            <ui.Button>Page</ui.Button>
            <Dialog open={() => $read(s)} onOpenChange={(/** @type {boolean} */ x) => $write(s, x)} title="Hello" motion={0} closable={false}>
              <ui.Text>Only text</ui.Text>
            </Dialog>
          </>
        );
      }));
      disposeAfter(t, () => p.dispose());
      const settle = () => {
        for (let i = 0; i < 5; i++) {
          clock.advance(100);
          p.flush();
        }
      };
      const set = (/** @type {boolean} */ v) => {
        for (const s of hooks.list) $write(s, v);
        p.flush();
        settle();
      };
      settle();
      assert.deepEqual(where(p), [true, true], `${Dialog.name}: first opening`);
      set(false);
      set(true);
      assert.deepEqual(where(p), [true, true], `${Dialog.name}: second opening`);
      set(false);
      set(true);
      assert.deepEqual(where(p), [true, true], `${Dialog.name}: third opening`);
    }
  });
  it('a bare Modal over another, reopened: the holder has the focus (DOM and Skia)', async t => {
    const { pair, states, app } = await import('./overlay-harness.jsx');
    const clock = ui.manualClock();
    const hooks = states();
    const p = pair(app(clock, () => {
      const b = hooks.add($signal($active(), false));
      return (
        <ui.Modal defaultOpen title="Outer" motion={0} closable={false}>
          <ui.Button onPress={() => $write(b, true)}>Open inner</ui.Button>
          <ui.Modal open={() => $read(b)} onOpenChange={(/** @type {boolean} */ x) => $write(b, x)} title="Inner" motion={0} closable={false}>
            <ui.Text>Inner text</ui.Text>
          </ui.Modal>
        </ui.Modal>
      );
    }));
    disposeAfter(t, () => p.dispose());
    const settle = () => {
      for (let i = 0; i < 5; i++) {
        clock.advance(100);
        p.flush();
      }
    };
    const set = (/** @type {boolean} */ v) => {
      for (const s of hooks.list) $write(s, v);
      p.flush();
      settle();
    };
    settle();
    set(true);
    assert.deepEqual(where(p), [true, true], 'the inner one, first opening');
    set(false);
    set(true);
    assert.deepEqual(where(p), [true, true], 'the inner one, second opening');
  });
});

describe('the active descendant follows what is shown', () => {
  /** The field's aria-activedescendant and the text of what it points at ('MISSING' when nothing has that id). @param {any} doc */
  const active = doc => {
    const id = doc.querySelector('[role="combobox"]').getAttribute('aria-activedescendant');
    return id === null ? null : (doc.getElementById(id)?.textContent.trim() ?? 'MISSING');
  };
  for (const [name, make] of /** @type {[string, () => any][]} */ ([
    ['Select', () => <ui.Select searchable label="Pick" data={['Beta', 'Alpha', 'Gamma']} />],
    ['MultiSelect', () => <ui.MultiSelect searchable label="Pick" data={['Beta', 'Alpha', 'Gamma']} />],
  ])) {
    it(`${name} searchable: the first keystroke, then filtering, never point at nothing`, async t => {
      const { pair, app } = await import('./overlay-harness.jsx');
      const clock = ui.manualClock();
      const p = pair(app(clock, make));
      disposeAfter(t, () => p.dispose());
      const doc = p.dom.document;
      const step = (/** @type {() => void} */ fn) => {
        fn();
        clock.advance(300);
        p.flush();
        return active(doc);
      };
      doc.querySelector('input[role="combobox"]').focus();
      const typed = step(() => p.d.type('a'));
      assert.ok(typed !== null && typed !== 'MISSING', `the first keystroke opens on an option (${typed})`);
      // 'aq' matches none of Beta, Alpha and Gamma: no option shown, so nothing to point at.
      assert.equal(step(() => p.d.type('q')), null, 'filtered to nothing: no active descendant');
      assert.equal(doc.querySelectorAll('[role="option"]').length, 0, 'filtered to nothing: no option shown');
      const edit = doc.querySelector('input[role="combobox"]');
      edit.value = 'g';
      assert.notEqual(step(() => edit.dispatchEvent(new p.dom.window.Event('input', { bubbles: true }))), 'MISSING', 'filtered again');
      const down = step(() => p.d.key('ArrowDown'));
      assert.ok(down !== null && down !== 'MISSING', `the arrow lands on a shown option (${down})`);
    });
  }
});

describe('a TreeSelect and a Cascader say the row the keyboard is on', () => {
  const data = [
    { value: 'fruit', label: 'Fruit', children: [{ value: 'apple', label: 'Apple' }] },
    { value: 'veg', label: 'Veg', children: [{ value: 'leek', label: 'Leek' }] },
  ];
  for (const [name, make] of /** @type {[string, () => any][]} */ ([
    ['TreeSelect', () => <ui.TreeSelect label="Food" data={data} />],
    ['Cascader', () => <ui.Cascader label="Food" data={data} />],
  ])) {
    it(`${name}: aria-activedescendant is the cursor's row, and moves with it (DOM)`, async t => {
      const { pair, app } = await import('./overlay-harness.jsx');
      const clock = ui.manualClock();
      const p = pair(app(clock, make));
      disposeAfter(t, () => p.dispose());
      const doc = p.dom.document;
      const field = doc.querySelector('[role="combobox"]');
      /** What the field's active descendant is: its row's text, 'MISSING', or null. */
      const active = () => {
        const id = field.getAttribute('aria-activedescendant');
        return id === null ? null : (doc.getElementById(id)?.textContent.trim() ?? 'MISSING');
      };
      const key = (/** @type {string} */ k) => {
        p.d.key(k);
        clock.advance(300);
        p.flush();
        return active();
      };
      field.focus();
      key('ArrowDown'); // opens (a TreeSelect with no value has no row yet)
      const seen = [key('ArrowDown'), key('ArrowDown')];
      assert.ok(seen.every(v => v !== null && v !== 'MISSING'), `each step names a row (${seen})`);
      assert.notEqual(seen[0], seen[1], 'the second step moves it');
    });
  }
});

describe('a TreeSelect chevron leaves the focus on the field', () => {
  it('a press on it opens the node; the combobox keeps the focus; it is no button (DOM and Skia)', async t => {
    const { pair, app } = await import('./overlay-harness.jsx');
    const clock = ui.manualClock();
    const p = pair(app(clock, () => <ui.TreeSelect placeholder="Node" data={[{ value: 'a', label: 'Aa', children: [{ value: 'a1', label: 'A1' }] }]} />));
    disposeAfter(t, () => p.dispose());
    const settle = () => {
      for (let i = 0; i < 3; i++) {
        clock.advance(300);
        p.flush();
      }
    };
    p.d.press('Node');
    p.s.press('Node');
    settle();
    const field = p.dom.document.querySelector('[role="combobox"]');
    field.focus();
    const skiaField = p.s.focused();
    assert.ok(skiaField, 'Skia: the field has the focus');
    const chevron = p.dom.document.querySelector('[aria-label="Expand Aa"]');
    assert.notEqual(chevron.getAttribute('data-ren'), 'Action', 'the chevron is drawn, not a button');
    p.d.tap(chevron);
    const item = p.s.items().find(i => i.other?.get?.('aria-label') === 'Expand Aa');
    p.s.at(p.s.box(item).x + 3, p.s.box(item).y + 3);
    settle();
    assert.ok(p.d.text().includes('A1') && p.s.text().includes('A1'), 'the node opened on both');
    assert.ok(p.dom.document.activeElement === field, 'DOM: the field keeps the focus');
    assert.ok(p.s.focused() === skiaField, 'Skia: the field keeps the focus');
  });
});

describe('a pressed field opens from its whole box', () => {
  const fields = {
    Select: () => <ui.Select placeholder="Pick" data={['Alpha', 'Beta']} />,
    Cascader: () => <ui.Cascader placeholder="Pick" data={[{ value: 'a', label: 'Alpha', children: [{ value: 'a1', label: 'Beta' }] }]} />,
    TreeSelect: () => <ui.TreeSelect placeholder="Pick" data={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />,
  };
  for (const [name, view] of Object.entries(fields)) {
    it(`${name}: the chevron and the padding open it, the field itself toggles it (DOM and Skia)`, async t => {
      const { pair, app } = await import('./overlay-harness.jsx');
      const clock = ui.manualClock();
      const p = pair(app(clock, view));
      disposeAfter(t, () => p.dispose());
      const settle = () => {
        for (let i = 0; i < 3; i++) {
          clock.advance(300);
          p.flush();
        }
      };
      const open = () => [p.d.text().includes('Alpha'), p.s.text().includes('Alpha')];
      const shut = () => {
        p.d.key('Escape');
        p.s.key('Escape');
        settle();
        assert.deepEqual(open(), [false, false], 'Escape closes it');
      };
      // DOM: the combobox sits in the box's inner row; the box's last child is the end section (the chevron)
      const combo = p.dom.document.querySelector('[role="combobox"]');
      const box = combo.parentElement.parentElement;
      const sItem = p.s.items().find(i => i.other?.get?.('role') === 'combobox');
      const sBox = p.s.box(sItem.parent.parent);
      // the chevron
      p.d.tap(box.lastElementChild);
      p.s.at(sBox.x + sBox.width - 8, sBox.y + sBox.height / 2);
      settle();
      assert.deepEqual(open(), [true, true], 'the chevron opens it');
      shut();
      // the padding before the field's text
      p.d.tap(combo.parentElement);
      p.s.at(sBox.x + 3, sBox.y + sBox.height / 2);
      settle();
      assert.deepEqual(open(), [true, true], 'the padding opens it');
      shut();
      // the field itself opens it, and pressed again closes it
      p.d.tap(combo);
      p.s.at(sBox.x + sBox.width / 3, sBox.y + sBox.height / 2);
      settle();
      assert.deepEqual(open(), [true, true], 'the field opens it');
      p.d.tap(combo);
      p.s.at(sBox.x + sBox.width / 3, sBox.y + sBox.height / 2);
      settle();
      assert.deepEqual(open(), [false, false], 'pressed again, it closes');
    });
  }
});

describe('a typed field opens from its box, ready to type', () => {
  // each typed field, and where its box is pressed: the chevron (the end section), else the padding before the text
  const fields = {
    'a searchable Select': [() => <ui.Select searchable placeholder="Pick" data={['Alpha', 'Beta']} />, 'chevron'],
    MultiSelect: [() => <ui.MultiSelect placeholder="Pick" data={['Alpha', 'Beta']} />, 'chevron'],
    Autocomplete: [() => <ui.Autocomplete placeholder="Pick" data={['Alpha', 'Beta']} />, 'padding'],
  };
  for (const [name, [view, where]] of Object.entries(fields)) {
    it(`${name}: a press on its ${where} opens it and focuses its Edit; Escape then closes it (DOM and Skia)`, async t => {
      const { pair, app } = await import('./overlay-harness.jsx');
      const clock = ui.manualClock();
      const p = pair(app(clock, view));
      disposeAfter(t, () => p.dispose());
      const settle = () => {
        for (let i = 0; i < 3; i++) {
          clock.advance(300);
          p.flush();
        }
      };
      const combo = p.dom.document.querySelector('[role="combobox"]');
      const sItem = p.s.items().find(i => i.other?.get?.('role') === 'combobox');
      // the Edit sits in the box's inner row; the box's last child is its end section (the chevron)
      const box = combo.parentElement.parentElement;
      const sBox = p.s.box(sItem.parent.parent);
      if (where === 'chevron') {
        p.d.tap(box.lastElementChild);
        p.s.at(sBox.x + sBox.width - 8, sBox.y + sBox.height / 2);
      } else {
        p.d.tap(combo.parentElement);
        p.s.at(sBox.x + 3, sBox.y + sBox.height / 2);
      }
      settle();
      assert.ok(p.d.text().includes('Alpha') && p.s.text().includes('Alpha'), `the ${where} opens it on both`);
      assert.equal(p.dom.document.activeElement, combo, 'DOM: its Edit has the focus');
      assert.equal(p.s.focused(), sItem, 'Skia: its Edit has the focus');
      p.d.key('Escape');
      p.s.key('Escape');
      settle();
      assert.ok(!p.d.text().includes('Alpha') && !p.s.text().includes('Alpha'), 'its keys work: Escape closes it');
    });
  }
});

describe('tab ids never collide', () => {
  it("'a b' and 'a_20b' get two ids; each panel is labelled by its own tab (DOM)", async t => {
    const { onDom } = await import('./harness.jsx');
    const values = ['a b', 'a_20b', 'a\u00020b'];
    const v = onDom(() => (
      <Rui>
        <ui.Tabs defaultValue="a b" persistent>
          <ui.Tabs.List>
            {values.map(x => (
              <ui.Tabs.Tab value={x}>{`Tab ${x}`}</ui.Tabs.Tab>
            ))}
          </ui.Tabs.List>
          {values.map(x => (
            <ui.Tabs.Panel value={x}>{`Panel ${x}`}</ui.Tabs.Panel>
          ))}
        </ui.Tabs>
      </Rui>
    ));
    disposeAfter(t, () => v.dispose());
    v.text();
    const ids = [...v.document.querySelectorAll('[role="tab"]')].map(n => n.id);
    assert.equal(new Set(ids).size, values.length, `distinct ids: ${ids}`);
    const panels = [...v.document.querySelectorAll('[role="tabpanel"]')];
    assert.deepEqual(
      panels.map(p => v.document.getElementById(p.getAttribute('aria-labelledby'))?.textContent.trim()),
      values.map(x => `Tab ${x}`),
    );
  });
});

describe('a disabled Pagination says so on each page', () => {
  it('every page button and arrow is aria-disabled (ren-json)', async () => {
    const out = await nodes(() => <ui.Pagination total={3} defaultValue={2} disabled />);
    const buttons = out.filter(n => n.role === 'button');
    assert.deepEqual(buttons.map(n => [n.label ?? n.text, n.disabled]), [['Previous page', true], ['1', true], ['2', true], ['3', true], ['Next page', true]]);
  });
});

describe('fields leave an input method\'s keys to it', () => {
  it('a composing Enter or arrow steps, opens and picks nothing (DOM)', async t => {
    const { onDom } = await import('./harness.jsx');
    /** A key to a view's field while an input method composes. @param {any} v @param {string} key */
    const compose = (v, key) => {
      const field = v.document.querySelector('input, textarea');
      field.focus();
      field.dispatchEvent(new v.window.KeyboardEvent('keydown', { key, isComposing: true, bubbles: true, cancelable: true }));
      field.dispatchEvent(new v.window.KeyboardEvent('keydown', { key, keyCode: 229, bubbles: true, cancelable: true }));
      v.text();
      return field;
    };
    /** @type {any[]} */
    const numbers = [];
    const n = onDom(() => (
      <Rui>
        <ui.NumberInput label="Count" defaultValue={5} onChange={(/** @type {any} */ x) => numbers.push(x)} />
      </Rui>
    ));
    disposeAfter(t, () => n.dispose());
    compose(n, 'ArrowUp');
    compose(n, 'Enter');
    assert.deepEqual(numbers, [], 'NumberInput: no step');
    for (const [name, make, key] of /** @type {[string, () => any, string][]} */ ([
      ['Select', () => <ui.Select searchable label="Pick" data={['Alpha', 'Beta']} />, 'ArrowDown'],
      ['Autocomplete', () => <ui.Autocomplete label="Pick" data={['Alpha', 'Beta']} />, 'ArrowDown'],
      ['TagInput', () => <ui.TagInput label="Tags" data={['Alpha', 'Beta']} />, 'ArrowDown'],
    ])) {
      const v = onDom(() => <Rui>{make()}</Rui>);
      disposeAfter(t, () => v.dispose());
      const field = compose(v, key);
      assert.notEqual(field.getAttribute('aria-expanded'), 'true', `${name}: not opened`);
    }
    /** @type {string[][]} */
    const tags = [];
    const tg = onDom(() => (
      <Rui>
        <ui.TagInput label="Tags" onChange={(/** @type {string[]} */ x) => tags.push(x)} />
      </Rui>
    ));
    disposeAfter(t, () => tg.dispose());
    const input = tg.document.querySelector('input');
    input.focus();
    input.value = 'kanji';
    input.dispatchEvent(new tg.window.Event('input', { bubbles: true }));
    tg.text();
    compose(tg, 'Enter');
    assert.deepEqual(tags, [], 'TagInput: the confirming Enter adds no tag');
  });
});
