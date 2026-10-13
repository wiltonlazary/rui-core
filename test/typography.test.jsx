// Typography on the DOM and on Skia: Quote, Code, Mark, Highlight,
// List, Prose and Table, with the same text and the same answers.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active, For, View } from 'ren-core';
import { Rui, Quote, Code, Mark, Highlight, List, Prose, Table, Heading, Text, Stack, Link, BASE_THEME, themeOf } from 'rui-core';
import { alpha } from '../src/theme/colors.js';
import { matchRuns } from '../src/core/typography/blocks.jsx';
import { both } from './harness.jsx';
import { items, KIND } from './scene.js';

/** The painted text commands of a Skia view. @param {any} skia */
const painted = skia => (skia.text(), skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'text'));

describe('rui-core typography on the DOM and on Skia', () => {
  it('a block Text strikes through, underlines and leans as its runs do', () => {
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <Text strike>gone</Text>
          <Text underline>marked</Text>
          <Text italic>lean</Text>
          <Text inherit italic>kept</Text>
          <Text inherit underline strike>both</Text>
        </Rui>
      ),
      { width: 300, height: 100 },
    );
    const label = (/** @type {string} */ t) => dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === t);
    assert.match(label('gone').style.textDecoration, /line-through/);
    assert.match(label('marked').style.textDecoration, /underline/);
    const drawn = (/** @type {string} */ t) => items(skia, KIND.Label).find((/** @type {any} */ n) => n.text === t);
    // Skia keeps these as 1 (on), 0 (off) or -1 (inherited).
    assert.equal(drawn('gone').style.strike, 1, 'Skia: struck through');
    assert.notEqual(drawn('gone').style.underline, 1);
    assert.equal(drawn('marked').style.underline, 1);
    assert.equal(label('lean').style.fontStyle, 'italic');
    assert.equal(drawn('lean').style.italic, 1, 'Skia: italic');
    // With `inherit` (the size and color of what holds it), its own face still applies.
    assert.equal(label('kept').style.fontStyle, 'italic', 'inherit: italic');
    assert.match(label('both').style.textDecoration, /underline/);
    assert.match(label('both').style.textDecoration, /line-through/);
    assert.equal(drawn('kept').style.italic, 1, 'Skia, inherit: italic');
    assert.deepEqual([drawn('both').style.underline, drawn('both').style.strike], [1, 1], 'Skia, inherit: underline and strike');
    dispose();
  });

  it('splits text into marked runs, any case, longest term first', () => {
    assert.deepEqual(matchRuns('Watch the tide, then TIDE', ['tide', 'de']), [
      { text: 'Watch the ', marked: false },
      { text: 'tide', marked: true },
      { text: ', then ', marked: false },
      { text: 'TIDE', marked: true },
    ]);
    assert.deepEqual(matchRuns('a.b', '.'), [
      { text: 'a', marked: false },
      { text: '.', marked: true },
      { text: 'b', marked: false },
    ]);
    assert.deepEqual(matchRuns('plain', []), [{ text: 'plain', marked: false }]);
  });

  it('Quote, Code, Mark, Highlight, Prose: the same text and marks', () => {
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <Stack p={30}>
            <Quote color="blue" source="– the workshop rule" icon={<Text>i</Text>}>
              Measure twice and cut once
            </Quote>
            <Code>npm test</Code>
            <Code block>{'const a = 1;\nconst b = 2;'}</Code>
            <Mark>marked</Mark>
            <Highlight match={['box', 'of']}>a box of things</Highlight>
            <Prose>
              <Heading level={4}>Heading</Heading>
              <Text>paragraph</Text>
            </Prose>
          </Stack>
        </Rui>
      ),
      { width: 600, height: 600 },
    );
    const shown = 'i Measure twice and cut once – the workshop rule npm test const a = 1; const b = 2; marked a box of things Heading paragraph';
    assert.equal(dom.text(), shown);
    assert.equal(skia.text(), shown);
    const spans = [...dom.host.querySelectorAll('span:not([data-ren])')];
    const box = spans.find((/** @type {any} */ n) => n.textContent === 'box');
    const marked = spans.find((/** @type {any} */ n) => n.textContent === 'marked');
    const bg = (/** @type {any} */ n) => n.style.background || n.style.backgroundColor;
    assert.ok(bg(box) !== '' && bg(box) === bg(marked), 'Highlight marks as Mark does: a run\'s background');
    assert.equal(dom.nodes('Label').filter((/** @type {any} */ n) => n.textContent === 'a box of things').length, 1, 'the DOM: one Label of spans');
    const runs = painted(skia).filter((/** @type {any[]} */ c) => ['a ', 'box', ' ', 'of', ' things'].includes(c[1]));
    assert.equal(runs.length, 5, 'Skia: a piece a run');
    assert.ok(new Set(runs.map((/** @type {any[]} */ c) => c[3])).size === 1, 'on one line');
    const label = items(skia, KIND.Label).find(n => n.joined === 'a box of things');
    assert.equal(label?.spans.length, 5, 'Skia: one Label of runs');
    const quote = dom.nodes('View').find((/** @type {any} */ n) => n.getAttribute('role') === 'blockquote');
    assert.equal(quote.style.borderLeftWidth, '', 'no bar: the mark sets it off');
    assert.equal(quote.firstElementChild.textContent, 'i', 'its icon at its start, in the flow');
    assert.notEqual(quote.firstElementChild.style.position, 'absolute');
    const code = dom.nodes('Label').filter((/** @type {any} */ n) => n.textContent === 'npm test' || n.textContent.startsWith('const a'));
    assert.equal(code.length, 2);
    for (const n of code) assert.match(n.style.fontFamily, /^var\(--ren-mono, ui-monospace, .*monospace\)$/, 'the monospace stack behind --ren-mono');
    const drawn = items(skia, KIND.Label).filter(n => n.text === 'npm test');
    assert.match(drawn[0].style.fontFamily, /monospace/, 'the canvases draw it in their monospace face');
    dispose();
  });

  it('Highlight: one Label that wraps across its runs, a word spanning a mark', () => {
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <Highlight w={120} match="light" markStyle={{ fontWeight: 700, margin: 4 }}>
            Highlight the lighter parts of this long line
          </Highlight>
        </Rui>
      ),
      { width: 300, height: 300 },
    );
    const text = 'Highlight the lighter parts of this long line';
    const label = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === text);
    assert.ok(label, 'the DOM: one Label');
    const marks = [...label.querySelectorAll('span:not([data-ren])')].filter((/** @type {any} */ n) => n.textContent === 'light');
    assert.equal(marks.length, 2);
    assert.equal(marks[0].style.fontWeight, '700', 'markStyle over the marks');
    assert.equal(marks[0].style.margin, '', 'only its text part');
    const drawn = items(skia, KIND.Label).filter(n => n.joined === text);
    assert.equal(drawn.length, 1, 'Skia: one Label');
    const rows = new Set(painted(skia).map((/** @type {any[]} */ c) => c[3]));
    assert.ok(rows.size >= 3, 'wraps across its runs at 120 px');
    dispose();
  });

  it('Text with inline Link, Code, Mark and Text: one Label of runs; the link presses', () => {
    let pressed = 0;
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <Text w={200}>
            Read the{' '}
            <Link onPress={() => pressed++}>
              docs
            </Link>
            , run <Code>npm test</Code> and <Mark>mark</Mark> it{' '}
            <Text inline fontWeight={700} fg="red">
              now
            </Text>
          </Text>
        </Rui>
      ),
      { width: 400, height: 300 },
    );
    const text = 'Read the docs, run npm test and mark it now';
    assert.equal(dom.text(), text);
    const label = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === text);
    assert.ok(label, 'the DOM: one Label');
    const span = (/** @type {string} */ t) => [...label.querySelectorAll('span:not([data-ren])')].find((/** @type {any} */ n) => n.textContent === t);
    assert.equal(span('docs').style.color, '#4b5ec8', 'the link in the accent');
    assert.match(span('docs').style.textDecoration, /underline/);
    assert.match(span('npm test').style.fontFamily, /^var\(--ren-mono, ui-monospace, .*monospace\)$/, 'code in the monospace stack');
    assert.equal(span('mark').style.backgroundColor || span('mark').style.background, '#fde5c9', 'the mark\'s amber');
    assert.equal(span('now').style.fontWeight, '700', 'a nested Text\'s style props');
    assert.equal(span('now').style.color, '#b63636');
    const drawn = items(skia, KIND.Label).find(n => n.joined === text);
    assert.ok(drawn, 'Skia: one Label');
    assert.equal(drawn.spans.find((/** @type {any} */ s) => text.slice(s.start, s.end) === 'npm test').style.fontFamily.includes('monospace'), true);
    assert.ok(new Set(painted(skia).map((/** @type {any[]} */ c) => c[3])).size >= 2, 'wraps at 200 px');
    span('docs').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.equal(pressed, 1, 'the DOM: the run hears the press');
    skia.press('docs');
    assert.equal(pressed, 2, 'Skia: the run hears the press');
    dispose();
  });

  it('List items with inline marks: one Label each', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <List>
          <List.Item>
            use <Code>pnpm</Code> or <Mark>npm</Mark>
          </List.Item>
        </List>
      </Rui>
    ));
    assert.equal(dom.text(), 'use pnpm or npm');
    assert.equal(dom.nodes('Label').length, 1);
    assert.equal(items(skia, KIND.Label).filter(n => n.joined === 'use pnpm or npm').length, 1);
    dispose();
  });

  it('List: unordered, ordered and nested, markers the same', () => {
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <List ordered indented>
            <List.Item>first</List.Item>
            <List.Item>
              second
              <List marker="circle">
                <List.Item>inner a</List.Item>
                <List.Item>inner b</List.Item>
              </List>
            </List.Item>
            <List.Item icon={<Text>*</Text>}>third</List.Item>
          </List>
          <List>
            <List.Item>dot</List.Item>
          </List>
        </Rui>
      ),
      { height: 400 },
    );
    const shown = '1. first 2. second inner a inner b * third dot';
    assert.equal(dom.text(), shown);
    assert.equal(skia.text(), shown);
    const inner = painted(skia).find((/** @type {any[]} */ c) => c[1] === 'inner a');
    const second = painted(skia).find((/** @type {any[]} */ c) => c[1] === 'second');
    assert.ok(inner[2] > second[2], 'nested: indented');
    assert.ok(inner[3] > second[3], 'below its item');
    const dots = dom.nodes('View').filter((/** @type {any} */ n) => n.style.width === '6px');
    assert.equal(dots.length, 3, 'drawn markers: two circles, one disc');
    dispose();
  });

  it('Table from parts: striped rows, hover, column and table borders', () => {
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <Table striped hoverable bordered lines="both">
            <Table.Head>
              <Table.Row>
                <Table.Heading>Planet</Table.Heading>
                <Table.Heading>Moons</Table.Heading>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              <Table.Row>
                <Table.Cell>Mars</Table.Cell>
                <Table.Cell>2</Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell>Earth</Table.Cell>
                <Table.Cell>1</Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell>Venus</Table.Cell>
                <Table.Cell>0</Table.Cell>
              </Table.Row>
            </Table.Body>
            <Table.Caption>Rocky planets</Table.Caption>
          </Table>
        </Rui>
      ),
      { height: 400 },
    );
    const shown = 'Planet Moons Mars 2 Earth 1 Venus 0 Rocky planets';
    assert.equal(dom.text(), shown);
    assert.equal(skia.text(), shown);
    const cmds = painted(skia);
    const at = (/** @type {string} */ t) => cmds.find((/** @type {any[]} */ c) => c[1] === t);
    assert.equal(at('Moons')[2], at('2')[2], 'columns aligned');
    assert.equal(at('2')[2], at('0')[2]);
    assert.equal(at('Mars')[3], at('2')[3], 'a row on one line');
    // A row is its cells: the stripe, the line under it and the hover are theirs.
    const cell = (/** @type {string} */ t) => dom.nodes('View').find((/** @type {any} */ n) => n.textContent === t);
    const bg = (/** @type {any} */ n) => n.style.background || n.style.backgroundColor;
    assert.equal(bg(cell('Mars')), '', 'the first body row is plain');
    assert.notEqual(bg(cell('Earth')), '', 'every second row is striped, from the second');
    assert.equal(bg(cell('1')), bg(cell('Earth')), 'every cell of it');
    assert.equal(bg(cell('Venus')), '');
    cell('0').dispatchEvent(new dom.window.PointerEvent('pointerenter'));
    $flush(dom.root);
    assert.notEqual(bg(cell('Venus')), '', 'hovering a cell highlights its row');
    assert.equal(bg(cell('Venus')), bg(cell('0')));
    cell('0').dispatchEvent(new dom.window.PointerEvent('pointerleave'));
    $flush(dom.root);
    assert.equal(bg(cell('Venus')), '');
    const padded = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'Mars');
    assert.deepEqual([padded.style.paddingTop, padded.style.paddingLeft], ['8px', '12px'], 'density even: 8 × 12');
    const columnLines = dom.nodes('View').filter((/** @type {any} */ n) => n.style.borderRightWidth === '1px' && n.style.borderLeftWidth !== '1px');
    assert.equal(columnLines.length, 4, 'one line between the two cells of each row: the first cell\'s right border');
    const rowLines = dom.nodes('View').filter((/** @type {any} */ n) => n.style.borderBottomWidth === '1px' && n.style.borderTopWidth !== '1px');
    assert.equal(rowLines.length, 8, 'a line under each row: its cells\' bottom borders');
    const drawn = items(skia, KIND.View);
    assert.equal(drawn.filter(n => n.style.borderRight === 1 && n.style.borderLeft !== 1).length, 4, 'the same borders on Skia');
    assert.equal(drawn.filter(n => n.style.borderBottom === 1 && n.style.borderTop !== 1).length, 8);
    // The row's line runs across: its cells' bottoms meet.
    const box = (/** @type {string} */ t) => items(skia, KIND.Label).find(i => i.text === t).parent.getBoundingClientRect();
    assert.equal(box('Mars').bottom, box('2').bottom);
    assert.equal(box('Mars').right, box('2').left, 'no gap between the cells');
    dispose();
  });

  it('Table columns sized by their content; fixed shares the width; span', () => {
    const view = (/** @type {Record<string, any>} */ extra) => () => (
      <Rui>
        <Table w={400} {...extra}>
          <Table.Head>
            <Table.Row>
              <Table.Heading>Id</Table.Heading>
              <Table.Heading>Description</Table.Heading>
              <Table.Heading>Qty</Table.Heading>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>1</Table.Cell>
              <Table.Cell>A long description of the first item</Table.Cell>
              <Table.Cell>3</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell span={2}>Total</Table.Cell>
              <Table.Cell>3</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </Rui>
    );
    const auto = both(view({}), { width: 480, height: 300 });
    const text = 'Id Description Qty 1 A long description of the first item 3 Total 3';
    assert.equal(auto.dom.text(), text);
    assert.equal(auto.skia.text(), text);
    const cellOf = (/** @type {any} */ skia, /** @type {string} */ t) => items(skia, KIND.Label).find(i => i.text === t).parent.getBoundingClientRect();
    const widths = (/** @type {any} */ skia) => ['Id', 'Description', 'Qty'].map(t => Math.round(cellOf(skia, t).width));
    const [id, desc, qty] = widths(auto.skia);
    // Each column as wide as its widest line here (it fits): the long one the widest. The
    // width left over is shared among the 'auto' tracks (justify-content normal), on the
    // canvases as in the browser: the columns fill the table.
    assert.ok(Math.abs(id + desc + qty - 400) <= 1.5, `the columns fill the table: ${[id, desc, qty]}`);
    assert.ok(desc > 2 * id && desc > 2 * qty, `the long column is the wide one: ${[id, desc, qty]}`);
    assert.equal(Math.round(cellOf(auto.skia, '1').width), id, 'every row shares the columns');
    assert.equal(Math.round(cellOf(auto.skia, 'A long description of the first item').left), Math.round(cellOf(auto.skia, 'Description').left));
    // The stretched tracks are fractional: rounded apart, the two columns may round a pixel over.
    assert.ok(Math.abs(Math.round(cellOf(auto.skia, 'Total').width) - (id + desc)) <= 1, 'span 2: across two columns');
    const grid = auto.dom.nodes('View')[0].style;
    assert.deepEqual([grid.display, grid.gridTemplateColumns], ['grid', 'repeat(3, auto)']);
    assert.equal(auto.dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'Total').style.gridColumn, '1 / span 2', 'a row\'s first cell starts at the first column');
    auto.dispose();

    const fixed = both(view({ fixed: true }), { width: 480, height: 300 });
    const [a, b, c] = widths(fixed.skia);
    assert.ok(Math.abs(a - b) <= 1 && Math.abs(b - c) <= 1, `equal columns: ${[a, b, c]}`);
    assert.equal(fixed.dom.nodes('View')[0].style.gridTemplateColumns, 'repeat(3, minmax(0, 1fr))');
    fixed.dispose();

    // Narrower than the content: the long column wraps, the short ones keep their words.
    const narrow = both(view({ w: 200 }), { width: 480, height: 300 });
    const [n1, n2, n3] = widths(narrow.skia);
    assert.ok(n1 + n2 + n3 <= 200, `within 200: ${[n1, n2, n3]}`);
    // No width left to share: the short columns hug their words, the long one takes the rest.
    const word = (/** @type {string} */ t) => Math.round(items(narrow.skia, KIND.Label).find(i => i.text === t).getBoundingClientRect().width);
    assert.ok(n1 >= word('Id') && n3 >= word('Qty') && n1 < id && n3 < qty && n2 > n1 + n3, `the short columns keep their words: ${[n1, n2, n3]}`);
    const long = cellOf(narrow.skia, 'A long description of the first item');
    assert.ok(long.height > cellOf(narrow.skia, 'Id').height, 'the long text on several lines: its row higher than the header');
    narrow.dispose();
  });

  it('Table from data in a Table.Scroll: the header stays at the top', () => {
    /** @type {any[]} */
    const refs = [];
    const rows = Array.from({ length: 12 }, (_, i) => [`row ${i}`, String(i * 10)]);
    const view = () => {
      const ref = $signal($active(), null);
      refs.push(ref);
      return (
        <Rui>
          <Table.Scroll maxHeight={150} ref={ref}>
            <Table sticky data={{ columns: ['Name', 'Value'], rows, caption: 'numbers' }} />
          </Table.Scroll>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.match(dom.text(), /^Name Value row 0 0 row 1 10 .* row 11 110 numbers$/);
    // Skia paints what the Scroll shows, the sticky header cells (stacking contexts) last.
    assert.match(skia.text(), /^row 0 0 row 1 10 .*Name Value$/);
    const header = () => painted(skia).find((/** @type {any[]} */ c) => c[1] === 'Name');
    const before = header()[3];
    const scroll = $read(refs[1]);
    scroll.scrollTop = 60;
    $flush(skia.root);
    assert.ok(Math.abs(header()[3] - before) < 1, `Skia: the header stays (${before} → ${header()[3]})`);
    const row0 = painted(skia).find((/** @type {any[]} */ c) => c[1] === 'row 3');
    assert.ok(row0 !== undefined, 'the rows moved under it');
    const heads = dom.nodes('View').filter((/** @type {any} */ n) => (n.textContent === 'Name' || n.textContent === 'Value') && n.style.position === 'sticky');
    assert.deepEqual(heads.map((/** @type {any} */ n) => [n.style.position, n.style.top]), [['sticky', '0px'], ['sticky', '0px']], 'DOM: sticky cells, the browser holds them');
    const sticky = items(skia, KIND.View).filter(n => n.style.position === 2);
    assert.equal(sticky.length, 2, 'Skia: the two header cells sticky');
    dispose();
  });
});

