// Rui: the provider of the theme, the color scheme and the words, and in
// the outermost one what an application root holds once (the text menu).
// It sits apart from theme.jsx, which every component imports, so the
// menus it holds import the theme without a cycle.

import { Show, $context, $lookup } from 'ren-core';
import { BASE_THEME, Theme, Scheme, $ui } from './theme.jsx';
import { Words, wordsOver } from './labels.js';
import { TextMenu } from '../core/overlays/text-menu.jsx';

/** Inside a Rui: only the outermost holds the text menu. */
const Inside = $context(false);

/**
 * Provides a `theme` and a color `scheme` to everything inside, and
 * `labels`: words over BASE_LABELS (and over an outer Rui's) for the
 * texts components show of their own, each a value or a signal or
 * accessor; a component's own prop for a text still wins. The outermost
 * Rui holds the text menu while its theme's `control.textMenu` is on; it
 * renders no box of its own.
 * @param {{ theme?: any, scheme?: any, labels?: any, children?: any }} props
 */
export function Rui(props) {
  const content = $lookup(Inside) === true ? props.children : <Outermost>{props.children}</Outermost>;
  if (props.labels === undefined) {
    return (
      <Theme value={props.theme ?? BASE_THEME}>
        <Scheme value={props.scheme ?? 'light'}>{content}</Scheme>
      </Theme>
    );
  }
  return (
    <Theme value={props.theme ?? BASE_THEME}>
      <Scheme value={props.scheme ?? 'light'}>
        <Words value={wordsOver(props.labels)}>{content}</Words>
      </Scheme>
    </Theme>
  );
}

/** The outermost Rui's content, and the text menu beside it while the theme says (a portal: no box). @param {{ children?: any }} props */
function Outermost(props) {
  const ui = $ui();
  return (
    <Inside value={true}>
      {props.children}
      <Show when={() => ui.theme().control.textMenu === true}>{() => <TextMenu />}</Show>
    </Inside>
  );
}
