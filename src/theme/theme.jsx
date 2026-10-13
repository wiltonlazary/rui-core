// The theme: the base theme (palette, accent color and shade, scales for
// spacing, radius, font sizes, line heights, breakpoints, shadows and
// headings) as one plain object, provided with the color scheme through two
// rrx-core contexts, Theme and Scheme (Rui provides both). A component reads
// both with `$ui()`; a new theme or scheme restyles every component in place
// (their styles are bindings).

import { $context, $lookup, read } from 'ren-core';
import { BASE_COLORS } from './colors.js';
import { own, ownValue, tables } from '../own.js';

/** @typedef {'xs' | 'sm' | 'md' | 'lg' | 'xl'} Size */
/** @typedef {Size | number} SizeValue a scale step or pixels */
/** @typedef {'light' | 'dark'} Scheme */

/**
 * Components' default boxes, in px, where a component's own `size`,
 * `height` or `width` is not set.
 * @typedef {object} RuiBoxes
 * @property {number} ring Ring's and Rings' side
 * @property {number} arc Arc's width
 * @property {number} pie Pie and Donut's side
 * @property {number} donut Donut's ring thickness
 * @property {number} funnel Funnel's width
 * @property {number} chart a cartesian or scatter chart's height
 * @property {number} spark a Sparkline's height
 * @property {number} clock AnalogClock's side
 * @property {number} qr QrCode's side
 * @property {number} knob AngleSlider's side
 * @property {number} swatch a Swatch's side
 * @property {number} panel a combobox or tree panel's height
 * @property {number} menu a Menu panel's least width
 * @property {number} tip a wrapping Tooltip's width
 * @property {number} follow Tooltip.Follow's offset from the pointer
 * @property {number} empty an Empty state's text width
 * @property {number} reveal Excerpt's height while folded
 * @property {number} table DataTable's body height while it measures
 * @property {number} snippet a folded Snippet's height
 * @property {number} toast a notification's width
 * @property {readonly [number, number]} window a Window's size (width, height)
 * @property {readonly [number, number]} windowMin a Window's least size
 * @property {{ offset: number, list: number }} launcher the Launcher's offset from the top and its list's height
 * @property {number} launcherWidth the Launcher's width
 * @property {number} modalTop a Modal's offset from the top at 'top'
 * @property {number} select a Picker's panel width
 * @property {readonly [number, number]} at a Floater's or Window's first place (left or x, top or y)
 * @property {{ size: number, offset: number }} arrow a panel's arrow: its size, and its least distance from the panel's ends
 * @property {number} stripe a striped Progress's stripe period
 * @property {number} stage the height of Compare and TextAnimate's stage
 * @property {number} parallax Parallax's height
 * @property {number} pane a Panes pane's first size in pixels
 * @property {readonly [number, number]} book a Book page's size (width, height)
 * @property {number} tableCheck DataTable's picking column width
 * @property {number} tableRow DataTable's row height while it measures virtual rows
 * @property {number} windowTitle a Window's title bar height
 * @property {number} carouselButton a Carousel control's side
 * @property {{ day: number, row: number, label: number, header: number }} gantt Gantt's day width, row height, label column width and header height
 * @property {{ card: number, room: number, center: number }} onboarding Onboarding's card width, the room below a target before it flips above, and half its card's height when centered
 * @property {{ label: number }} bubble BubbleChart's category label height under its axis
 */

/**
 * A theme's overrides: any part at any depth (objects merge deeply; arrays
 * replace).
 * @template T
 * @typedef {{ [K in keyof T]?: T[K] extends readonly any[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }} DeepPartial
 */

