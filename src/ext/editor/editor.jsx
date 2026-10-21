// Editor on the portable primitives: a toolbar of controls and the
// content, where the block being edited is a portable Edit (one per block)
// and every other block is drawn with its marks as one Label of styled
// runs (ren-core's `runs`), which wraps across them. Pressing a block edits it.
//
// A press on a drawn block edits it with the caret at the pressed
// character (caret.js: a canvas Label's offsetAt, the DOM's
// caretPositionFromPoint; at the end in a worker, which has neither). Inline
// code and code blocks draw in the monospace stack.
//
// The block being edited shows its marks through the Edit's `runs` (ren-core's
// runs over an Edit), rebuilt from the block as it is typed and marked; its
// value stays the block's plain text. An Edit sets its text in one font and
// size, so there inline code is its background tint in the Edit's family,
// and subscript and superscript are plain; on the DOM bold and italic show
// only in a font whose bold and italic keep its widths (ren-dom's mirror),
// and a run's background hides the caret inside it. A drawn subscript or
// superscript is smaller type on the baseline (a run is not moved off it);
// justified text is drawn from the start (the portable Label aligns to the
// start, the center or the end).

import { View, Label, Edit, Action, Shape, Show, For, $context, $lookup, $active, $signal, $read, $write, $untrack, $owner, $cleanup, read } from 'ren-core';
import { styled, pressLook } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { pageColors, radiusOf, variantColors, colorOf, shadesOf, fontBelow } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { runs, isList, depths } from './model.js';
import { $editor, SHOWN, handClock } from './state.js';
import { Clock } from '../../theme/motion.js';
import { MONOSPACE } from '../snippet/palette.js';
import { offsetAt, pointOf } from './caret.js';
import { boxOf } from '../../core/misc/tween.js';
import { Popover } from '../../core/overlays/index.js';
import { ColorPicker, parseColor, formatColor } from '../../core/inputs/index.js';
import { Swatch } from '../../core/data/index.js';
import { DECOR, flag, state } from '../../theme/meaning.js';
import { $fieldName } from '../../core/inputs/field.jsx';
import { $editMenu } from '../../core/inputs/edit-menu.jsx';

/** @typedef {ReturnType<typeof $editor>} EditorHandle */
/** @typedef {import('./model.js').Block} Block */
/** @typedef {import('./model.js').Align} Align */
/** @typedef {import('./state.js').Caret} Caret */

/** What the parts of an editor share: the editor and its labels. */
const EditorContext = $context(/** @type {{ editor: EditorHandle, labels: Record<string, any>, link: { open: () => boolean, set: (on: boolean) => void }, editMenu?: any } | null} */ (null));

/**
 * The default labels of the parts, keyed by each part's own name; the
 * ones that take a value are functions of it.
 */
export const LABELS = Object.freeze({
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strike out',
  clear: 'Plain text',
  code: 'Inline code',
  sub: 'Lower',
  sup: 'Raise',
  highlight: 'Mark',
  colors: 'Ink',
  swatch: (/** @type {string} */ color) => `Color ${color}`,
  uncolor: 'Default color',
  colorsCustom: 'Custom…',
  align: (/** @type {string} */ value) => `Align ${value}`,
  rule: 'Divider',
  codeBlock: 'Code',
  heading: (/** @type {number} */ level) => `Title ${level}`,
  quote: 'Quote',
  bullet: 'Bulleted list',
  ordered: 'Numbered list',
  link: 'Link',
  unlink: 'Unlink',
  undo: 'Undo',
  redo: 'Redo',
  linkAddress: 'Address',
  linkHint: 'https://',
  linkApply: 'Apply',
});

/** The editor the parts are in. */
const $parts = () => {
  const ctx = $lookup(EditorContext);
  if (ctx === null) throw new Error('RUI: an Editor part goes inside an Editor');
  return ctx;
};

/**
 * A rich text editor: `store` (from
 * `$editor()`; one is made from `content`, `editable` and `onChange`
 * when absent), `labels` (over
 * `LABELS`), `editMenu` (as Input's: the link field's menu; the blocks
 * keep their own, the platform's), and its parts as children: Editor.Toolbar
 * with Editor.Group and the actions, then Editor.Content.
 * @param {Record<string, any>} props
 */
export function Editor(props) {
  const editor = props.store ?? $editor({ content: read(props.content), editable: read(props.editable) !== false, onChange: props.onChange });
  handClock(editor, /** @type {any} */ ($lookup(Clock)));
  const open = $signal($active(), false);
  const ctx = { editor, labels: { ...LABELS, ...read(props.labels) }, link: { open: () => $read(open), set: (/** @type {boolean} */ on) => $write(open, on) }, editMenu: props.editMenu };
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    // The frame draws the focus ring of the block being edited, along its corners.
    return { direction: 'column', border: 1, borderColor: page.border, radius: radiusOf(theme, read(props.radius)), ring: 'inner', background: page.body, color: page.text, overflow: 'hidden' };
  });
  return (
    <EditorContext value={ctx}>
      <View ref={props.ref} style={style}>
        {props.children}
      </View>
    </EditorContext>
  );
}

