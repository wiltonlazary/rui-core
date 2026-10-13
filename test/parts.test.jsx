// The components that lay their children out one by one follow them as
// rendered (ren-core's $parts), on the DOM and on Skia: Button.Group and
// IconButton.Group draw a line between two, Breadcrumbs a separator, Row
// `fill` a share each; a For's items count one by one, an accessor's
// parts too, and a Show showing nothing counts none.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active, For, Show } from 'ren-core';
import { Rui, Button, IconButton, CheckIcon, Breadcrumbs, Link, Row, Text } from 'rui-core';
import { both } from './harness.jsx';
import { KIND } from './scene.js';

/** The Skia items right under a frame, markers left out. @param {any} frame */
function kids(frame) {
  const out = [];
  for (let c = frame.first; c !== null; c = c.next) if (c.kind === KIND.View || c.kind === KIND.Action || c.kind === KIND.Label) out.push(c);
  return out;
}

/** The DOM children of a node that are primitives. @param {any} node */
const domKids = node => [...node.children].filter((/** @type {any} */ n) => n.hasAttribute('data-ren'));

/** What a group's frame holds, in order: 'line' for a drawn line, else the child's text, on both. @param {any[]} refs @param {any} dom @param {any} skia */
function joined(refs, dom, skia) {
  dom.text();
  skia.text();
  const onDom = domKids(refs[0]).map((/** @type {any} */ n) => (n.getAttribute('data-ren') === 'View' && n.children.length === 0 ? 'line' : n.textContent || n.getAttribute('aria-label')));
  const onSkia = kids(refs[1]).map(k => (k.kind === KIND.View && k.first === null ? 'line' : k.text || k.label || kids(k).map(c => c.text).join('')));
  return [onDom, onSkia];
}

describe('children as rendered', () => {
  it('Button.Group: a line between a For\'s items and an accessor\'s parts, none for an empty Show; the items are grouped', () => {
    /** @type {any[]} */
    const refs = [];
    /** @type {any[]} */
    const lists = [];
    /** @type {string[]} */
    const pressed = [];
    const { dom, skia, dispose } = both(() => {
      const list = $signal($active(), ['b', 'c']);
      lists.push(list);
      return (
        <Rui>
          <Button.Group ref={(/** @type {any} */ n) => refs.push(n)}>
            <Button>a</Button>
            <For each={() => $read(list)}>{(/** @type {() => string} */ x) => <Button onPress={() => pressed.push(x())}>{x}</Button>}</For>
            <Show when={false}>
              <Button>never</Button>
            </Show>
            {() => ($read(list).length > 1 ? [<Button>d</Button>, <Button>e</Button>] : null)}
          </Button.Group>
        </Rui>
      );
    });
    const shown = ['a', 'line', 'b', 'line', 'c', 'line', 'd', 'line', 'e'];
    assert.deepEqual(joined(refs, dom, skia), [shown, shown]);
    // A grouped child draws no border: the For's rows were built in the group.
    const button = kids(refs[1]).find(k => k.kind === KIND.Action && k.text === 'b');
    assert.equal(button.style.borderTop, 0, 'Skia: grouped');
    const domButton = domKids(refs[0]).find((/** @type {any} */ n) => n.textContent === 'b');
    assert.equal(domButton.style.borderWidth || domButton.style.borderTopWidth, '0px', 'DOM: grouped');
    dom.press('c');
    skia.press('c');
    assert.deepEqual(pressed, ['c', 'c']);
    for (const list of lists) $write(list, ['b']);
    $flush(dom.root);
    $flush(skia.root);
    const fewer = ['a', 'line', 'b'];
    assert.deepEqual(joined(refs, dom, skia), [fewer, fewer], 'the lines follow the items as they change');
    dispose();
  });

  it('IconButton.Group: a line between a For\'s items, none for an empty Show', () => {
    /** @type {any[]} */
    const refs = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <IconButton.Group ref={(/** @type {any} */ n) => refs.push(n)}>
          <Show when={false}>
            <IconButton label="never">
              <CheckIcon />
            </IconButton>
          </Show>
          <For each={['x', 'y']}>
            {(/** @type {() => string} */ name) => (
              <IconButton label={name}>
                <CheckIcon />
              </IconButton>
            )}
          </For>
        </IconButton.Group>
      </Rui>
    ));
    const shown = ['x', 'line', 'y'];
    assert.deepEqual(joined(refs, dom, skia), [shown, shown]);
    dispose();
  });

  it('Breadcrumbs: a separator between a For\'s items and an accessor\'s parts, none for an empty Show; the last is the page', () => {
    /** @type {any[]} */
    const lists = [];
    const { dom, skia, dispose } = both(() => {
      const list = $signal($active(), ['Docs', 'Guides']);
      lists.push(list);
      return (
        <Rui>
          <Breadcrumbs>
            <Link href="#home">Home</Link>
            <Show when={false}>
              <Link href="#never">Never</Link>
            </Show>
            <For each={() => $read(list)}>{(/** @type {() => string} */ x) => <Link href={() => `#${x()}`}>{x}</Link>}</For>
            {() => <Text>Here</Text>}
          </Breadcrumbs>
        </Rui>
      );
    });
    assert.equal(dom.text(), 'Home › Docs › Guides › Here');
    assert.equal(skia.text(), dom.text());
    const current = () => [...dom.host.querySelectorAll('[role="listitem"]')].map((/** @type {any} */ n) => n.getAttribute('aria-current'));
    assert.deepEqual(current(), [null, null, null, 'page']);
    for (const list of lists) $write(list, []);
    assert.equal(dom.text(), 'Home › Here');
    assert.equal(skia.text(), dom.text());
    assert.deepEqual(current(), [null, 'page']);
    dispose();
  });

  it('Row fill: a share for each of a For\'s items and an accessor\'s parts, none for an empty Show', () => {
    /** @type {any[]} */
    const refs = [];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Row fill gap={0} w={400} ref={(/** @type {any} */ n) => refs.push(n)}>
          <Text>a</Text>
          <Show when={false}>
            <Text>never</Text>
          </Show>
          <For each={['b', 'c', 'd']}>{(/** @type {() => string} */ x) => <Text>{x}</Text>}</For>
          {() => [<Text>e</Text>]}
        </Row>
      </Rui>
    ));
    assert.equal(dom.text(), 'a b c d e');
    assert.equal(skia.text(), 'a b c d e');
    assert.equal(domKids(refs[0]).length, 5, 'DOM: five shares');
    const shares = kids(refs[1]);
    assert.equal(shares.length, 5, 'Skia: five shares');
    assert.deepEqual(shares.map(s => Math.round(s.getBoundingClientRect().width)), [80, 80, 80, 80, 80], 'equal shares of the row');
    dispose();
  });
});