/**
 * Component sizes, each by size step (xs to xl) unless it says otherwise.
 * @typedef {object} RuiSizes
 * @property {Record<Size, number>} control a control's height (buttons, inputs, fields, pickers)
 * @property {Record<Size, number>} dense a dense control's height
 * @property {Record<Size, number>} day a calendar day's side
 * @property {{ cell: readonly [number, number], column: readonly [number, number], presets: number }} time the time picker's cell (width, height), its scrolling column (width, height) and its presets' row width
 * @property {Record<Size, number>} icon an IconButton's or CloseButton's side
 * @property {Record<Size, number>} closeIcon a CloseButton's cross
 * @property {Record<Size, number>} iconBox an IconBox's side
 * @property {Record<Size, number>} avatar an Avatar's side
 * @property {Record<Size, number>} badge a Badge's height
 * @property {Record<Size, readonly [number, number]>} tag a Tag's height and font size
 * @property {Record<Size, number>} check a Checkbox's or Radio's box
 * @property {Record<Size, number>} swatch a ColorInput's preview swatch
 * @property {Record<Size, number>} colorThumb a color slider's thumb
 * @property {Record<Size, { w: number, h: number }>} picker a ColorPicker's saturation area
 * @property {Record<Size, number>} track a Slider's track thickness
 * @property {Record<Size, number>} thumb a Slider's thumb
 * @property {Record<Size, number>} rating a Rating's symbol
 * @property {Record<Size, number>} progress a Progress bar's thickness
 * @property {Record<Size, number>} loader a Loader's side
 * @property {Record<Size, number>} empty an Empty state's mark
 * @property {Record<Size, number>} step a Stepper's step mark
 * @property {Record<Size, number>} pagination a Pagination control's side
 * @property {Record<Size, number>} toggle a NavToggle's side
 * @property {Record<Size, number>} divider a Divider's thickness
 * @property {Record<Size, number>} indicator a small drawn indicator's side (Led, Spinner, …)
 * @property {Record<Size, number>} modal a Modal's width
 * @property {Record<Size, number>} dialog a Dialog's width
 * @property {number} drawer a Drawer's width (or height, at the top or bottom)
 * @property {Record<Size, readonly [number, number]>} chip a Chip's height and font size
 * @property {Record<Size, number>} container a Container's width
 * @property {Record<Size, number>} glyph an inline icon's side (a chevron, check or mark in a row or control)
 * @property {RuiBoxes} box components' default boxes (see RuiBoxes)
 */

/**
 * @typedef {object} RuiThemeValue
 * @property {Record<string, readonly string[]>} colors ten shades per color, lightest first
 * @property {string} accent a key of `colors`
 * @property {{ light: number, dark: number }} accentShade the shade solid variants use
 * @property {string} white
 * @property {string} black
 * @property {Record<Size, number>} spacing px
 * @property {Record<Size | 'round', number>} radius px; `round` makes a pill or a circle of any box
 * @property {Size} corner the radius components take by default
 * @property {Record<Size, number>} fontSizes px
 * @property {Record<Size | 'code', number>} lineHeights multiples of the font size; `code` is the leading of code blocks
 * @property {Record<Size, string>} breakpoints min-widths of the responsive values (em)
 * @property {Record<Size, { x: number, y: number, blur: number, color: string }>} shadows
 * @property {{ weight: number | string, levels: readonly { size: number, leading: number }[] }} headings the headings' weight, and each level's size (px) and leading (a multiple of the size), level 1 first
 * @property {boolean=} contrast black text on light solid backgrounds
 * @property {({ colors?: readonly string[], angle?: number })=} gradient the gradient variant's default: its colors (evenly spread) and angle
 * @property {number} contrastThreshold the luminance past which a background takes black text (0.179: where black and white text have equal WCAG contrast, so the pick is the more readable one)
 * @property {{ faint: number, soft: number, disabled: number, muted: number, dense: number }} opacity rui's opacity steps: a faint tint or dimmed series, a soft wash (a highlight, a quiet fill), a disabled control, a muted (resting, secondary) part, a dense fill that still lets the grid through
 * @property {{ regular: number, strong: number, bold: number }} weights font weights: body text, labels and emphasis, headings and marks
 * @property {{ glyph: number, mark: number, inset: number, icon: number, pad: number }} ratios parts sized by their box: a letter in its box (glyph), a dot on a badge or field (mark), a field's text inset from its start (inset), an icon in a square control (icon), each a share of the box's height; and a compact part's side padding as a share of its font size (pad)
 * @property {{ labelGap: number, panelPad: number, optionPad: readonly [number, number], iconGap: number, textStep: number, pad: Record<Size, number>, densePad: Record<Size, number>, density: Record<'tight' | 'even' | 'airy', readonly [number, number]> }} control control geometry: the gap between a field and its label and notes, a panel's inner padding, an option's padding (y, x), the gap between an icon and its text, how many font steps a control's notes sit below its text, a button's side padding by size (pad) and a compact one's (densePad), and a table cell's padding (y, x) by density
 * @property {{ pointArea: number, axisWidth: number, band: number, bandGap: number, labelOffset: number, outer: number, inner: number, dim: number, pointLabel: Size, reference: string, frame: { top: number, right: number }, tick: number, charWidth: number, near: number, line: number, legend: number }} chart chart geometry: a point's area (px²), a value axis's width, a bar's share of its band and the least gap between bars, a label's offset from its mark, a radial chart's outer and inner radius (shares of half its box), the opacity of the series not highlighted, the point labels' size and the reference lines' color; the plot's margins at the top and end (frame), a tick's length, a label character's estimated width, how near a point must be for its tooltip, a label line's height, and the legend's height
 * @property {RuiSizes} sizes component sizes by size step (see RuiSizes)
 * @property {Record<string, any>} extra free values for the application
 */

