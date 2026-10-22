import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const electron = createRequire(join(appDir, 'package.json'))('electron');

export function electronArguments(protocolArguments) {
  return ['.', ...protocolArguments];
}

export function electronEnvironment(environment) {
  const { ELECTRON_RUN_AS_NODE, ...env } = environment;
  return env;
}

export function electronSpawnOptions(platform, environment, cwd = appDir) {
  const isWindows = platform === 'win32';
  return {
    cwd,
    env: electronEnvironment(environment),
    detached: isWindows,
    stdio: isWindows ? 'ignore' : 'inherit',
    windowsHide: isWindows,
  };
}

if (process.argv[1] && pathToFileURL(fileURLToPath(import.meta.url)).href === pathToFileURL(process.argv[1]).href) {
  const child = spawn(electron, electronArguments(process.argv.slice(2)), electronSpawnOptions(process.platform, process.env));

  child.on('error', (error) => {
    console.error('Could not start the Electron exam app:', error);
    process.exitCode = 1;
  });

  if (process.platform === 'win32') {
    child.unref();
  } else {
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
    });
  }
}
