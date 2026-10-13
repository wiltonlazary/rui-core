// rui-core/launcher: the action center on Modal and the combobox's
// keyboard list: a store per root (`$launcher()`: isOpen, open, close,
// toggle, the search, the shortcut's `onKey`), <Launcher>, the match.

export { LauncherContext, launcherStore, $launcher, launcherMatch, firstActions, isGroup } from './store.js';
export { Launcher } from './launcher.jsx';
