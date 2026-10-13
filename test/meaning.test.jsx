// What rui-core's components mean, read through ren-json's `$json`: the
// data an AI agent or a tool sees (roles, levels, names, states, values),
// with the visual hierarchy dissolved. Each test asserts the meaning of
// representative components, not whole trees.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $json } from 'ren-json';
import {
  Rui,
  Stack,
  Surface,
  Heading,
  Text,
  Link,
  Code,
  Quote,
  List,
  Table,
  Badge,
  Avatar,
  Image,
  Accordion,
  DataList,
  Timeline,
  DigitRoll,
  TextInput,
  PasswordInput,
  NumberInput,
  Checkbox,
  Radio,
  Switch,
  Chip,
  SegmentedControl,
  Slider,
  Rating,
  Select,
  MultiSelect,
  FieldGroup,
  Button,
  CloseButton,
  Tabs,
  NavItem,
  Breadcrumbs,
  Pagination,
  Stepper,
  NavToggle,
  Tree,
  Shell,
  Divider,
  Alert,
  Notification,
  Progress,
  Ring,
  Arc,
  Loader,
  Skeleton,
  Busy,
  Modal,
  Tooltip,
  Menu,
  Panes,
} from 'rui-core';
import { BarChart, DonutChart, Bars, AreaChart, LineChart, MixedChart, RadarChart, PieChart, RadialBarChart, FunnelChart, ScatterChart, BubbleChart, Sparkline, Heatmap } from 'rui-core/charts';
import { Calendar, DateSelect, TimePicker } from 'rui-core/dates';
import { Carousel } from 'rui-core/carousel';
import { Snippet } from 'rui-core/snippet';
import { Dropzone } from 'rui-core/dropzone';
import { Editor } from 'rui-core/editor';
import { DataTable, JsonTree, Onboarding, AnalogClock, QrCode, Gantt, Led, Spinner, Rings, Compare, TextAnimate, Window } from 'rui-core/more';

/** @typedef {string | { role?: string, text?: string, children?: Json[], [field: string]: unknown }} Json */

/** Every node of the data, depth first. @param {Json[]} nodes @param {any[]} [out] @returns {any[]} */
function all(nodes, out = []) {
  for (const n of nodes) {
    if (typeof n === 'string') continue;
    out.push(n);
    if (n.children) all(n.children, out);
  }
  return out;
}

/** The nodes with a role. @param {Json[]} nodes @param {string} role */
const byRole = (nodes, role) => all(nodes).filter(n => n.role === role);

/** A node's fields without its content. @param {any} node */
const fields = node => {
  const { children, ...rest } = node;
  return rest;
};

/** The data of a view in a Rui. @param {() => any} view */
const data = view => $json(() => <Rui>{view()}</Rui>);

describe('names past the first sweep', () => {
  it('PinInput names each cell by its place', async () => {
    const { PinInput } = await import('rui-core');
    const out = await data(() => <PinInput aria-label="Code" length={3} />);
    assert.deepEqual(byRole(out, 'textbox').map(n => n.label), ['1 of 3', '2 of 3', '3 of 3']);
  });

  it('the year and decade grids are named by their headers', async () => {
    const { MonthPanel, YearPanel } = await import('rui-core/dates');
    const out = await data(() => (
      <>
        <MonthPanel defaultPeriod="2026-01-01" />
        <YearPanel defaultPeriod="2026-01-01" />
      </>
    ));
    assert.deepEqual(byRole(out, 'grid').map(n => n.label), ['2026', '2020…2029']);
  });

  it('a tab panel is named by its tab', async () => {
    const { Tabs } = await import('rui-core');
    const out = await data(() => (
      <>
        <Tabs defaultValue="b c">
          <Tabs.List>
            <Tabs.Tab value="a">Overview</Tabs.Tab>
            <Tabs.Tab value="b c">Details</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">First</Tabs.Panel>
          <Tabs.Panel value="b c">Second</Tabs.Panel>
        </Tabs>
        <Tabs defaultValue="a">
          <Tabs.List>
            <Tabs.Tab value="a">Overview</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">First</Tabs.Panel>
        </Tabs>
      </>
    ));
    assert.deepEqual(byRole(out, 'tabpanel').map(n => n.label), ['Details', 'Overview'], 'a value with a space too');
  });

  it('a NumberInput with negative false says its floor of 0', async () => {
    const { NumberInput } = await import('rui-core');
    const out = await data(() => <NumberInput label="Count" negative={false} value={2} />);
    assert.equal(byRole(out, 'spinbutton')[0].min, 0);
  });
});

