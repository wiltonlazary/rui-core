// What FileInput shows for the files it holds, and what a clear leaves.

/** The default count text for several files. @param {number} n */
export const countFiles = n => `${n} files`;

/**
 * The field's text for a non-empty list: one file's name (`unnamed` when it
 * has none), or the count through `countText` for two or more.
 * @param {ReadonlyArray<{ name?: string } | null | undefined>} files
 * @param {(n: number) => string} [countText]
 * @param {string} [unnamed]
 * @returns {string}
 */
export function fileText(files, countText = countFiles, unnamed = 'file') {
  if (files.length === 0) return '';
  if (files.length > 1) return String(countText(files.length));
  const name = files[0]?.name;
  return typeof name === 'string' && name !== '' ? name : unnamed;
}

/**
 * The value a clear leaves: null in every mode (an empty FileInput holds
 * null, never an empty list).
 * @param {boolean} [multiple]
 * @returns {null}
 */
export function clearedFiles(multiple) {
  void multiple;
  return null;
}
