// Owner: Person B (#19), in Person C's runner folder; merge with C.
//
// The system-call filter for the lab-PC sandbox, as a raw seccomp BPF
// program that bubblewrap installs just before it starts the student's
// program (`bwrap --seccomp <fd>`). Generated here so no native library
// (libseccomp) has to ship with the app.
//
// Same policy as the server's infra/runner/seccomp.json (built by
// infra/runner/build-seccomp.mjs); keep the DENIED lists in sync:
//  - DENIED calls kill the program (SIGSYS; the exam view shows "Blocked by
//    the sandbox"): nothing a solution needs makes them.
//  - socket() only for AF_UNIX; other families fail with EPERM.
//  - clone() with namespace flags fails with EPERM; clone3() with ENOSYS, so
//    the C library falls back to clone(), where the flags can be checked.
//  - Any other CPU architecture or ABI (32-bit, x32) is killed.

export type SeccompArch = 'x64' | 'arm64';

/** Kill the program if it makes any of these. Keep in sync with infra/runner/build-seccomp.mjs. */
export const DENIED = [
  'ptrace', 'process_vm_readv', 'process_vm_writev', 'kcmp', 'pidfd_getfd',
  'unshare', 'setns', 'mount', 'umount2', 'pivot_root', 'chroot',
  'open_tree', 'move_mount', 'fsopen', 'fsconfig', 'fsmount', 'fspick', 'mount_setattr',
  'open_by_handle_at',
  'bpf', 'perf_event_open', 'userfaultfd', 'io_uring_setup', 'io_uring_enter', 'io_uring_register',
  'keyctl', 'add_key', 'request_key',
  'personality',
  'init_module', 'finit_module', 'delete_module', 'kexec_load', 'kexec_file_load',
  'reboot', 'swapon', 'swapoff', 'acct',
] as const;

type Syscall = (typeof DENIED)[number] | 'socket' | 'clone' | 'clone3';

/** System-call numbers (arch/x86/entry/syscalls/syscall_64.tbl; include/uapi/asm-generic/unistd.h for arm64). */
const NR: Record<SeccompArch, Record<Syscall, number>> = {
  x64: {
    ptrace: 101, process_vm_readv: 310, process_vm_writev: 311, kcmp: 312, pidfd_getfd: 438,
    unshare: 272, setns: 308, mount: 165, umount2: 166, pivot_root: 155, chroot: 161,
    open_tree: 428, move_mount: 429, fsopen: 430, fsconfig: 431, fsmount: 432, fspick: 433, mount_setattr: 442,
    open_by_handle_at: 304,
    bpf: 321, perf_event_open: 298, userfaultfd: 323, io_uring_setup: 425, io_uring_enter: 426, io_uring_register: 427,
    keyctl: 250, add_key: 248, request_key: 249,
    personality: 135,
    init_module: 175, finit_module: 313, delete_module: 176, kexec_load: 246, kexec_file_load: 320,
    reboot: 169, swapon: 167, swapoff: 168, acct: 163,
    socket: 41, clone: 56, clone3: 435,
  },
  arm64: {
    ptrace: 117, process_vm_readv: 270, process_vm_writev: 271, kcmp: 272, pidfd_getfd: 438,
    unshare: 97, setns: 268, mount: 40, umount2: 39, pivot_root: 41, chroot: 51,
    open_tree: 428, move_mount: 429, fsopen: 430, fsconfig: 431, fsmount: 432, fspick: 433, mount_setattr: 442,
    open_by_handle_at: 265,
    bpf: 280, perf_event_open: 241, userfaultfd: 282, io_uring_setup: 425, io_uring_enter: 426, io_uring_register: 427,
    keyctl: 219, add_key: 217, request_key: 218,
    personality: 92,
    init_module: 105, finit_module: 273, delete_module: 106, kexec_load: 104, kexec_file_load: 294,
    reboot: 142, swapon: 224, swapoff: 225, acct: 89,
    socket: 198, clone: 220, clone3: 435,
  },
};

