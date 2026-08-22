/**
 * @fileoverview Module-level exports and factory type definitions.
 */

/**
 * @typedef {object} FcaRequestCore
 * Returned by `createRequestCore()` — an isolated HTTP client.
 *
 * @property {import('tough-cookie').CookieJar} jar  - The bound cookie jar
 * @property {function(string, object=): Promise}     get
 * @property {function(string, *, object=): Promise}  post
 * @property {function(string, *, object=): Promise}  put
 * @property {function(string, *, object=): Promise}  patch
 * @property {function(string, string, *, object=): Promise} doRequest
 */

/**
 * @typedef {object} FcaJsonCollectionRow
 * A row returned from JsonCollection CRUD methods.
 * @property {function(): object}               get      - Get a plain copy of the row
 * @property {function(object): Promise<this>}  update   - Merge updates and save
 * @property {function(): Promise<void>}        destroy  - Remove from collection
 */

export const FCA_VERSION = '5.1.0-esm+fixed+patched';