describe('a Field names its control', () => {
  it('by its label, or a Field.Label in it, through aria-labelledby; the control\'s own aria-label wins', async () => {
    const { Field, Input } = await import('rui-core');
    const out = await data(() => (
      <>
        <Field label="Call sign" description="Letters and digits, up to 8" asterisk>
          <Input required placeholder="orbit7" />
        </Field>
        <Field>
          <Field.Label>Search orders</Field.Label>
          <Input placeholder="status:shipped" />
        </Field>
        <Field label="Shown">
          <Input aria-label="Own name" placeholder="x" />
        </Field>
      </>
    ));
    assert.deepEqual(byRole(out, 'textbox').map(n => n.label), ['Call sign', 'Search orders', 'Own name']);
  });
});

describe('TreeSelect states its rows', () => {
  const kit = [
    { value: 'tools', label: 'Tools', children: [{ value: 'saw', label: 'Saw' }, { value: 'awl', label: 'Awl' }] },
    { value: 'paint', label: 'Paint', children: [{ value: 'red', label: 'Red' }] },
  ];
  /** Each treeitem's text and states. @param {any} out */
  const rows = out => byRole(out, 'treeitem').map(n => [n.text, n.checked, n.selected]);

  it('with checks, each row checked, mixed or not by its leaves, never selected', async () => {
    const { TreeSelect } = await import('rui-core');
    const out = await data(() => <TreeSelect checks defaultExpanded defaultOpen placeholder="Kit" data={kit} defaultValue={['saw', 'red']} />);
    assert.deepEqual(rows(out), [
      ['Tools', 'mixed', undefined],
      ['Saw', true, undefined],
      ['Awl', false, undefined],
      ['Paint', true, undefined],
      ['Red', true, undefined],
    ]);
  });

  it('with checks strict, each node checked by itself', async () => {
    const { TreeSelect } = await import('rui-core');
    const out = await data(() => <TreeSelect checks strict defaultExpanded defaultOpen placeholder="Kit" data={kit} defaultValue={['tools']} />);
    assert.deepEqual(rows(out).map(r => r[1]), [true, false, false, false, false]);
  });

  it('without checks, selected as chosen', async () => {
    const { TreeSelect } = await import('rui-core');
    const out = await data(() => <TreeSelect defaultExpanded defaultOpen placeholder="Kit" data={kit} defaultValue="awl" />);
    assert.deepEqual(rows(out).map(r => [r[1], r[2]]), [[undefined, false], [undefined, false], [undefined, true], [undefined, false], [undefined, false]]);
  });
});

describe('Editor.Content is a nameable textbox', () => {
  it('takes its aria-label, else its placeholder, as its name', async () => {
    const named = await data(() => (
      <Editor content="<p>Hi</p>">
        <Editor.Content aria-label="Notes" />
      </Editor>
    ));
    assert.deepEqual(byRole(named, 'textbox').map(n => ({ role: n.role, label: n.label })), [{ role: 'textbox', label: 'Notes' }]);
    const hinted = await data(() => (
      <Editor content="">
        <Editor.Content placeholder="Write here" />
      </Editor>
    ));
    assert.deepEqual(byRole(hinted, 'textbox').map(n => n.label), ['Write here'], 'the placeholder names it when nothing else does');
  });
});

