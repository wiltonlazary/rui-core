// rui-core/editor: a rich text editor: a document of blocks and marks,
// its actions, HTML and JSON in and out, edited through the portable Edit.
// Its parts are reached as Editor.Part (Editor.Toolbar, Editor.Bold, …).

export { Editor, LABELS } from './editor.jsx';
export { $editor, docOf, shortcut } from './state.js';
export {
  MARKS, BLOCKS, ALIGNS, isList, setAlign, indent, outdent, insertBefore, insertRule, depths, createDoc, normalize, hasMark, marksAt, setMark, toggleMark, clearMarks, linkRange, splice, setText, setBlock, split, join,
  insertAfter, runs, toHTML, fromHTML, toJSON, fromJSON, toText,
} from './model.js';
