// OverflowList on the DOM and on Skia: which items stay, where the overflow
// item goes and what it counts, how it follows resizes and new data, and
// that the count settles without swinging, frame by frame on a manual clock.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active } from 'ren-core';
import { $json } from 'ren-json';
import { Rui, Clock, manualClock, Text, OverflowList, BASE_THEME, themeOf } from 'rui-core';
import { both, onDom, onSkia } from './harness.jsx';

const FRUITS = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape'];

/**
 * Gives happy-dom boxes (it lays nothing out): 8 px a character of text,
 * `width` for the list itself (the View whose overflow is hidden).
 * @param {any} dom @param {() => number} width
 */
function boxes(dom, width) {
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    const w = this.style.overflow === 'hidden' ? width() : this.textContent.length * 8;
    return { x: 0, y: 0, left: 0, top: 0, width: w, height: 20, right: w, bottom: 20 };
  };
}

/** A fruit as an item. @param {string} name */
const item = name => <Text>{name}</Text>;

/**
 * A list on the DOM in a manual clock, with happy-dom boxes.
 * @param {Record<string, any>} props @param {number | (() => number)} [width] @param {any} [theme]
 */
function domList(props, width = 200, theme) {
  const clock = manualClock();
  const dom = onDom(() => (
    <Clock value={clock}>
      <Rui theme={theme}>
        <OverflowList data={FRUITS} renderItem={item} {...props} />
      </Rui>
    </Clock>
  ));
  boxes(dom, typeof width === 'function' ? width : () => width);
  return { dom, clock };
}

/** Runs `frames` frames and flushes. @param {any} side @param {any} clock @param {number} [frames] */
function frames(side, clock, frames = 3) {
  for (let i = 0; i < frames; i++) {
    clock.advance(16);
    $flush(side.root);
    side.text();
  }
}

