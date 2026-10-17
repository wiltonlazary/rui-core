// Icons drawn with the portable Shape (lines, paths and ovals), the same on
// every renderer: no font icons, no SVG tags. Each takes `size` (px, 16 by
// default), `color` (a theme color, `'name.shade'` or hex; the scheme's text
// color by default) and, where it strokes, `stroke` (px). A Shape does not
// inherit the text color, so a component passes the color it paints text in.

import { Shape, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { colorOf, pageColors } from '../../theme/resolve.js';
import { styled } from '../../theme/style.js';

/** @typedef {Record<string, any>} Figure */

/**
 * The color an icon paints in.
 * @param {ReturnType<typeof $ui>} ui @param {any} color
 */
export function inkOf(ui, color) {
  const c = read(color);
  const theme = ui.theme();
  const scheme = ui.scheme();
  return c == null ? pageColors(theme, scheme).text : c === 'quiet' ? pageColors(theme, scheme).quiet : colorOf(theme, scheme, c);
}

/**
 * Points (x, y pairs, 0 to 1 of the box) turned `degrees` clockwise about
 * the center and scaled to `size`.
 * @param {readonly number[]} unit @param {number} size @param {number} degrees
 */
export function turned(unit, size, degrees) {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const out = new Array(unit.length);
  for (let i = 0; i < unit.length; i += 2) {
    const x = unit[i] - 0.5;
    const y = unit[i + 1] - 0.5;
    out[i] = (x * cos - y * sin + 0.5) * size;
    out[i + 1] = (x * sin + y * cos + 0.5) * size;
  }
  return out;
}

/**
 * An icon: a Shape `size` square drawing `figures(size, color)`, turned
 * `turn()` degrees clockwise about its center by the style (not redrawn).
 * @param {Record<string, any>} props @param {(size: number, color: string) => Figure[]} figures @param {() => number} [turn]
 */
function icon(props, figures, turn) {
  const ui = $ui();
  const size = () => Number(read(props.size) ?? ui.theme().sizes.glyph.md);
  return (
    <Shape
      shapes={() => figures(size(), inkOf(ui, props.color))}
      style={styled(props, () => {
        const degrees = turn === undefined ? 0 : turn();
        return { width: size(), height: size(), shrink: 0, ...(degrees === 0 ? null : { rotate: degrees }) };
      })}
    />
  );
}

/** The stroke of an icon: `stroke`, or a width that grows with the size. @param {Record<string, any>} props @param {number} size */
const strokeOf = (props, size) => Number(read(props.stroke) ?? Math.max(1.5, Math.round(size / 8)));

/** An X. @param {Record<string, any>} props */
export function CloseIcon(props) {
  return icon(props, (size, color) => {
    // The X's ends, in parts of the box.
    const [a, b] = [0.22, 0.78].map(v => v * size);
    const width = strokeOf(props, size);
    return [
      { kind: 'line', x: a, y: a, right: b, bottom: b, color, stroke: width },
      { kind: 'line', x: b, y: a, right: a, bottom: b, color, stroke: width },
    ];
  });
}

/** A check mark. @param {Record<string, any>} props */
export function CheckIcon(props) {
  return icon(props, (size, color) => [
    { kind: 'path', points: turned([0.18, 0.52, 0.41, 0.74, 0.82, 0.28], size, 0), color, stroke: strokeOf(props, size) },
  ]);
}

/**
 * A chevron pointing down, turned `rotate` degrees clockwise (90 points
 * left, -90 right, 180 up) by the style's `rotate`, so a turning chevron
 * (Accordion, NavItem) is one drawing; `edge` adds a bar where it points
 * (the first and last page controls).
 * @param {Record<string, any>} props
 */
export function ChevronIcon(props) {
  return icon(
    props,
    (size, color) => {
      const stroke = strokeOf(props, size);
      /** @type {Figure[]} */
      const out = [{ kind: 'path', points: turned([0.25, 0.37, 0.5, 0.62, 0.75, 0.37], size, 0), color, stroke }];
      if (read(props.edge)) out.push({ kind: 'path', points: turned([0.25, 0.76, 0.75, 0.76], size, 0), color, stroke });
      return out;
    },
    () => Number(read(props.rotate) ?? 0),
  );
}

/**
 * A pointer: a shaft with an open head at its tip and a dot at its tail,
 * pointing toward the end (`dir` 1) or the start (-1); along the row, or
 * down and up with `orientation="vertical"` (drawn so, not turned).
 * @param {Record<string, any>} props @param {number} dir
 */
function pointer(props, dir) {
  return icon(props, (size, color) => {
    const stroke = strokeOf(props, size);
    const degrees = read(props.orientation) === 'vertical' ? 90 : 0;
    /** A point of the end-pointing figure, mirrored for the start. @param {number[]} unit */
    const at = unit => turned(dir > 0 ? unit : unit.map((v, i) => (i % 2 === 0 ? 1 - v : v)), size, degrees);
    // The figure, in parts of the box: the head's wings meet at the tip; the tail's dot sits apart from the shaft.
    const [cx, cy] = at([0.18, 0.5]);
    // The tail dot's radius: a little past the stroke's half, so it reads as a dot, not a stub.
    const r = Math.max(1, stroke - stroke / 4);
    return [
      { kind: 'path', points: at([0.5, 0.26, 0.76, 0.5, 0.5, 0.74]), color, stroke },
      { kind: 'path', points: at([0.34, 0.5, 0.74, 0.5]), color, stroke },
      { kind: 'oval', x: cx - r, y: cy - r, right: cx + r, bottom: cy + r, color },
    ];
  });
}

/** A pointer toward the start (back): a shaft, its head and a tail dot; `orientation="vertical"` points up. @param {Record<string, any>} props */
export function BackIcon(props) {
  return pointer(props, -1);
}

/** A pointer toward the end (forward): a shaft, its head and a tail dot; `orientation="vertical"` points down. @param {Record<string, any>} props */
export function ForwardIcon(props) {
  return pointer(props, 1);
}

/** Three dots in a row (the dots of Pagination). @param {Record<string, any>} props */
export function DotsIcon(props) {
  return icon(props, (size, color) => {
    const d = Math.max(2, size / 5);
    const y = (size - d) / 2;
    /** @type {Figure[]} */
    const out = [];
    // The dots' centers, in parts of the box.
    for (const at of [0.2, 0.5, 0.8]) {
      const x = at * size - d / 2;
      out.push({ kind: 'oval', x, y, right: x + d, bottom: y + d, color });
    }
    return out;
  });
}

/** Two sheets, one over the other (copy). @param {Record<string, any>} props */
export function CopyIcon(props) {
  return icon(props, (size, color) => {
    const stroke = strokeOf(props, size);
    /** A square outline from (x, y), `w` wide, as a closed path. @param {number} x @param {number} y @param {number} w */
    const sheet = (x, y, w) => ({ kind: 'path', closed: true, points: [x, y, x + w, y, x + w, y + w, x, y + w].map(v => v * size), color, stroke });
    return [
      // The sheet behind shows only its top and left edges.
      { kind: 'path', points: [0.2, 0.62, 0.2, 0.2, 0.62, 0.2].map(v => v * size), color, stroke },
      sheet(0.38, 0.38, 0.44),
    ];
  });
}

/** Three points joined by two lines (share). @param {Record<string, any>} props */
export function ShareIcon(props) {
  return icon(props, (size, color) => {
    const stroke = strokeOf(props, size);
    /** A point at (x, y), in parts of the box, `d` across. @param {number} x @param {number} y @param {number} [d] */
    const dot = (x, y, d = Math.max(3, size * 0.22)) => ({ kind: 'oval', x: x * size - d / 2, y: y * size - d / 2, right: x * size + d / 2, bottom: y * size + d / 2, color });
    return [
      { kind: 'line', x: 0.72 * size, y: 0.24 * size, right: 0.28 * size, bottom: 0.5 * size, color, stroke },
      { kind: 'line', x: 0.28 * size, y: 0.5 * size, right: 0.72 * size, bottom: 0.76 * size, color, stroke },
      dot(0.72, 0.24),
      dot(0.28, 0.5),
      dot(0.72, 0.76),
    ];
  });
}

/** A camera: its body with a raised top, and the lens (photos, pictures). @param {Record<string, any>} props */
export function CameraIcon(props) {
  return icon(props, (size, color) => {
    const stroke = strokeOf(props, size);
    // The body's outline, in parts of the box: the top rises in the middle, where the viewfinder sits.
    const body = [0.1, 0.32, 0.32, 0.32, 0.4, 0.2, 0.6, 0.2, 0.68, 0.32, 0.9, 0.32, 0.9, 0.82, 0.1, 0.82];
    // The lens, a circle in the body's middle.
    const [x, y, d] = [0.5, 0.57, 0.3];
    return [
      { kind: 'path', closed: true, points: body.map(v => v * size), color, stroke },
      { kind: 'oval', x: (x - d / 2) * size, y: (y - d / 2) * size, right: (x + d / 2) * size, bottom: (y + d / 2) * size, color, stroke },
    ];
  });
}

/** A label tag: its body pointing to the lower right corner, a hole near the upper left (tags, labels). @param {Record<string, any>} props */
export function TagIcon(props) {
  return icon(props, (size, color) => {
    const stroke = strokeOf(props, size);
    // The tag's outline, in parts of the box: square at the upper left, its point at the lower right.
    const body = [0.12, 0.12, 0.52, 0.12, 0.9, 0.5, 0.5, 0.9, 0.12, 0.52];
    // The hole, filled, where a string would go.
    const [x, y, d] = [0.32, 0.32, 0.14];
    return [
      { kind: 'path', closed: true, points: body.map(v => v * size), color, stroke },
      { kind: 'oval', x: (x - d / 2) * size, y: (y - d / 2) * size, right: (x + d / 2) * size, bottom: (y + d / 2) * size, color },
    ];
  });
}