/**
 * The toolbar (Editor.Toolbar): controls in groups, wrapping, on the
 * page's sunken ground a panel pad in from its edges, with a rule under it;
 * the link editor shows under them while it is open.
 * @param {Record<string, any>} props
 */
function EditorToolbar(props) {
  const ctx = $parts();
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return { direction: 'column', gap: theme.control.panelPad, padding: theme.control.panelPad, background: page.sunken, border: 0 };
  });
  const row = styled({}, theme => ({ direction: 'row', wrap: true, gap: theme.spacing.xs, align: 'center' }));
  const rule = styled({}, (theme, scheme) => ({ height: 1, background: pageColors(theme, scheme).rule }));
  return (
    <View style={() => ({ direction: 'column' })}>
      <View ref={props.ref} role="toolbar" style={style}>
        <View style={row}>{props.children}</View>
        <Show when={ctx.link.open}>
          <LinkEditor />
        </Show>
      </View>
      <View {...DECOR} style={rule} />
    </View>
  );
}

/** Controls side by side, attached (Editor.Group). @param {Record<string, any>} props */
function EditorGroup(props) {
  return <View style={styled(props, () => ({ direction: 'row', gap: 0 }))}>{props.children}</View>;
}

/**
 * A toolbar action (Editor.Action): `onPress`,
 * `active` (a value or accessor), `label`, `disabled`, and its icon as
 * children. A borderless square as tall as a small field; an active one
 * takes the accent's ghost tint and text. It reads the edited block's selection on pointerdown, before
 * the press takes the focus.
 * @param {Record<string, any>} props
 */
function EditorAction(props) {
  const ctx = $parts();
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const on = read(props.active) === true;
    const disabled = read(props.disabled) === true;
    const ghost = variantColors(theme, scheme, 'ghost', theme.accent);
    const s = theme.sizes.control.sm;
    return {
      direction: 'row',
      align: 'center',
      justify: 'center',
      width: s,
      height: s,
      minWidth: s,
      minHeight: s,
      padding: 0,
      border: 0,
      radius: radiusOf(theme, 'sm'),
      fontSize: theme.fontSizes.sm,
      background: on ? ghost.hover : 'transparent',
      color: disabled ? page.disabledText : on ? ghost.color : page.text,
      ...pressLook(theme, disabled),
      select: 'none',
      ...(disabled || on ? null : { hover: { background: page.hover } }),
    };
  });
  return (
    <Action
      label={props.label}
      aria-pressed={state(props.active)}
      aria-disabled={flag(props.disabled)}
      selected={() => read(props.active) === true}
      onPointerDown={() => ctx.editor.snapshot()}
      onPress={(/** @type {any} */ e) => {
        if (read(props.disabled) === true) return;
        props.onPress?.(e);
      }}
      style={style}
    >
      {props.children}
    </Action>
  );
}

/** A glyph for an action: text in the regular weight (the bold one when `strong`), with a slant or underline from `style`. @param {{ text: string | (() => string), strong?: boolean, style?: Record<string, any> }} props */
function Glyph(props) {
  const ui = $ui();
  const w = ui.theme().weights;
  return <Label text={props.text} style={() => ({ select: 'none', fontWeight: props.strong === true ? w.bold : w.regular, ...props.style })} />;
}

/** An icon drawn with shapes in a `sizes.glyph.md` (16 px) square, in the control's text color. @param {{ shapes: (color: string) => Record<string, any>[] }} props */
function Icon(props) {
  const ui = $ui();
  return <Shape shapes={() => props.shapes(pageColors(ui.theme(), ui.scheme()).text)} style={() => ({ width: ui.theme().sizes.glyph.md, height: ui.theme().sizes.glyph.md, shrink: 0 })} />;
}

/** A curved arrow (undo when `back`). @param {boolean} back */
const arrow = back => (/** @type {string} */ color) => {
  const x = (/** @type {number} */ v) => (back ? v : 16 - v);
  return [
    { kind: 'path', points: [x(4), 6, x(10), 6, x(13), 9, x(10), 12, x(6), 12], stroke: 1.5, color },
    { kind: 'path', points: [x(6.5), 3, x(3.5), 6, x(6.5), 9], stroke: 1.5, color },
  ];
};

/** The link icon: two joined rings, crossed out when `broken`. @param {boolean} broken */
const rings = broken => (/** @type {string} */ color) => {
  /** @type {Record<string, any>[]} */
  const out = [
    { kind: 'oval', x: 1.5, y: 5, right: 9.5, bottom: 11, stroke: 1.5, color },
    { kind: 'oval', x: 6.5, y: 5, right: 14.5, bottom: 11, stroke: 1.5, color },
  ];
  if (broken) out.push({ kind: 'line', x: 2, y: 14, right: 14, bottom: 2, stroke: 1.5, color });
  return out;
};

/** Three bulleted lines. @param {string} color */
const bullets = color => {
  /** @type {Record<string, any>[]} */
  const out = [];
  for (const y of [3.5, 8, 12.5]) {
    out.push({ kind: 'oval', x: 1, y: y - 1.2, right: 3.4, bottom: y + 1.2, color });
    out.push({ kind: 'line', x: 6, y, right: 15, bottom: y, stroke: 1.5, color });
  }
  return out;
};

