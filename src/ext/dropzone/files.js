// Files for the Dropzone, pure and portable: MIME type lists, an
// `accept` list matched as the browser's accept attribute does, the
// checks by type, size and count with their rejection
// codes, and `pickFiles`, the platform's file dialog where there is one.

/**
 * Media types by a file extension, for the files an app
 * most often takes, in eight kinds (the order here): images, audio,
 * video, documents (text for reading), sheets (tables), slides, archives,
 * and text (plain, markup, data and code); alphabetical within each kind.
 * The values are IANA media types; tar, which has none registered, uses
 * its common `x-` type. A kind's list below is an accept list of its own.
 */
export const mimeTypes = Object.freeze({
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  webm: 'video/webm',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  odt: 'application/vnd.oasis.opendocument.text',
  pdf: 'application/pdf',
  rtf: 'application/rtf',
  csv: 'text/csv',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  tsv: 'text/tab-separated-values',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  zip: 'application/zip',
  css: 'text/css',
  html: 'text/html',
  js: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  xml: 'application/xml',
});

/** @param {(keyof typeof mimeTypes)[]} keys */
const kind = keys => Object.freeze(keys.map(k => mimeTypes[k]));

/** Images: avif, bmp, gif, jpg, png, svg, webp; an accept list. */
export const imageTypes = kind(['avif', 'bmp', 'gif', 'jpg', 'png', 'svg', 'webp']);
/** Audio: flac, mp3, ogg, wav; an accept list. */
export const audioTypes = kind(['flac', 'mp3', 'ogg', 'wav']);
/** Video: mov, mp4, webm; an accept list. */
export const videoTypes = kind(['mov', 'mp4', 'webm']);
/** Documents, text for reading: docx, epub, odt, pdf, rtf; an accept list. */
export const documentTypes = kind(['docx', 'epub', 'odt', 'pdf', 'rtf']);
/** Sheets, tables: csv, ods, tsv, xlsx; an accept list. */
export const sheetTypes = kind(['csv', 'ods', 'tsv', 'xlsx']);
/** Slides: odp, pptx; an accept list. */
export const slideTypes = kind(['odp', 'pptx']);
/** Archives: gz, tar, zip; an accept list. */
export const archiveTypes = kind(['gz', 'tar', 'zip']);
/** Text, plain, markup, data and code: css, html, js, json, md, txt, xml; an accept list. */
export const textTypes = kind(['css', 'html', 'js', 'json', 'md', 'txt', 'xml']);

/**
 * What a Dropzone accepts: one list of MIME types (`'image/*'` for a
 * family) and extensions (`'.pdf'`), mixed freely (`['image/*', '.pdf']`).
 * @typedef {readonly string[]} Accept
 */

/**
 * A file as the platform gives it (a DOM File): a name, a MIME type and a
 * size in bytes.
 * @typedef {{ name?: string, type?: string, size?: number }} FileLike
 */

/**
 * Why a file is turned away: 'wrong-type' (not in the accept list),
 * 'too-large' (over `maxSize`), 'too-small' (under `minSize`) or
 * 'too-many' (more files than `max`, or more than one without
 * `multiple`).
 * @typedef {'wrong-type' | 'too-large' | 'too-small' | 'too-many'} RejectCode
 */

/**
 * A file turned away and every reason why, as codes.
 * @template {FileLike} [F=FileLike]
 * @typedef {{ file: F, reasons: RejectCode[] }} RejectedFile
 */

/**
 * The checks a batch of files goes through (`sortFiles`' options).
 * @typedef {{ accept?: Accept | null, maxSize?: number, minSize?: number, max?: number, multiple?: boolean }} FileChecks
 */

/**
 * The words for each rejection code, keyed by the code: a function of the
 * checks the file failed, for a message to show (`REJECT_LABELS[code](checks)`).
 * Spread it and replace an entry to reword or translate one.
 * @type {Readonly<Record<RejectCode, (checks: FileChecks) => string>>}
 */
export const REJECT_LABELS = Object.freeze({
  'wrong-type': (/** @type {FileChecks} */ o) => `Not an accepted type (accepted: ${acceptList(o.accept).join(', ')})`,
  'too-large': (/** @type {FileChecks} */ o) => `Over the ${o.maxSize}-byte limit`,
  'too-small': (/** @type {FileChecks} */ o) => `Under the ${o.minSize}-byte minimum`,
  'too-many': () => 'More files than this zone takes',
});

/**
 * The accept list as the tokens an input's `accept` attribute takes, each
 * trimmed, blanks dropped: a list as given, a lone string read as the
 * attribute's own comma-separated text (`'image/*, .pdf'`).
 * @param {Accept | string | null | undefined} accept
 * @returns {string[]}
 */
export function acceptList(accept) {
  if (accept == null) return [];
  const entries = typeof accept === 'string' ? [accept] : accept;
  /** @type {string[]} */
  const tokens = [];
  for (const entry of entries) {
    for (const part of String(entry).split(',')) {
      const token = part.trim();
      if (token !== '') tokens.push(token);
    }
  }
  return tokens;
}

/**
 * An accept list read once into what a file is tested against: the
 * extensions (with their dot), the whole MIME types and the families (the
 * part before `/*`), all lower case. `open` is true when the list holds no
 * valid token, and then every file passes.
 * @typedef {{ extensions: Set<string>, types: Set<string>, families: Set<string>, open: boolean }} AcceptMatcher
 */

/** A MIME type without its parameters, lower case (`'Text/Plain; charset=utf-8'` → `'text/plain'`). @param {string} type */
const bareType = type => type.split(';')[0].trim().toLowerCase();

