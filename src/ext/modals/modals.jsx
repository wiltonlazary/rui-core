// The modals manager: <Modals> keeps
// the shown modals of its part of the view and renders each as a Modal,
// stacked (a later one over an earlier one); `$modals()` is its API:
// `show`, `ask`, `showNamed`, `hide`, `clear`, `update`. One manager per
// <Modals>, so per root: never a global singleton.

import { View, For, read, $active, $signal, $read, $write, $untrack, $batch, $closed, $context, $lookup, $memo } from 'ren-core';
import { Modal } from '../../core/overlays/index.js';
import { LAYERS } from '../../theme/layers.js';
import { Button } from '../../core/buttons/index.js';
import { styled } from '../../theme/style.js';
import { textOf } from '../../core/feedback/feedback.jsx';
import { ownValue } from '../../own.js';

/**
 * A shown modal: its id, its `kind` (what opened it: 'ask' from `ask`,
 * 'plain' from `show`, 'named' from `showNamed`), props (Modal's, and the
 * kind's own) and the named modal's name; `closing` while its exit
 * transition runs.
 * @typedef {{ id: string, kind: 'ask' | 'plain' | 'named', props: Record<string, any>, modal: string | null, closing: boolean }} ModalRecord
 */

/**
 * What a named modal is given.
 * @typedef {{ id: string, data: any, hide: () => void }} NamedModalProps
 */

/**
 * The API of a <Modals>, from `$modals()`.
 * @typedef {object} Modals
 * @property {() => ModalRecord[]} modals the shown modals, oldest first (tracked)
 * @property {(props: Record<string, any>) => string} show a modal with Modal's props (`title`, `children`, …; `id`); returns its id
 * @property {(props: Record<string, any>) => Promise<boolean>} ask a question: `title`, `text`, `labels` ({ yes, no }), `tone` (the yes button's color), `yesButton` and `noButton` (their Button's props), and Modal's props; its answers stack as wide as the modal, yes (solid) over no (ghost); resolves true on yes, false on no, Escape, the backdrop, the close button or a hide
 * @property {(name: string, data?: any, props?: Record<string, any>) => string} showNamed the manager's `named[name]`, given `{ id, data, hide }`; returns its id
 * @property {(id: string) => void} hide
 * @property {() => void} clear
 * @property {(id: string, props: Record<string, any>) => void} update merges props into a shown modal; its title (when it was shown with one), text or children, data and labels follow, the rest are read when it is shown
 */

/** The manager's API, for `$modals()`. */
export const ModalHost = $context(/** @type {Modals | null} */ (null));

/** The nearest <Modals>'s API; call it while a view is built. @returns {Modals} */
export function $modals() {
  const api = /** @type {Modals | null} */ ($lookup($active(), ModalHost));
  if (api === null) throw new Error('RUI: $modals() needs a <Modals> around it');
  return api;
}

/**
 * The modals manager: `named` (named modals by name: components given
 * `{ id, data, hide }`), `defaults` (every modal's props), `labels` (the
 * question's, { yes: 'Yes', no: 'No' }); `children` reach it with
 * `$modals()`. Every hide runs the modal's `onOpenChange(false)`, else the defaults' one.
 * @param {Record<string, any>} props
 */
