import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export const PLUGIN_NAME = 'antigravity-latex-enhancer';
export const SETTINGS_DIR_NAME = 'AntigravityLatexEnhancer';

export function platformPaths({ platform = process.platform, home = homedir(), env = process.env } = {}) {
  let config;
  let local;
  if (platform === 'win32') {
    config = env.APPDATA || join(home, 'AppData', 'Roaming');
    local = env.LOCALAPPDATA || join(home, 'AppData', 'Local');
  } else if (platform === 'darwin') {
    config = local = join(home, 'Library', 'Application Support');
  } else if (platform === 'linux') {
    config = env.XDG_CONFIG_HOME || join(home, '.config');
    local = env.XDG_DATA_HOME || join(home, '.local', 'share');
  } else {
    throw new Error('Supported platforms: Windows, Linux, macOS');
  }

  const settings = env.AG_LATEX_SETTINGS || join(local, SETTINGS_DIR_NAME, 'settings.json');
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(settings, 'utf8').replace(/^\uFEFF/, ''));
  } catch {}

  const profile =
    env.AG_LATEX_PROFILE ||
    (typeof saved.profile === 'string' && saved.profile.trim() ? saved.profile.trim() : null) ||
    join(config, 'Antigravity');

  const appAsarCandidates = env.AG_LATEX_APP_ASAR
    ? [env.AG_LATEX_APP_ASAR]
    : platform === 'darwin'
      ? [
          '/Applications/Antigravity.app/Contents/Resources/app.asar',
          join(home, 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'app.asar'),
        ]
      : platform === 'win32'
        ? [join(local, 'Programs', 'antigravity', 'resources', 'app.asar')]
        : [
            '/opt/Antigravity/resources/app.asar',
            '/opt/antigravity/resources/app.asar',
            '/usr/share/antigravity/resources/app.asar',
          ];

  const appAsar = appAsarCandidates.find((p) => existsSync(p)) || appAsarCandidates[0];

  const agentExeCandidates = env.ANTIGRAVITY_AGENTAPI_EXE
    ? [env.ANTIGRAVITY_AGENTAPI_EXE]
    : platform === 'darwin'
      ? [
          '/Applications/Antigravity.app/Contents/Resources/bin/language_server',
          join(home, 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'bin', 'language_server'),
        ]
      : platform === 'win32'
        ? [join(local, 'Programs', 'antigravity', 'resources', 'bin', 'language_server.exe')]
        : [
            '/opt/Antigravity/resources/bin/language_server',
            '/opt/antigravity/resources/bin/language_server',
            '/usr/share/antigravity/resources/bin/language_server',
          ];

  return {
    home,
    config,
    local,
    profile,
    settings,
    appAsar,
    agentExeCandidates,
    pluginConfig: join(home, '.gemini', 'config', 'config.json'),
    pluginDir: join(home, '.gemini', 'config', 'plugins', PLUGIN_NAME),
    data:
      env.ANTIGRAVITY_EXECUTABLE_DATA_DIR ||
      join(home, '.gemini', 'antigravity', 'sidecar_data', PLUGIN_NAME, 'panel', 'data'),
  };
}