const AUDIT_ARCH: Record<SeccompArch, number> = { x64: 0xc000003e, arm64: 0xc00000b7 };

// BPF opcodes and seccomp return values (linux/filter.h, linux/seccomp.h).
const LD_W_ABS = 0x20;
const JEQ_K = 0x15;
const JGE_K = 0x35;
const JSET_K = 0x45;
const RET_K = 0x06;
const RET_KILL_PROCESS = 0x80000000;
const RET_ALLOW = 0x7fff0000;
const retErrno = (errno: number) => 0x00050000 | errno;
const EPERM = 1;
const ENOSYS = 38;

// struct seccomp_data offsets.
const OFF_NR = 0;
const OFF_ARCH = 4;
const OFF_ARG0_LOW = 16; // little-endian: the low 32 bits of args[0]

const X32_SYSCALL_BIT = 0x40000000;
const AF_UNIX = 1;
/** CLONE_NEWNS | NEWCGROUP | NEWUTS | NEWIPC | NEWUSER | NEWPID | NEWNET (same mask as Docker's profile). */
const CLONE_NAMESPACE_FLAGS = 0x7e020000;

interface Insn {
  code: number;
  /** Jump targets: a label name, or 0 for "next instruction". */
  jt?: string;
  jf?: string;
  k: number;
  label?: string;
}

/** The filter as a BPF program (struct sock_filter[], 8 bytes each), ready for `bwrap --seccomp`. */
export function buildSeccompFilter(arch: SeccompArch): Buffer {
  const nr = NR[arch];
  const p: Insn[] = [
    { code: LD_W_ABS, k: OFF_ARCH },
    { code: JEQ_K, k: AUDIT_ARCH[arch], jf: 'kill' },
    { code: LD_W_ABS, k: OFF_NR },
  ];
  if (arch === 'x64') p.push({ code: JGE_K, k: X32_SYSCALL_BIT, jt: 'kill' });
  for (const name of DENIED) p.push({ code: JEQ_K, k: nr[name], jt: 'kill' });
  p.push(
    { code: JEQ_K, k: nr.clone3, jt: 'enosys' },
    { code: JEQ_K, k: nr.socket, jf: 'not_socket' },
    { code: LD_W_ABS, k: OFF_ARG0_LOW },
    { code: JEQ_K, k: AF_UNIX, jt: 'allow', jf: 'eperm' },
    { label: 'not_socket', code: JEQ_K, k: nr.clone, jf: 'allow' },
    { code: LD_W_ABS, k: OFF_ARG0_LOW },
    { code: JSET_K, k: CLONE_NAMESPACE_FLAGS, jt: 'eperm', jf: 'allow' },
    { label: 'allow', code: RET_K, k: RET_ALLOW },
    { label: 'kill', code: RET_K, k: RET_KILL_PROCESS },
    { label: 'eperm', code: RET_K, k: retErrno(EPERM) },
    { label: 'enosys', code: RET_K, k: retErrno(ENOSYS) },
  );

  const at = new Map(p.flatMap((insn, i) => (insn.label ? [[insn.label, i] as const] : [])));
  const offset = (from: number, label: string | undefined) => {
    if (!label) return 0;
    const to = at.get(label);
    const jump = to! - from - 1;
    if (to === undefined || jump < 0 || jump > 255) throw new Error(`bad jump to ${label}`);
    return jump;
  };
  const out = Buffer.alloc(p.length * 8);
  p.forEach((insn, i) => {
    out.writeUInt16LE(insn.code, i * 8);
    out.writeUInt8(offset(i, insn.jt), i * 8 + 2);
    out.writeUInt8(offset(i, insn.jf), i * 8 + 3);
    out.writeUInt32LE(insn.k >>> 0, i * 8 + 4);
  });
  return out;
}

/** The filter's architecture for this machine, or null where no filter exists (then the runner refuses). */
export function seccompArch(processArch: string = process.arch): SeccompArch | null {
  return processArch === 'x64' || processArch === 'arm64' ? processArch : null;
}
