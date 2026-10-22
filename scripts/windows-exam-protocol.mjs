const MARKER = 'HadPrevious';
const PREVIOUS_PROTOCOL = 'PreviousProtocol';

export function windowsProtocolCommands({ scriptHost, nodeExecutable, launcherScript, obsoleteScript }) {
  return {
    current: `"${scriptHost}" //B //NoLogo "${launcherScript}" "%1"`,
    obsolete: `"${nodeExecutable}" "${obsoleteScript}" "%1"`,
  };
}

function sameCommand(left, right) {
  return typeof left === 'string' && left.replaceAll('/', '\\').toLowerCase() === right.replaceAll('/', '\\').toLowerCase();
}

function commandParts(command) {
  if (typeof command !== 'string') return null;
  const match = command.match(/^"([^"]+)"\s+"([^"]+)"\s+"%1"$/i);
  return match ? { executable: match[1], script: match[2] } : null;
}

function isNodeCommandForScript(installedCommand, knownCommand) {
  const installed = commandParts(installedCommand);
  const known = commandParts(knownCommand);
  if (!installed || !known) return false;
  const executable = installed.executable.replaceAll('/', '\\').toLowerCase();
  const script = installed.script.replaceAll('/', '\\').toLowerCase();
  return executable === known.executable.replaceAll('/', '\\').toLowerCase() &&
    executable.endsWith('\\node.exe') &&
    script === known.script.replaceAll('/', '\\').toLowerCase();
}

function ensureBackup(registry, protocolKey, backupKey, preserveExisting) {
  if (registry.keyExists(backupKey)) {
    const marker = registry.readValue(backupKey, MARKER);
    if (marker !== '0' && marker !== '1') {
      throw new Error('an incomplete protocol backup exists; leaving the registration unchanged.');
    }
    if (marker === '1' && !registry.keyExists(`${backupKey}\\${PREVIOUS_PROTOCOL}`)) {
      throw new Error('the previous protocol backup is missing; leaving the registration unchanged.');
    }
    return;
  }

  registry.createKey(backupKey);
  if (preserveExisting) {
    try {
      registry.copyKey(protocolKey, `${backupKey}\\${PREVIOUS_PROTOCOL}`);
      registry.writeValue(backupKey, MARKER, '1');
    } catch (error) {
      registry.deleteKey(backupKey);
      throw new Error(`could not back up the existing protocol registration: ${error.message}`);
    }
  } else {
    registry.writeValue(backupKey, MARKER, '0');
  }
}

export function registerWindowsProtocol({
  registry,
  protocolKey,
  commandKey,
  backupKey,
  currentCommand,
  obsoleteCommand,
  remove = false,
  compile = () => {},
}) {
  const installedCommand = registry.readValue(commandKey, '');
  const protocolExists = registry.keyExists(protocolKey);
  const isCurrent =
    sameCommand(installedCommand, currentCommand) || isNodeCommandForScript(installedCommand, currentCommand);
  const isObsolete = isNodeCommandForScript(installedCommand, obsoleteCommand);

  if (remove) {
    if (!isCurrent && !isObsolete) {
      if (installedCommand === null && !protocolExists) return 'absent';
      throw new Error('the secure-exam:// handler is not this project registration; leaving it unchanged.');
    }

    registry.deleteKey(protocolKey);
    const marker = registry.readValue(backupKey, MARKER);
    if (marker === '1') {
      try {
        registry.copyKey(`${backupKey}\\${PREVIOUS_PROTOCOL}`, protocolKey);
      } catch (error) {
        throw new Error(`could not restore the previous protocol registration; backup retained: ${error.message}`);
      }
      registry.deleteKey(backupKey);
    } else if (marker === '0') {
      registry.deleteKey(backupKey);
    }
    return 'removed';
  }

  if (installedCommand !== null && !isCurrent && !isObsolete) {
    throw new Error('secure-exam:// is registered to a different application; leaving it unchanged.');
  }
  if (installedCommand === null && protocolExists) {
    throw new Error('secure-exam:// has an incomplete registration; leaving it unchanged.');
  }

  compile();
  if (!registry.keyExists(backupKey)) {
    ensureBackup(registry, protocolKey, backupKey, !isCurrent && protocolExists);
  }

  try {
    registry.writeValue(protocolKey, '', 'URL:Secure Exam Protocol');
    registry.writeValue(protocolKey, 'URL Protocol', '');
    registry.writeValue(commandKey, '', currentCommand);
  } catch (error) {
    registry.deleteKey(protocolKey);
    const marker = registry.readValue(backupKey, MARKER);
    if (marker === '1') {
      registry.copyKey(`${backupKey}\\${PREVIOUS_PROTOCOL}`, protocolKey);
    }
    throw new Error(`could not install the protocol handler: ${error.message}`);
  }

  return isCurrent ? 'already-registered' : 'registered';
}
