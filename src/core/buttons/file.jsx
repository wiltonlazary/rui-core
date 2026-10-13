// FileButton: a Button whose press opens the platform's file dialog and
// hands over the files picked, as a list.

import { read } from 'ren-core';
import { Button } from './button.jsx';
import { pickFiles } from '../../ext/dropzone/files.js';

/** Whether a value can make the dialog's input: a document. @param {any} doc */
const usable = doc => doc != null && typeof doc.createElement === 'function';

/** An accept list: a string split on commas and trimmed, or a list; null for anything. @param {any} accept @returns {string[] | null} */
function acceptOf(accept) {
  const list = typeof accept === 'string' ? accept.split(',') : Array.isArray(accept) ? accept : [];
  const out = list.map(a => String(a).trim()).filter(a => a !== '');
  return out.length === 0 ? null : out;
}

/**
 * Opens one file dialog and resolves with the files picked (`[]` on a
 * cancel or where there is no document). The dialog opens in
 * `options.document`, else the pressed node's document, else the global
 * one. `accept` is a string (`'image/png,.pdf'`) or a list; `multiple`,
 * `capture` and `document` may be accessors. Internal: FileButton's and
 * FileInput's press.
 * @param {{ accept?: any, multiple?: any, capture?: any, document?: any }} options
 * @param {any} [event] the press, whose node gives the document
 * @returns {Promise<File[]>}
 */
export function chooseFiles(options, event) {
  const given = read(options.document);
  const node = event?.currentTarget ?? event?.target;
  const doc = usable(given) ? given : usable(node?.ownerDocument) ? node.ownerDocument : undefined;
  const capture = read(options.capture);
  return pickFiles({
    accept: acceptOf(read(options.accept)),
    multiple: read(options.multiple) === true,
    ...(capture == null || capture === false ? null : { capture: capture === true ? '' : String(capture) }),
    ...(doc === undefined ? null : { document: doc }),
  });
}

/**
 * A Button that opens the file dialog: its children are the button's
 * content, `onFiles(files)` gets the files picked as a list (one file is a
 * list of one; a cancel calls nothing), `accept` (a string such as
 * `'image/png,.pdf'` or a list), `multiple`, `capture` (the input's
 * `capture`), `disabled`, `document` (where the dialog opens: the pressed
 * node's document by default, else the global one). Every other Button
 * prop passes through; the press is its own.
 * @param {Record<string, any>} props
 */
export function FileButton(props) {
  const onPress = (/** @type {any} */ event) => {
    if (read(props.disabled) === true || read(props.loading) === true) return;
    chooseFiles({ accept: props.accept, multiple: props.multiple, capture: props.capture, document: props.document }, event).then(files => {
      if (files.length > 0) props.onFiles?.(files);
    });
  };
  const { onFiles: _files, onPress: _press, accept: _accept, multiple: _multiple, capture: _capture, document: _document, ...rest } = props;
  return <Button {...rest} onPress={onPress} />;
}
