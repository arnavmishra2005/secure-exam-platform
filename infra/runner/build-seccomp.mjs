#!/usr/bin/env node
/**
 * Owner: Person B. Builds infra/runner/seccomp.json, the system-call filter
 * for the code-runner sandbox (docs/execution-security.md).
 *
 * It starts from Docker's own default profile (an allowlist) and makes it
 * stricter, so it can only ever allow less than Docker's default:
 *  - rules that apply only with a Linux capability are removed (the sandbox
 *    drops every capability, so they never apply anyway);
 *  - the DENIED calls below are taken out of every allow rule and get their
 *    own rule that kills the program (SIGSYS). Nothing a student solution
 *    legitimately needs makes these calls, so the API reports the kill as
 *    "blocked by the sandbox" and flags it on Monitoring;
 *  - socket() is allowed only for AF_UNIX (local pipes some libraries use);
 *    any other family fails with EPERM, like any other blocked call.
 *
 * Usage:
 *   node infra/runner/build-seccomp.mjs                 # fetch Docker's profile at DOCKER_PROFILE_TAG
 *   node infra/runner/build-seccomp.mjs path/to/default.json
 *
 * The lab-PC runner (apps/exam-client/src/main/runner/seccompFilter.ts)
 * uses the same DENIED list.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCKER_PROFILE_TAG = 'v28.0.0';
const SOURCE_URL = `https://raw.githubusercontent.com/moby/moby/${DOCKER_PROFILE_TAG}/profiles/seccomp/default.json`;

/** Kill the program if it makes any of these. Keep in sync with seccompFilter.ts (lab PC). */
export const DENIED = [
  // Debugging / reading other processes' memory
  'ptrace', 'process_vm_readv', 'process_vm_writev', 'kcmp', 'pidfd_getfd',
  // Namespaces and mounts (container escape building blocks)
  'unshare', 'setns', 'mount', 'umount2', 'pivot_root', 'chroot',
  'open_tree', 'move_mount', 'fsopen', 'fsconfig', 'fsmount', 'fspick', 'mount_setattr',
  'open_by_handle_at',
  // Kernel attack surface with a long CVE history
  'bpf', 'perf_event_open', 'userfaultfd', 'io_uring_setup', 'io_uring_enter', 'io_uring_register',
  'keyctl', 'add_key', 'request_key',
  // Changing the execution domain (used to weaken ASLR)
  'personality',
  // Kernel modules, kexec, machine state
  'init_module', 'finit_module', 'delete_module', 'kexec_load', 'kexec_file_load',
  'reboot', 'swapon', 'swapoff', 'acct',
];

const AF_UNIX = 1;

export function harden(profile) {
  const denied = new Set(DENIED);
  const syscalls = [];
  for (const rule of profile.syscalls) {
    if (rule.includes?.caps?.length) continue; // needs a capability the sandbox never has
    if (rule.names.length === 1 && rule.names[0] === 'socket') continue; // replaced below
    const names = rule.names.filter((n) => !denied.has(n));
    if (names.length === 0) continue;
    syscalls.push({ ...rule, names });
  }
  syscalls.push({
    names: ['socket'],
    action: 'SCMP_ACT_ALLOW',
    args: [{ index: 0, value: AF_UNIX, op: 'SCMP_CMP_EQ' }],
    comment: 'secure-exam: only local (AF_UNIX) sockets',
  });
  syscalls.push({
    names: [...DENIED],
    action: 'SCMP_ACT_KILL_PROCESS',
    comment: 'secure-exam: never needed by a solution; killed with SIGSYS and flagged',
  });
  return { ...profile, syscalls };
}

async function main() {
  const source = process.argv[2];
  const profile = source ? JSON.parse(readFileSync(source, 'utf8')) : await (await fetch(SOURCE_URL)).json();
  const out = join(dirname(fileURLToPath(import.meta.url)), 'seccomp.json');
  writeFileSync(out, JSON.stringify(harden(profile), null, 2) + '\n');
  console.log(`Wrote ${out} (from ${source ?? SOURCE_URL})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
