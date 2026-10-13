// The harness itself: a view a test leaves open (as a failing test does) is
// disposed and its window closed after that test, never leaked to the next.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { View } from 'ren-core';
import { Rui, Text } from 'rui-core';
import { both, onDom, openViews } from './harness.jsx';

describe('test harness', () => {
  /** @type {any} */
  let left = null;

  it('leaves a DOM view and a pair open, as a test failing midway would', () => {
    left = onDom(() => (
      <Rui>
        <Text>left</Text>
      </Rui>
    ));
    both(() => (
      <Rui>
        <Text>pair</Text>
      </Rui>
    ));
    assert.equal(openViews(), 3, 'one DOM view, and a pair of two');
  });

  it('finds them disposed after that test: none open, the window closed', () => {
    assert.equal(openViews(), 0);
    assert.equal(left.document.body.innerHTML, '', 'the window was closed');
  });
});

describe('the DOM harness\'s ResizeObserver', () => {
  it('reports the boxes a test gives: once observed unless 0 × 0, then each change, and nothing unchanged', () => {
    /** @type {string[]} */
    const heard = [];
    /** @type {any} */
    let node = null;
    const dom = onDom(() => <View ref={(/** @type {any} */ n) => (node = n)} onResize={(/** @type {{ width: number, height: number }} */ e) => heard.push(`${e.width}×${e.height}`)} />);
    dom.report();
    assert.deepEqual(heard, [], 'happy-dom lays nothing out: 0 × 0, no report');
    let box = { width: 120, height: 40 };
    node.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: box.width, bottom: box.height, ...box });
    dom.report();
    assert.deepEqual(heard, ['120×40']);
    dom.report();
    assert.deepEqual(heard, ['120×40'], 'unchanged: no report');
    box = { width: 80, height: 40 };
    dom.report();
    assert.deepEqual(heard, ['120×40', '80×40']);
    dom.dispose();
  });
});