/**
 * A theme whose `extra` is a plain object again (tables() takes every
 * prototype; extra is the application's, not a table).
 * @param {RuiThemeValue} theme @returns {RuiThemeValue}
 */
const withExtra = theme => /** @type {RuiThemeValue} */ (own(theme, 'extra', { ...theme.extra }));

/** @type {RuiThemeValue} */
export const BASE_THEME = Object.freeze(withExtra(tables(/** @type {RuiThemeValue} */ ({
  colors: BASE_COLORS,
  // Indigo at shade 6 takes white text at 5.6 : 1 in both schemes.
  accent: 'indigo',
  accentShade: { light: 6, dark: 6 },
  contrastThreshold: 0.179,
  gradient: { colors: ['teal', 'indigo'], angle: 120 },
  white: '#ffffff',
  black: '#000000',
  // Spacing on a 4 px grid; radius from a hairline round to a pill-ish 24;
  // type on a 1.125 ratio around 15 px, headings on 1.25 up from the body.
  spacing: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 },
  radius: { xs: 3, sm: 6, md: 10, lg: 14, xl: 24, round: 9999 },
  corner: 'md',
  fontSizes: { xs: 12, sm: 13, md: 15, lg: 17, xl: 19 },
  lineHeights: { xs: 1.3, sm: 1.4, md: 1.5, lg: 1.55, xl: 1.6, code: 1.65 },
  breakpoints: { xs: '32em', sm: '44em', md: '60em', lg: '72em', xl: '90em' },
  shadows: {
    xs: { x: 0, y: 1, blur: 2, color: '#00000014' },
    sm: { x: 0, y: 2, blur: 6, color: '#0000001a' },
    md: { x: 0, y: 4, blur: 14, color: '#00000021' },
    lg: { x: 0, y: 8, blur: 24, color: '#00000026' },
    xl: { x: 0, y: 14, blur: 40, color: '#0000002e' },
  },
  headings: {
    weight: 700,
    levels: [
      { size: 36, leading: 1.15 },
      { size: 29, leading: 1.2 },
      { size: 23, leading: 1.25 },
      { size: 19, leading: 1.3 },
      { size: 17, leading: 1.35 },
      { size: 15, leading: 1.4 },
    ],
  },
  // The style tokens: every component style number reads one of these
  // (or spacing, fontSizes, lineHeights, radius), never an inline literal.
  opacity: { faint: 0.16, soft: 0.3, disabled: 0.45, muted: 0.7, dense: 0.88 },
  weights: { regular: 400, strong: 600, bold: 700 },
  ratios: { glyph: 0.42, mark: 0.3, inset: 0.3, icon: 0.62, pad: 0.75 },
  control: {
    labelGap: 6,
    panelPad: 6,
    optionPad: /** @type {[number, number]} */ ([6, 12]),
    iconGap: 8,
    textStep: 1,
    pad: { xs: 10, sm: 12, md: 16, lg: 20, xl: 24 },
    densePad: { xs: 5, sm: 6, md: 8, lg: 10, xl: 12 },
    density: { tight: /** @type {[number, number]} */ ([4, 8]), even: /** @type {[number, number]} */ ([8, 12]), airy: /** @type {[number, number]} */ ([12, 16]) },
  },
  chart: { pointArea: 48, axisWidth: 56, band: 0.72, bandGap: 6, labelOffset: 6, outer: 0.84, inner: 0.16, dim: 0.16, pointLabel: /** @type {Size} */ ('xs'), reference: 'orange', frame: { top: 10, right: 20 }, tick: 6, charWidth: 7, near: 24, line: 16, legend: 32 },
  sizes: {
    control: { xs: 24, sm: 30, md: 36, lg: 44, xl: 52 },
    dense: { xs: 18, sm: 22, md: 26, lg: 30, xl: 36 },
    day: { xs: 28, sm: 32, md: 36, lg: 40, xl: 48 },
    time: { cell: /** @type {[number, number]} */ ([48, 28]), column: /** @type {[number, number]} */ ([52, 180]), presets: 240 },
    icon: { xs: 20, sm: 24, md: 28, lg: 36, xl: 44 },
    closeIcon: { xs: 12, sm: 14, md: 18, lg: 22, xl: 28 },
    iconBox: { xs: 20, sm: 24, md: 32, lg: 40, xl: 48 },
    avatar: { xs: 20, sm: 28, md: 40, lg: 56, xl: 80 },
    badge: { xs: 18, sm: 20, md: 22, lg: 26, xl: 30 },
    tag: { xs: /** @type {[number, number]} */ ([16, 10]), sm: /** @type {[number, number]} */ ([20, 11]), md: /** @type {[number, number]} */ ([24, 13]), lg: /** @type {[number, number]} */ ([28, 15]), xl: /** @type {[number, number]} */ ([32, 17]) },
    check: { xs: 14, sm: 18, md: 22, lg: 26, xl: 30 },
    swatch: { xs: 14, sm: 18, md: 22, lg: 26, xl: 32 },
    colorThumb: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24 },
    picker: { xs: { w: 168, h: 104 }, sm: { w: 192, h: 120 }, md: { w: 224, h: 140 }, lg: { w: 264, h: 164 }, xl: { w: 312, h: 184 } },
    track: { xs: 3, sm: 4, md: 6, lg: 8, xl: 10 },
    thumb: { xs: 10, sm: 14, md: 18, lg: 22, xl: 26 },
    rating: { xs: 16, sm: 20, md: 24, lg: 30, xl: 36 },
    progress: { xs: 3, sm: 4, md: 6, lg: 10, xl: 14 },
    loader: { xs: 16, sm: 24, md: 32, lg: 40, xl: 56 },
    empty: { xs: 28, sm: 36, md: 44, lg: 56, xl: 68 },
    step: { xs: 28, sm: 32, md: 36, lg: 44, xl: 52 },
    pagination: { xs: 24, sm: 28, md: 32, lg: 40, xl: 48 },
    toggle: { xs: 14, sm: 18, md: 22, lg: 30, xl: 38 },
    divider: { xs: 1, sm: 1, md: 2, lg: 3, xl: 4 },
    indicator: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 },
    modal: { xs: 320, sm: 400, md: 560, lg: 640, xl: 800 },
    dialog: { xs: 200, sm: 260, md: 320, lg: 400, xl: 480 },
    drawer: 360,
    chip: { xs: /** @type {[number, number]} */ ([22, 10]), sm: /** @type {[number, number]} */ ([26, 11]), md: /** @type {[number, number]} */ ([30, 13]), lg: /** @type {[number, number]} */ ([34, 15]), xl: /** @type {[number, number]} */ ([40, 17]) },
    container: { xs: 576, sm: 736, md: 944, lg: 1152, xl: 1344 },
    glyph: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24 },
    box: {
      ring: 112,
      arc: 180,
      pie: 180,
      donut: 24,
      funnel: 260,
      chart: 300,
      spark: 60,
      clock: 200,
      qr: 160,
      knob: 64,
      swatch: 24,
      panel: 280,
      menu: 160,
      tip: 250,
      follow: 12,
      empty: 420,
      reveal: 120,
      table: 300,
      snippet: 240,
      toast: 360,
      window: /** @type {[number, number]} */ ([320, 240]),
      windowMin: /** @type {[number, number]} */ ([160, 80]),
      launcher: { offset: 96, list: 360 },
      launcherWidth: 640,
      modalTop: 64,
      select: 200,
      at: /** @type {[number, number]} */ ([20, 20]),
      arrow: { size: 6, offset: 6 },
      stripe: 12,
      stage: 200,
      parallax: 300,
      pane: 200,
      book: /** @type {[number, number]} */ ([240, 320]),
      tableCheck: 44,
      tableRow: 36,
      windowTitle: 36,
      carouselButton: 32,
      gantt: { day: 32, row: 36, label: 160, header: 40 },
      onboarding: { card: 280, room: 180, center: 60 },
      bubble: { label: 24 },
    },
  },
  extra: {},
}))));