/**
 * Reads an accept list into its matcher. A token starting with a dot is an
 * extension; `family/*` a family; `family/kind` a whole type (its parameters
 * dropped); anything else is not a token and is skipped, as the browser
 * skips it.
 * @param {Accept | string | null | undefined} accept
 * @returns {AcceptMatcher}
 */
function acceptMatcher(accept) {
  /** @type {AcceptMatcher} */
  const m = { extensions: new Set(), types: new Set(), families: new Set(), open: false };
  for (const token of acceptList(accept)) {
    if (token.startsWith('.')) {
      if (token.length > 1) m.extensions.add(token.toLowerCase());
      continue;
    }
    const type = bareType(token);
    const slash = type.indexOf('/');
    if (slash <= 0 || slash === type.length - 1) continue;
    if (type.endsWith('/*')) m.families.add(type.slice(0, slash));
    else m.types.add(type);
  }
  m.open = m.extensions.size + m.types.size + m.families.size === 0;
  return m;
}

/**
 * Whether a file passes a matcher: by its name's end against an extension,
 * or by its MIME type against a whole type or a family. A file with no type
 * passes by its extension only.
 * @param {FileLike} file @param {AcceptMatcher} m
 */
function matches(file, m) {
  if (m.open) return true;
  const name = String(file.name ?? '').toLowerCase();
  for (const ext of m.extensions) if (name.length > ext.length && name.endsWith(ext)) return true;
  const type = bareType(String(file.type ?? ''));
  if (type === '') return false;
  if (m.types.has(type)) return true;
  const slash = type.indexOf('/');
  return slash > 0 && m.families.has(type.slice(0, slash));
}

/**
 * Whether a file matches an accept list as the web's accept attribute reads
 * one. Each token is one of: an extension (`'.pdf'`), which the file's name
 * must end with, after at least one other character (`'.gz'` and
 * `'.tar.gz'` both take `a.tar.gz`; a name that is only `'.pdf'` has no
 * extension); a whole MIME type (`'image/png'`), compared without its
 * parameters; or a family (`'image/*'`), which takes every type whose part
 * before the slash is that family. Case never matters. A file with no type
 * matches by its extension only. An empty or absent list, or one with no
 * valid token, accepts every file.
 * @param {FileLike} file @param {Accept | string | null | undefined} accept
 */
export function accepts(file, accept) {
  return matches(file, acceptMatcher(accept));
}

/**
 * Sorts files into the accepted and the rejected, in their order. Each file
 * is checked by its type (`accept`) and size (`minSize`, `maxSize` in
 * bytes), every failed check a reason. The files that pass are then counted
 * against the zone's room (one with `multiple` false, else `max` when it is
 * above 0, else no limit): the first ones that fit are accepted, and each
 * one past the room is rejected as 'too-many'. A file already rejected for
 * its type or size takes no room. Each rejected file carries its reasons as
 * codes; `REJECT_LABELS` words them.
 * @template {FileLike} F
 * @param {readonly F[]} files
 * @param {FileChecks} [o]
 * @returns {{ accepted: F[], rejected: RejectedFile<F>[] }}
 */
export function sortFiles(files, o = {}) {
  const m = acceptMatcher(o.accept);
  const maxSize = o.maxSize ?? Infinity;
  const minSize = o.minSize ?? 0;
  const max = Number(o.max ?? 0);
  const room = o.multiple === false ? 1 : max >= 1 ? max : Infinity;
  /** @type {F[]} */
  const accepted = [];
  /** @type {RejectedFile<F>[]} */
  const rejected = [];
  for (const file of files) {
    /** @type {RejectCode[]} */
    const reasons = [];
    const size = file.size ?? 0;
    if (!matches(file, m)) reasons.push('wrong-type');
    if (size > maxSize) reasons.push('too-large');
    if (size < minSize) reasons.push('too-small');
    if (reasons.length === 0 && accepted.length >= room) reasons.push('too-many');
    if (reasons.length === 0) accepted.push(file);
    else rejected.push({ file, reasons });
  }
  return { accepted, rejected };
}

/**
 * The platform's file dialog (the browser's `<input type="file">`, shown
 * by the component itself, as ren-core documents): resolves with the files
 * picked, or none when the dialog is canceled. It needs a DOM document on
 * the thread (ren-dom, or ren-skia and ren-three in the page; `document`
 * names it, the page's by default); in a worker or on a server it is inert
 * and resolves with none at once. Call it from a press, which the browser
 * requires for opening the dialog. `capture`: false (or none) sets no
 * capture attribute, true an empty one, a string itself ('user', 'environment').
 * @param {{ accept?: Accept | null, multiple?: boolean, capture?: boolean | string, document?: any }} [o]
 * @returns {Promise<File[]>}
 */
export function pickFiles(o = {}) {
  const doc = o.document ?? /** @type {any} */ (globalThis).document;
  if (doc == null || typeof doc.createElement !== 'function') return Promise.resolve([]);
  return new Promise(resolve => {
    const input = doc.createElement('input');
    input.type = 'file';
    const list = acceptList(o.accept);
    if (list.length > 0) input.accept = list.join(',');
    input.multiple = o.multiple === true;
    // Any capture attribute opens the camera: false sets none, true an empty one.
    if (o.capture != null && o.capture !== false) input.setAttribute('capture', o.capture === true ? '' : String(o.capture));
    input.style.display = 'none';
    let done = false;
    const finish = (/** @type {File[]} */ files) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish([...(input.files ?? [])]));
    input.addEventListener('cancel', () => finish([]));
    // In the document while open: some browsers ignore a detached input's click.
    (doc.body ?? doc.documentElement)?.appendChild(input);
    input.click();
  });
}
