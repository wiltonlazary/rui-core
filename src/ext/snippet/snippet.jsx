// Snippet, SnippetTabs and InlineSnippet on the portable
// primitives: the code tokenized by tokenize.js, each
// line one Label of styled runs (ren-core's `runs`), a run per stretch of
// one color, colored with the syntax palette (palette.js).
//
// Code draws in the monospace stack (the canvases' `mono` font, their
// text font without one); a line wider than the block scrolls across (a
// Scroll on the x axis). Tabs show as two spaces.

import { View, Label, Action, Shape, Scroll, Show, $active, $read, $memo, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { pageColors, radiusOf } from '../../theme/resolve.js';
import { Button, IconButton, CheckIcon, ChevronIcon } from '../../core/buttons/index.js';
import { alpha } from '../../theme/colors.js';
import { $clipboard } from '../../hooks/platform.js';
import { $value } from '../../core/inputs/shared.js';
import { $barRoom } from '../more/shared.js';
import { tokenize, lines } from './tokenize.js';
import { SYNTAX_LIGHT, SYNTAX_DARK, MONOSPACE, tokenColor } from './palette.js';
import { DECOR, state } from '../../theme/meaning.js';
import { labelsIn } from '../../theme/labels.js';

/** @typedef {import('./palette.js').SyntaxColors} SyntaxColors */

/** The syntax palette of a scheme. @param {'light' | 'dark'} scheme @returns {SyntaxColors} */
export const syntaxColors = scheme => (scheme === 'dark' ? SYNTAX_DARK : SYNTAX_LIGHT);

/** Two overlapping sheets (the copy icon), in a `size` square. @param {{ size: () => number, color: () => string }} props */
function CopyIcon(props) {
  const shapes = () => {
    const s = props.size();
    const color = props.color();
    const stroke = Math.max(1.5, Math.round(s / 10));
    const box = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w) => ({ kind: 'path', points: [x, y, x + w, y, x + w, y + w, x, y + w], closed: true, stroke, color });
    return [box(s * 0.34, s * 0.34, s * 0.52), { kind: 'path', points: [s * 0.66, s * 0.2, s * 0.66, s * 0.14, s * 0.14, s * 0.14, s * 0.14, s * 0.66, s * 0.2, s * 0.66], stroke, color }];
  };
  return <Shape shapes={shapes} style={() => ({ width: props.size(), height: props.size(), shrink: 0 })} />;
}

