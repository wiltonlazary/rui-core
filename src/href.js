// Whether an address is safe to follow or show as a link. Internal, not an
// entry: the editor keeps only safe links; Link follows and shows only safe
// addresses; NavItem only shows them.

/**
 * Whether a link's address is safe: relative, `#…`, `http:`, `https:`,
 * `mailto:` or `tel:`. The scheme is read as a browser reads it, without
 * case and ignoring control characters and whitespace, so ` JaVa\tScRiPt:`
 * is `javascript:` and is not safe.
 * @param {unknown} href
 */
export const safeHref = href => {
  const bare = String(href ?? '').replace(/[\s\u0000-\u001f\u007f-\u009f]/g, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(bare);
  return scheme === null || ['http', 'https', 'mailto', 'tel'].includes(scheme[1]);
};

/** `href` when it is safe (and given), else undefined. @param {unknown} href @returns {string | undefined} */
export const safeOrNone = href => (href == null || href === '' || !safeHref(href) ? undefined : String(href));
