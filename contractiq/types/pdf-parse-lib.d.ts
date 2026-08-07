/**
 * pdf-parse's package entry (index.js) runs a debug block at import time guarded by
 * `!module.parent`, which is always true once webpack bundles it — that block synchronously
 * reads a test fixture that doesn't exist in this repo and crashes `next build`. Importing the
 * inner implementation directly skips that wrapper entirely.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdfParse from 'pdf-parse'
  export default pdfParse
}
