// rui-core/more: extra components, on the
// portable primitives, the same on ren-dom, ren-skia and ren-three.

export { encodeQr, reedSolomon, formatBits, versionBits, byteCapacity, alignmentPositions } from './qrcode.js';
export { QrCode } from './qr.jsx';
export { Led, Spinner, Rings } from './drawn.jsx';
export { AnalogClock } from './clock.jsx';
export { ContextMenu } from './context-menu.jsx';
export { DataTable, sortRecords, windowOf, valueAt } from './data-table.jsx';
export { JsonTree } from './json-tree.jsx';
export { Compare } from './compare.jsx';
export { TextAnimate, Flip, segmentsOf } from './motion.jsx';
export { Window } from './window.jsx';
export { Onboarding } from './onboarding.jsx';
export { Parallax } from './parallax.jsx';
export { Gantt, rescheduled } from './gantt.jsx';
export { Book, bookSlots } from './book.jsx';

/** A DataTable field's options, keyed by its row path in `fields`. @typedef {import('./data-table.jsx').DataTableField} DataTableField */
/** A DataTable's order: `{ by, desc }`. @typedef {import('./data-table.jsx').Order} DataTableOrder */
