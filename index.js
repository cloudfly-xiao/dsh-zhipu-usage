// Root entry shim: some loader paths (hot-mount include trees) resolve the
// plugin entry as <name>/index.js; mirror the real host entry there with
// explicit named re-exports.
export { apply, inject, API_PREFIX } from './lib/index.js'