describe('rui-core typography: rui\'s own headings, marks and quotes', () => {
  it('Heading takes its level\'s size and leading from headings.levels; Mark is amber', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Heading level={1}>One</Heading>
        <Heading level={2} size={4}>Two as four</Heading>
        <Mark>marked</Mark>
        <Quote source="the saying">Well begun is half done</Quote>
        <Quote icon={{ size: 24 }}>Sized</Quote>
        <Quote icon={false}>Bare</Quote>
        <Quote source={<Link href="/talk">the talk</Link>}>Linked</Quote>
      </Rui>
    ));
    const [one, two] = dom.nodes('Label');
    assert.deepEqual([one.style.fontSize, one.style.fontWeight, two.style.fontSize], ['36px', '700', '19px']);
    assert.equal(two.getAttribute('aria-level'), '2');
    const mark = [...dom.host.querySelectorAll('span:not([data-ren])')].find((/** @type {any} */ n) => n.textContent === 'marked');
    assert.equal(mark.style.backgroundColor || mark.style.background, '#fde5c9', 'amber.1');
    const [quote, sized, bare, linked] = [...dom.document.querySelectorAll('[role="blockquote"]')];
    const glyph = quote.firstElementChild;
    assert.equal(glyph.textContent, '\u201C', 'an opening quotation mark at its start');
    assert.equal(glyph.getAttribute('aria-hidden'), 'true', 'the mark is decoration');
    assert.deepEqual([glyph.style.fontSize, glyph.style.color], ['36px', '#4b5ec8'], 'the first heading\'s size, in the tone (the accent)');
    assert.deepEqual([quote.style.paddingTop, quote.style.paddingLeft, quote.style.columnGap || quote.style.gap], ['16px', '24px', '12px'], 'padded md by lg; the mark sm from the text');
    assert.equal(quote.textContent, '\u201CWell begun is half donethe saying', 'the source under the text');
    assert.equal(sized.firstElementChild.style.fontSize, '24px', 'icon={{ size }}');
    assert.equal(bare.textContent, 'Bare', 'icon={false}: no mark');
    assert.equal(linked.querySelector('[role="link"], a')?.textContent, 'the talk', 'a source of any content');
    const drawn = items(skia, KIND.Label).filter(n => n.text === '\u201C');
    assert.deepEqual(drawn.map(n => n.style.fontSize), [36, 24, 36], 'the same marks on Skia');
    dispose();
  });

  it('Table data: columns, rows and totals', () => {
    const { dom, dispose } = both(() => (
      <Rui>
        <Table data={{ columns: ['Moon', 'Days'], rows: [['Io', '1.8'], ['Europa', '3.6']], totals: ['Two', '5.4'] }} />
      </Rui>
    ));
    assert.equal(dom.text(), 'Moon Days Io 1.8 Europa 3.6 Two 5.4');
    assert.equal(dom.document.querySelectorAll('[role="columnheader"]').length, 2);
    assert.equal(dom.document.querySelectorAll('[role="rowheader"]').length, 2, 'the totals row: header cells');
    dispose();
  });

  it('Code, Mark and Table read their numbers from the theme', () => {
    const view = (/** @type {any} */ theme, /** @type {'light' | 'dark'} */ scheme) => () => (
      <Rui theme={theme} scheme={scheme}>
        <Code>npm test</Code>
        <Mark>marked</Mark>
        <Table data={{ columns: ['Moon', 'Days'], rows: [['Io', '1.8']] }} />
      </Rui>
    );
    const look = (/** @type {any} */ theme, /** @type {'light' | 'dark'} */ scheme) => {
      const { dom, dispose } = both(view(theme, scheme));
      const code = dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === 'npm test');
      const mark = [...dom.host.querySelectorAll('span:not([data-ren])')].find((/** @type {any} */ n) => n.textContent === 'marked');
      const cell = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'Io');
      const out = {
        code: [code.style.paddingTop, code.style.paddingLeft],
        mark: mark.style.backgroundColor || mark.style.background,
        cell: [cell.style.paddingTop, cell.style.paddingLeft],
      };
      dispose();
      return out;
    };
    const base = look(BASE_THEME, 'dark');
    assert.deepEqual(base.code, ['1px', '9px'], 'inline Code: 1 by ratios.pad of its font (12 × .75)');
    assert.equal(base.mark, alpha(BASE_THEME.colors.amber[6], BASE_THEME.opacity.soft), 'a dark Mark: amber.6 at opacity.soft');
    assert.deepEqual(base.cell, ['8px', '12px'], 'a cell: control.density.even');
    const own = look(themeOf({ ratios: { pad: 1 }, opacity: { soft: 0.5 }, control: { density: { even: [6, 10] } } }), 'dark');
    assert.deepEqual(own.code, ['1px', '12px'], 'ratios.pad sets inline Code\'s side padding');
    assert.equal(own.mark, alpha(BASE_THEME.colors.amber[6], 0.5), 'opacity.soft sets the dark Mark');
    assert.deepEqual(own.cell, ['6px', '10px'], 'control.density sets the cells');
  });
});

