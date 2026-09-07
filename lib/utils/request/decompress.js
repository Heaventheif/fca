import zlib from 'node:zlib';
import { promisify } from 'node:util';

const _brotliDecompress = promisify(zlib.brotliDecompress);
const _gunzip = promisify(zlib.gunzip);
const _inflate = promisify(zlib.inflate);

let _zstdDecompress = null;
if (typeof zlib.zstdDecompress === 'function') {
  _zstdDecompress = promisify(zlib.zstdDecompress);
}

async function decompressOne(buf, enc) {
  switch (enc.toLowerCase().trim()) {
    case 'br':
      return _brotliDecompress(buf);
    case 'gzip':
    case 'x-gzip':
      return _gunzip(buf);
    case 'deflate':
      return _inflate(buf);
    case 'zstd':
      if (_zstdDecompress) return _zstdDecompress(buf);
      return buf; 
    case 'identity':
    case '':
      return buf;
    default:
      return buf;
  }
}

export async function decompressResponse(buffer, encoding) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return buffer;
  if (!encoding || encoding === 'identity') return buffer;

  
  
  const encodings = encoding
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (encodings.length === 1) {
    return decompressOne(buffer, encodings[0]);
  }

  
  let result = buffer;
  for (let i = encodings.length - 1; i >= 0; i--) {
    result = await decompressOne(result, encodings[i]);
  }
  return result;
}

export default { decompressResponse };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-request-decompress',
  meta: { category: 'utils', path: 'lib/utils/request/decompress.js' },
  setup(_ctx) {
    // provides: decompressResponse
  },
};
