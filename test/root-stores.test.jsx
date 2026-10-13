// A per-root store or hook cache hands every caller the same nodes, so it
// must not build them inside the scope that asked first: made in a scope A
// that then stops, each store still works, and updates what reads it, from
// a scope B.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $root, $scope, $enter, $stop, $read, $flush, $watch, $dispose, $signal, $write, $active, Show } from 'ren-core';
import { Rui } from 'rui-core';
import { $localStorage, $sessionStorage } from 'rui-core/hooks';
import { $notifications, Notifications } from 'rui-core/notifications';
import { $loadBar } from 'rui-core/load-bar';
import { $launcher } from 'rui-core/launcher';
import { onDom, disposeAfter } from './harness.jsx';

/**
 * Each cached store: how to get it on a root, change it, and what to read.
 * @type {[string, (R: any) => any, (s: any) => void, (s: any) => unknown, unknown][]}
 */
const STORES = [
  ['$notifications', R => $notifications(R), s => s.show({ title: 'Saved' }), s => s.all().length, 1],
  ['$loadBar', R => $loadBar(R), s => s.to(40), s => s.value(), 40],
  ['$launcher', R => $launcher(R), s => s.open(), s => s.isOpen(), true],
  ['$localStorage', R => $localStorage(R, { key: 'rui-root-stores', fallback: 0 }), s => s.set(2), s => $read(s.value), 2],
  ['$sessionStorage', R => $sessionStorage(R, { key: 'rui-root-stores', fallback: 0 }), s => s.set(2), s => $read(s.value), 2],
];

describe('a per-root store outlives the scope that asked first', () => {
  for (const [name, get, change, readOf, expected] of STORES) {
    it(`${name}: made in a scope that stopped, it still updates what reads it from another`, t => {
      const R = $root('stores');
      t.after(() => $dispose(R));
      const a = $scope(R, null);
      $enter(a, () => get(R));
      $stop(a);
      const b = $scope(R, null);
      /** @type {unknown[]} */
      const seen = [];
      const store = $enter(b, () => {
        const s = get(R);
        $watch(R, () => readOf(s), v => void seen.push(v));
        return s;
      });
      $flush(R);
      change(store);
      $flush(R);
      assert.deepEqual(seen.at(-1), expected, `${name}: the reader in scope B saw the change (${JSON.stringify(seen)})`);
      $stop(b);
    });
  }

  it('Notifications (DOM): the page that first asked is gone; a toast shown after still shows', t => {
    /** @type {any} */
    let on = null;
    const Page = () => {
      $notifications();
      return null;
    };
    const dom = onDom(() => {
      on = $signal($active(), true);
      return (
        <Rui>
          <Show when={() => $read(on)}>
            <Page />
          </Show>
          <Notifications />
        </Rui>
      );
    });
    disposeAfter(t, () => dom.dispose());
    $write(on, false);
    $flush(dom.root);
    $notifications(dom.root).show({ title: 'Saved' });
    $flush(dom.root);
    // The toasts sit in the portal layer, outside the view's host: the whole page.
    assert.ok(dom.document.body.textContent.includes('Saved'), 'the toast shows');
  });
});