/** Lines of text aligned one way (the align controls' icons). @param {Align} align */
const lines = align => (/** @type {string} */ color) =>
  [
    [14, 3],
    [9, 6.5],
    [14, 10],
    [9, 13.5],
  ].map(([w, y]) => {
    const span = align === 'justify' ? 14 : w;
    const x = align === 'start' || align === 'justify' ? 1 : align === 'end' ? 15 - span : (16 - span) / 2;
    return { kind: 'line', x, y, right: x + span, bottom: y, stroke: 1.5, color };
  });

/** A horizontal line across the middle. @param {string} color */
const rule = color => [{ kind: 'line', x: 1, y: 8, right: 15, bottom: 8, stroke: 1.5, color }];

/**
 * A control bound to the editor: its label from the editor's labels, its
 * icon, what it runs and when it shows as active.
 * @param {string} name the label's key @param {() => any} icon @param {(editor: EditorHandle) => void} run @param {((editor: EditorHandle) => boolean) | null} active @param {((editor: EditorHandle) => boolean) | null} [enabled]
 */
function control(name, icon, run, active, enabled = null) {
  /** @param {Record<string, any>} props */
  const Bound = props => {
    const ctx = $parts();
    return (
      <EditorAction
        label={() => read(props.label) ?? ctx.labels[name]}
        active={active === null ? false : () => active(ctx.editor)}
        disabled={enabled === null ? false : () => !enabled(ctx.editor)}
        onPress={() => run(ctx.editor)}
        style={props.style}
      >
        {props.children ?? props.icon ?? icon()}
      </EditorAction>
    );
  };
  return Bound;
}

const EditorBold = control('bold', () => <Glyph text="B" strong />, e => e.toggle('bold'), e => e.marked('bold'));
const EditorItalic = control('italic', () => <Glyph text="I" style={{ italic: true }} />, e => e.toggle('italic'), e => e.marked('italic'));
const EditorUnderline = control('underline', () => <Glyph text="U" style={{ underline: true }} />, e => e.toggle('underline'), e => e.marked('underline'));
const EditorStrike = control('strike', () => <Glyph text="S" />, e => e.toggle('strike'), e => e.marked('strike'));
const EditorClear = control('clear', () => <Glyph text="Tx" />, e => e.clearFormatting(), null);
const EditorCode = control('code', () => <Glyph text="</>" />, e => e.toggle('code'), e => e.marked('code'));
const EditorCodeBlock = control('codeBlock', () => <Glyph text="{ }" />, e => e.toggleBlock('code'), e => e.isBlock('code'));
/**
 * A heading action (Editor.Heading): `level` (1 to 4) makes the block a
 * heading of that level, or a paragraph when it is one already.
 * @param {Record<string, any>} props
 */
function EditorHeading(props) {
  const ctx = $parts();
  const level = () => Math.max(1, Math.min(4, Number(read(props.level) ?? 1) || 1));
  return (
    <EditorAction
      label={() => read(props.label) ?? ctx.labels.heading(level())}
      active={() => ctx.editor.isBlock('heading', level())}
      onPress={() => ctx.editor.toggleBlock('heading', level())}
      style={props.style}
    >
      {props.children ?? props.icon ?? <Glyph text={() => `H${level()}`} strong />}
    </EditorAction>
  );
}
const EditorSub = control('sub', () => <Glyph text="x₂" />, e => e.toggle('subscript'), e => e.marked('subscript'));
const EditorSup = control('sup', () => <Glyph text="x²" />, e => e.toggle('superscript'), e => e.marked('superscript'));
const EditorHighlight = control('highlight', () => <HighlightGlyph />, e => e.toggle('highlight'), e => e.marked('highlight'));
const EditorUncolor = control('uncolor', () => <Icon shapes={color => [{ kind: 'oval', x: 2, y: 2, right: 14, bottom: 14, stroke: 1.5, color }, { kind: 'line', x: 3, y: 13, right: 13, bottom: 3, stroke: 1.5, color }]} />, e => e.colorText(null), null);
/**
 * An alignment action (Editor.Align): `value` ('start', 'center', 'end'
 * or 'justify') aligns the block's text.
 * @param {Record<string, any>} props
 */
function EditorAlign(props) {
  const ctx = $parts();
  const value = () => /** @type {Align} */ (read(props.value) ?? 'start');
  return (
    <EditorAction
      label={() => read(props.label) ?? ctx.labels.align(value())}
      active={() => ctx.editor.block()?.align === value()}
      onPress={() => ctx.editor.align(value())}
      style={props.style}
    >
      {props.children ?? props.icon ?? (() => <Icon shapes={lines(value())} />)}
    </EditorAction>
  );
}
const EditorRule = control('rule', () => <Icon shapes={rule} />, e => e.insertRule(), null);

/** The highlight control's glyph: a letter on the highlight's color. */
function HighlightGlyph() {
  const ui = $ui();
  return <Label text="H" style={() => ({ select: 'none', padding: [0, ui.theme().spacing.xs / 2], background: highlightOf(ui.theme(), ui.scheme(), undefined) })} />;
}

