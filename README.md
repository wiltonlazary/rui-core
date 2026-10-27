# rui-core

rui's components: a complete set of layout, inputs, combobox, buttons,
navigation, feedback, overlays, data display and typography, with hooks,
forms and extensions, built on ren-core's portable primitives. The same
component renders the same on ren-dom (the browser lays it out), ren-skia
and ren-three (ren-canv lays it out with Taffy and paints it), in a worker
too, since it is only application code.

```jsx
import { $signal, $active, $read, $write } from 'ren-core';
import { Rui, Surface, Stack, Heading, Text, Row, Button } from 'rui-core';

const Counter = () => {
  const count = $signal($active(), 0);
  return (
    <Rui scheme="dark">
      <Surface p="md" bordered>
        <Stack gap="sm">
          <Heading level={3}>Counter</Heading>
          <Text fg="quiet">{() => `pressed ${$read(count)} times`}</Text>
          <Row>
            <Button onPress={() => $write(count, $read(count) + 1)}>Add</Button>
            <Button variant="soft" color="red" onPress={() => $write(count, 0)}>Reset</Button>
          </Row>
        </Stack>
      </Surface>
    </Rui>
  );
};
```

The package is published on npm as `@maxenve/rui-core` under the MIT license;
install it under its import name: `npm install rui-core@npm:@maxenve/rui-core`.
Its components ship as `.jsx` source, which the application's JSX build
compiles (ren-core's README, "Components and JSX"): a bundle built with
`--jsx=automatic --jsx-import-source=ren-core` or with the `ren-core/esbuild`
plugin, or `node --import ren-core/loader` under Node.

## Theme

`BASE_THEME` is the theme every component starts from:
- `colors`: 13 hues in color-wheel order (red, orange, amber, yellow,
  lime, green, teal, cyan, blue, indigo, violet, purple, magenta), then
  gray and night, each 10 shades (0 lightest) drawn in OKLCH on one
  lightness curve and one chroma curve, so a shade index means the same
  weight in every hue. White text on shade 6 passes WCAG AA in every hue.
- `accent` indigo at `accentShade` 6 in both schemes; `corner` md (the
  radius components take by default); `contrast` off (solid text is
  white; `contrast: true` picks black on fills past `contrastThreshold`
  .179, where black and white text have equal contrast; checks and dots
  always follow the threshold); `gradient` teal to indigo at 120 degrees.
- `spacing` (8, 12, 16, 24, 32 on a 4 px grid), `radius` (3, 6, 10, 14,
  24), `fontSizes` (12, 13, 15, 17, 19), `lineHeights`, `breakpoints` (xs
  32em, sm 44em, md 60em, lg 72em, xl 90em), `shadows`, `extra` (free
  values for the application).
- `headings`: `{ weight: 700, levels: [{ size, leading }, …] }`, level 1
  first: 36, 29, 23, 19, 17 and 15 px, a 1.25 ratio up from the body.

`themeOf(overrides, base)` merges deeply over `BASE_THEME` (a color's shades
replace); `Rui` provides a `theme` and a `scheme` (`'light'` or `'dark'`),
each a value or a signal. A new theme or scheme restyles every component in
place: a component's style is one binding (`styled(props, own)`).
The theme's own tables (`colors`, `spacing`, `sizes` and the rest) have no
prototype, so a name such as `toString` is no entry: read them with
`Object.hasOwn` or `in`, not `.hasOwnProperty`. `extra` is the
application's own data and keeps its prototype.

The words components show of their own (a close button's name, 'Clear',
'Show password', 'Loading', a chart's summary, …) are `BASE_LABELS`,
English, keyed by what each names; the ones that take a value are
functions of it (`remove(value)`, `step(i, n)`, `chartSummary(kind,
names, points)`). `Rui`'s `labels` puts other words over them for
everything inside (a map, or a signal or accessor of one; a nested `Rui`'s
over the outer's), and a change of the words reaches what is shown. A
component's own prop for a text (`label`, `placeholder`, `moreLabel`, …)
still wins. `$ui().labels()` reads them. The dates extension's words are
`DateSettings`' `labels`, the editor's its `labels`, and Dropzone's
rejections `REJECT_LABELS`.

- Colors: a theme color name (its accent shade), `'name.shade'`
  (`'blue.3'`, `'night.7'`), or CSS hex. `accentShade()` and
  `pageColors()` read the theme for a scheme.
- Color roles (`pageColors(theme, scheme)`): components never name a gray
  or night shade. Every surface, edge, track and hover reads a role, and
  `src/theme/resolve.js` is the one place that maps roles to shades (a
  test fails on a raw shade anywhere else in `src/`). Tinted grounds of a
  theme color use `TINTS`.

  | Role | For | Light | Dark |
  | --- | --- | --- | --- |
  | `body` | the page | white | night.8 |
  | `text` | body text | gray.9 | gray.1 |
  | `quiet` | secondary text, inactive labels (7 : 1 or more) | gray.7 | night.1 |
  | `placeholder` | hints, outside days | gray.6 | night.2 |
  | `border` | field and control edges (3 : 1) | gray.5 | night.3 |
  | `rule` | dividers, card edges, soft outlines | gray.2 | night.5 |
  | `edge` | thick lips and grips (Key's lip, Panes' grips) | gray.4 | night.4 |
  | `neutral` | the `neutral` variant's ground | white | night.6 |
  | `hover` | hover on page-colored surfaces and rows | gray.0 | night.5 |
  | `field` | input ground | white | night.7 |
  | `sunken` | wells below the page: code, Snippet, Tag, Key, soft inputs | gray.1 | night.9 |
  | `raised` | surfaces above the page: Card, Notification, panels | white | night.7 |
  | `track` | the unfilled part of sliders, switches, progress, rings; Skeleton | gray.2 | night.5 |
  | `stripe` | alternate table rows | gray.2 at `opacity.soft` | night.7 |
  | `disabled`, `disabledText` | disabled ground and text | gray.1, gray.4 | night.7, night.4 |

  In the light scheme a raised panel is white on white, set off by its
  shadow and `rule` edge; in the dark scheme it is lighter than the body.
  `sunken` goes below the page in both. Tooltips and the Slider's value
  label wear `tooltipColors`, the other scheme's roles.
- Variants (`variantColors`): `solid`, `soft`, `outline`, `ghost`,
  `neutral`, `plain`, `inverse`. Solid text is white; with `contrast:
  true` the theme picks black on fills past `contrastThreshold`. Tinted grounds use one scale
  (`TINTS`: rest .14, hover .22, wash .08 in light; .22, .30, .12 in
  dark), with text at the deep shade (8 in light, 3 in dark). Button,
  IconButton, Badge and IconBox take `variant="gradient"` with
  `gradient={{ colors, angle }}` (two or more colors spread evenly along
  the angle; the theme's `gradient`, teal to indigo at 120, by default).
- Layers (`LAYERS`): `raised` 10 (Pin, Busy, sticky heads), `sheet` 20
  (Modal, Drawer, Dialog, ActionBar, Window, Floater, Launcher), `float` 30
  (Popover, HoverCard, Menu, the combobox and picker panels), `tip` 35
  (tooltips), `toast` 40 (Notifications), `top` 50 (LoadBar). A sheet sits
  under the panels it opens.
- Motion (`MOTION`): `quick` 110 ms, `base` 190, `calm` 300, and `hold`
  1500 (how long a confirmation stays), easing ease-out; a `motion` prop takes a preset's name or `{ effect, duration,
  exit, easing }`. Popovers, menus and tooltips move quick, Modal and
  Dialog base, Drawer calm.
- Responsive values, in object form (`columns={{ base: 1, sm: 2, lg:
  4 }}`): the value of the widest breakpoint the application root's
  viewport reaches (min-width, mobile first; ren-core's `$viewport`, so
  on every renderer and in a worker), `base` below them. Grid (`gap`,
  Grid.Col `span`, `offset`, `order`), Tiles (`columns`, `gap`,
  `rowGap`), Shell (part sizes, and `fold`: below it a nav or side lies
  over Main, hidden with `hide: { nav: 'narrow' }`) and Carousel
  (`span`, `gap`) take them.
- Style props on every component: `m`, `mx`, `my`, `mt`, `mr`, `mb`, `ml`,
  `p`, … (scale steps or pixels), `w`, `h`, `minWidth`, `maxWidth`,
  `minHeight`, `maxHeight`, `bg`, `fg` (`'quiet'` too), `fontSize`,
  `fontWeight`, `textAlign`, `textTransform`, `lineHeight`, `opacity`,
  `flex`, then `style` (the portable style) over them. A margin or
  padding prop for some sides (`py`, `mt`) sets those; the others keep
  the component's own.

## Conventions

One word for one concept, the same in every component, and no DOM or CSS
vocabulary, so a name means the same on every renderer.

- Presses are `onPress`; a drag's end is `onCommit`; a combobox option
  chosen is `onPick`.
- The main value is `value`, `defaultValue` and `onChange` (`checked`
  and `defaultChecked` for choices). Any other state `x` is `x`, `defaultX` and `onXChange`
  together: `open`, `defaultOpen`, `onOpenChange(open)` for everything
  that opens or discloses (Modal, Drawer, Popover, Menu, Tooltip,
  Excerpt, NavItem, the combobox fields, Launcher, Window; Collapse reads
  `open` alone);
  `search`, `sort`, `expanded` (JsonTree too, as node ids: the path's keys joined by
  dots, a key's `\` and `.` escaped with a backslash), `shown`
  (PasswordInput; Busy, Transition, Dot and Combobox.Panel read `shown`
  alone), `period`
  (Calendar and the date panels: the month, year or decade on view),
  `flipped` (Flip), `started` (Onboarding) likewise. Handles take
  options last: Carousel `goTo(index, { instant })`.
- Content before and after the main content is `start` and `end` (with
  `startWidth`, `endWidth`); a side is `start` or `end`, never left or
  right (`labelAt`, `checkAt`, `chevronAt`, `listAt`). Placement against
  something is `at` (`'top'`, `'bottom-start'`, …). Paired content is
  `before` and `after` (Compare), paired navigation `previous` and `next`
  (`previousLabel`, `nextIcon`).
- A boolean that shows a part is the part's noun (`arrow`, `legend`,
  `tooltip`, `controls`, `dots`, `check`, `backdrop`, `portal`); a
  quality is an adjective (`bordered`, `closable`, `copyable`,
  `removable`, `sticky`, `persistent`). A boolean names what is on; its
  default is true where the part shows by default (`controls={false}`,
  `outside={false}`).
- A part prop takes four forms: `false` (no part), `true` (the built-in
  part), a node (your own) or an object of options for the built-in one:
  `closable={{ label: 'Dismiss' }}`, `arrow={{ size: 8 }}`,
  `backdrop={{ opacity: 0.4 }}`, `motion={{ effect: 'fade',
  duration: 150 }}`, `xAxis={{ title: 'Month' }}`, `chevron={{ size: 12,
  turn: false }}`. A styleable part has
  its own `*Style` prop (`fieldStyle`, `outerStyle`); a per-item function
  ends in `Of` (`dayOf`, `tipOf`, `iconOf`); render callbacks are
  `render*`. Commands come through `getHandle(handle)`.
- Overlays: `dismiss` (`{ escape, outside }`, or `false`), `trap`,
  `refocus`, `portal` (true), `layer` (stacking order), `persistent`
  (built while closed), `stack`, `full`, `offset`. `EFFECTS` names the
  motions: `fade`, `rise` and `sink` (in from below or above, by spacing
  xs), `from-start` and `from-end`, `grow` (about the center), and
  `slide-top`, `slide-bottom`, `slide-start`, `slide-end` (in from that
  edge).
- Parts are reached as `Parent.Part` only. Shared roles use these names:
  `Trigger` (what opens), `Panel` (what opens), `List` (the options),
  `Close`, `Frame` (the composition base), `Backdrop`, `Track` and
  `Segment` (progress), and Table's `Head`, `Body`, `Foot`, `Row`,
  `Heading`, `Cell`, `Scroll`; other parts are named by what they are
  (`Grid.Col`, `Card.Media`, `Modal.Body`, `Carousel.Slide`).
- Variants: `solid`, `soft`, `outline`, `ghost`, `neutral`, `plain`,
  `inverse`, `gradient`, `dot`; fields `outline`, `soft`, `bare`;
  Accordion `plain`, `boxed`, `soft`, `split`; Tabs `line`, `outline`,
  `pill`. A shape is `kind` (Loader `ring`, `bars`, `dots`), a line style
  `line`, a date picker's selection `mode` (`single`, `multiple`,
  `range`).
- A provider is named by what it provides (`Rui`, `DateSettings`,
  `Modals`, `ModalHost`); a context is a noun (`Theme`, `Scheme`, `Clock`); a
  store is made by `<noun>Store()` (`notificationsStore`, `loadBarStore`,
  `launcherStore`, as `manualClock()`), reached by `$name()` and its
  `*Context`, read through accessors
  (`isOpen()`, `active()`) and driven by verbs (`open()`, `next()`).
- Hooks are `$` and a plain word or two: `$open`, `$list`, `$patch`, `$bound`,
  `$model`, `$history`, `$pages`, `$debounced`, `$debounce`,
  `$throttled`, `$outside`, `$shortcuts`, `$trap`, `$spy`, `$scheme`,
  `$fits`, `$online`, `$title`, …
- What a panel opens from is its `trigger` (`width: 'trigger'`,
  `Flip.Trigger`, the combobox's `setTrigger`); Onboarding's highlighted
  element is its `Spot`.
- A choice of form is a `kind` (chart kinds `group`, `overlap`, `stack`,
  `share`, `diverge`, `cascade`; `MixedChart` series; TimePicker; Loader).
  Line and grid choices share `'rows' | 'columns' | 'both' | false`
  (Table `lines`, chart `grid`); signs and trends are `up` and `down`.
- An option is `{ value, label, disabled }`, or `{ …, action: true, icon }`
  for one that does something rather than stand for a value (a list's
  "Manage…"): drawn apart, under a rule, as a soft button with its icon.
- Grouped data is `{ label, options }` (Launcher: `{ label, actions }`);
  a change reports the value only, and `onPick(value, option)` gives the
  chosen item. Chart items are `{ label, value, color }`. A search matches
  one item at a time, `match(item, search) → boolean`, and `limit` caps the
  shown count (Select, Autocomplete, Picker, Cascader, Launcher; Cascader's
  item is a path, `match(nodes, search)` with its nodes from the root);
  `max` caps the picks (MultiSelect, TagInput, TreeSelect).
- DataTable reads a `fields` map keyed by the row path (`'address.city'`):
  its key order is the column order, and a field left out is not shown;
  `order { by, desc }`, `pages`, `picking` and `density` are one prop
  each.
- One part takes a value: `Editor.Heading level`, `Editor.Align value`,
  `Dropzone.Show when`, `Menu.Branch label`.
  Label maps are keyed by the part's own name (`LABELS.bold`,
  `LABELS.heading(2)`).
- Results use short verbs and plain returns: `$form`'s `validate() → {
  ok, errors }`; `$pages` → `{ items, page, go, step }`; `$modalStack(ids?)`
  → `{ value (the open ids, bottom to top), top(), isOpen(id), open, close,
  toggle, clear, bind(id) }` (an id outside a given list throws); LoadBar's `run`, `hold`, `to`, `add`,
  `finish`, `clear`; `$modals`' `show`, `ask` (a Promise of true or
  false), `showNamed`, `hide`, `clear`, `update`; `$notifications`'
  `show`, `hide`, `update`, `clear`; `$treeState`'s `expand`, `collapse`,
  `select`, `deselect`, `expandAll`, `collapseAll`.
- A hook returns one handle: its state as rrx-core nodes
  named by nouns, the main one always `value` (read with `$read`, or given
  to JSX as is), and its commands as verbs. `const menu = $open(false);
  menu.value; menu.toggle()`. Options are one object after the hook's own
  inputs; collections use JavaScript's verbs (`push`, `unshift`, `pop`,
  `shift`, `filter`, `map`; a Set's `add`, `delete`, `has`, `clear`).
  Each handle has a type named `…Handle` (`OpenHandle`, `ListHandle<T>`).
- Numbers take their marks from the locale (`Intl.NumberFormat`): a
  `locale` prop, the platform's by default (Pie and Donut: 'en-US', see
  Defaults); an explicit `groupMark` or
  `decimalMark` string wins.
- Date formats take the tokens `YYYY MM DD HH mm`, `EEEE`, `a`, …; dates
  are ISO 8601; `weekStart` is 1 and `weekend` [0, 6]; time is 24-hour,
  or 12-hour with AM and PM.
- Modifiers: Button `dense`, IconButton and
  CloseButton `field` (as tall as a field of that size).
- Text is selectable only where a component means it: an Edit, `Code`,
  `Snippet`, or anything styled `select: 'text'`; the rest is an app's, not
  a page's (no I-beam, no page-wide Ctrl+A, no browser menu outside an
  Edit). The renderer's `behavior` option (`'page'`, or one switch such as
  `{ like: 'app', select: true }`) brings a page's back.
- An application's own menus, off by default, the same on the DOM, Skia
  and three.js (each acts through ren-core's text actions):
  - The field menu: with `control.editMenu` 'app' in the theme (or a
    field's own `editMenu` prop, which wins: every text field, the
    combobox fields' search, Combobox.Filter, TagInput's entry, Launcher's
    field, the Editor's link field), a right press, a finger's long press,
    Shift+F10 or the ContextMenu key opens rui's menu in place of the
    platform's: Undo, Redo, Cut, Copy, Paste and Select all, each with its
    keys as the platform writes them ('Ctrl+X', '⌘X'). It keeps the field's
    selection and focus (opened by the keys, the focus goes to its first
    item); each item puts them back before it acts; Cut and Copy leave a
    secret field alone, and Undo, Redo, Cut and Paste a read-only one; a
    disabled field keeps the platform's. Paste reads the clipboard
    (`$clipboard`'s `paste`); where the platform refuses, the item turns
    into 'Paste with Ctrl+V' and the menu stays open. A right press on a
    combobox's field opens this menu, not its list. In worker mode the
    field's actions stay on the main thread, so the platform's menu stays.
    The Editor's blocks keep their own behavior (the platform's menu).
  - The text menu: with `control.textMenu` 'text', a right press on
    static text (a Label's, not a press target's or a field's), with 'all'
    on any text but a field's (a button's, a pressable row's, a bar's too;
    while one is selected its presses select, never press it), opens Copy (that
    text) and Select text (that text alone becomes selectable, all of it
    selected, until a press elsewhere or Escape; a drag in it keeps a part,
    which Ctrl+C or the menu copies); over a selection it opens Copy of the
    selection. The outermost `Rui` holds it (no box: its menu is a portal).
    A ContextMenu's region or a field's menu that took the press keeps it.
    A finger's long press does not open it.
- The pointer over what presses is the theme's `cursor`: `press` (a hand,
  'pointer') over every press target (a button, an option, a pressed field
  all over and a field's chevron, a Box or Card with `onPress`, a bar…)
  and `disabled` ('not-allowed') over one that takes no press now. An app
  sets other CSS cursor names, or `null` for none (the renderer's own
  pointer): `themeOf({ cursor: { press: null } })`. It shows the same on
  the DOM, Skia and three.js.
- Every component style number comes from a theme token, never an inline
  literal: `opacity` (faint .16, soft .3, disabled .45, muted .7, dense
  .88), `weights`
  (regular 400, strong 600 for labels, bold 700), `ratios` (glyph .42,
  mark .3, inset .3, icon .62: a share of a box's height; pad .75 of a
  font size), `control` (labelGap 6, panelPad 6, optionPad [6, 12], iconGap
  8, textStep 1, `pad` and `densePad` by size, table `density`), `chart` (pointArea
  48, axisWidth 56, axisShare 1/3, band .72, bandGap 6, labelOffset 6, outer .84, inner
  .16, dim .16), `sizes` (every component's sizes by step: control
  heights, icons, avatars, checks, sliders, loaders, modals, …; `glyph`
  for inline icons and `box` for components' default boxes),
  `radius.round` for pills and circles, `lineHeights.code`
  1.65, MOTION for durations, LAYERS for stacking, and the spacing, type
  and leading scales; a control's notes sit `fontBelow(theme, size)`
  (steps down the type scale), never a pixel offset. A theme overrides any
  of them with `themeOf`. `test/tokens.test.js` refuses literal
  opacities (in styles, alpha() and '#rrggbbaa' colors), weights, leadings,
  font sizes, stacking orders, size divisions and decimal ratios, any
  literal in a padding, margin or gap, pill radii, `duration` defaults and
  tween durations, px boxes, glyphs and offsets (props, defaults, widths
  and heights, UPPER_CASE px constants, default positions), hidden tables of them and size tables keyed by step, in `src/core`, `src/ext`, `src/hooks` and
  `src/form`; drawing math may mark a line `// geometry: <reason>` and a
  loop period `// cycle: <reason>`, and those stay few.

## Defaults

The defaults come from rui's scales: spacing, the palette, the motion
presets and the layers.

| Component | Defaults |
| --- | --- |
| Modal | size 560, `at` 'top' at offset 64, padding lg, shadow lg, motion base grow; taller than the screen, it scrolls in its layer (a Drawer's body in its panel) |
| Drawer | `at` 'end', size 360, offset 0, motion calm |
| Dialog | at `{ bottom: lg, right: lg }`, padding lg, shadow lg, motion base rise; its close in flow at the first row's end |
| Popover, Menu, HoverCard | padding 8 × 12, spacing xs × sm (Menu: panel 6, items 6 × 12, labels 600), offset 6, shadow md, motion quick; HoverCard delays 80 / 240 |
| Tooltip | the other scheme's roles (`tooltipColors`), padding 3 × 9 (half the label gap; `ratios.pad` of its font), font xs, offset 6, delays 500 / 100, at once on keyboard focus; Tooltip.Follow at 'bottom-end', offset 12 |
| Combobox panels | offset 4, motion quick fade |
| Backdrop, Busy | night.9 at `opacity.disabled` .45 (`opacity.muted` .7 dark), `opacity` fading the color or the gradient's stops (never the children); Busy while `shown`; Busy the body at .7; no blur |
| Buttons, Chip | side padding `control.pad` (10, 12, 16, 20, 24 from xs), dense and a checked Chip `control.densePad` (5, 6, 8, 10, 12) |
| Button.Group, IconButton.Group | a frame: its edge and a line between each pair of children as rendered (a `For`'s items and an accessor's parts one by one, a `Show` showing nothing none) `divider` xs (1 px) in the page's `border`, the theme's corner, clipping its children; the children draw no border and no radius |
| Switch, SegmentedControl | `duration` quick and base (a MOTION name or ms) |
| Checkbox, Radio | `variant` 'solid' or 'outline'; the check `ratios.icon` of the box, Radio's dot `ratios.mark` |
| Card | a frame: `Card.Media` sits across the card's top (all media, in order; the first with the card's corner), the body padded below; `Card.Rule` a hairline across |
| Skeleton, Loader | Skeleton covers while `loading` and breathes between `opacity.disabled` and `opacity.dense` while `pulse`; the ring's track `opacity.faint`, resting dots `opacity.soft` |
| Onboarding | `value` 0 (Book too), layer float, backdrop at `opacity.disabled`; Flip, TextAnimate duration calm; Flip and Compare `orientation` 'horizontal'; Book two calm steps |
| QrCode, `encodeQr` | `level` 'M', `versions` [1, 40] (the smallest that fits), `mask` the lowest penalty, `raise` false (raises the level while the version still fits) |
| `$modals` | a record's `kind` 'ask', 'plain' or 'named' |
| Dropzone | `accept` one list (extensions, MIME types, `image/*` families; none: everything); past `max` the first files stay and the rest are rejected 'too-many'; `maxSize` Infinity, `minSize` 0; `mimeTypes` holds 35 extensions in eight kinds (images, audio, video, documents, sheets, slides, archives, text), alphabetical within each, their values IANA media types (tar, which has none registered, its common `x-` type), and each kind has its list (`imageTypes`, `audioTypes`, `documentTypes`, …) |
| Pin, Dot | Pin at `{ bottom: lg, right: lg }`; Dot size 8, offset 0, `anchor` `{ x: 1, y: 0 }` (fractions of the box), `shown` true; `bordered` adds a 1 px ring in `raised` |
| Notifications | at 'top-end', limit 4, timeout 5000 ms, width 360 |
| LoadBar | size 2, interval 400, the accent, layer top |
| Launcher | size 640 (`sizes.box.launcherWidth`) at offset 96, list height 360, no `limit` (as Select, Autocomplete, Picker, Cascader), `loop` true (the arrow keys wrap), shortcut 'primary+K', placeholder 'Find an action', empty text 'No matches' |
| Ring, Arc | Ring 112 × 10 (`sizes.progress.lg`); Arc 180 × 14, `sweep` 180 from `start` -sweep/2 (standing over the top, open at the bottom), `label={{ at }}` 'center' (or 'bottom', 'end'), a negative `sweep` fills the other way; motion calm |
| Notification | a tone dot (`ratios.mark` of the first line) or the icon in its color, title strong, message in the text color one step below, dimmed to `opacity.muted` under a title, `loading` a rule along the bottom edge, edge border, shadow md, closable at xs |
| Progress | sizes 3, 4, 6, 10, 14 |
| Badge | heights 18, 20, 22, 26, 30, radius sm |
| Timeline | `value` none (nothing reached), marker 16, line 2 |
| Excerpt | height 120, 'More' / 'Less' |
| Carousel | align 'start', `span` 100 %, ends 'open' (or 'fill': the frame stays filled), dots named `n / total`, duration calm, buttonSize 32, buttonInset xs, autoplay 5000 (never starting itself while the user asks for reduced motion; its play still starts it); a percent span holds the gap; its `region` and slide `group`s carry `aria-roledescription` |
| CopyButton, `$clipboard` | `hold` MOTION.hold (1500 ms); CopyButton 'Copy' / 'Done' (as Snippet) |
| Field menu, text menu | `control.editMenu` 'browser' (the platform's; 'app': rui's own), `control.textMenu` 'off' ('text', 'all'); the menu at the press's point ('bottom-start'), a long press held 600 ms (twice `MOTION.calm`) by a finger or a pen, canceled past 10 px; 'Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select all', 'Select text', `pasteWithKeys(keys)` ('Paste with Ctrl+V') |
| TagInput | separators `[',', ';']` |
| FileInput | one file shows its name ('file' when it has none), several `countText(n)` ('N files'); empty is null in every mode, and a clear sets null |
| Chip.Group | single: null, `toggle` true (a press on the chosen chip clears it); `multiple`: `[]` in press order, `max` none |
| Rating | amber, size md, `count` 5, `divisions` 1 (whole symbols) |
| PinInput | length 6, accept 'digits', placeholder '·', gap xs |
| NumberInput | clamp 'commit' (on blur and Enter), marks from the locale |
| CurrencyInput | `display` 'symbol' ('narrowSymbol', 'code', 'name', 'none'), placed and spaced as the locale writes money (R$ 12,50; 12,50 €), a name following the amount; the currency's decimals (`currencyDecimals`) unless `decimals` is given; NumberInput's other defaults |
| Combobox panels (height) | panelHeight 280 |
| Select, MultiSelect lightbox | the theme's `control.lightbox` (null: never; a breakpoint key below which the options open in a centered lightbox titled by the field's label), a filter there past `control.typeahead` (10) options or for a searchable Select, a MultiSelect's Done; the options' height the viewport's less `sizes.box.boxed` (240), at least `panel` |
| Combobox lists | as high as their options up to `panelHeight` (a ScrollBox.Fit), scrolling down only, without bars; an option's label too wide for the panel ends with an ellipsis (its full text still its name) |
| ColorPicker, ColorInput | format 'hex' (or 'rgb', 'hsl'), `alpha` false, no value until picked (opens on the accent), swatchColumns 8; `picker` true: the spectrum, then the swatches ('collapsed': the swatches, then 'More colors', which shows the spectrum under them) |
| ColorInput | value '' (no color); the panel at 'bottom-start', opened by a press or ArrowDown (not by focus); `revert`, `sticky`, `typing`, `preview` and `eyedropper` true; the empty preview a Swatch of 'transparent'; the eye dropper named 'Pick a color from the screen', disabled while the field is disabled or read-only |
| JsonArea, PasswordInput | JsonArea `rows` 4, `indent` 2, `parseError` 'Not valid JSON', `pretty` false; PasswordInput's toggle 'Show password' / 'Hide password' |
| Checkbox, Radio | 14, 18, 22, 26, 30 (xs to xl); Radio's dot `ratios.mark` (30 %); `checkColor` and `dotColor` black or white by the theme's contrast rule |
| Chip, Slider | radius the theme's corner |
| Tag | size xs, radius sm |
| Rings | 112 × 10, `trackOpacity` `opacity.faint` |
| Stepper | `value` 0; numbered chips (`sizes.step` at `size`, or `chipSize`) without a border, rounded by the corner up to a circle; a track (`sizes.progress`) between them that fills in the stage's tone once the stage is done; `reach` 'back' (a press moves back to a done stage only); gap lg between the stages and the content |
| Breadcrumbs, Pagination | '›' with gap sm between the crumbs as rendered (as Button.Group's lines); Pagination `around` 1 and `ends` 1, pages gap 4, ghost controls, the current page a soft wash with a tone underline |
| EmptyState | parts `.Mark`, `.Heading`, `.Note`, `.Buttons` (props `mark`, `heading`, `note`), aligned to the start |
| Progress | `moving` runs a sheen along the bar (apart from `striped`); `Progress.Text` inside it |
| Tree | `store` (from `$treeState`); `renderItem({ open, chosen, handle })`; the open nodes kept as a Set |
| DataList | rows apart by a gap and a hairline in the edge role between them |
| Menu.Branch, ActionBar | a branch opens at offset `control.panelPad / 2` after `MOTION.quick`; ActionBar closes on Escape, its parts apart by a gap |
| Modal | `Modal.Body` padded `spacing.xs` at the top under a header |
| DigitRoll | easing 'settle' |
| Tree, NavItem, Outline | indent md (Outline from level 2, its `value` 0); NavItem ghost, padding `control.optionPad`, label md, an edge at its start while active; chevrons turn quick |
| Accordion | trigger padding `control.optionPad`, gap `control.iconGap`; panel `[0, optionPad x, control.panelPad]`, indented under the label when the chevron is at the start; chevron `sizes.glyph.md` pointing to the end (or start) and turning 90° down as it opens, motion base |
| Tabs | tab padding `control.optionPad` (`control.pad.sm` across), label md strong, a hairline under the list, a round mark under the active tab; the outline variant raises the active tab with a top tone edge |
| Row, Flex | `wrap` a boolean: Row wraps by default, Flex does not; alignment takes these words only (`start`, `end`, `center`, `between`, `around`, `stretch`) |
| NavToggle | label 'Menu' |
| Link, NavItem | Link follows and shows only safe addresses; NavItem shows only safe addresses (it never navigates: its press is its `onPress`). Safe, as the editor keeps them: relative, `#…`, `http:`, `https:`, `mailto:`, `tel:`; any other scheme (`javascript:`, `data:`, read without case, control characters or whitespace) is not followed and shows no `href` |
| DataTable, Table | density 'even' from `control.density` (tight 4 × 8, even 8 × 12, airy 12 × 16); DataTable's empty text 'Nothing here yet'; a Table cell's number `w` (pixels) sizes its column (at least `w`, the rest shared; `minmax(w, 1fr)` with `fixed`), the cell stretching across it, a spanning cell's `w` its least width; a string `w` is the cell's own width |
| Shell | header 56, nav 280 |
| Panes | a number is pixels, a string '30%' a percent of the room (the container less its handles); a pixel list sizes every pane but the last (which takes the rest), a missing size `sizes.box.pane` (200); a percent list sizes every pane as a true percent of the room (under 100% in all leaves the rest empty, over 100% shares the room in proportion), the missing ones sharing what is left, each at least its `min`, a number in it pixels of the room; a given size outside its pane's bounds laid out and told within them; `min` 0 and `max` none (100% in a percent list), each in either unit; `orientation` 'horizontal'; `handleSize` `spacing.xs` (the handle's thickness), `step` its own prop, `spacing.xs` (the keys' step; Shift five), `handle` true: a `sizes.divider.xs` line in `rule` and a `sizes.glyph.xl` × `sizes.track.sm` grip in `edge` |
| Grid, Avatar.Group | Grid 12 columns, gap lg, Grid.Col `span` a number or 'auto'; Avatar.Group overlap `ratios.mark` of the side (or `overlap`), set apart by shadow sm |
| ScrollBox | `bars` true: the renderer's bars, as wide as its theme's bar, the thumb the page's `border` on its `track` (`thin` half as wide; false none, no room kept, still scrolling); `onEnd` (an endless list's next page) called within `endGap` (spacing lg) of the end down, after a scroll and as the box or its content changes size, once a frame at most, again once a promise it returns settles; `ScrollBox.Fit` as high as its content up to `maxHeight` (measured on every renderer: a Scroll without a height is the renderer's region high) |
| Marquee | repeat 2, gap lg, fade false (fadeSize xl when on, three stops to the page ground); the copies after the first are `inert` decoration (no Tab stop, no pointer, out of the accessibility tree), the first the live content; it holds still while the user asks for reduced motion |
| Dropzone | outline, teal valid, orange invalid, interactive |
| `$form`, `$idle` | touchOn 'blur', afterError 'check', `onChange(values, previous)`; `$idle` starts active |
| Editor | links keep only safe addresses: relative, `#…`, `http:`, `https:`, `mailto:`, `tel:`; any other scheme (`javascript:`, `data:`, read without case, control characters or whitespace) makes no link, in HTML, JSON or `link(href)`: the text stays, the mark is dropped; a document's text or highlight color is a CSS color: hex, a name, or rgb/hsl/hwb/lab/lch/oklab/oklch/color() of plain values (not var() or color-mix()), else the mark is dropped (a theme name such as `teal.3` is resolved by Editor.Swatch and Editor.Colors before it reaches the document, never by the model); hex, rgb and hsl draw on every renderer, a CSS name and the other functions on the DOM only; highlights write `background-color`; in its HTML a list item's text is a paragraph (`<li><p>…</p></li>`) |
| Snippet | leading `lineHeights.code` 1.65 (the editor's code blocks too), collapsed height 240, 'Show all lines' / 'Fold', 'Copy' / 'Done' |
| Charts | signColors `{ up: 'teal', down: 'orange' }`, a `share` axis 0 to 100 % (each value's share of its row's absolute total), reaching down in quarters to a negative value's share, grid 'rows' at `opacity.muted`, area fills `opacity.faint`, bars `opacity.dense` (`fillOpacity`), `gridColor` the page's border (muted), `textColor` quiet, dash '4 2', bridge false, `curve` 'monotone' (Sparkline's too; the curves are `linear`, `monotone`, `natural`, `step`, `bump`), an axis `domain` with the keywords 'dataMin' and 'dataMax'; Pie and Donut 180, drawn clockwise from three o'clock, gap 1° (pie) and 2° (donut), PieChart `labelsAt` 'inside' or 'outside', labels as percent (Intl, one decimal under 10 %) in `locale` 'en-US' by default (the exception to Conventions' platform locale); Funnel 260, labels inside, rows 2 px apart with a square last row; Radar grid, axes, points, tooltip, legend with two or more series; RadialBar labels at each bar's end and tooltip, `thickness` `sizes.progress.xl` (14); Bubble 300 tall on a value axis (as wide as its tick labels, `chart.axisWidth` at least, a third of its width at most), areas 24 to 400 px²; Heatmap `cell` `{ size: 12, gap: 2, radius: 'xs' }` (px or a radius step), today's calendar year, months and weekdays on, legend and tooltip off; Bars a label line over a thin track (`barSize` `sizes.progress.md`), a long label wrapping beside its whole value, rows spacing sm apart, each pressed with `onPress(item, index)` (named by its label and value, the page's hover tint); a cartesian chart's categories chosen with `onSelect(index, row)` (a press, or ← → Home End then Enter or Space on the focused chart, the tooltip following the keys). Every legend, a Legend of its own too, sits under the chart at its start (`bottom-start`) and follows a changing `at`; points are circles of `chart.pointArea`; the tooltip is a table of tone dots and names over their values on the sunken ground. The rest reads `theme.chart`: point area 48 px², a value axis as wide as its tick labels (`charWidth` a character, beside its tick), 56 at least and `axisShare` (a third) of the chart's width at most (a longer label ends with an ellipsis), a band's bars .72 of it with gap 6, labels offset 6, RadialBar radii .84/.16; Donut a 24 px ring (`sizes.box.donut`), others dimmed to .16 as a legend item is active (Legend `onActiveChange(key | null)`), point labels xs, reference lines orange (their label at `at`) |
| Dates | Calendar, the panels and DayStrip `period` from the value or today; DateInput 'D MMM YYYY' and `revert` true, DateTimeSelect 'YYYY-MM-DD HH:mm', DateSelect ranges ' → ', Calendar and DayStrip md; Calendar views `month`, `year`, `decade`, monthFormat 'MMM YYYY', yearFormat 'YYYY', decadeFormat 'YYYY' (each end of 'YYYY…YYYY'), monthCellFormat 'MMM' and yearCellFormat 'YYYY'; DayStrip 7 days, monthFormat 'MMM' (on a month's 1st) and weekdayFormat 'EEEEE'; week numbers by each row's Thursday (ISO), weekends in `quiet`, TimeSlots 4 columns; TimePicker `presets` in groups `{ label, times }` |
| Divider, Container | Divider size xs (1 px); Container side padding md |
| MaskInput | '_' for an empty slot |
| RangeSlider, AngleSlider | RangeSlider `push` true; AngleSlider Home at 0 and End at the maximum |

## Components

What exists is listed in `test/exports.lock.json`; open work is in
[TODO.md](TODO.md).

- Text is inline: children that hold Text, Link, Code or
  Mark elements are one Label of styled runs (ren-core's `runs`), which
  wraps across them; a Link's run presses as the Link does. Highlight,
  Mark, each code line of Snippet, InlineSnippet and
  the Editor's drawn blocks are Labels of runs too; the block being edited
  shows its marks as its Edit's runs (code a tint, sub and superscript
  plain there), in a multi-line Edit that wraps and grows as the drawn
  block does (one row at the least), so a block keeps its height and rows
  as it is edited; Enter splits a block, Up and Down leave a block from
  its first or last drawn row (its Edit's `caretRow()`; where a worker's
  Handle cannot tell, a one-row block at once and a longer one from its
  first or last place).
- Focus: FocusTrap, `$trap`, Modal, Drawer and a trapped Popover move
  the focus to their first focusable (ren-core's `$focus`) unless given
  one; Launcher's shortcut is heard anywhere in the root (`$keys`).

## Meaning

Components say what they mean with ren-core's `Meaning` props (WAI-ARIA
roles and states, following the Authoring Practices patterns), so
ren-json's `$json` gives a view's data by meaning, not by its visual tree;
the DOM gains the same accessibility, and the canvases paint nothing of
it. Decoration (icons, chevrons, markers, separators, backdrops, drawn
axis text) is `aria-hidden`; layout (Stack, Row, Grid, Surface, Card, …)
has no role and dissolves. A caller's `role`, `aria-*` and microdata
(`itemscope`, `itemtype`, `itemprop`, `itemref`, `id`, `content`,
`datetime`, `href`) pass on to the
layout components' View, and so do `data-*` props (the DOM
writes them, ren-json drops them) and `tabIndex` (ren-core's place in the
focus: a ScrollBox at -1 is a skip link's target, focused by its ref's
`focus()`).

- Typography: Heading `heading` (`aria-level` its level), Text `paragraph`
  (not with `inline` or `inherit`), Link `link` with `href`, Code and
  Snippet `code`, Quote `blockquote`, List `list` of
  `listitem`s, Table `table` of boxless `row`s (`display: 'contents'`) of
  `columnheader`, `rowheader` and `cell` (ren-json: a record per row keyed
  by the column headers), its caption `caption`; Mark, Highlight, Key,
  Badge stay text (Badge's as written: it shows upper case by
  `textTransform`).
- Data display: Avatar `img` named by `label` or `name`, Image the portable
  Image's `img`, Accordion triggers `aria-expanded` over `region` panels,
  DataList a `list` of `term` and `definition`, Timeline a `list`,
  DigitRoll named by its value, Excerpt's control `aria-expanded`.
- Inputs: a field is named by its label (`aria-label`; the label shown is
  then decoration), with `aria-required`, `aria-invalid` and its value (a
  password's never); NumberInput `spinbutton`; Checkbox and Chip
  `checkbox`, Switch `switch`, Radio and SegmentedControl `radio` in a
  `radiogroup`, each `aria-checked` (SegmentedControl's segments
  Actions, one Tab stop: the checked one at `tabIndex` 0, the others -1,
  the arrow keys, Home and End move it); Slider, RangeSlider, AngleSlider,
  Rating and the color sliders `slider` with value, `min` and `max`; the
  groups and FieldGroup `group` named by their label or legend; Select,
  Autocomplete, MultiSelect, TagInput and Cascader `combobox`
  (`aria-expanded`) over a `listbox` of `option`s (`aria-selected`);
  TreeSelect a `combobox` over a `tree` of `treeitem`s (`aria-level`,
  `aria-selected`, or with `checks` `aria-checked` true, false or mixed
  by the leaves under a row; parents `aria-expanded`; the chevrons that
  open them are decoration, the arrow keys open and close).
- Buttons: the Action's `button`, `aria-disabled`, `aria-busy` while
  loading; CloseButton named 'Close'.
- Navigation: Tabs `tablist`, `tab` (`aria-selected`), `tabpanel`, the
  list one Tab stop (every tab an Action, the active one at `tabIndex` 0,
  the others -1; the arrow keys, Home and End move it); NavItem
  `link` (`aria-current` 'page'; a parent `aria-expanded`); Breadcrumbs a
  `navigation` of a `list` of `listitem`s, the last `aria-current` 'page';
  Pagination and Outline `navigation` (`aria-current`); Stepper a
  `list` of `listitem`s (the current one `aria-current` 'step'), a
  `button` in each stage a press may move to (named by its label, or
  'Step i of n'); NavToggle `aria-expanded`; Tree
  `tree` of `treeitem`s; Menu `menu` of `menuitem`,
  `menuitemcheckbox`, `menuitemradio`; Menubar `menubar`.
- Feedback: Alert `alert`, Notification `status` (`alert` in red), the
  progress bars and rings `progressbar` with their value (a ring's text
  label its `aria-valuetext` only, not its name too), Loader and
  Busy a `status` named 'Loading' (said once over the backdrop),
  Skeleton `aria-hidden` while it shows.
- Overlays: Modal and Drawer a modal `dialog` named by the title (a
  `heading`), Dialog, Popover, HoverCard and Floater `dialog`,
  Tooltip `tooltip`, ActionBar `toolbar`; backdrops `aria-hidden`.
- Layout: Shell's Header `banner`, Nav `navigation`, Main `main`,
  Side `complementary`, Footer `contentinfo`; a bare Divider
  `aria-hidden`; Panes' handles `separator`s named 'Resize pane N' with
  the pane's size and bounds (in the list's unit) and `aria-orientation`;
  Marquee's first copy is its content and the repeated copies are
  `inert` decoration (no Tab stop, out of the accessibility tree and of
  ren-json's data).
- Extensions: charts `img` named by a summary (their kind, series and
  points; `aria-label` replaces it) holding their data as microdata, a
  schema.org `Dataset` item: `row`s as given (their plain fields, colors
  left out) with the `series` (`name`, `label`), a Sparkline's `value`s, a
  Heatmap's `row`s of `date` and `value`, a ScatterChart's `series` with
  their `point`s; the values sit in empty boxes out of sight (`UNSEEN`:
  nothing drawn on any renderer). Bars a `list` of items (microdata
  `name` and raw `value`); Calendar a `grid`
  of `row`s and `gridcell`s (`aria-selected`, today `aria-current`; each
  day's ISO date its `datetime`, a month's `YYYY-MM`, a year's `YYYY`, as
  DayStrip's days and TimeSlots' times; ren-json: a record per week
  keyed by the weekdays, each day `{ datetime, label, selected, text }`), the
  picker inputs buttons named by their label (`aria-expanded`), TimePicker
  `spinbutton`s; Carousel a `region` of slide `group`s; Dropzone
  `button`; Launcher a `combobox` over a `listbox`; LoadBar a
  `progressbar`; the Editor's content a multi-line
  `textbox` of its blocks' roles; DataTable a `table` of `row`s
  (`aria-sort` on sortable headers).
- Goodies: JsonTree a `tree` of `treeitem`s named by their paths
  (`aria-level`, `aria-expanded`, open children a `group`), Onboarding's
  card a `dialog` named by the step's title (a `heading`), AnalogClock an
  `img` named by its time ('10:09:30'), QrCode an `img` named 'QR code: '
  and its value, Gantt a `grid` (a `row` per task: its name the
  `rowheader`, its bar a `gridcell` named by its days, progress and
  dependencies), Led an `img` 'On' or 'Off', Spinner a `status`,
  Rings a `group` of `progressbar`s, Compare's handle a `slider`, TextAnimate
  named by its text (its segments decoration), Window a `dialog`,
  Flip.Trigger a `button` (named by its content), pressed by pointer or
  keyboard, so its content holds no controls; given a function child
  `(props) => control` it puts no button of its own and hands the caller's
  control `onPress`, `aria-pressed` ('true' while the back shows) and its
  `label` (or `aria-label`) as `label`; Book's pages turn by pointer only (no buttons, no keys), so
  the keyboard turns them through `value` and `onChange`, as Buttons
  beside the book that set the page.

## Hooks and form

`rui-core/hooks` holds the hooks as rrx-core operations (`$open`,
`$counter`, `$list`, `$debounced`, `$shortcuts`, `$localStorage`,
…); `rui-core/form` holds `$form` and its validators (`required`,
`email`, `pattern`, `range`, `length`, `same`).

- Each takes an optional root first (rrx-core's two spellings); the short
  spelling uses the root being built, so call it while a view is built, not
  in an event handler.
- Each returns one handle (Conventions): `$open` → `{ value, open, close,
  toggle }`, `$toggle` → `{ value, next, set }`, `$counter` → `{ value, add,
  set, reset }`, `$list` → `{ value, push, unshift, insert, pop, shift,
  removeAt, move, swap, replace, setField, filter, map, mapWhere, set }`,
  `$history({ limit })` → `{ value, entries, index, set, back, forward, reset }`
  (100 kept by default),
  `$selection` → `{ value, has, add, delete, toggle, all, some, set, clear
  }`, `$validated(initial, { check, valid })` → `{ value, valid, good,
  reason, set }` (`reason`: the text `check` gave for a failure),
  `$patch` → `{ value, set }` (a patch: its own keys over the current ones,
  a key given as undefined removed, no write when nothing changes),
  `$model` → `{ value, set, controlled }`, `$interval` → `{ value (running), start, stop, toggle }`,
  `$timeout` → `{ value (pending), start, stop }`, `$clipboard` → `{ value
  (copied), error, copy, paste, reset }` (`copy` through the Clipboard API, else the browser's copy command, so it copies outside a secure context too; `paste()` the clipboard's text, null where the platform refuses or has none), `$fullscreen` → `{ value (shown), ref,
  toggle }`, `$localStorage({ key, fallback, print, parse })` → `{ value, set, remove }` (JSON by default), and `$fits`,
  `$scheme`, `$online`, `$os` → `{ value }`. `$debounce` returns the
  debounced function with `cancel`, `flush` and `pending`.
- Values are rrx-core nodes; they clean up with their owner (timers,
  listeners).
- An input hook hands out props for a primitive
  (`$hover` → `{ value, props }`, `$move(onChange, { onMoveStart,
  onMoveEnd, dir })` → `{ value (held), props }`, `$idle` → `{ value,
  reset, props }`, `$spy` → `{ value (the active heading's index, 0 first), measured,
  headings, scroll, heading, scrollTo, refresh }`, `$eyedropper` → `{ value
  (the last color picked), available, pick }`, `$outside` →
  `{ inside, outside }`, `$shortcuts` → an `onKey` handler, or with `{
  global: true }` the root's every key (ren-core's `$keys`; a key typed in
  a field, the event's `editable`, is left alone unless `fields: true`);
  shortcuts are an object map, `{ 'primary+S': save }`: one chord each,
  parts joined by `+` (case and spaces ignored), modifiers `ctrl`
  (`control`), `alt` (`option`, `opt`), `shift`, `meta` (`cmd`, `command`,
  `win`, `super`) and `primary` (Cmd on macOS and iOS, Ctrl elsewhere), and
  one key as the browser names it or `space`, `plus`, `esc`, `del` (the key
  typed first; its position, `code`, only when no chord for the key is
  bound, as on a layout without that letter); a
  malformed chord throws; a match prevents the default unless `allowDefault`; `$trap` → `{ props: { trap, ref },
  start, active }`), so they
  work on every renderer. `$outside` sees presses inside
  the element holding `outside` only.
- `$fits`, `$scheme`, `$reducedMotion` and `$viewportSize`,
  called in a component, read the application root's viewport (ren-core's
  `$media` and `$viewport`: the window on the DOM, the canvas on Skia and
  three.js, the main thread's in a worker); elsewhere the platform's
  `matchMedia` and window.
- Platform hooks (network, title, fullscreen, clipboard, media queries
  outside a view) keep inert defaults where the platform lacks them (node,
  a worker).
- `$localStorage` uses the application root's `Storage` where there is one.
- `$form(R, { values, rules, validateOn, transform, keyed })`: values in
  a `$store`, paths `'a.b.0.c'`, `rules` by field or a schema function,
  validation on change or blur (`validateOn: { change, blur }`),
  `validate() → { ok, errors }` and `check(path) → { ok, error }`,
  `valid()`, `touched()` and `dirty()`, `get`, `set` and `merge`, one
  verb each for errors and marks (`setError`, `clear`, `touch`,
  `untouch`, `markDirty`, `settle`), `watch(path, (value, previous))`,
  list helpers (`insert`, `remove`, `move(path, from, to)`, `replace`)
  that carry errors along, `bind(path, { as })` for every input, and
  `submit(handler, onInvalid)` with `transform` (`busy` while it runs).
  Keyed (`keyed: true`), the inputs keep their own state: `bind` gives
  `defaultValue`, and `form.keyOf(path)`, read in a region around the
  input, re-mounts it when the form sets the field. `validateOn` lists
  paths and path patterns, segment arrays where `EACH` (a Symbol) stands
  for any list index (`['items', EACH, 'name']`). The validators return
  a short message when no error is named ('Fill this in', 'Not an email
  address', 'Wrong format', 'Does not match', and the bounds of `range`
  and `length`); `required` lets `false` through and stops `NaN`; `length`
  counts characters as seen, untrimmed unless `{ trim: true }`.

## Portability

- Components are portable primitives, styled by the portable `style`
  and the style props.
- Font weights reach the DOM as given (500 and 600 too); the
  canvases draw the nearest face they have (100 to 500 regular, 600 to 900
  bold).
- A press handler is `onPress`, on every renderer.
- Hooks are rrx-core operations (`$open`, …).

## Tests

`npm test`: the declarations, `tsc`, the TypeScript consumer of every
entry (`test/types/`), then the suites under the runtime JSX and the
compiled templates. `test/harness.jsx` renders a view on ren-dom
(happy-dom) and on ren-skia (headless CanvasKit) for parity checks; its
DOM window's ResizeObserver reports the boxes a test gives (`report()`), as
happy-dom lays nothing out. `test/meaning.test.jsx` reads
representative components through ren-json's `$json` (a devDependency)
and checks their roles, names, states and values.