describe('rui-core meaning, as data', () => {
  it('typography: headings, paragraphs, links, code, quotes and lists', async () => {
    const out = await data(() => (
      <Stack>
        <Heading level={2}>Pricing</Heading>
        <Text>
          Read the <Link href="/docs">docs</Link> first
        </Text>
        <Text inline>aside</Text>
        <Link href="/plans">Plans</Link>
        <Code block>{'npm test'}</Code>
        <Quote source="– Ada">Numbers are poetry</Quote>
        <List ordered>
          <List.Item>One</List.Item>
          <List.Item>Two</List.Item>
        </List>
      </Stack>
    ));
    // The layout (Stack) dissolves; the first node is the heading.
    assert.deepEqual(out[0], { role: 'heading', level: 2, text: 'Pricing' });
    assert.deepEqual(out[1], { role: 'paragraph', text: 'Read the docs first' });
    // Inline text runs on as plain text.
    assert.equal(out[2], 'aside');
    assert.deepEqual(byRole(out, 'link'), [{ role: 'link', href: '/plans', text: 'Plans' }]);
    assert.deepEqual(byRole(out, 'code'), [{ role: 'code', text: 'npm test' }]);
    assert.deepEqual(byRole(out, 'blockquote')[0].children, ['Numbers are poetry', '– Ada']);
    // The ordered markers are decoration: the items hold only their text.
    assert.deepEqual(byRole(out, 'list')[0], { role: 'list', children: [{ role: 'listitem', text: 'One' }, { role: 'listitem', text: 'Two' }] });
  });

  it("an Accordion trigger's icon is decoration: the trigger is named by its title alone (ren-json and the DOM)", async () => {
    const { IconBox } = await import('rui-core');
    const { onDom } = await import('./harness.jsx');
    const view = () => (
      <Accordion defaultValue="a">
        <Accordion.Item value="a">
          <Accordion.Trigger icon={<IconBox size="sm">A</IconBox>}>Account</Accordion.Trigger>
          <Accordion.Panel>Profile and password</Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
    const out = await data(view);
    assert.deepEqual(byRole(out, 'button').map(fields), [{ role: 'button', expanded: true, text: 'Account' }]);
    assert.deepEqual(byRole(out, 'region'), [{ role: 'region', label: 'Account', text: 'Profile and password' }]);
    // The DOM's accessible name of the button: its text, less what is hidden from assistive technology.
    const dom = onDom(() => <Rui>{view()}</Rui>);
    /** @param {any} node @returns {string} */
    const held = node => [...node.childNodes].map((/** @type {any} */ c) => (c.nodeType === 3 ? c.data : c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true' ? ` ${held(c)} ` : '')).join('');
    const button = dom.nodes('Action')[0];
    assert.equal(held(button).replace(/\s+/g, ' ').trim(), 'Account');
    dom.dispose();
  });

  it('data display: tables, images, accordions, data lists, timelines, numbers', async () => {
    const out = await data(() => (
      <Surface>
        <Table data={{ caption: 'Planets', columns: ['Planet', 'Moons'], rows: [['Mars', 2]] }} />
        <Avatar name="Ada Lovelace" />
        <Image source="/ada.png" label="Ada" />
        <Accordion defaultValue="a">
          <Accordion.Item value="a">
            <Accordion.Trigger>Shipping</Accordion.Trigger>
            <Accordion.Panel>Two days</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="b">
            <Accordion.Trigger>Returns</Accordion.Trigger>
            <Accordion.Panel>Thirty days</Accordion.Panel>
          </Accordion.Item>
        </Accordion>
        <DataList>
          <DataList.Item>
            <DataList.Term>Plan</DataList.Term>
            <DataList.Detail>Pro</DataList.Detail>
          </DataList.Item>
        </DataList>
        <Timeline value={0}>
          <Timeline.Item title="Ordered">Monday</Timeline.Item>
        </Timeline>
        <DigitRoll value={1234} groupMark="," />
        <Badge>New arrivals</Badge>
      </Surface>
    ));
    // A badge shows its text in upper case; its data keeps it as written.
    assert.ok(JSON.stringify(out).includes('"New arrivals"'));
    assert.ok(!JSON.stringify(out).includes('NEW ARRIVALS'));
    // Its rows are boxless rows, so its data is a record per row keyed by the column headers.
    assert.deepEqual(byRole(out, 'table')[0], { role: 'table', columns: ['Planet', 'Moons'], rows: [{ Planet: 'Mars', Moons: '2' }], children: [{ role: 'caption', text: 'Planets' }] });
    // An avatar is a picture named by its person; its initials are decoration.
    assert.deepEqual(byRole(out, 'img'), [
      { role: 'img', label: 'Ada Lovelace' },
      { role: 'img', src: '/ada.png', alt: 'Ada' },
    ]);
    // The open item's panel is a region; the closed one's is hidden.
    assert.deepEqual(byRole(out, 'button').map(fields), [
      { role: 'button', expanded: true, text: 'Shipping' },
      { role: 'button', expanded: false, text: 'Returns' },
    ]);
    assert.deepEqual(byRole(out, 'region'), [{ role: 'region', label: 'Shipping', text: 'Two days' }], 'named by its trigger');
    assert.deepEqual(byRole(out, 'listitem')[0].children, [
      { role: 'term', text: 'Plan' },
      { role: 'definition', text: 'Pro' },
    ]);
    assert.deepEqual(byRole(out, 'listitem')[1], { role: 'listitem', children: ['Ordered', 'Monday'] });
    // The rolling digits are decoration: the number is its name.
    assert.deepEqual(byRole(out, 'group'), [{ role: 'group', label: '1,234' }]);
  });

  it('inputs: fields named by their labels, with their states and values', async () => {
    const out = await data(() => (
      <Stack>
        <TextInput label="Email" placeholder="you@example.com" description="Work mail" error="Required" required defaultValue="ada@" />
        <PasswordInput label="Password" defaultValue="secret" />
        <NumberInput label="Seats" defaultValue={3} min={1} max={9} />
        <Checkbox label="Agree" defaultChecked />
        <Checkbox label="Some" indeterminate />
        <Radio.Group label="Plan" defaultValue="pro">
          <Radio value="free" label="Free" />
          <Radio value="pro" label="Pro" />
        </Radio.Group>
        <Switch label="Alerts" />
        <Chip defaultChecked>Tag</Chip>
        <SegmentedControl data={['Day', 'Week']} defaultValue="Week" />
        <Slider defaultValue={40} />
        <Rating defaultValue={3} />
        <FieldGroup legend="Profile">
          <Select label="Country" data={['France', 'Japan']} defaultValue="Japan" defaultOpen />
        </FieldGroup>
        <MultiSelect label="Topics" data={['a', 'b']} />
        <Button disabled>Save</Button>
        <CloseButton />
      </Stack>
    ));
    // The label shown is the field's name, said once; the description and error stay text.
    assert.equal(out[0], 'Work mail');
    assert.deepEqual(out[1], { role: 'textbox', label: 'Email', placeholder: 'you@example.com', value: 'ada@', required: true, invalid: true });
    assert.equal(out[2], 'Required');
    const boxes = byRole(out, 'textbox');
    // A password's value never shows.
    assert.deepEqual(boxes[1], { role: 'textbox', label: 'Password' });
    assert.deepEqual(byRole(out, 'spinbutton'), [{ role: 'spinbutton', label: 'Seats', value: 3, min: 1, max: 9 }]);
    const checks = byRole(out, 'checkbox').map(n => ({ label: n.label, text: n.text, checked: n.checked }));
    assert.deepEqual(checks, [
      { label: 'Agree', text: undefined, checked: true },
      { label: 'Some', text: undefined, checked: 'mixed' },
      { label: undefined, text: 'Tag', checked: true },
    ]);
    const plan = byRole(out, 'radiogroup')[0];
    assert.equal(plan.label, 'Plan');
    assert.deepEqual(
      plan.children.map((/** @type {any} */ r) => [r.role, r.label, r.checked]),
      [
        ['radio', 'Free', false],
        ['radio', 'Pro', true],
      ],
    );
    assert.deepEqual(byRole(out, 'switch').map(n => [n.label, n.checked]), [['Alerts', false]]);
    // A segment is named by its text alone, checked or not: no label beside the same text.
    assert.deepEqual(byRole(out, 'radiogroup')[1].children, [
      { role: 'radio', checked: false, text: 'Day' },
      { role: 'radio', checked: true, text: 'Week' },
    ]);
    assert.deepEqual(
      byRole(out, 'slider').map(n => [n.label, n.value, n.min, n.max]),
      [
        ['Slider thumb', 40, 0, 100],
        ['Rating', 3, 0, 5],
      ],
    );
    // A fieldset is a group named by its legend; a select a combobox with its value and its listbox.
    const profile = byRole(out, 'group').find(n => n.label === 'Profile');
    assert.ok(profile);
    assert.deepEqual(byRole(out, 'combobox').map(fields), [
      { role: 'combobox', expanded: true, label: 'Country', text: 'Japan' },
      { role: 'combobox', expanded: false, label: 'Topics' },
    ]);
    assert.deepEqual(
      byRole(out, 'option').map(n => [n.text, n.selected]),
      [
        ['France', false],
        ['Japan', true],
      ],
    );
    assert.deepEqual(byRole(out, 'button').filter(n => n.text === 'Save' || n.label === 'Close').map(fields), [
      { role: 'button', disabled: true, text: 'Save' },
      { role: 'button', label: 'Close' },
    ]);
  });

  it('navigation and layout: landmarks, tabs, links, pages, steps, trees', async () => {
    const out = await data(() => (
      <Shell header={60} nav={200} fold="sm">
        <Shell.Header>
          <NavToggle open />
        </Shell.Header>
        <Shell.Nav>
          <NavItem label="Home" href="/" active />
          <NavItem label="Settings" defaultOpen>
            <NavItem label="Profile" href="/profile" />
          </NavItem>
        </Shell.Nav>
        <Shell.Main>
          <Breadcrumbs>
            <Link href="/">Home</Link>
            <Link href="/docs">Docs</Link>
          </Breadcrumbs>
          <Divider />
          <Tabs defaultValue="a">
            <Tabs.List>
              <Tabs.Tab value="a">Overview</Tabs.Tab>
              <Tabs.Tab value="b">Specs</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="a">First</Tabs.Panel>
            <Tabs.Panel value="b">Second</Tabs.Panel>
          </Tabs>
          <Pagination total={3} defaultValue={2} />
          <Stepper value={1}>
            <Stepper.Stage label="Account" />
            <Stepper.Stage label="Verify" />
          </Stepper>
          <Tree data={[{ value: 'src', label: 'src', children: [{ value: 'a', label: 'a.js' }] }]} />
        </Shell.Main>
      </Shell>
    ));
    assert.deepEqual(
      out.map(n => (typeof n === 'string' ? n : n.role)),
      ['banner', 'navigation', 'main'],
    );
    assert.deepEqual(fields(byRole(out, 'button').find(n => n.label === 'Menu')), { role: 'button', label: 'Menu', expanded: true });
    const nav = byRole(out, 'navigation')[0].children.map(fields);
    assert.deepEqual(nav, [
      { role: 'link', href: '/', current: 'page', text: 'Home' },
      { role: 'button', expanded: true, text: 'Settings' },
      { role: 'link', href: '/profile', text: 'Profile' },
    ]);
    const crumbs = byRole(out, 'navigation').find(n => n.label === 'Breadcrumbs');
    // A list of crumbs, the last the current page; the separators are decoration.
    assert.deepEqual(crumbs.children, [
      {
        role: 'list',
        children: [
          { role: 'listitem', children: [{ role: 'link', href: '/', text: 'Home' }] },
          { role: 'listitem', current: 'page', children: [{ role: 'link', href: '/docs', text: 'Docs' }] },
        ],
      },
    ]);
    assert.deepEqual(
      byRole(out, 'tab').map(n => [n.text, n.selected]),
      [
        ['Overview', true],
        ['Specs', false],
      ],
    );
    assert.deepEqual(byRole(out, 'tabpanel'), [{ role: 'tabpanel', label: 'Overview', text: 'First' }], 'named by its tab');
    const pages = byRole(out, 'navigation').find(n => n.label === 'Pagination');
    assert.deepEqual(
      pages.children.map((/** @type {any} */ n) => n.label ?? `${n.text}${n.current ? ` (${n.current})` : ''}`),
      ['Previous page', '1', '2 (page)', '3', 'Next page'],
    );
    // The steps (the crumbs' items hold links, no text).
    assert.deepEqual(
      byRole(out, 'listitem').filter(n => n.text !== undefined).map(n => [n.text, n.current]),
      [
        ['Account', undefined],
        ['Verify', 'step'],
      ],
    );
    assert.deepEqual(byRole(out, 'treeitem').map(fields), [{ role: 'treeitem', level: 1, selected: false, expanded: false, text: 'src' }]);
  });

  it('feedback and overlays: alerts, progress, loading, dialogs, tooltips, menus', async () => {
    const out = await data(() => (
      <Stack>
        <Alert title="Heads up">Disk almost full</Alert>
        <Notification title="Saved" closable={false}>
          All good
        </Notification>
        <Notification color="red" title="Failed" closable={false} />
        <Progress value={30} />
        <Ring segments={[{ value: 40, color: 'blue' }]} label="40%" />
        <Arc value={60} label="Upload" />
        <Skeleton height={8} />
        <Busy shown />
        <Loader />
        <Loader kind="dots" aria-label="Saving" />
        <Modal open onOpenChange={() => {}} title="Confirm">
          Are you sure?
        </Modal>
        <Tooltip label="Copies the link" open>
          <Button>Share</Button>
        </Tooltip>
        <Menu open>
          <Menu.Trigger>
            <Button>Actions</Button>
          </Menu.Trigger>
          <Menu.Panel>
            <Menu.Item>Rename</Menu.Item>
            <Menu.Divider />
            <Menu.CheckboxItem defaultChecked>Pinned</Menu.CheckboxItem>
          </Menu.Panel>
        </Menu>
      </Stack>
    ));
    assert.deepEqual(byRole(out, 'alert'), [
      { role: 'alert', children: ['Heads up', 'Disk almost full'] },
      { role: 'alert', text: 'Failed' },
    ]);
    assert.deepEqual(byRole(out, 'status').slice(0, 2), [
      { role: 'status', children: ['Saved', 'All good'] },
      { role: 'status', label: 'Loading' },
    ]);
    assert.deepEqual(byRole(out, 'progressbar'), [
      { role: 'progressbar', value: 30, min: 0, max: 100 },
      // The ring's label is its value's text, said once (not its name too).
      { role: 'progressbar', value: 40, min: 0, max: 100, valueText: '40%' },
      { role: 'progressbar', value: 60, min: 0, max: 100, valueText: 'Upload' },
    ]);
    // A loader is a status named 'Loading'; in a Busy the overlay's status says it once.
    assert.deepEqual(byRole(out, 'status').slice(2), [{ role: 'status', label: 'Loading' }, { role: 'status', label: 'Saving' }]);
    const dialog = byRole(out, 'dialog')[0];
    assert.equal(dialog.label, 'Confirm');
    assert.deepEqual(byRole(dialog.children, 'heading'), [{ role: 'heading', level: 2, text: 'Confirm' }]);
    assert.ok(dialog.children.includes('Are you sure?'));
    // The focus holder is not a button of the dialog; its close button is.
    assert.deepEqual(byRole(dialog.children, 'button'), [{ role: 'button', label: 'Close' }]);
    assert.deepEqual(byRole(out, 'tooltip'), [{ role: 'tooltip', text: 'Copies the link' }]);
    const menu = byRole(out, 'menu')[0];
    assert.deepEqual(menu.children.map(fields), [
      { role: 'menuitem', text: 'Rename' },
      { role: 'menuitemcheckbox', checked: true, text: 'Pinned' },
    ]);
  });

  it('extensions: charts, dates, carousel, code, dropzone, rich text, data table', async () => {
    const out = await data(() => (
      <Stack>
        <BarChart h={200} data={[{ month: 'Jan', north: 1 }, { month: 'Feb', north: 2 }]} category="month" series={[{ key: 'north', label: 'North' }]} />
        <DonutChart data={[{ label: 'Ours', value: 3, color: 'blue' }, { label: 'Theirs', value: 2, color: 'red' }]} />
        <Bars data={[{ label: 'Search', value: 60 }]} />
        <Calendar defaultPeriod="2026-02-01" dayOf={(/** @type {string} */ d) => ({ selected: d === '2026-02-14' })} />
        <DateSelect label="When" defaultValue="2026-09-27" />
        <TimePicker label="At" defaultValue="09:30" />
        <Carousel>
          <Carousel.Slide>One</Carousel.Slide>
          <Carousel.Slide>Two</Carousel.Slide>
        </Carousel>
        <Snippet code={'let a = 1;\nlet b = 2;'} language="js" copyable={false} />
        <Dropzone onDrop={() => {}}>Drop files</Dropzone>
        <Editor content="<h2>Notes</h2><p>Hello</p><ul><li>One</li></ul>">
          <Editor.Content />
        </Editor>
        <DataTable rows={[{ id: 1, name: 'Ann' }]} fields={{ name: { sort: true } }} />
      </Stack>
    ));
    // A chart is an image named by what it shows, holding its data (a Dataset); its drawn text is decoration.
    assert.deepEqual(byRole(out, 'img'), [
      {
        role: 'img',
        label: 'Bar chart of North, 2 points',
        item: {
          '@type': 'Dataset',
          series: { name: 'north', label: 'North' },
          row: [
            { month: 'Jan', north: 1 },
            { month: 'Feb', north: 2 },
          ],
        },
      },
      {
        role: 'img',
        label: 'Donut chart of Ours, Theirs',
        item: {
          '@type': 'Dataset',
          row: [
            { label: 'Ours', value: 3 },
            { label: 'Theirs', value: 2 },
          ],
        },
      },
    ]);
    assert.deepEqual(byRole(out, 'list')[0], { role: 'list', children: [{ role: 'listitem', item: { name: 'Search', value: 60 } }] });
    // A month is a record per week keyed by the weekdays, each day its date, name and state with its number.
    const grid = byRole(out, 'grid')[0];
    assert.equal(grid.label, 'February 2026');
    // The column headers in the calendar's default weekday format, 'EEE'.
    assert.deepEqual(grid.columns, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    // A day is named in full: 'EEEE, D MMMM YYYY'.
    const day = (/** @type {number} */ n, /** @type {string} */ weekday, selected = false) => ({ datetime: `2026-02-${String(n).padStart(2, '0')}`, label: `${weekday}, ${n} February 2026`, selected, text: String(n) });
    assert.deepEqual(grid.rows[2], { Mon: day(9, 'Monday'), Tue: day(10, 'Tuesday'), Wed: day(11, 'Wednesday'), Thu: day(12, 'Thursday'), Fri: day(13, 'Friday'), Sat: day(14, 'Saturday', true), Sun: day(15, 'Sunday') });
    assert.deepEqual(fields(byRole(out, 'button').find(n => n.label === 'When')), { role: 'button', label: 'When', expanded: false, text: '27 Sep 2026' });
    assert.deepEqual(
      byRole(out, 'spinbutton').map(n => [n.label, n.value, n.min, n.max]),
      [
        ['hours', 9, 0, 23],
        ['minutes', 30, 0, 59],
      ],
    );
    const carousel = byRole(out, 'region').find(n => n.label === 'Carousel');
    assert.deepEqual(byRole(carousel.children, 'group').map(n => n.text), ['One', 'Two']);
    assert.deepEqual(byRole(out, 'code'), [{ role: 'code', children: ['let a = 1;', 'let b = 2;'] }]);
    assert.ok(byRole(out, 'button').some(n => n.text === 'Drop files'));
    // Rich text: a multi-line textbox of its blocks' meanings.
    const doc = byRole(out, 'textbox').find(n => n.children !== undefined);
    assert.deepEqual(doc.children, [
      { role: 'heading', level: 2, text: 'Notes' },
      { role: 'paragraph', text: 'Hello' },
      { role: 'listitem', text: 'One' },
    ]);
    // A data table's records, keyed by its column headers.
    assert.deepEqual(byRole(out, 'table')[0], { role: 'table', columns: ['Name'], rows: [{ Name: 'Ann' }] });
  });
});

describe('rui-core data, as data', () => {
  it("charts: each chart's series and points as a Dataset under its img", async () => {
    const rows = [
      { month: 'Jan', north: 1, south: 4 },
      { month: 'Feb', north: 2, south: 3 },
    ];
    const series = [{ key: 'north', label: 'North', color: 'red' }, { key: 'south' }];
    const slices = [
      { label: 'Ours', value: 3, color: 'blue' },
      { label: 'Theirs', value: 2, color: 'red' },
    ];
    const out = await data(() => (
      <Stack>
        <AreaChart h={200} data={rows} category="month" series={series} />
        <LineChart h={200} data={rows} category="month" series={series} />
        <MixedChart h={200} data={rows} category="month" series={[{ key: 'north', kind: 'bar' }, { key: 'south', kind: 'line' }]} />
        <RadarChart h={200} data={rows} category="month" series={series} />
        <PieChart data={slices} />
        <RadialBarChart h={200} data={slices} valueKey="value" />
        <FunnelChart data={slices} />
        <ScatterChart h={200} data={[{ label: 'Group', color: 'blue', points: [{ hours: 2, score: 60 }, { hours: 3, score: 70 }] }]} category={{ x: 'hours', y: 'score' }} />
        <BubbleChart data={[{ label: 'Lisbon', value: 545 }]} />
        <Sparkline w={100} data={[1, 5, 3]} />
        <Heatmap data={{ '2026-01-01': 2, '2026-01-02': 5 }} from="2026-01-01" to="2026-01-07" />
        <Bars data={[{ label: 'Search', value: 60, color: 'blue' }, { label: 'Direct', value: 25 }]} format={(/** @type {number} */ v) => `${v}%`} />
      </Stack>
    ));
    const named = [{ name: 'north', label: 'North' }, { name: 'south' }];
    const items = byRole(out, 'img').map(n => [n.label, n.item]);
    assert.deepEqual(items, [
      ['Area chart of North, south, 2 points', { '@type': 'Dataset', series: named, row: rows }],
      ['Line chart of North, south, 2 points', { '@type': 'Dataset', series: named, row: rows }],
      ['Mixed chart of north, south, 2 points', { '@type': 'Dataset', series: [{ name: 'north' }, { name: 'south' }], row: rows }],
      ['Radar chart of North, south, 2 points', { '@type': 'Dataset', series: named, row: rows }],
      // A slice's color is its look: left out.
      ['Pie chart of Ours, Theirs', { '@type': 'Dataset', row: [{ label: 'Ours', value: 3 }, { label: 'Theirs', value: 2 }] }],
      ['Radial bar chart of Ours, Theirs', { '@type': 'Dataset', row: [{ label: 'Ours', value: 3 }, { label: 'Theirs', value: 2 }] }],
      ['Funnel chart of Ours, Theirs', { '@type': 'Dataset', row: [{ label: 'Ours', value: 3 }, { label: 'Theirs', value: 2 }] }],
      ['Scatter chart of Group', { '@type': 'Dataset', series: { name: 'Group', point: [{ hours: 2, score: 60 }, { hours: 3, score: 70 }] } }],
      ['Bubble chart of Lisbon', { '@type': 'Dataset', row: { label: 'Lisbon', value: 545 } }],
      ['Sparkline', { '@type': 'Dataset', value: [1, 5, 3] }],
      ['Heatmap', { '@type': 'Dataset', row: [{ date: '2026-01-01', value: 2 }, { date: '2026-01-02', value: 5 }] }],
    ]);
    // A bars chart's items hold the raw values; the text shows them formatted.
    assert.deepEqual(byRole(out, 'listitem'), [
      { role: 'listitem', item: { name: 'Search', value: 60 } },
      { role: 'listitem', item: { name: 'Direct', value: 25 } },
    ]);
  });

  it('goodies: trees, tours, clocks, codes, timelines, indicators, sliders, windows', async () => {
    const out = await data(() => (
      <Stack>
        <JsonTree data={{ name: 'Ada', langs: ['en'] }} defaultExpanded={1} />
        <Onboarding started steps={[{ id: 'a', title: 'Welcome', content: 'Start here' }]}>
          <Text>Page</Text>
        </Onboarding>
        <AnalogClock value="2026-09-27T10:09:30Z" utc />
        <QrCode value="https://rui.example" />
        <Gantt
          from="2026-09-01"
          to="2026-09-10"
          tasks={[
            { id: 'd', name: 'Design', start: '2026-09-01', end: '2026-09-03', progress: 100 },
            { id: 'b', name: 'Build', start: '2026-09-04', end: '2026-09-08', dependencies: ['d'] },
          ]}
        />
        <Led label="Server" />
        <Led value={false} />
        <Spinner />
        <Rings rings={[{ value: 80, color: 'red' }, { value: 40, color: 'green' }]} label="Activity" />
        <Compare before="/a.png" after="/b.png" defaultValue={30} />
        <Panes defaultSizes={[120]}>
          <Panes.Pane min={50}>
            <Text>Left</Text>
          </Panes.Pane>
          <Panes.Pane>
            <Text>Right</Text>
          </Panes.Pane>
        </Panes>
        <TextAnimate play={false}>Portable text moves</TextAnimate>
        <Window title="Notes">Body</Window>
      </Stack>
    ));
    // JsonTree: a tree of items named by their paths, levels and states; a leaf holds its copy button.
    const tree = byRole(out, 'tree')[0];
    assert.deepEqual(fields(tree.children[0]), { role: 'treeitem', level: 1, expanded: true, label: 'root' });
    assert.deepEqual(tree.children[1], {
      role: 'group',
      children: [
        { role: 'treeitem', level: 2, label: 'name', children: [{ role: 'button', label: 'Copy name', text: '"Ada"' }] },
        { role: 'treeitem', level: 2, expanded: false, label: 'langs', text: '1 item' },
      ],
    });
    // Onboarding: its card a dialog named by the step's title.
    const tour = byRole(out, 'dialog').find(n => n.label === 'Welcome');
    assert.deepEqual(byRole(tour.children, 'heading'), [{ role: 'heading', level: 2, text: 'Welcome' }]);
    assert.ok(tour.children.includes('Start here'));
    assert.deepEqual(byRole(tour.children, 'button').map(n => n.text), ['Skip', 'Finish']);
    // Clock, QR code and leds: images named by what they show.
    assert.deepEqual(byRole(out, 'img').filter(n => !n.src), [
      { role: 'img', label: '10:09:30' },
      { role: 'img', label: 'QR code: https://rui.example' },
      { role: 'img', label: 'On' },
      { role: 'img', label: 'Off' },
    ]);
    // Gantt: a grid of rows, a task's name its row header, its bar a cell named by its days.
    const grid = byRole(out, 'grid')[0];
    assert.deepEqual(grid.children, [
      { role: 'row', children: [{ role: 'columnheader', text: 'Task' }, { role: 'columnheader', label: '2026-09-01 to 2026-09-10' }] },
      { role: 'row', children: [{ role: 'rowheader', text: 'Design' }, { role: 'gridcell', label: '2026-09-01 to 2026-09-03, 100%' }] },
      { role: 'row', children: [{ role: 'rowheader', text: 'Build' }, { role: 'gridcell', label: '2026-09-04 to 2026-09-08, after Design' }] },
    ]);
    // The spinner a status; the rings a group of progress bars named by their label.
    assert.deepEqual(byRole(out, 'status'), [{ role: 'status', label: 'Loading' }]);
    assert.deepEqual(byRole(out, 'group').find(n => n.label === 'Activity'), {
      role: 'group',
      label: 'Activity',
      children: [
        { role: 'progressbar', value: 80, min: 0, max: 100 },
        { role: 'progressbar', value: 40, min: 0, max: 100 },
      ],
    });
    // Compare: a slider of the share shown; Panes: a separator with the pane's size.
    assert.deepEqual(byRole(out, 'slider'), [{ role: 'slider', value: 30, min: 0, max: 100, label: 'Compare' }]);
    assert.deepEqual(byRole(out, 'separator'), [{ role: 'separator', value: 120, min: 50, label: 'Resize pane 1' }]);
    // TextAnimate: its text once, as its name; Window: a dialog named by its title.
    assert.deepEqual(byRole(out, 'group').find(n => n.label === 'Portable text moves'), { role: 'group', label: 'Portable text moves' });
    const win = byRole(out, 'dialog').find(n => n.label === 'Notes');
    assert.ok(win.children.includes('Body'));
  });
});
