// The words components show of their own: BASE_LABELS, English, keyed by
// what each names; the ones that take a value are functions of it. Rui's
// `labels` puts other words over them (and over an outer Rui's) for
// everything inside; a component's own prop still wins over both.

import { $context, $lookup, read } from 'ren-core';

/** The English words components show of their own. */
export const BASE_LABELS = Object.freeze({
  /** Modal, Drawer, Dialog, Notification, Alert, CloseButton and the floating close. */
  close: 'Close',
  /** Window's close. */
  closeWindow: 'Close window',
  /** The clear buttons of the combobox fields, FileInput and DateInput. */
  clear: 'Clear',
  /** TimeInput's clear button. */
  clearTime: 'Clear time',
  /** Loader, Busy and Spinner, as a `status`. */
  loading: 'Loading',
  /** LoadBar's progress bar. */
  pageLoading: 'Page loading',
  /** The Notifications region. */
  notifications: 'Notifications',
  /** PasswordInput's toggle while the password is hidden. */
  showPassword: 'Show password',
  /** PasswordInput's toggle while the password shows. */
  hidePassword: 'Hide password',
  /** A tag's remove button. */
  remove: (/** @type {string} */ value) => `Remove ${value}`,
  /** The color hue slider. */
  hue: 'Hue',
  /** The color alpha slider. */
  alpha: 'Alpha',
  /** The color saturation panel's thumb. */
  saturation: 'Saturation',
  /** The saturation panel's value, as a percent of each. */
  saturationValue: (/** @type {number} */ saturation, /** @type {number} */ brightness) => `Saturation ${saturation}%, brightness ${brightness}%`,
  /** ColorPicker's press that shows the spectrum (`picker` 'collapsed'). */
  moreColors: 'More colors',
  /** ColorInput's eye dropper. */
  pickColor: 'Pick a color from the screen',
  /** Picker's search field. */
  search: 'Search',
  /** TreeSelect's field, empty. */
  options: 'Options',
  /** Cascader's trail of the levels above. */
  levelsAbove: 'Levels above',
  /** Cascader's press back to the deeper levels. */
  deeperLevels: 'Deeper levels',
  /** Cascader's line when nothing matches. */
  noMatch: 'No match',
  /** Launcher's line when nothing matches. */
  noMatches: 'No matches',
  /** Launcher's search field, empty. */
  findAction: 'Find an action',
  /** CopyButton's and Snippet's copy. */
  copy: 'Copy',
  /** CopyButton's and Snippet's copy once done, and the date pickers' done. */
  done: 'Done',
  /** Excerpt's press that shows it whole. */
  more: 'More',
  /** Excerpt's press that folds it. */
  less: 'Less',
  /** Snippet's press that shows every line. */
  showAllLines: 'Show all lines',
  /** Snippet's press that folds it. */
  fold: 'Fold',
  /** NavToggle. */
  menu: 'Menu',
  /** A slider thumb with no other name. */
  sliderThumb: 'Slider thumb',
  /** AngleSlider. */
  angle: 'Angle',
  /** Rating. */
  rating: 'Rating',
  /** A floating panel's resize grip. */
  dragToResize: 'Drag to resize',
  /** Gantt's task column. */
  task: 'Task',
  /** JsonArea's error for text that does not parse. */
  notValidJson: 'Not valid JSON',
  /** DataTable with no rows. */
  nothingHere: 'Nothing here yet',
  /** DataTable's check of a row, by its place from 1. */
  selectRow: (/** @type {number} */ n) => `Select row ${n}`,
  /** DataTable's check of every row. */
  selectAllRows: 'Select all rows',
  /** Onboarding's skip. */
  skip: 'Skip',
  /** Onboarding's and Carousel's step back. */
  back: 'Back',
  /** Onboarding's step on. */
  next: 'Next',
  /** Onboarding's last step. */
  finish: 'Finish',
  /** Carousel's step on. */
  forward: 'Forward',
  /** Carousel's region. */
  carousel: 'Carousel',
  /** Compare's side before. */
  before: 'Before',
  /** Compare's side after. */
  after: 'After',
  /** Compare's handle. */
  compare: 'Compare',
  /** Pagination's navigation. */
  pagination: 'Pagination',
  /** Pagination's first page. */
  firstPage: 'First page',
  /** Pagination's step back. */
  previousPage: 'Previous page',
  /** Pagination's step on. */
  nextPage: 'Next page',
  /** Pagination's last page. */
  lastPage: 'Last page',
  /** Breadcrumbs' navigation. */
  breadcrumbs: 'Breadcrumbs',
  /** Outline's navigation. */
  tableOfContents: 'Table of contents',
  /** A Panes handle, by its place from 1. */
  resizePane: (/** @type {number} */ n) => `Resize pane ${n}`,
  /** A Stepper stage with no label, by its place from 1 and the count. */
  step: (/** @type {number} */ i, /** @type {number} */ n) => `Step ${i} of ${n}`,
  /** A TreeSelect row's chevron while closed. */
  expand: (/** @type {string} */ label) => `Expand ${label}`,
  /** A TreeSelect row's chevron while open. */
  collapse: (/** @type {string} */ label) => `Collapse ${label}`,
  /** JsonTree's copy of a node, by its path ('' for the whole value). */
  copyPath: (/** @type {string} */ path) => (path === '' ? 'Copy value' : `Copy ${path}`),
  /** NumberInput's step up. */
  increment: 'Increment',
  /** NumberInput's step down. */
  decrement: 'Decrement',
  /** RangeSlider's first thumb. */
  lowerValue: 'Lower value',
  /** RangeSlider's second thumb. */
  upperValue: 'Upper value',
  /** A ScrollArea's arrow back. */
  scrollBack: 'Scroll back',
  /** A ScrollArea's arrow on. */
  scrollForward: 'Scroll forward',
  /** A Modal or Drawer whose title is no text. */
  dialog: 'Dialog',
  /** Window's press that folds it. */
  minimize: 'Minimize',
  /** Window's press that unfolds it. */
  restore: 'Restore',
  /** Carousel's kind of region, as said. */
  carouselRole: 'carousel',
  /** A Carousel slide's kind of group, as said. */
  slideRole: 'slide',
  areaChart: 'Area chart',
  barChart: 'Bar chart',
  lineChart: 'Line chart',
  mixedChart: 'Mixed chart',
  pieChart: 'Pie chart',
  donutChart: 'Donut chart',
  scatterChart: 'Scatter chart',
  sparkline: 'Sparkline',
  bubbleChart: 'Bubble chart',
  funnelChart: 'Funnel chart',
  heatmap: 'Heatmap',
  radarChart: 'Radar chart',
  radialBarChart: 'Radial bar chart',
  /** A chart's name: its kind (one of the words above), the names it shows, and its count of points (null: none told). */
  chartSummary: (/** @type {string} */ kind, /** @type {string[]} */ names, /** @type {number | null} */ points) =>
    `${kind}${names.length > 0 ? ` of ${names.join(', ')}` : ''}${points === null ? '' : `, ${points} ${points === 1 ? 'point' : 'points'}`}`,
  /** FileInput's text for one file without a name. */
  file: 'file',
  /** FileInput's text for several files. */
  files: (/** @type {number} */ n) => `${n} files`,
});

/** @typedef {typeof BASE_LABELS} RuiLabels */

/**
 * The words over the English ones in effect, as `get()` (Rui's `labels`
 * over the outer Rui's): an object, so the provider keeps it as it is and
 * `get` reads the words where it is called, following their signals.
 */
export const Words = $context(/** @type {{ get: () => Record<string, any> } | null} */ (null));

/** The words of `labels` (a map, or a signal or accessor of one) over the ones in effect, as a provider's value. @param {any} labels */
export const wordsOver = labels => {
  const outer = /** @type {{ get: () => Record<string, any> } | null} */ ($lookup(Words));
  return { get: () => ({ ...outer?.get(), ...read(labels) }) };
};

/** The labels in effect: Rui's words over BASE_LABELS. Read it inside a binding to follow a change. @returns {RuiLabels} */
export const labelsIn = () => {
  const words = /** @type {{ get: () => Record<string, any> } | null} */ ($lookup(Words));
  return words === null ? BASE_LABELS : { ...BASE_LABELS, ...words.get() };
};
