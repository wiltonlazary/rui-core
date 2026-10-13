// rui-core/dropzone: a zone that takes files:
// files dropped (the primitives' onDrop) or picked (the platform's file
// dialog, `pickFiles`, which FileButton and FileInput can use too),
// checked by type, size and count.

export { Dropzone } from './dropzone.jsx';
export {
  mimeTypes, imageTypes, audioTypes, videoTypes, documentTypes, sheetTypes, slideTypes, archiveTypes, textTypes,
  acceptList, accepts, sortFiles, pickFiles, REJECT_LABELS,
} from './files.js';