describe('Table rows keep their own lines', () => {
  it('a short row lets no cell of the next row flow up into it (Skia and the DOM\'s grid placement)', () => {
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <Table w={300}>
            <Table.Body>
              <Table.Row>
                <Table.Cell>a1</Table.Cell>
                <Table.Cell>b1</Table.Cell>
                <Table.Cell>c1</Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell>a2</Table.Cell>
                <Table.Cell>b2</Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell>a3</Table.Cell>
                <Table.Cell>b3</Table.Cell>
                <Table.Cell>c3</Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table>
        </Rui>
      ),
      { width: 480, height: 300 },
    );
    const at = (/** @type {string} */ t) => {
      skia.text();
      const r = items(skia, KIND.Label).find(i => i.text === t).parent.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top)];
    };
    assert.equal(at('a3')[0], at('a1')[0], 'a3 in the first column');
    assert.ok(at('a3')[1] > at('a2')[1], 'on a line below a2');
    // The DOM places cells with CSS grid the same way: each row's first cell starts a line at the first column.
    const cell = (/** @type {string} */ t) => dom.nodes('View').find((/** @type {any} */ n) => n.textContent === t);
    assert.deepEqual(['a1', 'a2', 'a3', 'b3'].map(t => cell(t).style.gridColumn), ['1 / span 1', '1 / span 1', '1 / span 1', '']);
    dispose();
  });
});

