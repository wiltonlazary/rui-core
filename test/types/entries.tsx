// A TypeScript application over every rui-core entry: the published
// declarations resolve through package.json's exports and type its use.
import { $signal, $read, $write, $dispose, $root } from 'rrx-core';
import { Rui, Stack, Button, TextInput, ColorPicker, Select, DigitRoll, Busy, themeOf, parseColor, formatColor, BASE_THEME, BASE_COLORS, BASE_LABELS } from 'rui-core';
import { $open, $counter, $toggle, $patch, $localStorage } from 'rui-core/hooks';
import type { OpenHandle, CounterHandle, ToggleHandle, PatchHandle } from 'rui-core/hooks';
import { $form, email, required, length, range, emailTest, EACH } from 'rui-core/form';
import type { PathPattern } from 'rui-core/form';
import { DatePanel, addDays, dayNumber, sameDate } from 'rui-core/dates';
import { LineChart, linearScale } from 'rui-core/charts';
import { Notifications, notificationsStore } from 'rui-core/notifications';
import { Launcher, launcherStore } from 'rui-core/launcher';
import { Carousel, nearest } from 'rui-core/carousel';
import { Dropzone, acceptList, imageTypes, pickFiles } from 'rui-core/dropzone';
import { Modals } from 'rui-core/modals';
import { Snippet, tokenize } from 'rui-core/snippet';
import { LoadBar, creep, loadBarStore } from 'rui-core/load-bar';
import { Editor } from 'rui-core/editor';
import { QrCode, DataTable } from 'rui-core/more';
import type { DataTableField, DataTableOrder } from 'rui-core/more';
import type { Option } from 'rui-core';

const R = $root('typed');

// Hooks: one handle each, its state `value` (a node) and its commands verbs.
const menu: OpenHandle = $open(R, false, { onChange: (next: boolean) => void next });
const isOpen: boolean = $read(menu.value);
menu.open();
menu.toggle();
const count: CounterHandle = $counter(R, 1);
count.add();
count.add(-1);
count.set($read(count.value) + 1);
const side: ToggleHandle<'start' | 'end'> = $toggle(R, ['start', 'end'] as const);
side.next();
const at: 'start' | 'end' = $read(side.value);
const card: PatchHandle<{ name: string, plan?: string }> = $patch(R, { name: 'Ada' });
card.set({ plan: 'free' });
side.set(at === 'start' ? 'end' : 'start');
// @ts-expect-error a counter is set to a number
count.set('2');
// @ts-expect-error a side is one of its options
side.set('middle');

// A form typed by its initial values.
const form = $form(R, { values: { contact: '', nick: '' }, rules: { contact: email('Needs an @'), nick: required() } });
const contact: string = form.get().contact;
form.set('nick', 'Ada');
const valid: boolean = form.valid();
const binding = form.bind('nick');
binding.onChange('Grace');
const { ok } = form.validate();
// @ts-expect-error the values have no age
void form.get().age;
// A path pattern is segments; EACH stands for any list index.
const pattern: PathPattern = ['items', EACH, 'name'];
$form({ values: { items: [{ name: '' }] }, validateOn: { change: [pattern, 'items'] } });
// @ts-expect-error EACH is a symbol, not text
const joined: string = EACH;

// Colors and the theme.
const red: { h: number, s: number, v: number, a: number } | null = parseColor('#ff0000');
const text: string = red === null ? '' : formatColor(red, 'rgb', true);
const theme = themeOf({ accent: 'teal' });
// A kept value's codec: print to text, parse it back.
const kept = $localStorage(R, { key: 'count', fallback: 0, print: (n: number) => String(n), parse: (t: string) => Number(t) });
void kept;
// Overrides merge deeply: one key of a token group is enough.
themeOf({ opacity: { soft: 0.25 }, sizes: { control: { md: 38 } } });
// @ts-expect-error a token group's key keeps its type
themeOf({ opacity: { soft: 'faint' } });
const level2: number = BASE_THEME.headings.levels[1].size;
const indigo6: string = BASE_COLORS.indigo[6];
// The built-in words: strings, and functions of a value.
const closeWord: string = BASE_LABELS.close;
const stepWord: string = BASE_LABELS.step(2, 5);
// @ts-expect-error a word that takes a value is called with it
BASE_LABELS.remove();
// @ts-expect-error a color's text is a string
parseColor(0xff0000);

// The extensions' functions.
const tomorrow: string = addDays('2026-09-26', 1);
const day: number = dayNumber(2026, 9, 26);
const same: boolean = sameDate(tomorrow, '2026-09-27');
const x: number = linearScale(0, 10, 0, 100)(5);
const types: string[] = acceptList(imageTypes);
const tokens = tokenize('const a = 1;', 'ts');
const step: number = creep(50);
// capture takes a boolean (false: no camera) or a string, as the runtime does.
void pickFiles({ capture: false });
void pickFiles({ capture: 'user' });
const bar = loadBarStore(R);
const barShown: boolean = bar.shown();
const notifications = notificationsStore(R);
const id: string = notifications.show({ text: 'Saved' });
const launcher = launcherStore(R);
void nearest;

// The Select family matches one option at a time; DataTable reads a fields map and an order.
const startsWith = (option: Option, search: string): boolean => option.label.toLowerCase().startsWith(search.toLowerCase());
const rows = [{ id: 1, name: 'Ada', address: { city: 'Lima' } }];
const fields: Record<string, DataTableField | true> = { name: { title: 'Name', sort: true }, 'address.city': true };
const order: DataTableOrder = { by: 'name', desc: true };
// @ts-expect-error an order names its path in `by`
const unordered: DataTableOrder = { key: 'name' };

// The validators: length(min, max?, error), range(min, max, error), and the email rule's own test.
const rules = { name: [required(), length(3, 40, '3 to 40 letters')], budget: range(100, 50000, 'Out of range') };
const mailOk: boolean = emailTest('ada@rui.example');
// @ts-expect-error the email test reads text
emailTest(42);

// A view of components from every entry.
const value = $signal(R, '');
void (
  <Rui theme={theme} scheme="dark" labels={{ close: 'Fechar', step: (i: number, n: number) => `Passo ${i} de ${n}` }}>
    <Modals>
      <Stack gap="md">
        <TextInput label="Nick" value={value} onChange={(e: any) => $write(value, e.target.value)} />
        <Button variant="soft" color="teal" onPress={menu.open}>Open</Button>
        <DigitRoll value={1234} />
        <Busy shown />
        <ColorPicker format="rgb" alpha defaultValue="#ff0000" />
        <DatePanel />
        <LineChart h={200} data={[{ month: 'Jan', rain: 40 }]} category="month" series={[{ key: 'rain', label: 'Rain' }]} />
        <Notifications store={notifications} />
        <Launcher store={launcher} actions={[]} />
        <Carousel />
        <Dropzone onDrop={() => {}} accept={imageTypes} />
        <Snippet code="let a = 1;" language="ts" />
        <LoadBar />
        <Editor />
        <QrCode value="rui" />
        <DataTable rows={rows} fields={fields} defaultOrder={order} />
        <Select data={['Oslo', 'Lima']} searchable match={startsWith} limit={5} />
      </Stack>
    </Modals>
  </Rui>
);

void isOpen, indigo6, rules, mailOk, unordered, contact, valid, ok, level2, pattern, text, tomorrow, day, x, types, tokens, step, id;
$dispose(R);
