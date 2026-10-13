// QrCode: the encoder's modules drawn with Shape rects, one per horizontal
// run of dark modules, on a light quiet zone.

import { View, Shape, $memo, $read, $active, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { colorOf } from '../../theme/resolve.js';
import { pass } from '../../core/layout/layout.jsx';
import { encodeQr } from './qrcode.js';

/**
 * The figures of a matrix: a rect per run of dark modules in a row, at
 * `scale` px per module, after a `quiet` zone of modules.
 * @param {import('./qrcode.js').QrMatrix} qr @param {number} scale @param {number} quiet @param {string} color
 * @returns {Record<string, any>[]}
 */
export function qrFigures(qr, scale, quiet, color) {
  const s = qr.size;
  /** @type {Record<string, any>[]} */
  const out = [];
  for (let y = 0; y < s; y++) {
    let x = 0;
    while (x < s) {
      if (!qr.modules[y * s + x]) {
        x++;
        continue;
      }
      const from = x;
      while (x < s && qr.modules[y * s + x]) x++;
      out.push({ kind: 'rect', x: (from + quiet) * scale, y: (y + quiet) * scale, right: (x + quiet) * scale, bottom: (y + 1 + quiet) * scale, color });
    }
  }
  return out;
}

/**
 * A QR code (byte mode, UTF-8): `value`, `level` ('M'; 'L', 'Q', 'H'),
 * `size` (the side in px, `sizes.box.qr` 160; modules are whole pixels where it allows),
 * `quietZone` (4 modules), `color` ('#000000'), `bg` ('#ffffff'),
 * `versions` ([min, max]: the version range, [1, 40]), `raise` (lift the
 * level while the version still holds the value), `mask` (forced; else
 * the lowest penalty), `onEncode`
 * (hears the matrix). It means an `img` named 'QR code: ' and its value.
 * @param {Record<string, any>} props
 */
export function QrCode(props) {
  const ui = $ui();
  const R = $active();
  const qr = $memo(R, () =>
    encodeQr(String(read(props.value) ?? ''), {
      level: read(props.level) ?? 'M',
      versions: read(props.versions),
      raise: read(props.raise) === true,
      mask: read(props.mask),
    }),
  );
  const quiet = () => Number(read(props.quietZone) ?? 4);
  const side = () => Number(read(props.size) ?? ui.theme().sizes.box.qr);
  const scale = () => {
    const q = /** @type {import('./qrcode.js').QrMatrix} */ ($read(qr));
    const modules = q.size + quiet() * 2;
    const exact = side() / modules;
    return exact >= 1 ? Math.floor(exact) : exact;
  };
  const drawn = () => {
    const q = /** @type {import('./qrcode.js').QrMatrix} */ ($read(qr));
    return (q.size + quiet() * 2) * scale();
  };
  const figures = () => {
    const q = /** @type {import('./qrcode.js').QrMatrix} */ ($read(qr));
    props.onEncode?.(q);
    return qrFigures(q, scale(), quiet(), colorOf(ui.theme(), ui.scheme(), read(props.color) ?? '#000000'));
  };
  const style = styled(props, (theme, scheme) => ({
    width: side(),
    height: side(),
    shrink: 0,
    align: 'center',
    justify: 'center',
    background: colorOf(theme, scheme, read(props.bg) ?? '#ffffff'),
  }));
  return (
    <View role="img" aria-label={() => `QR code: ${String(read(props.value) ?? '')}`} {...pass(props)} style={style}>
      <Shape shapes={figures} style={() => ({ width: drawn(), height: drawn(), shrink: 0 })} />
    </View>
  );
}