/**
 * A text color action (Editor.Swatch): `color` (
 * a theme name or a CSS color: hex, a name, or rgb/hsl/hwb/lab/lch/oklab/oklch/color() of plain values (not var() or color-mix()); hex, rgb and hsl draw on every renderer, a CSS name and the other functions on the DOM only) set on the selection; its swatch as the icon.
 * @param {Record<string, any>} props
 */
function EditorSwatch(props) {
  const ctx = $parts();
  const ui = $ui();
  const color = () => String(read(props.color) ?? '');
  const resolved = () => colorOf(ui.theme(), ui.scheme(), color());
  return (
    <EditorAction
      label={() => read(props.label) ?? ctx.labels.swatch(color())}
      active={() => ctx.editor.marked('color', resolved())}
      onPress={() => ctx.editor.colorText(resolved())}
      style={props.style}
    >
      {props.children ?? <Swatch color={resolved} size={() => ui.theme().spacing.md} radius="round" />}
    </EditorAction>
  );
}

/** How many swatches a row of Editor.Colors' panel holds before it wraps. */
const SWATCHES_A_ROW = 6; // count: color swatches across a row

/**
 * A text color picker (Editor.Colors): its action shows the selection's
 * color and opens one panel: a row of round swatches, the "no color"
 * swatch first (`LABELS.uncolor`), then `colors` (each a theme name or a CSS color: hex, a name, or rgb/hsl/hwb/lab/lch/oklab/oklch/color() of plain values (not var() or color-mix()); hex, rgb and hsl draw on every renderer, a CSS name and the other functions on the DOM only;
 * every theme hue by default), and under them a Custom… entry
 * (`LABELS.colorsCustom`) that opens a ColorPicker in the same panel. A
 * swatch sets the color and closes the panel; the picker sets it as it
 * moves and leaves the panel open (Escape or a press outside closes it).
 * Each opening starts on the swatches, which wrap after six a row. `popover` goes to the Popover and
 * `picker` to the ColorPicker (their props). The selection is the one read
 * when the action was pressed. Swatches are as wide as the md spacing step
 * inside the control and the lg step in the panel, a half xs step apart.
 * @param {Record<string, any>} props
 */
function EditorColors(props) {
  const ctx = $parts();
  const ui = $ui();
  const R = $active();
  const open = $signal(R, false);
  const custom = $signal(R, false);
  const current = () => ctx.editor.markValue('color') ?? pageColors(ui.theme(), ui.scheme()).text;
  /** The swatches' colors, resolved. */
  const colors = () => {
    const theme = ui.theme();
    const given = read(props.colors) ?? Object.keys(theme.colors);
    return /** @type {string[]} */ (given).map(c => colorOf(theme, ui.scheme(), c));
  };
  /** Sets a color (null clears it) and closes the panel. @param {string | null} color */
  const pick = color => {
    ctx.editor.colorText(color);
    $write(open, false);
  };
  const size = () => ui.theme().spacing.lg;
  const swatches = styled({}, theme => ({ direction: 'row', wrap: true, gap: theme.spacing.xs / 2, maxWidth: SWATCHES_A_ROW * theme.spacing.lg + (SWATCHES_A_ROW - 1) * (theme.spacing.xs / 2) }));
  const panel = styled({}, theme => ({ direction: 'column', gap: theme.spacing.xs }));
  const entry = styled({}, (theme, scheme) => {
    const c = variantColors(theme, scheme, 'plain', theme.accent);
    return { self: 'start', padding: 0, border: 0, background: 'transparent', color: c.color, fontSize: theme.fontSizes.sm, ...pressLook(theme), hover: { color: c.hoverColor } };
  });
  return (
    <Popover
      open={() => $read(open)}
      portal
      trap
      {...(read(props.popover) ?? {})}
      onOpenChange={(/** @type {boolean} */ v) => {
        if (v) $write(custom, false);
        $write(open, v);
      }}
    >
      <Popover.Trigger>
        <EditorAction label={() => read(props.label) ?? ctx.labels.colors} style={props.style}>
          <Swatch color={current} size={() => ui.theme().spacing.md} radius="round" />
        </EditorAction>
      </Popover.Trigger>
      <Popover.Panel>
        <View style={panel}>
          <View style={swatches}>
            <Swatch label={ctx.labels.uncolor} size={size} radius="round" color="transparent" onPress={() => pick(null)}>
              <Icon shapes={color => [{ kind: 'line', x: 3, y: 13, right: 13, bottom: 3, stroke: 1.5, color }]} />
            </Swatch>
            <For each={colors} by="position">
              {(/** @type {() => string} */ color) => <Swatch label={() => ctx.labels.swatch(color())} color={color} size={size} radius="round" onPress={() => pick(color())} />}
            </For>
          </View>
          <Action
            text={ctx.labels.colorsCustom}
            label={ctx.labels.colorsCustom}
            aria-expanded={() => ($read(custom) ? 'true' : 'false')}
            onPress={() => $write(custom, !$untrack(R, () => $read(custom)))}
            style={entry}
          />
          <Show when={() => $read(custom)}>
            <ColorPicker defaultValue={$untrack(R, current)} {...(read(props.picker) ?? {})} onChange={(/** @type {string} */ v) => ctx.editor.colorText(v)} />
          </Show>
        </View>
      </Popover.Panel>
    </Popover>
  );
}