/** The code's lines of tokens; a trailing line break ends the last line, it opens no empty one. @param {string} code @param {string | undefined} language */
function rowsOf(code, language) {
  const rows = lines(tokenize(code, language));
  if (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

/**
 * Tokens as a Label's runs in a palette: a run per stretch of one color
 * (neighboring tokens of one color join).
 * @param {readonly { text: string, type: import('./tokenize.js').TokenType }[]} tokens @param {SyntaxColors} palette @param {(text: string) => string} [clean]
 * @returns {{ text: string, style: { color: string } }[]}
 */
export function runsOf(tokens, palette, clean = t => t) {
  /** @type {{ text: string, style: { color: string } }[]} */
  const out = [];
  for (const t of tokens) {
    const color = tokenColor(palette, t.type);
    const text = clean(t.text);
    const last = out[out.length - 1];
    if (last !== undefined && last.style.color === color) last.text += text;
    else out.push({ text, style: { color } });
  }
  return out;
}

/** A monospace digit's advance, in em: the line numbers' column is as wide as their digits. */
const ADVANCE = 0.6;

/**
 * The code's lines, each one Label of colored runs, with line numbers when
 * asked (decoration): it means `code`, a string a line.
 * @param {{ rows: () => ReturnType<typeof rowsOf>, scheme: () => 'light' | 'dark', numbers: () => boolean, quiet: () => string }} props
 */
function Lines(props) {
  const ui = $ui();
  return (
    <View role="code" style={{ direction: 'column', shrink: 0, self: 'start' }}>
      {() => {
        const palette = syntaxColors(props.scheme());
        const rows = props.rows();
        const numbers = props.numbers();
        const digits = String(rows.length).length;
        const quiet = props.quiet();
        const theme = ui.theme();
        // The numbers' column: their digits, then an sm step before the code.
        /** @type {Record<string, any>} */
        const gutter = { width: Math.ceil(digits * theme.fontSizes.sm * ADVANCE) + theme.spacing.sm, shrink: 0, textAlign: 'end', padding: [0, theme.spacing.sm, 0, 0], color: quiet, select: 'none' };
        return rows.map((runs, i) => (
          <View style={{ direction: 'row', shrink: 0 }}>
            {numbers ? (
              <Label
                {...DECOR}
                text={String(i + 1)}
                style={gutter}
              />
            ) : null}
            {runs.length === 0 ? <Label text=" " /> : <Label runs={runsOf(runs, palette)} style={{ shrink: 0 }} />}
          </View>
        ));
      }}
    </View>
  );
}

/**
 * A code block: its header strip (the `lead`, SnippetTabs' tabs, then the
 * controls at the end: copy first, then expand, then the caller's
 * actions), the lines, and, while collapsed, a fade row over their bottom
 * edge with a text button that opens them. Shared by Snippet and
 * SnippetTabs.
 * @param {Record<string, any>} props @param {() => string} code @param {() => string | undefined} language @param {any} [lead]
 */
function block(props, code, language, lead = null) {
  const R = $active();
  const ui = $ui();
  const rows = $memo(R, () => rowsOf(code(), language()));
  const clip = $clipboard(R, { hold: () => read(props.hold) });
  const copied = () => /** @type {boolean} */ (read(clip.value));
  // The Scroll across is as high as its lines, its padding and its bar's room.
  const bar = $barRoom();
  const across = styled({}, theme => ({
    direction: 'column',
    padding: [theme.control.densePad.md, theme.control.pad.sm],
    height: Math.ceil($read(rows).length * theme.fontSizes.sm * theme.lineHeights.code) + 2 * theme.control.densePad.md + bar.room(),
  }));
  const scheme = () => read(props.scheme) ?? ui.scheme();
  const open = $value(props, /** @type {boolean} */ (read(props.defaultOpen) ?? true), 'open', 'defaultOpen', 'onOpenChange');
  const expandable = () => read(props.expandable) === true;
  const copyable = () => read(props.copyable) !== false;
  const collapsed = () => expandable() && !open.get();
  const quiet = () => pageColors(ui.theme(), scheme()).quiet;
  const glyph = () => ui.theme().sizes.glyph.sm;
  const ink = () => syntaxColors(scheme()).text;
  const more = () => String(read(props.moreLabel) ?? labelsIn().showAllLines);
  const body = styled({}, theme => ({
    direction: 'column',
    overflow: 'hidden',
    fontFamily: MONOSPACE,
    fontSize: theme.fontSizes.sm,
    lineHeight: theme.lineHeights.code,
    color: ink(),
    select: 'text',
    ...(collapsed() ? { maxHeight: Number(read(props.height) ?? theme.sizes.box.snippet) } : null),
  }));
  // The strip: the page's hover ground, the controls a half `xs` step apart and `panelPad` in from the end.
  const strip = styled({}, theme => ({
    direction: 'row',
    align: 'center',
    gap: theme.spacing.xs / 2,
    padding: [0, lead === null ? theme.control.panelPad : 0, 0, 0],
    overflow: 'hidden',
    background: pageColors(theme, scheme()).hover,
  }));
  const controls = styled({}, theme => ({ direction: 'row', align: 'center', gap: theme.spacing.xs / 2, shrink: 0, padding: [0, lead === null ? 0 : theme.control.panelPad, 0, 0] }));
  // The fade row: from the block's ground, clear at its top, to solid under the button; an `lg` step of fade over it.
  const fade = styled({}, theme => {
    const ground = read(props.background) ?? pageColors(theme, scheme()).sunken;
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      direction: 'row',
      justify: 'center',
      padding: [theme.spacing.lg, 0, theme.spacing.xs, 0],
      background: { linear: 180, stops: [[0, alpha(ground, 0)], [1, ground]] },
    };
  });
  const toggle = () => open.set(!open.get());
  const any = () => lead !== null || copyable() || expandable() || props.actions != null;
  return (
    <View style={{ position: 'relative', direction: 'column' }}>
      <Show when={any}>
        <View style={strip}>
          {lead ?? <View style={{ grow: 1 }} />}
          <View style={controls}>
            <Show when={copyable}>
              <IconButton variant="ghost" color={quiet} size="sm" label={() => String(copied() ? (read(props.doneLabel) ?? labelsIn().done) : (read(props.copyLabel) ?? labelsIn().copy))} onPress={() => void clip.copy(code())}>
                <Show when={copied} fallback={<CopyIcon size={glyph} color={quiet} />}>
                  <CheckIcon size={glyph} color="teal" />
                </Show>
              </IconButton>
            </Show>
            <Show when={expandable}>
              <IconButton
                variant="ghost"
                color={quiet}
                size="sm"
                label={() => (collapsed() ? more() : String(read(props.lessLabel) ?? labelsIn().fold))}
                onPress={toggle}
              >
                <ChevronIcon size={glyph} color={quiet} rotate={() => (collapsed() ? 0 : 180)} />
              </IconButton>
            </Show>
            {props.actions}
          </View>
        </View>
      </Show>
      <View style={body}>
        <Scroll axis="x" ref={bar.ref} onResize={bar.onResize} style={across}>
          <Lines rows={() => $read(rows)} scheme={scheme} numbers={() => read(props.numbered) === true} quiet={quiet} />
        </Scroll>
      </View>
      <Show when={collapsed}>
        <View style={fade}>
          <Button variant="plain" size="xs" onPress={toggle}>
            {more}
          </Button>
        </View>
      </Show>
    </View>
  );
}

/** The frame of a code block: its background, radius and border. @param {Record<string, any>} props */
const frame = props => {
  const ui = $ui();
  return styled(props, theme => {
    const page = pageColors(theme, read(props.scheme) ?? ui.scheme());
    return {
      direction: 'column',
      background: read(props.background) ?? page.sunken,
      radius: radiusOf(theme, read(props.radius)),
      overflow: 'hidden',
      ...(read(props.bordered) ? { border: 1, borderColor: page.rule } : null),
    };
  });
};

/**
 * Highlighted code: `code`, `language` (js, jsx,
 * ts, tsx, json, css, html, bash and their aliases; anything else plain),
 * `copyable` (true) with `copyLabel` ('Copy'), `doneLabel` ('Done') and
 * `hold` (how long the done state shows: a MOTION name or ms, MOTION.hold), `numbered` (line numbers), `expandable` with
 * `defaultOpen` (true) or `open` + `onOpenChange`, `height` (`sizes.box.snippet`, 240, about eleven lines: how high
 * it is while closed), `moreLabel`, `lessLabel`, `actions` (more
 * IconButtons after copy and expand), `scheme` (the palette's scheme, the page's by default),
 * `background`, `radius` (the theme's `corner`), `bordered`, and the style props.
 * The look: the controls sit at the end of a header strip in the page's
 * hover tone above the code (copy first, then expand, then `actions`; no
 * strip when there is none); the code is padded `control.densePad.md`
 * high and `control.pad.sm` wide; closed, a fade row over the code's
 * bottom edge, clear to the block's ground, holds a plain text button
 * (`moreLabel`, 'Show all lines') that opens it.
 * @param {Record<string, any>} props
 */
export function Snippet(props) {
  return (
    <View ref={props.ref} style={frame(props)}>
      {block(props, () => String(read(props.code) ?? ''), () => read(props.language))}
    </View>
  );
}

/**
 * Several files, one shown at a time under their names:
 * `files` is a list of `{ name, code, language, icon }`; tabs are keyed by name: the shown tab's name is its `value`,
 * with `onChange(name)`, or `defaultValue` (the first tab's name);
 * `iconOf(name)` gives an icon for a file without one; `aria-label` or
 * `aria-labelledby` names the tabs (no name by default); the rest as
 * Snippet. The tabs lead the header strip, the controls at its end.
 * @param {Record<string, any>} props
 */
export function SnippetTabs(props) {
  const ui = $ui();
  const active = $value(props, /** @type {string | undefined} */ (undefined), 'value', 'defaultValue', 'onChange');
  /** @returns {{ name?: string, code: string, language?: string, icon?: any }[]} */
  const files = () => {
    const f = read(props.files);
    return Array.isArray(f) ? f : [];
  };
  /** A tab's name: its file's, else its place. @param {{ name?: string }} file @param {number} i */
  const nameOf = (file, i) => file.name ?? `File ${i + 1}`;
  /** The shown tab's index: the one named by the value, else the first. */
  const shown = () => Math.max(0, files().findIndex((f, i) => nameOf(f, i) === active.get()));
  const current = () => files()[shown()] ?? { code: '' };
  const header = styled({}, () => ({ direction: 'row', grow: 1, minWidth: 0, overflow: 'hidden' }));
  const tab = (/** @type {number} */ i) =>
    styled({}, theme => {
      const scheme = read(props.scheme) ?? ui.scheme();
      const on = shown() === i;
      const page = pageColors(theme, scheme);
      return {
        direction: 'row',
        align: 'center',
        gap: theme.control.iconGap,
        padding: theme.control.optionPad,
        fontSize: theme.fontSizes.xs,
        fontWeight: on ? theme.weights.strong : theme.weights.regular,
        color: on ? page.text : page.quiet,
        background: on ? page.sunken : 'transparent',
        border: 0,
        radius: 0,
        cursor: 'pointer',
        shrink: 0,
      };
    });
  const tabs = (
    <View role="tablist" aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} style={header}>
      {() =>
        files().map((file, i) => {
          const name = nameOf(file, i);
          const icon = file.icon ?? props.iconOf?.(name) ?? null;
          return (
            <Action label={name} role="tab" aria-selected={state(() => shown() === i)} onPress={() => active.set(name)} style={tab(i)}>
              {icon}
              <Label text={name} />
            </Action>
          );
        })
      }
    </View>
  );
  return (
    <View ref={props.ref} style={frame(props)}>
      {block(props, () => String(current().code ?? ''), () => current().language, tabs)}
    </View>
  );
}

/**
 * Highlighted code inline: `code`,
 * `language`, `scheme`, `radius`, `background`, and the style
 * props; one Label of colored runs, which wraps as text, meaning `code`.
 * @param {Record<string, any>} props
 */
export function InlineSnippet(props) {
  const ui = $ui();
  const scheme = () => read(props.scheme) ?? ui.scheme();
  const style = styled(props, theme => {
    return {
      wrap: true,
      self: 'start',
      background: read(props.background) ?? pageColors(theme, scheme()).sunken,
      radius: radiusOf(theme, read(props.radius) ?? 'xs'),
      padding: [1, theme.spacing.xs / 2],
      fontFamily: MONOSPACE,
      fontSize: theme.fontSizes.xs,
      lineHeight: theme.lineHeights.xs,
      select: 'text',
    };
  });
  const runs = () => runsOf(tokenize(String(read(props.code) ?? ''), read(props.language)), syntaxColors(scheme()), t => t.replace(/\s+/g, ' '));
  return <Label ref={props.ref} role="code" runs={runs} style={style} />;
}