/** @param {any} v */
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * A theme from overrides over a base, BASE_THEME by default (objects merge
 * deeply; arrays, such as a color's shades or the heading levels, replace).
 * @param {DeepPartial<RuiThemeValue> & Record<string, any>} [overrides]
 * @param {RuiThemeValue} [base]
 * @returns {RuiThemeValue}
 */
export function themeOf(overrides = {}, base = BASE_THEME) {
  /** @param {any} a @param {any} b @returns {any} */
  const merge = (a, b) => {
    if (!plain(a) || !plain(b)) return b === undefined ? a : b;
    /** @type {Record<string, any>} */
    const out = { ...a };
    for (const key of Object.keys(b)) own(out, key, merge(ownValue(a, key), b[key]));
    return out;
  };
  const merged = merge(base, overrides);
  // Every table without a prototype: a lookup by a user-given name sees own entries only.
  // `extra` is the application's own data: merged by own keys, its prototype kept.
  const theme = tables({ ...merged, extra: {} });
  own(theme, 'extra', merged.extra);
  for (const [name, shades] of Object.entries(theme.colors)) {
    if (!Array.isArray(shades) || shades.length !== 10) throw new Error(`RUI: color "${name}" needs 10 shades`);
  }
  if (!Object.hasOwn(theme.colors, theme.accent)) throw new Error(`RUI: accent "${theme.accent}" is not in colors`);
  return theme;
}

/** The theme in effect: a plain theme, or a signal or accessor of one. */
export const Theme = $context(/** @type {any} */ (BASE_THEME));
/** The color scheme in effect, 'light' or 'dark': a value, or a signal or accessor of one. */
export const Scheme = $context(/** @type {any} */ ('light'));

/**
 * Provides a `theme` and a color `scheme` to everything inside.
 * @param {{ theme?: any, scheme?: any, children?: any }} props
 */
export function Rui(props) {
  return (
    <Theme value={props.theme ?? BASE_THEME}>
      <Scheme value={props.scheme ?? 'light'}>{props.children}</Scheme>
    </Theme>
  );
}

/**
 * The theme and scheme in effect, for a component: call the accessors inside
 * bindings so a change restyles in place.
 */
export function $ui() {
  return {
    /** @returns {RuiThemeValue} */
    theme: () => /** @type {RuiThemeValue} */ (read($lookup(Theme))),
    /** @returns {Scheme} */
    scheme: () => (read($lookup(Scheme)) === 'dark' ? 'dark' : 'light'),
  };
}