const EditorQuote = control('quote', () => <Glyph text={'“'} strong />, e => e.toggleBlock('quote'), e => e.isBlock('quote'));
const EditorBullet = control('bullet', () => <Icon shapes={bullets} />, e => e.toggleBlock('bullet'), e => e.isBlock('bullet'));
const EditorOrdered = control('ordered', () => <Glyph text="1." strong />, e => e.toggleBlock('ordered'), e => e.isBlock('ordered'));
const EditorUnlink = control('unlink', () => <Icon shapes={rings(true)} />, e => e.unlink(), null);
const EditorUndo = control('undo', () => <Icon shapes={arrow(true)} />, e => e.undo(), null, e => e.canUndo());
const EditorRedo = control('redo', () => <Icon shapes={arrow(false)} />, e => e.redo(), null, e => e.canRedo());

/**
 * The link control (Editor.Link): opens the link editor
 * under the toolbar for the selection.
 * @param {Record<string, any>} props
 */
function EditorLink(props) {
  const ctx = $parts();
  return (
    <EditorAction label={() => read(props.label) ?? ctx.labels.link} active={() => ctx.editor.marked('link')} onPress={() => ctx.link.set(!ctx.link.open())}>
      {props.children ?? props.icon ?? <Icon shapes={rings(false)} />}
    </EditorAction>
  );
}

/** The link editor: an address field and Apply; Enter applies too. */
function LinkEditor() {
  const ctx = $parts();
  const url = $signal($active(), '');
  const save = () => {
    ctx.editor.link($read(url).trim());
    ctx.link.set(false);
  };
  const field = styled({}, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return { grow: 1, minWidth: 0, height: theme.sizes.control.sm, padding: [0, theme.spacing.xs], border: 1, borderColor: page.border, radius: radiusOf(theme, 'sm'), background: page.field, color: page.text, fontSize: theme.fontSizes.sm };
  });
  const button = styled({}, (theme, scheme) => {
    const c = variantColors(theme, scheme, 'neutral', null);
    return { height: theme.sizes.control.sm, padding: [0, theme.spacing.sm], border: 1, borderColor: c.border, radius: radiusOf(theme, 'sm'), background: c.background, color: c.color, fontSize: theme.fontSizes.sm, ...pressLook(theme) };
  });
  const bar = styled({}, theme => ({ direction: 'row', gap: theme.spacing.xs, align: 'center' }));
  const menu = $editMenu({ editMenu: ctx.editMenu });
  return (
    <View style={bar}>
      <Edit
        {...menu.bind()}
        value={() => $read(url)}
        label={ctx.labels.linkHint}
        aria-label={ctx.labels.linkAddress}
        onChange={(/** @type {{ value: string }} */ e) => $write(url, e.value)}
        onSubmit={save}
        style={field}
      />
      {menu.menu}
      <Action text={ctx.labels.linkApply} onPress={save} style={button} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Content

/** The text style of a block type. @param {any} theme @param {Block} b */
function textOf(theme, b) {
  if (b.type === 'heading') {
    const h = theme.headings.levels[b.level - 1] ?? theme.headings.levels[3];
    return { fontSize: h.size, lineHeight: h.leading, fontWeight: theme.headings.weight };
  }
  if (b.type === 'code') return { fontSize: theme.fontSizes.sm, lineHeight: theme.lineHeights.code, fontFamily: MONOSPACE };
  return { fontSize: theme.fontSizes.md, lineHeight: theme.lineHeights.md };
}

/**
 * The marker of a list item: its place among the items of its list at its
 * depth (an ordered item), or the bullet of its depth (disc, circle,
 * square, as the browser's nested lists).
 * @param {readonly Block[]} blocks @param {number} id
 */
function markerOf(blocks, id) {
  const eff = depths(blocks);
  /** @type {number[]} */
  const counts = [];
  /** @type {string[]} */
  const types = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!isList(b.type)) {
      counts.length = 0;
      types.length = 0;
      continue;
    }
    const d = eff[i];
    counts.length = d + 1;
    types.length = d + 1;
    counts[d] = types[d] === b.type ? (counts[d] ?? 0) + 1 : 1;
    types[d] = b.type;
    if (b.id === id) return { text: b.type === 'ordered' ? `${counts[d]}.` : (['•', '◦', '▪'][Math.min(2, d)]), depth: d };
  }
  return { text: '•', depth: 0 };
}

/**
 * A mark's color as the portable style draws it on every renderer: one
 * parseColor reads (hex, rgb(a), hsl(a)) as hex; any other CSS color
 * (a name, oklch, lab, color()) as it is, which only the DOM draws.
 * @param {string} color
 */
const drawable = color => {
  const c = parseColor(color);
  return c === null ? color : formatColor(c, 'hex', c.a < 1);
};

