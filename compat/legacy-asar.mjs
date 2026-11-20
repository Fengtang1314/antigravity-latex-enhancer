// Zero-dependency read-only inspector for legacy app.asar Voyager patches.
import { lstat, open, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const LEGACY_MARKER_START = '/* --- VOYAGER-LATEX-START --- */';
export const LEGACY_MARKER_END = '/* --- VOYAGER-LATEX-END --- */';

export async function inspectLegacyAsar(appAsarPath) {
  const result = {
    exists: false,
    asarPath: appAsarPath || null,
    hostVersion: null,
    patched: false,
    hasTruncatedMarker: false,
    hasColdBackup: false,
    hasBackupMeta: false,
    error: null,
  };
  if (!appAsarPath || typeof appAsarPath !== 'string') return result;

  const target = resolve(appAsarPath);
  result.asarPath = target;
  try {
    const linkInfo = await lstat(target);
    if (linkInfo.isSymbolicLink()) {
      result.error = 'app.asar is a symlink';
      return result;
    }
    const fileInfo = await stat(target);
    if (!fileInfo.isFile()) return result;
  } catch {
    return result;
  }

  result.exists = true;
  result.hasColdBackup = existsSync(target + '.before-voyager');
  result.hasBackupMeta = existsSync(join(dirname(target), 'voyager-backup-meta.json'));

  let handle;
  try {
    handle = await open(target, 'r');
    const head = Buffer.alloc(16);
    const { bytesRead: headBytes } = await handle.read(head, 0, 16, 0);
    if (headBytes !== 16) return result;

    const pickleSize = head.readUInt32LE(0);
    const headerSize = head.readUInt32LE(4);
    const jsonSize = head.readUInt32LE(12);
    if (pickleSize !== 4 || jsonSize <= 0 || jsonSize > 16 * 1024 * 1024) return result;

    const rawHeader = Buffer.alloc(jsonSize);
    const { bytesRead: hdrBytes } = await handle.read(rawHeader, 0, jsonSize, 16);
    if (hdrBytes !== jsonSize) return result;

    const header = JSON.parse(rawHeader.toString('utf8'));
    const base = 8 + headerSize;
    const files = header.files || {};

    const readEntry = async (entry, limit) => {
      if (!entry || typeof entry !== 'object' || entry.unpacked) return null;
      const size = entry.size;
      if (!Number.isSafeInteger(size) || size < 0 || size > limit) return null;
      const buf = Buffer.alloc(size);
      const { bytesRead } = await handle.read(buf, 0, size, base + Number(entry.offset));
      return bytesRead === size ? buf : null;
    };

    const pkgBuf = await readEntry(files['package.json'], 65536);
    if (pkgBuf) {
      try {
        const pkg = JSON.parse(pkgBuf.toString('utf8'));
        if (typeof pkg.version === 'string' && pkg.version.trim()) {
          result.hostVersion = pkg.version.trim();
        }
      } catch {}
    }

    const preloadBuf = await readEntry(files.dist?.files?.['preload.js'], 4 * 1024 * 1024);
    if (preloadBuf) {
      const preload = preloadBuf.toString('utf8');
      const hasStart = preload.includes(LEGACY_MARKER_START);
      const hasEnd = preload.includes(LEGACY_MARKER_END);
      result.patched = hasStart;
      result.hasTruncatedMarker = hasStart && !hasEnd;
    }
  } catch (error) {
    result.error = error.message;
  } finally {
    await handle?.close().catch(() => {});
  }

  return result;
}
