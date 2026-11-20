import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function loadSidecarSdk() {
  try {
    return await import('sidecar_sdk');
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    const file = createRequire(import.meta.url).resolve('sidecar_sdk');
    return import(pathToFileURL(file).href);
  }
}