describe('a Table has as many columns as its widest row now', () => {
  /** Where a cell sits on Skia. @param {any} skia @param {string} t */
  const at = (skia, t) => {
    skia.text();
    const r = items(skia, KIND.Label).find(i => i.text === t).parent.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top)];
  };
  it('data with fewer columns: the tracks shrink with it', () => {
    /** @type {any[]} */
    const data = [];
    const { dom, skia, dispose } = both(
      () => {
        const d = $signal($active(), { columns: ['A', 'B', 'C'], rows: [['a1', 'b1', 'c1']] });
        data.push(d);
        return (
          <Rui>
            <Table w={300} data={d} />
          </Rui>
        );
      },
      { width: 480, height: 300 },
    );
    for (const d of data) $write(d, { columns: ['X', 'Y'], rows: [['x1', 'y1'], ['x2', 'y2']] });
    $flush(skia.root);
    $flush(dom.root);
    assert.equal(at(skia, 'x1')[0], at(skia, 'X')[0], 'x1 under X');
    assert.equal(at(skia, 'y2')[0], at(skia, 'Y')[0], 'y2 under Y');
    assert.equal(dom.nodes('View')[0].style.gridTemplateColumns, 'repeat(2, auto)', 'two tracks on the DOM');
    dispose();
  });
  it('rows built of parts, in a list that loses its widest row', () => {
    /** @type {any[]} */
    const rows = [];
    const { dom, skia, dispose } = both(
      () => {
        const list = $signal($active(), [['a', 'b', 'c'], ['d', 'e']]);
        rows.push(list);
        return (
          <Rui>
            <Table w={300}>
              <Table.Body>
                <For each={() => $read(list)}>
                  {(/** @type {() => string[]} */ r) => (
                    <Table.Row>
                      {r().map(c => (
                        <Table.Cell>{c}</Table.Cell>
                      ))}
                    </Table.Row>
                  )}
                </For>
              </Table.Body>
            </Table>
          </Rui>
        );
      },
      { width: 480, height: 300 },
    );
    assert.equal(dom.nodes('View')[0].style.gridTemplateColumns, 'repeat(3, auto)');
    for (const list of rows) $write(list, [['d', 'e']]);
    $flush(skia.root);
    $flush(dom.root);
    assert.equal(dom.nodes('View')[0].style.gridTemplateColumns, 'repeat(2, auto)', 'the widest row gone: two tracks');
    dispose();
  });
});