/** A highlight's background: its color, or the Mark amber (1, or 6 at the theme's `opacity.soft` in the dark). @param {any} theme @param {'light' | 'dark'} scheme @param {string | undefined} color */
const highlightOf = (theme, scheme, color) => {
  // A document color is CSS already (Swatch and Colors resolve theme names before they store one).
  if (color !== undefined) return drawable(color);
  const shades = shadesOf(theme, 'amber');
  return scheme === 'dark' ? alpha(shades[6], theme.opacity.soft) : shades[1];
};

/** A row's justification (a Label's text alignment) for an alignment. @param {Align} align */
const justifyOf = align => (align === 'center' ? 'center' : align === 'end' ? 'end' : 'start');

/**
 * The style of a run's marks: bold, italic, underline, strike, code (on its
 * background; monospace and smaller when drawn), link (the accent color,
 * underlined; its color wins over a text color), highlight, text color, and
 * subscript and superscript as smaller type (two steps down the theme's type scale) when drawn. In
 * an Edit (`edited`) the size and family stay the Edit's: code is its
 * background only and subscript and superscript are plain.
 * @param {Block} b @param {readonly import('./model.js').Mark[]} marks @param {any} theme @param {'light' | 'dark'} scheme @param {boolean} edited
 * @returns {{ style: Record<string, any>, href: string | null }}
 */
function markStyle(b, marks, theme, scheme, edited) {
  /** @type {Record<string, any>} */
  const style = {};
  /** @type {string | null} */
  let href = null;
  for (const m of marks) {
    if (m.type === 'bold') style.fontWeight = theme.weights.bold;
    else if (m.type === 'italic') style.italic = true;
    else if (m.type === 'underline') style.underline = true;
    else if (m.type === 'strike') style.strike = true;
    else if (m.type === 'code') {
      style.background = pageColors(theme, scheme).sunken;
      if (!edited) {
        style.fontSize = theme.fontSizes.sm;
        style.fontFamily = MONOSPACE;
      }
    } else if (m.type === 'link') {
      style.underline = true;
      href = m.href ?? '';
    } else if (m.type === 'highlight') style.background = highlightOf(theme, scheme, m.color);
    else if (m.type === 'color') style.color = drawable(/** @type {string} */ (m.color));
    else if ((m.type === 'subscript' || m.type === 'superscript') && !edited) style.fontSize = fontBelow(theme, textOf(theme, b).fontSize, 2);
  }
  if (href !== null) style.color = colorOf(theme, scheme, theme.accent);
  return { style, href };
}

/**
 * A block's marked runs as a Label's runs (`markStyle`), links pressable
 * with `onLink`.
 * @param {Block} b @param {any} theme @param {'light' | 'dark'} scheme @param {((href: string) => void) | null} onLink
 * @returns {{ text: string, style: Record<string, any>, onPress?: () => void }[]}
 */
function drawnRuns(b, theme, scheme, onLink) {
  return runs(b).map(run => {
    const { style, href } = markStyle(b, run.marks, theme, scheme, false);
    return href === null || onLink === null ? { text: run.text, style } : { text: run.text, style, onPress: () => onLink(href) };
  });
}

/**
 * The runs of the block being edited, as its Edit's `runs`: its texts
 * joined are the block's text, the Edit's value (`markStyle` in an Edit);
 * null for a block without marks, which shows plain.
 * @param {Block} b @param {any} theme @param {'light' | 'dark'} scheme
 * @returns {{ text: string, style: Record<string, any> }[] | null}
 */
function editedRuns(b, theme, scheme) {
  if (b.marks.length === 0 || b.text === '') return null;
  return runs(b).map(run => ({ text: run.text, style: markStyle(b, run.marks, theme, scheme, true).style }));
}

/**
 * A drawn Label and where its text starts in its block.
 * @typedef {{ node: any, start: number, length: number }} Spot
 */

/**
 * A block drawn with its marks: one Label of runs, which wraps across them;
 * links pressable when `onLink` is given; a code block a Label a line.
 * Each Label is noted in `spots` with where its text starts in the block.
 * @param {{ block: () => Block, placeholder: () => string | null, onLink: () => ((href: string) => void) | null, spots: Spot[] }} props
 */
function Drawn(props) {
  const ui = $ui();
  return (
    <View style={{ direction: 'column', minWidth: 0 }}>
      {() => {
        const b = props.block();
        const theme = ui.theme();
        const scheme = ui.scheme();
        const page = pageColors(theme, scheme);
        const spots = props.spots;
        spots.length = 0;
        const note = (/** @type {number} */ start, /** @type {number} */ length) => (/** @type {any} */ node) => void spots.push({ node, start, length });
        if (b.type === 'code') {
          let at = 0;
          return b.text.split('\n').map(line => {
            const start = at;
            at += line.length + 1;
            return <Label ref={note(start, line.length)} text={line === '' ? ' ' : line} style={{ width: '100%', wrap: true }} />;
          });
        }
        if (b.text === '') {
          const p = props.placeholder();
          return <Label text={p ?? ' '} style={p === null ? {} : { color: page.placeholder }} />;
        }
        const onLink = props.onLink();
        const list = drawnRuns(b, theme, scheme, onLink);
        return <Label ref={note(0, b.text.length)} runs={list} style={{ wrap: true, textAlign: justifyOf(b.align), ...(onLink !== null && list.some(r => r.onPress !== undefined) ? pressLook(theme) : null) }} />;
      }}
    </View>
  );
}

