// The stacking layers: named steps of 10 above the page (0), so a sheet
// (a Modal) sits under the floating panels it opens (a Select in it
// opens above it), a tooltip above any panel it explains, and toasts and
// the load bar above them all. Components take a `layer` prop: one of
// these numbers, or any other.

/** The named layers. */
export const LAYERS = Object.freeze({
  /** Raised over its own container: Pin, Busy, sticky table heads. */
  raised: 10,
  /** Sheets over the page: Modal, Drawer, Dialog, ActionBar, Window, Floater, Launcher, Backdrop. */
  sheet: 20,
  /** Floating panels: Popover, HoverCard, Menu, combobox panels, pickers, ContextMenu. */
  float: 30,
  /** Tooltips, above any panel they explain. */
  tip: 35,
  /** Notifications. */
  toast: 40,
  /** The load bar. */
  top: 50,
});