describe('a cell\'s w sizes its column', () => {
  it('in a table wider than its content, each row\'s cells meet edge to edge, their lines whole (Skia and the DOM)', () => {
    const planets = [['Mercury', '4,879', '0'], ['Venus', '12,104', '0'], ['Earth', '12,742', '1']];
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <View style={{ width: 680 }}>
            <Table>
              <Table.Head>
                <Table.Row>
                  <Table.Heading w={120}>Planet</Table.Heading>
                  <Table.Heading>Diameter (km)</Table.Heading>
                  <Table.Heading w={90}>Moons</Table.Heading>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {planets.map(([n, d, m]) => (
                  <Table.Row>
                    <Table.Cell w={120}>{n}</Table.Cell>
                    <Table.Cell>{d}</Table.Cell>
                    <Table.Cell w={90}>{m}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </View>
        </Rui>
      ),
      { width: 720, height: 400 },
    );
    skia.text();
    const cellOf = (/** @type {string} */ t) => items(skia, KIND.Label).find(i => i.text === t).parent.getBoundingClientRect();
    for (const row of [['Planet', 'Diameter (km)', 'Moons'], ...planets]) {
      const r = row.map(cellOf);
      assert.equal(Math.round(r[0].left), 0, `${row[0]}: from the table's start`);
      assert.equal(Math.round(r[0].right), Math.round(r[1].left), `${row[0]}: no gap after the first cell`);
      assert.equal(Math.round(r[1].right), Math.round(r[2].left), `${row[0]}: no gap after the second`);
      assert.equal(Math.round(r[2].right), 680, `${row[0]}: to the table's end`);
      assert.ok(r[0].width >= 120 && r[2].width >= 90, `${row[0]}: each column at least its w`);
    }
    // The DOM: the columns carry the widths, the cells none of their own (they stretch across their tracks).
    const table = dom.nodes('View').find((/** @type {any} */ n) => n.getAttribute('role') === 'table');
    assert.equal(table.style.gridTemplateColumns, 'minmax(120px, auto) auto minmax(90px, auto)');
    const mercury = dom.nodes('View').find((/** @type {any} */ n) => n.textContent === 'Mercury');
    assert.equal(mercury.style.width, '', 'no width of its own');
    dispose();
  });
  it('a column keeps its widest word: unbreakable code never runs into the next column; fixed columns may cut it', () => {
    const view = (/** @type {boolean} */ fixed) => () => (
      <Rui>
        <View style={{ width: 300 }}>
          <Table fixed={fixed}>
            <Table.Body>
              <Table.Row>
                <Table.Cell>Called with the new value as it changes</Table.Cell>
                <Table.Cell>
                  <Code>onValueChange</Code>
                </Table.Cell>
                <Table.Cell>Next</Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table>
        </View>
      </Rui>
    );
    const { dom, skia, dispose } = both(view(false), { width: 480, height: 300 });
    skia.text();
    const label = (/** @type {string} */ t) => items(skia, KIND.Label).find(i => i.text === t);
    const code = label('onValueChange').getBoundingClientRect();
    const first = label('Called with the new value as it changes').parent.getBoundingClientRect();
    const next = label('Next').parent.getBoundingClientRect();
    assert.ok(code.left >= first.right - 0.5, `the code starts after the first column: ${code.left} < ${first.right}`);
    assert.ok(code.right <= next.left + 0.5, `the code ends before the next column (Skia): ${code.right} > ${next.left}`);
    assert.ok(next.right <= 300.5, `the table within its box: ${next.right}`);
    // The DOM: the cells keep the grid's automatic minimum (their content's), no min-width of their own.
    const cells = dom.nodes('View').filter((/** @type {any} */ n) => n.getAttribute('role') === 'cell');
    assert.deepEqual(cells.map((/** @type {any} */ n) => n.style.minWidth), ['', '', '']);
    dispose();
    const cut = both(view(true), { width: 480, height: 300 });
    const fixedCells = cut.dom.nodes('View').filter((/** @type {any} */ n) => n.getAttribute('role') === 'cell');
    assert.deepEqual(fixedCells.map((/** @type {any} */ n) => n.style.minWidth), ['0px', '0px', '0px'], 'fixed: equal columns, a cell as narrow as its share');
    cut.dispose();
  });

  it('with fixed, a w column is at least w and shares the rest; a spanning cell\'s w is its least width', () => {
    const { dom, skia, dispose } = both(
      () => (
        <Rui>
          <View style={{ width: 400 }}>
            <Table fixed>
              <Table.Body>
                <Table.Row>
                  <Table.Cell w={200}>a</Table.Cell>
                  <Table.Cell>b</Table.Cell>
                  <Table.Cell>c</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell span={2} w={300}>
                    ab
                  </Table.Cell>
                  <Table.Cell>c2</Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table>
          </View>
        </Rui>
      ),
      { width: 480, height: 300 },
    );
    skia.text();
    const cellOf = (/** @type {string} */ t) => items(skia, KIND.Label).find(i => i.text === t).parent.getBoundingClientRect();
    assert.ok(cellOf('a').width >= 199.5, `a at least 200: ${cellOf('a').width}`);
    assert.equal(Math.round(cellOf('b').width), Math.round(cellOf('c').width), 'the others share the rest equally');
    assert.ok(cellOf('ab').width >= 299.5, `the spanning cell at least 300: ${cellOf('ab').width}`);
    const table = dom.nodes('View').find((/** @type {any} */ n) => n.getAttribute('role') === 'table');
    assert.equal(table.style.gridTemplateColumns, 'minmax(200px, 1fr) minmax(0, 1fr) minmax(0, 1fr)');
    dispose();
  });
});

describe('a reactive w moves its column', () => {
  for (const [name, start] of /** @type {[string, number | undefined][]} */ ([['from 100', 100], ['from none', undefined]])) {
    it(`a w that changes ${name} to 500: the column follows (Skia and the DOM)`, () => {
      /** @type {any[]} */
      const ws = [];
      const { dom, skia, dispose } = both(
        () => {
          const w = $signal($active(), /** @type {number | undefined} */ (start));
          ws.push(w);
          return (
            <Rui>
              <View style={{ width: 600 }}>
                <Table>
                  <Table.Body>
                    <Table.Row>
                      <Table.Cell w={() => $read(w)}>a</Table.Cell>
                      <Table.Cell>b</Table.Cell>
                    </Table.Row>
                  </Table.Body>
                </Table>
              </View>
            </Rui>
          );
        },
        { width: 700, height: 300 },
      );
      const table = () => dom.nodes('View').find((/** @type {any} */ n) => n.getAttribute('role') === 'table');
      assert.equal(table().style.gridTemplateColumns, start === undefined ? 'repeat(2, auto)' : 'minmax(100px, auto) auto');
      for (const w of ws) $write(w, 500);
      $flush(skia.root);
      $flush(dom.root);
      skia.text();
      assert.equal(table().style.gridTemplateColumns, 'minmax(500px, auto) auto', 'the DOM template follows');
      const a = items(skia, KIND.Label).find(i => i.text === 'a').parent.getBoundingClientRect();
      assert.ok(a.width >= 499.5, `Skia: the column at least 500 (${a.width})`);
      dispose();
    });
  }
});
