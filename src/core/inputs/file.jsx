// FileInput: a field that picks files through the platform's file dialog
// (FileButton's chooser): the picked file's name (or a count) in the
// field, the placeholder while empty, a clear button.

import { View, Label, Action, Show, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, sized, pageColors } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { CloseButton } from '../buttons/index.js';
import { chooseFiles } from '../buttons/file.jsx';
import { Field, outerOf, invalidOf, $fieldName } from './field.jsx';
import { fileText, clearedFiles } from './file-value.js';
import { sizeOf, $value, fieldColors, insetOf, disabledLook } from './shared.js';
import { flag } from '../../theme/meaning.js';
import { labelsIn } from '../../theme/labels.js';

/**
 * A field whose press opens the file dialog: `value`
 * + `onChange` (the File, or null; with `multiple`, a non-empty list or
 * null: empty is always null) or
 * `defaultValue`, `multiple`, `accept`, `capture`, `placeholder`,
 * `clearable` (a clear button while it holds a file; a clear sets null),
 * `renderValue` (renders `{ value }`; by default one file's name, or
 * `countText(n)` for several, `n => \`${n} files\`` by default), `disabled`,
 * `readOnly`, `variant`, `size`, `radius`, `start`, `end`, `picker`
 * (FileButton's options, `document` among them), `fieldStyle`, and the
 * Field's `label`, `description`, `error`, `asterisk`, and `invalid`.
 * @param {Record<string, any>} props
 */
export function FileInput(props) {
  const multiple = () => read(props.multiple) === true;
  const model = $value(props, /** @type {any} */ (null));
  /** The files held, as a list. @returns {any[]} */
  const files = () => {
    const v = model.get();
    return v == null ? [] : Array.isArray(v) ? v : [v];
  };
  const empty = () => files().length === 0;
  const off = () => read(props.disabled) === true || read(props.readOnly) === true;
  const size = () => sizeOf(read(props.size));
  const ui = $ui();
  const box = styled({ style: props.fieldStyle }, (theme, scheme) => {
    const c = fieldColors(theme, scheme, read(props.variant), { error: invalidOf(read(props.error), read(props.invalid)), disabled: read(props.disabled) === true });
    const h = theme.sizes.control[size()];
    return {
      direction: 'row',
      align: 'center',
      height: h,
      minHeight: h,
      border: read(props.variant) === 'bare' ? 0 : 1,
      borderColor: c.border,
      radius: radiusOf(theme, read(props.radius)),
      // The field draws its press target's focus ring, along its corners.
      ring: 'inner',
      background: c.background,
      color: c.color,
      ...(read(props.disabled) === true ? disabledLook(theme) : null),
    };
  });
  const press = styled({}, (theme, scheme) => {
    const c = fieldColors(theme, scheme, read(props.variant), { error: invalidOf(read(props.error), read(props.invalid)), disabled: read(props.disabled) === true });
    const pad = insetOf(theme, theme.sizes.control[size()]);
    return {
      grow: 1,
      shrink: 1,
      width: 0,
      minWidth: 0,
      height: '100%',
      padding: [0, props.end === undefined ? pad : 0, 0, props.start === undefined ? pad : 0],
      border: 0,
      radius: 0,
      ring: false,
      background: 'transparent',
      direction: 'row',
      justify: 'start',
      align: 'center',
      fontSize: sized(theme.fontSizes, size()),
      color: empty() ? c.placeholder : c.color,
      cursor: off() ? 'not-allowed' : 'pointer',
    };
  });
  const section = (/** @type {any} */ content) => {
    const s = styled({}, () => ({ width: ui.theme().sizes.control[size()], height: '100%', shrink: 0, align: 'center', justify: 'center', color: pageColors(ui.theme(), ui.scheme()).quiet }));
    return <View style={s}>{content}</View>;
  };
  const names = () => fileText(files(), typeof props.countText === 'function' ? props.countText : labelsIn().files, labelsIn().file);
  const shown = () => (empty() ? String(read(props.placeholder) ?? '') : names());
  const custom = typeof props.renderValue === 'function';
  const label = <Label text={shown} style={{ grow: 1, minWidth: 0 }} ellipsis />;
  const value = custom ? () => (empty() ? label : props.renderValue({ value: model.get() })) : label;
  const extra = read(props.picker) ?? {};
  const choose = (/** @type {any} */ event) => {
    if (off()) return;
    chooseFiles({ ...extra, accept: props.accept, multiple, capture: props.capture }, event).then(list => {
      if (list.length > 0) model.set(multiple() ? list : list[0]);
    });
  };
  return (
    <Field {...outerOf(props)}>
      <View style={box}>
        {props.start === undefined ? null : section(props.start)}
        <Action ref={props.ref} label={() => read(props.label) ?? read(props.placeholder) ?? shown()} {...(props.label === undefined && props['aria-label'] === undefined ? $fieldName(props) : null)} aria-disabled={flag(props.disabled)} aria-required={flag(props.required)} aria-invalid={flag(() => invalidOf(read(props.error), read(props.invalid)))} onPress={choose} style={press}>
          {value}
        </Action>
        <Show when={() => read(props.clearable) === true && !empty() && !off()}>
          <CloseButton size="sm" label={() => labelsIn().clear} onPress={() => model.set(clearedFiles(multiple()))} mr="xs" />
        </Show>
        {props.end === undefined ? null : section(props.end)}
      </View>
    </Field>
  );
}
