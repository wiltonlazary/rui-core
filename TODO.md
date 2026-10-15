# TODO

Open work for rui-core.

- [ ] Built-in texts in any language. Components show English words of
  their own that an app speaking another language cannot replace, or can
  replace only on every use. No prop at all: PasswordInput's toggle
  ('Show password' / 'Hide password', `core/inputs/input.jsx`); the
  combobox Clear button (`core/combobox/field.jsx` takes a `label`, but
  Select, Autocomplete, MultiSelect, TagInput and TreeSelect never pass
  one: 'Clear');
  DateInput's clear button ('Clear', `ext/dates/inputs.jsx`);
  MultiSelect's pill buttons ('Remove {value}', `core/combobox/tags.jsx`);
  ColorPicker's sliders and panel ('Hue', 'Alpha', 'Saturation',
  `core/inputs/color.jsx`, `color-panel.jsx`); the Notifications region
  ('Notifications') and LoadBar ('Page loading'). A prop on each use only
  ('Close' of Modal, Notification, CloseButton and the floating close;
  'Loading' of Loader and the backdrop; 'Menu', 'Search', 'Options',
  'Levels above', 'Rating', 'Drag to resize', 'Close window', 'Task',
  'No matches', 'Nothing here yet', Copy/Snippet's 'Copy', 'Done',
  'Fold', 'Show all lines'; check `grep -rn "?? '[A-Z]" src` for the rest).
  Wanted: one provider of the words, as the dates extension's
  `DateSettings` `labels` already is for its own (`ext/dates/arith.js`
  `DATES_LABELS`), English by default, read by every component for each
  built-in text it shows, a component's own prop still winning; a
  notification's close label then comes from it too. Repro: a page whose
  texts are Portuguese with a PasswordInput, a clearable Select, a
  MultiSelect with a value, a DateInput with a value, a ColorInput opened,
  Notifications and a LoadBar: each still says its English. Done when a
  test renders each of them under the provider with other words and finds
  no English left.
