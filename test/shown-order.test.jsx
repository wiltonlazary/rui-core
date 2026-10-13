// Keyboard-walked lists walk their items in the order they are shown, not
// the order they were built: a middle item shown later is reached in place,
// in Tabs, Menubar, a composed Combobox and Menu.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active, Show } from 'ren-core';
import { Rui, Clock, manualClock, Button, Tabs, Menu, Menubar, Combobox, $combobox } from 'rui-core';
import { onDom } from './harness.jsx';

/**
 * A DOM view with a flag that shows the middle item later, and keys to the focused node.
 * @param {(later: () => boolean, clock: any) => any} content
 */
function setup(content) {
  const clock = manualClock();
  /** @type {any} */
  let flag = null;
  const v = onDom(() => {
    flag = $signal($active(), false);
    const later = () => /** @type {boolean} */ ($read(flag));
    return (
      <Clock value={clock}>
        <Rui>{content(later, clock)}</Rui>
      </Clock>
    );
  });
  const settle = () => {
    clock.advance(300);
    $flush(v.root);
  };
  $write(flag, true);
  settle();
  const focus = (/** @type {string} */ text) => {
    const node = [...v.host.querySelectorAll('[data-ren="Action"]')].find((/** @type {any} */ n) => n.textContent.trim() === text);
    if (node === undefined) throw new Error(`no "${text}" in: ${v.host.textContent}`);
    node.focus();
  };
  const key = (/** @type {string} */ k) => {
    (v.document.activeElement ?? v.document.body).dispatchEvent(new v.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    settle();
  };
  const at = () => v.document.activeElement?.textContent?.trim();
  return { v, focus, key, at, settle };
}

describe('shown order', () => {
  it('Tabs: the arrows reach a tab shown later between two, in place', () => {
    const t = setup(later => (
      <Tabs defaultValue="a">
        <Tabs.List>
          <Tabs.Tab value="a">Alpha</Tabs.Tab>
          <Show when={later}>
            <Tabs.Tab value="b">Beta</Tabs.Tab>
          </Show>
          <Tabs.Tab value="c">Gamma</Tabs.Tab>
        </Tabs.List>
      </Tabs>
    ));
    t.focus('Alpha');
    t.key('ArrowRight');
    assert.equal(t.at(), 'Beta');
    t.key('ArrowRight');
    assert.equal(t.at(), 'Gamma');
    t.v.dispose();
  });

  it('Menubar: the arrows reach a menu shown later between two, in place, and its menu opens in place', () => {
    const t = setup(later => (
      <Menubar>
        <Menubar.Menu>
          <Menubar.Trigger>Board</Menubar.Trigger>
          <Menubar.Panel>
            <Menu.Item>New board</Menu.Item>
          </Menubar.Panel>
        </Menubar.Menu>
        <Show when={later}>
          <Menubar.Menu>
            <Menubar.Trigger>Cards</Menubar.Trigger>
            <Menubar.Panel>
              <Menu.Item>Add card</Menu.Item>
            </Menubar.Panel>
          </Menubar.Menu>
        </Show>
        <Menubar.Menu>
          <Menubar.Trigger>Share</Menubar.Trigger>
          <Menubar.Panel>
            <Menu.Item>Invite</Menu.Item>
          </Menubar.Panel>
        </Menubar.Menu>
      </Menubar>
    ));
    t.focus('Board');
    t.key('ArrowRight');
    assert.equal(t.at(), 'Cards');
    t.key('ArrowRight');
    assert.equal(t.at(), 'Share');
    t.key('ArrowLeft');
    t.key('ArrowDown');
    assert.equal(t.at(), 'Add card', "the middle menu's own panel opens");
    t.v.dispose();
  });

  it('Menubar: ArrowDown while a re-sort is pending opens the menu of the trigger pressed', () => {
    const clock = manualClock();
    /** @type {any} */
    let flag = null;
    const v = onDom(() => {
      flag = $signal($active(), false);
      return (
        <Clock value={clock}>
          <Rui>
            <Menubar>
              <Show when={() => $read(flag)}>
                <Menubar.Menu>
                  <Menubar.Trigger>Board</Menubar.Trigger>
                  <Menubar.Panel>
                    <Menu.Item>New board</Menu.Item>
                  </Menubar.Panel>
                </Menubar.Menu>
              </Show>
              <Menubar.Menu>
                <Menubar.Trigger>Share</Menubar.Trigger>
                <Menubar.Panel>
                  <Menu.Item>Invite</Menu.Item>
                </Menubar.Panel>
              </Menubar.Menu>
            </Menubar>
          </Rui>
        </Clock>
      );
    });
    $write(flag, true);
    $flush(v.root);
    const share = [...v.host.querySelectorAll('[data-ren="Action"]')].find((/** @type {any} */ n) => n.textContent.trim() === 'Share');
    share.focus();
    share.dispatchEvent(new v.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    clock.advance(300);
    $flush(v.root);
    assert.equal(v.document.activeElement?.textContent?.trim(), 'Invite', "Share's own menu, not Board's");
    v.dispose();
  });

  it('a composed Combobox: next reaches an option shown later between two, in place', () => {
    /** @type {any} */
    let store = null;
    const t = setup(later => {
      store = $combobox({ defaultOpen: true });
      return (
        <Combobox store={store}>
          <Combobox.Trigger>
            <Button>Pick</Button>
          </Combobox.Trigger>
          <Combobox.Panel portal={false}>
            <Combobox.List>
              <Combobox.Option value="a">Alpha</Combobox.Option>
              <Show when={later}>
                <Combobox.Option value="b">Beta</Combobox.Option>
              </Show>
              <Combobox.Option value="c">Gamma</Combobox.Option>
            </Combobox.List>
          </Combobox.Panel>
        </Combobox>
      );
    });
    const active = () => store.options()[store.active()]?.value();
    store.first();
    assert.equal(active(), 'a');
    store.next();
    assert.equal(active(), 'b');
    store.next();
    assert.equal(active(), 'c');
    t.v.dispose();
  });

  it('Menu: Home and the arrows reach an item shown later in place', () => {
    const t = setup(later => (
      <Menu>
        <Menu.Trigger>
          <Button>Open</Button>
        </Menu.Trigger>
        <Menu.Panel portal={false}>
          <Menu.Item>Alpha</Menu.Item>
          <Show when={later}>
            <Menu.Item>Beta</Menu.Item>
          </Show>
          <Menu.Item>Gamma</Menu.Item>
        </Menu.Panel>
      </Menu>
    ));
    t.focus('Open');
    t.key('ArrowDown');
    t.key('Home');
    assert.equal(t.at(), 'Alpha');
    t.key('ArrowDown');
    assert.equal(t.at(), 'Beta');
    t.v.dispose();
  });
});