export function Modals(props) {
  const R = $active();
  const list = $signal(R, /** @type {ModalRecord[]} */ ([]));
  /** The pending answers of the questions, by id. @type {Map<string, (yes: boolean) => void>} */
  const answers = new Map();
  let seq = 0;
  const now = () => /** @type {ModalRecord[]} */ ($untrack(R, () => $read(list)));
  /** @param {ModalRecord[]} next */
  const put = next => {
    if (!$closed(R)) $batch(R, () => $write(list, next));
  };
  /** Each record's own key: an id used again is a new modal, built anew. @type {WeakMap<ModalRecord, number>} */
  const keys = new WeakMap();
  let made = 0;
  /** @param {ModalRecord} m */
  const keyOf = m => /** @type {number} */ (keys.get(m));
  /** A record's next state, under its key. @param {ModalRecord} m @param {Partial<ModalRecord>} change */
  const changed = (m, change) => {
    const next = { ...m, ...change };
    keys.set(next, keyOf(m));
    return next;
  };
  /** @param {ModalRecord['kind']} kind @param {Record<string, any>} own @param {string | null} modal */
  const add = (kind, own, modal) => {
    const id = own.id ?? `modal-${++seq}`;
    /** @type {ModalRecord} */
    const record = { id, kind, props: own, modal, closing: false };
    keys.set(record, made++);
    put([...now().filter(m => m.id !== id), record]);
    return id;
  };
  /** Answers a question (once), then hides it. @param {string} id @param {boolean} yes */
  const answer = (id, yes) => {
    const resolve = answers.get(id);
    answers.delete(id);
    resolve?.(yes);
    api.hide(id);
  };
  /** @type {Modals} */
  const api = {
    modals: () => /** @type {ModalRecord[]} */ ($read(list)).filter(m => !m.closing),
    show: own => add('plain', own, null),
    ask: own =>
      new Promise(resolve => {
        const id = add('ask', own, null);
        answers.get(id)?.(false);
        answers.set(id, resolve);
      }),
    showNamed: (name, data, own = {}) => add('named', { ...own, data }, String(name)),
    hide(id) {
      const found = now().find(m => m.id === id && !m.closing);
      if (found === undefined) return;
      put(now().map(m => (m === found ? changed(m, { closing: true }) : m)));
      const resolve = answers.get(id);
      answers.delete(id);
      resolve?.(false);
      (found.props.onOpenChange ?? read(props.defaults)?.onOpenChange)?.(false);
    },
    clear() {
      for (const m of [...now()].reverse()) if (!m.closing) api.hide(m.id);
    },
    update: (id, own) => put(now().map(m => (m.id === id ? changed(m, { props: { ...m.props, ...own } }) : m))),
  };
  /** @param {string} id */
  const remove = id => put(now().filter(m => m.id !== id));
  return (
    <ModalHost value={api}>
      {props.children}
      <For each={list} by={(/** @type {ModalRecord} */ m) => keyOf(m)}>
        {(/** @type {() => ModalRecord} */ entry) => <Entry entry={entry} api={api} host={props} list={list} remove={remove} answer={answer} />}
      </For>
    </ModalHost>
  );
}

/**
 * An ask's answers: stacked, as wide as the modal, the yes first; an xs
 * step apart and an md step under the text (none without text).
 * @param {boolean} bare no text above
 */
const answers = bare => styled({}, theme => ({ direction: 'column', gap: theme.spacing.xs, margin: [bare ? 0 : theme.spacing.md, 0, 0, 0] }));

/**
 * One shown modal as a Modal, its title and content following updates;
 * text content wraps within it.
 * @param {{ entry: () => ModalRecord, api: Modals, host: Record<string, any>, list: any, remove: (id: string) => void, answer: (id: string, yes: boolean) => void }} p
 */
function Entry(p) {
  const R = $active();
  const first = $untrack(R, p.entry);
  const id = first.id;
  const defaults = read(p.host.defaults) ?? {};
  // An own prop given as undefined leaves the default, as prop() and hide read them.
  const {
    title, children, text, id: _, onOpenChange, labels, tone, yesButton, noButton, data, layer, ...rest
  } = { ...defaults, ...Object.fromEntries(Object.entries(first.props).filter(([, v]) => v !== undefined)) };
  // A live prop: the record's own, else (left out or undefined, as showNamed's data) the host's default for it.
  const prop = (/** @type {string} */ name) =>
    $memo(R, () => {
      const own = p.entry().props[name];
      return own === undefined ? defaults[name] : own;
    });
  const content = prop(first.kind === 'ask' ? 'text' : 'children');
  const inner = prop('data');
  const titled = prop('title');
  const named = prop('labels');
  const depth = () => /** @type {ModalRecord[]} */ ($read(p.list)).findIndex(m => m.id === id);
  let body;
  if (first.kind === 'named') {
    const Component = ownValue(read(p.host.named), /** @type {string} */ (first.modal));
    if (Component === undefined) throw new Error(`RUI: no named modal "${first.modal}" in <Modals named>`);
    body = () => <Component id={id} data={$read(inner)} hide={() => p.api.hide(id)} />;
  } else body = () => textOf($read(content), { wrap: true });
  const words = () => ({ yes: 'Yes', no: 'No', ...read(p.host.labels), ...$read(named) });
  const said = first.kind === 'ask' ? text : children;
  return (
    <Modal
      {...rest}
      open={() => !p.entry().closing}
      onOpenChange={(/** @type {boolean} */ open) => void (open || p.api.hide(id))}
      onExited={() => p.remove(id)}
      layer={() => (read(layer) ?? LAYERS.sheet) + Math.max(0, depth())}
      title={title === undefined ? undefined : typeof title === 'string' || typeof title === 'number' ? () => String($read(titled) ?? '') : title}
    >
      {body}
      {first.kind === 'ask' ? (
        <View style={answers(said === undefined)}>
          <Button stretch {...(tone === undefined ? null : { color: tone })} {...(yesButton ?? {})} onPress={() => p.answer(id, true)}>
            {() => words().yes}
          </Button>
          <Button stretch variant="ghost" {...(noButton ?? {})} onPress={() => p.answer(id, false)}>
            {() => words().no}
          </Button>
        </View>
      ) : null}
    </Modal>
  );
}