describe('OverflowList on the DOM and on Skia', () => {
  it('fits its items inside its padding and its border alike', () => {
    // A box of 78 px: two items of 32 and a gap of 12 need 76, which a 2 px inset on each side leaves no room for.
    for (const style of [{ padding: 2 }, { border: 2 }, { borderLeft: 2, borderRight: 2 }]) {
      const { dom, clock } = domList({ data: ['aaaa', 'bbbb'], gap: 12, style }, 78);
      frames(dom, clock, 4);
      assert.notEqual(dom.text(), 'aaaa bbbb', `${JSON.stringify(style)}: the second item does not fit`);
      dom.dispose();
    }
    const { dom, clock } = domList({ data: ['aaaa', 'bbbb'], gap: 12 }, 78);
    frames(dom, clock, 4);
    assert.equal(dom.text(), 'aaaa bbbb', 'without an inset both fit');
    dom.dispose();
  });

  it('shows every item before layout, then keeps a prefix and counts the rest', () => {
    const clock = manualClock();
    const { dom, skia, dispose } = both(() => (
      <Clock value={clock}>
        <Rui>
          <OverflowList data={FRUITS} renderItem={item} w={200} />
        </Rui>
      </Clock>
    ));
    boxes(dom, () => 200);
    assert.equal(dom.text(), FRUITS.join(' '), 'not laid out: all show');
    frames(dom, clock);
    frames(skia, clock);
    // 8 px a character, 12 px gaps: apple, banana and cherry take 160 px; date would end at 204.
    assert.equal(dom.text(), 'apple banana cherry +4');
    // On Skia the font's widths decide; still a prefix and a count of the rest.
    const words = skia.text().split(' ');
    const kept = words.slice(0, -1);
    assert.ok(kept.length > 0 && kept.length < FRUITS.length, skia.text());
    assert.deepEqual(kept, FRUITS.slice(0, kept.length));
    assert.equal(words.at(-1), `+${FRUITS.length - kept.length}`);
    dispose();
  });

  it('limit: at most that many show even with room for all', () => {
    const { dom, clock } = domList({ limit: 2 }, 2000);
    frames(dom, clock);
    assert.equal(dom.text(), 'apple banana +5');
    dom.dispose();
  });

  it("fold 'start': the last items stay, the overflow item before them", () => {
    const { dom, clock } = domList({ fold: 'start' });
    frames(dom, clock);
    // +4 (16 px) then fig, grape and... elderberry would not fit: 16 + 12 + 80 + 12 + 24 + 12 + 40 = 196.
    assert.equal(dom.text(), '+4 elderberry fig grape');
    dom.dispose();
  });

  it("fold 'middle': head and tail runs with the folded items between, in data order", () => {
    /** @type {any[][]} */
    const given = [];
    const { dom, clock } = domList({
      fold: 'middle',
      data: ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt', 'f.txt', 'g.txt'],
      renderMore: (/** @type {any[]} */ hidden) => (given.push(hidden), <Text>{`+${hidden.length}`}</Text>),
    });
    frames(dom, clock);
    // 40 px a name, 12 px gaps, 16 px for +4: three names and the count take 188 px, four and it 240.
    // Three: the head takes ceil(3 / 2) = 2, the tail floor(3 / 2) = 1.
    assert.equal(dom.text(), 'a.txt b.txt +4 g.txt');
    assert.deepEqual(given.at(-1), ['c.txt', 'd.txt', 'e.txt', 'f.txt']);
    dom.dispose();
  });

  it('lines: 2 keeps more items than one line and wraps the row', () => {
    const one = domList({});
    frames(one.dom, one.clock);
    const two = domList({ lines: 2 });
    frames(two.dom, two.clock);
    const count = (/** @type {string} */ t) => t.split(' ').filter(w => !w.startsWith('+')).length;
    assert.ok(count(two.dom.text()) > count(one.dom.text()), `${two.dom.text()} / ${one.dom.text()}`);
    // Line one: apple banana cherry (160); line two: date elderberry fig (148) and +1 (164).
    assert.equal(two.dom.text(), 'apple banana cherry date elderberry fig +1');
    const list = (/** @type {any} */ dom) => dom.nodes('View').find((/** @type {any} */ n) => n.style.overflow === 'hidden');
    assert.equal(list(two.dom).style.flexWrap, 'wrap');
    assert.notEqual(list(one.dom).style.flexWrap, 'wrap');
    one.dom.dispose();
    two.dom.dispose();
  });

  it('the default overflow item: +N named "N more"; a custom one gets the hidden items', async () => {
    const { dom, clock } = domList({});
    frames(dom, clock);
    const more = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === '+4');
    assert.equal(more.getAttribute('aria-label'), '4 more');
    dom.dispose();
    /** @type {any[][]} */
    const given = [];
    const custom = domList({ renderMore: (/** @type {any[]} */ hidden) => (given.push(hidden), <Text>{`…${hidden.length}`}</Text>) });
    frames(custom.dom, custom.clock);
    assert.deepEqual(given.at(-1), ['date', 'elderberry', 'fig', 'grape']);
    assert.match(custom.dom.text(), /…4$/);
    custom.dom.dispose();
    // As data (no layout, so up to the limit shows): the folded items are gone, the count is named.
    const out = await $json(() => (
      <Rui>
        <OverflowList data={FRUITS} renderItem={item} limit={2} />
      </Rui>
    ));
    const text = JSON.stringify(out);
    assert.match(text, /apple/);
    assert.match(text, /banana/);
    assert.doesNotMatch(text, /cherry|grape/);
    assert.match(text, /5 more/);
  });

  it('resizes: narrower keeps fewer, wider more; a resize that keeps the width does nothing', () => {
    const clock = manualClock();
    /** @type {any} */
    let width = null;
    /** @type {any} */
    let height = null;
    const skia = onSkia(
      () => {
        width = $signal($active(), 300);
        height = $signal($active(), 40);
        return (
          <Clock value={clock}>
            <Rui>
              <OverflowList data={FRUITS} renderItem={item} w={() => $read(width)} h={() => $read(height)} />
            </Rui>
          </Clock>
        );
      },
      { width: 600 },
    );
    const kept = () => skia.text().split(' ').filter(w => !w.startsWith('+')).length;
    frames(skia, clock);
    const wide = kept();
    $write(width, 150);
    frames(skia, clock);
    const narrow = kept();
    assert.ok(narrow < wide, `${narrow} < ${wide}`);
    $write(width, 600);
    frames(skia, clock);
    assert.ok(kept() > wide, `${kept()} > ${wide}`);
    assert.equal(clock.pending(), 0, 'settled');
    $write(height, 60);
    $flush(skia.root);
    skia.text();
    assert.equal(clock.pending(), 0, 'the width kept: no settle');
    skia.dispose();
  });

  it('new data shows every item again, then settles with fresh widths', () => {
    const clock = manualClock();
    /** @type {any} */
    let list = null;
    const dom = onDom(() => {
      list = $signal($active(), FRUITS);
      return (
        <Clock value={clock}>
          <Rui>
            <OverflowList data={() => $read(list)} renderItem={item} />
          </Rui>
        </Clock>
      );
    });
    boxes(dom, () => 200);
    frames(dom, clock);
    assert.equal(dom.text(), 'apple banana cherry +4');
    $write(list, ['kiwi', 'lime', 'mango', 'nectarine', 'orange', 'papaya']);
    $flush(dom.root);
    assert.equal(dom.text(), 'kiwi lime mango nectarine orange papaya', 'all show to be measured');
    frames(dom, clock);
    // 32 + 12 + 32 + 12 + 40 + 12 + 72 = 212 does not fit, so three and +3.
    assert.equal(dom.text(), 'kiwi lime mango +3');
    dom.dispose();
  });

  it('an item wider than the list: only the overflow item shows', () => {
    const { dom, clock } = domList({ data: ['watermelon', 'fig'] }, 60);
    frames(dom, clock);
    assert.equal(dom.text(), '+2');
    dom.dispose();
  });

  it('a wide overflow item: settles within two frames and stays', () => {
    /** @type {number[]} */
    const counts = [];
    const { dom, clock } = domList({ renderMore: (/** @type {any[]} */ hidden) => (counts.push(hidden.length), <Text>{`and ${hidden.length} more fruits`}</Text>) });
    clock.advance(16);
    $flush(dom.root);
    clock.advance(16);
    $flush(dom.root);
    const settled = dom.text();
    // With the 136 px overflow item: apple (40) and it take 188 px; banana would not fit.
    assert.equal(settled, 'apple and 6 more fruits');
    frames(dom, clock, 10);
    assert.equal(dom.text(), settled, 'no swing');
    assert.equal(clock.pending(), 0);
    // Counts only fall once the overflow item shows.
    const after = counts.slice(counts.indexOf(4));
    for (let i = 1; i < after.length; i++) assert.ok(after[i] >= after[i - 1], counts.join());
    dom.dispose();
  });

  it('the gap is spacing.sm by default, and follows the theme', () => {
    const plain = domList({});
    frames(plain.dom, plain.clock);
    const list = (/** @type {any} */ dom) => dom.nodes('View').find((/** @type {any} */ n) => n.style.overflow === 'hidden');
    assert.equal(list(plain.dom).style.gap, `${BASE_THEME.spacing.sm}px`);
    const roomy = domList({}, 200, themeOf({ spacing: { sm: 40 } }));
    frames(roomy.dom, roomy.clock);
    assert.equal(list(roomy.dom).style.gap, '40px');
    // 40 + 40 + 48 = 128, then + 40 + 48 = 216: two fit with +5 (16 + 40 = 184).
    assert.equal(roomy.dom.text(), 'apple banana +5');
    plain.dom.dispose();
    roomy.dom.dispose();
  });
});