/** What each block means. @type {Record<string, string>} */
const ROLES = { paragraph: 'paragraph', heading: 'heading', bullet: 'listitem', ordered: 'listitem', quote: 'blockquote', code: 'code', rule: 'separator' };

/**
 * The document (Editor.Content): the block being edited
 * as an Edit, the others drawn; a press on a drawn block edits it. The
 * Edit wraps and grows with its rows as the drawn block does (one row at
 * the least), so a block keeps its height as it is edited; Enter splits a
 * block (a code block takes it as a line), Shift+Enter breaks no line in
 * one, and Up and Down move among its drawn rows, leaving the block from
 * its first row (Up) or its last (Down), as its Edit's `caretRow()` tells;
 * where the Edit cannot tell (a worker's Handle), a one-row block at once
 * and a longer one from its first place (Up) or its last (Down). It
 * means a multi-line `textbox` of its blocks' roles (paragraph, heading
 * at its level, listitem, blockquote, code).
 * It is named by `aria-label` or `aria-labelledby`, else by the label of the Field around it, else by its
 * `placeholder`, which also shows in an empty document; `onLinkPress(href)` hears
 * presses on links while the editor is not editable. It stands at least
 * `sizes.control.md` plus `spacing.lg` tall (one line and its room); a
 * quote's bar is `sizes.divider.lg` wide, and list markers and each
 * nesting level take a `spacing.lg` gutter.
 * @param {Record<string, any>} props
 */
