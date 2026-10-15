// CopyButton: a Button that copies `value` to the platform clipboard
// (navigator.clipboard, where the platform has one: a browser page or
// worker in a secure context) and shows `done` in place of `label` for
// `hold`. Where there is no clipboard, or it refuses, `onError` hears the
// failure and the label stays: nothing is faked. A trigger of your own
// reads the handle (`getHandle`) or uses `$clipboard` directly.

import { $active, $closed, read } from 'ren-core';
import { $clipboard } from '../../hooks/platform.js';
import { Button } from './button.jsx';
import { labelsIn } from '../../theme/labels.js';

/**
 * What a CopyButton does, from `getHandle`.
 * @typedef {object} CopyHandle
 * @property {() => Promise<boolean>} copy copies `value`; resolves to whether it did
 * @property {() => boolean} copied whether `done` shows
 * @property {() => Error | null} error why the last copy failed
 */

/**
 * A button that copies: `value` (the text; an accessor is read at the
 * press), `label` ('Copy') and `done` ('Done', shown for `hold`: a
 * MOTION name or ms, MOTION.hold by default), `onCopy(text)`,
 * `onError(error)` (not once its root is disposed), `getHandle(handle)`
 * ({ copy, copied, error }), and
 * Button's props (variant, color, size, start, end, disabled, …).
 * @param {Record<string, any>} props
 */
export function CopyButton(props) {
  const R = $active();
  const clip = $clipboard(R, { hold: () => read(props.hold) });
  const copied = () => /** @type {boolean} */ (read(clip.value));
  const copy = async () => {
    const text = String(read(props.value) ?? '');
    const ok = await clip.copy(text);
    if (ok) props.onCopy?.(text);
    // A root disposed while the copy was pending holds no error to read.
    else if (!$closed(R)) props.onError?.(read(clip.error));
    return ok;
  };
  props.getHandle?.({ copy, copied, error: () => read(clip.error) });
  const { value, label, done, hold, onCopy, onError, getHandle, children, ...rest } = props;
  return (
    <Button {...rest} onPress={() => void copy()}>
      {() => String(copied() ? (read(props.done) ?? labelsIn().done) : (read(props.label) ?? labelsIn().copy))}
    </Button>
  );
}
