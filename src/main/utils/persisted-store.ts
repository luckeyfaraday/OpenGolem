import { app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const LEGACY_STORE_DIR = 'open-cowork';

let cachedMachineIdentity: string | undefined;

function tryReadTextFile(filePath: string): string | null {
  try {
    const value = fs.readFileSync(filePath, 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

function getWindowsMachineIdentity(): string | null {
  try {
    const output = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const match = output.match(/MachineGuid\s+REG_\w+\s+([^\r\n]+)/i);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function getMacMachineIdentity(): string | null {
  try {
    const output = execFileSync(
      'ioreg',
      ['-rd1', '-c', 'IOPlatformExpertDevice'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function getLinuxMachineIdentity(): string | null {
  return (
    tryReadTextFile('/etc/machine-id')
    || tryReadTextFile('/var/lib/dbus/machine-id')
  );
}

function getMachineIdentity(): string {
  if (cachedMachineIdentity !== undefined) {
    return cachedMachineIdentity;
  }

  const machineSpecificId = process.platform === 'win32'
    ? getWindowsMachineIdentity()
    : process.platform === 'darwin'
      ? getMacMachineIdentity()
      : getLinuxMachineIdentity();

  if (machineSpecificId) {
    cachedMachineIdentity = `${process.platform}:${machineSpecificId}`;
    return cachedMachineIdentity;
  }

  let username = '';
  try {
    username = os.userInfo().username;
  } catch {
    username = process.env.USER || process.env.USERNAME || '';
  }

  cachedMachineIdentity = [
    process.platform,
    os.hostname(),
    os.homedir(),
    username,
  ].join(':');
  return cachedMachineIdentity;
}

export function deriveStableStoreKey(namespace: string, salt: string): Buffer {
  const seed = `${LEGACY_STORE_DIR}:${namespace}:${getMachineIdentity()}`;
  return crypto.scryptSync(seed, salt, 32);
}

export function getStableStoreCwd(): string {
  if (typeof process !== 'undefined' && !process.versions.electron) {
    return path.join(process.cwd(), '.cowork-user-data');
  }

  try {
    if (typeof app?.getPath === 'function') {
      return path.join(app.getPath('appData'), LEGACY_STORE_DIR);
    }
  } catch {
    // Fall through to OS-specific defaults.
  }

  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      LEGACY_STORE_DIR,
    );
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', LEGACY_STORE_DIR);
  }
  return path.join(os.homedir(), '.config', LEGACY_STORE_DIR);
}