function EditorContent(props) {
  const ctx = $parts();
  const editor = ctx.editor;
  // The rows each block's Edit shows while edited and its caret's row, for the arrows: they leave a block from its
  // first drawn row (Up) or its last (Down). Kept for the editor by its view, never on its handle.
  /** @type {Map<number, () => Caret>} */
  const shown = new Map();
  SHOWN.set(editor, id => shown.get(id)?.() ?? { row: null, rows: 1 });
  const ui = $ui();
  const style = styled(props, theme => ({ direction: 'column', gap: theme.spacing.xs, padding: theme.spacing.md, minHeight: theme.sizes.control.md + theme.spacing.lg }));
  const placeholder = () => {
    const blocks = editor.doc().blocks;
    const p = read(props.placeholder);
    return p != null && blocks.length === 1 && blocks[0].text === '' ? String(p) : null;
  };
  /** @param {() => Block} item */
  const row = item => {
    const id = item().id;
    const shell = styled({}, (theme, scheme) => {
      const b = item();
      const page = pageColors(theme, scheme);
      /** @type {Record<string, any>} */
      // A document's text: selectable (and pressed to its character) under an app's root too.
      const s = { direction: 'row', align: 'start', minWidth: 0, ...textOf(theme, b), select: 'text', cursor: editor.editable() ? 'text' : 'default', padding: [0, 0, 0, indentOf()] };
      if (b.type === 'rule') Object.assign(s, { padding: [theme.spacing.xs, 0], cursor: 'default' });
      if (b.type === 'quote') Object.assign(s, { border: 0, padding: [0, 0, 0, theme.spacing.md], background: 'transparent' });
      if (b.type === 'code') Object.assign(s, { padding: [theme.spacing.xs, theme.spacing.sm], radius: radiusOf(theme, 'sm'), background: page.sunken, color: page.text });
      return s;
    });
    const bar = styled({}, (theme, scheme) => ({ position: 'absolute', left: 0, top: 0, bottom: 0, width: theme.sizes.divider.lg, background: pageColors(theme, scheme).edge }));
    const marker = () => (isList(item().type) ? markerOf(editor.doc().blocks, id).text : null);
    const indentOf = () => (isList(item().type) ? markerOf(editor.doc().blocks, id).depth * ui.theme().spacing.lg : 0);
    const editing = () => editor.active() === id && editor.editable();
    const edit = styled({}, theme => {
      const b = item();
      const t = textOf(theme, b);
      // Across its column (it stretches there, as the drawn block does), never wider than it.
      return {
        minWidth: 0,
        border: 0,
        radius: 0,
        ring: false,
        padding: 0,
        background: 'transparent',
        textAlign: justifyOf(b.align),
        ...t,
        // Its least height is one row, as its drawn text's: an Edit takes no more room than the block did (a field's own least
        // height is taller).
        minHeight: t.fontSize * t.lineHeight,
      };
    });
    /** @type {Spot[]} */
    const spots = [];
    // The pressed character: the pressed Label (or the one under the point) asked where.
    const onPress = (/** @type {any} */ event) => {
      if (editing()) return;
      const [x, y] = pointOf(event);
      // The pressed Label, or on the DOM the Label holding the pressed run's span.
      const spot = spots.find(s => s.node === event?.target || (event?.target != null && s.node?.contains?.(event.target) === true)) ?? spots.find(s => {
        const r = s.node?.getBoundingClientRect?.();
        return r != null && x >= r.left && x < r.right && y >= r.top && y < r.bottom;
      });
      const at = spot === undefined ? null : offsetAt(spot.node, x, y);
      editor.activate(id, spot === undefined || at === null ? undefined : spot.start + Math.min(at, spot.length));
    };
    /** The block's Edit while shown (its caret's row, else its height, tells its rows). @type {any} */
    let editNode = null;
    /** @returns {Caret} */
    const rows = () => {
      // The drawn row of the caret and the rows drawn, where the Edit tells them (not a worker's Handle).
      const caret = typeof editNode?.caretRow === 'function' ? editNode.caretRow() : null;
      if (caret != null && typeof caret.row === 'number' && typeof caret.rows === 'number') return { row: caret.row, rows: caret.rows };
      const b = item();
      const t = textOf(ui.theme(), b);
      const h = boxOf(editNode).height;
      return { row: null, rows: Math.max(b.text.split('\n').length, h > 0 ? Math.round(h / (t.fontSize * t.lineHeight)) : 1) };
    };
    shown.set(id, rows);
    const owner = $owner($active());
    if (owner != null) $cleanup(/** @type {any} */ (owner), () => shown.get(id) === rows && shown.delete(id));
    const common = {
      ref: (/** @type {any} */ n) => {
        editNode = n;
        editor.bind(id, n);
      },
      value: () => item().text,
      // The block's marks while it is edited: always the runs of its current text.
      runs: () => editedRuns(item(), ui.theme(), ui.scheme()),
      label: () => placeholder() ?? '',
      onChange: (/** @type {{ value: string }} */ e) => editor.input(id, e.value),
      onKey: (/** @type {any} */ e) => editor.key(id, e),
      onPointerUp: () => editor.track(id),
      onPointerCancel: () => editor.track(id),
      style: edit,
    };
    const line = styled({}, (theme, scheme) => ({ grow: 1, height: 1, background: pageColors(theme, scheme).border }));
    return (
      <View role={() => ROLES[item().type]} aria-level={() => (item().type === 'heading' ? item().level : undefined)} style={shell} onPress={onPress}>
        {() => (item().type === 'quote' ? <View {...DECOR} style={bar} /> : item().type === 'rule' ? <View {...DECOR} style={line} /> : null)}
        {() => {
          const m = marker();
          return m === null ? null : <Label {...DECOR} text={m} style={() => ({ width: ui.theme().spacing.lg, shrink: 0, select: 'none' })} />;
        }}
        <View hidden={() => item().type === 'rule'} style={{ direction: 'column', grow: 1, minWidth: 0 }}>
          <Show
            when={editing}
            fallback={<Drawn block={item} spots={spots} placeholder={placeholder} onLink={() => (editor.editable() ? null : (props.onLinkPress ?? null))} />}
          >
            {/* Every block's Edit wraps and grows with its rows, as its drawn text wraps (a code block's lines too); its style,
                after autosize, keeps it one row at the least. Enter splits a block (a code block takes it as a line). */}
            <Edit lines={2} autosize {...common} />
          </Show>
        </View>
      </View>
    );
  };
  // A textbox is named: its aria-label or aria-labelledby, else its Field's label, else its placeholder.
  const field = $fieldName(props);
  const byField = () => /** @type {string | undefined} */ (field?.['aria-labelledby']?.());
  return (
    <View
      ref={props.ref}
      role="textbox"
      aria-multiline="true"
      aria-label={() => read(props['aria-label']) ?? (props['aria-labelledby'] === undefined && byField() === undefined ? (read(props.placeholder) ?? undefined) : undefined)}
      aria-labelledby={props['aria-labelledby'] ?? (field === null ? undefined : byField)}
      style={style}
    >
      <For each={() => editor.doc().blocks} by={(/** @type {Block} */ b) => b.id}>
        {(/** @type {() => Block} */ item) => row(item)}
      </For>
    </View>
  );
}

// The parts, reached as Editor.Part only.
Editor.Toolbar = EditorToolbar;
Editor.Group = EditorGroup;
Editor.Action = EditorAction;
Editor.Content = EditorContent;
Editor.Bold = EditorBold;
Editor.Italic = EditorItalic;
Editor.Underline = EditorUnderline;
Editor.Strike = EditorStrike;
Editor.Clear = EditorClear;
Editor.Code = EditorCode;
Editor.Sub = EditorSub;
Editor.Sup = EditorSup;
Editor.Highlight = EditorHighlight;
Editor.Swatch = EditorSwatch;
Editor.Uncolor = EditorUncolor;
Editor.Colors = EditorColors;
Editor.Align = EditorAlign;
Editor.Rule = EditorRule;
Editor.CodeBlock = EditorCodeBlock;
Editor.Heading = EditorHeading;
Editor.Quote = EditorQuote;
Editor.Bullet = EditorBullet;
Editor.Ordered = EditorOrdered;
Editor.Link = EditorLink;
Editor.Unlink = EditorUnlink;
Editor.Undo = EditorUndo;
Editor.Redo = EditorRedo;
