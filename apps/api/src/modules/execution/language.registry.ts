/**
 * Owner: Person B.
 *
 * Everything language-specific lives here. Adding a language = one entry
 * here + an image that contains python3 (the in-container harness is Python)
 * + its display data in @secure-exam/types (code-languages.ts).
 *
 * Images: infra/runner-images (build with `npm run runner:images --workspace=apps/api`).
 * C, C++ and Java need a second kernel boundary (gVisor) in production,
 * because compiled code makes raw system calls (phase5 plan #16/#19).
 */

import { CODE_LANGUAGES, CodeLanguage } from '@secure-exam/types';

/** What a command may depend on. */
export interface CommandContext {
  memoryLimitMb: number;
}

export type CommandSpec = string[] | ((ctx: CommandContext) => string[]);

export interface LanguageSpec {
  language: CodeLanguage;
  displayName: string;
  /** Monaco editor language id. */
  monacoId: string;
  /** Env var that overrides the Docker image (pin by digest in production). */
  imageEnvKey: string;
  defaultImage: string;
  /** File the student's code is written to inside the sandbox. */
  sourcePath: string;
  /**
   * Optional step the harness runs once before any test. If it fails, every
   * test is a COMPILATION_ERROR with its output, and the program never runs.
   */
  compileCommand?: CommandSpec;
  /** Time limit for `compileCommand`. */
  compileTimeLimitMs?: number;
  /** Command the harness runs once per test input. */
  runCommand: CommandSpec;
  defaultStarterCode: string;
  /** Per-language sandbox overrides; the defaults suit Python. */
  sandbox?: SandboxOverrides;
}

export function resolveCommand(command: CommandSpec, ctx: CommandContext): string[] {
  return typeof command === 'function' ? command(ctx) : command;
}

/**
 * Sandbox settings a language may need to change (#16: compiled languages).
 * Everything not set uses the defaults in docker-runner.provider.ts.
 */
export interface SandboxOverrides {
  /** --pids-limit (default 64). The JVM needs more threads, e.g. 128. */
  pidsLimit?: number;
  /** Size of the private /tmp (default 16 MB). A compiled binary must fit. */
  tmpfsMb?: number;
  /** Allow executing files from /tmp (a compiled binary). Default: noexec. */
  tmpfsExec?: boolean;
  /** Memory for the harness, compiler and /tmp on top of the program's limit (default 64 MB). */
  memoryOverheadMb?: number;
  /** Multiplier on the question's time limit (e.g. 2 for Java's start-up). Default 1. */
  timeFactor?: number;
  /** Stack size limit (`--ulimit stack`), for deep recursion in C/C++. Default: the image's (8 MB). */
  stackMb?: number;
  /**
   * Refuse to run unless a second kernel boundary is configured
   * (RUNNER_DOCKER_RUNTIME, e.g. gVisor's runsc). Compiled code makes raw
   * system calls, so C/C++/Java set this (phase5 plan #16/#19).
   */
  requiresIsolatedRuntime?: boolean;
}

const PYTHON_COMPILE_CHECK = [
  'import sys, traceback',
  'try:',
  '    compile(open(sys.argv[1], "rb").read(), sys.argv[1], "exec")',
  'except (SyntaxError, ValueError) as e:',
  '    sys.stderr.write("".join(traceback.format_exception_only(e)))',
  '    sys.exit(1)',
].join('\n');

/** Compiled languages: an exec-capable /tmp for the binary, room for the compiler, gVisor in production. */
const COMPILED: SandboxOverrides = {
  tmpfsExec: true,
  tmpfsMb: 64,
  memoryOverheadMb: 192,
  requiresIsolatedRuntime: true,
};

const GCC_FLAGS = ['-O2', '-pipe', '-fmax-errors=5', '-o', '/tmp/main'];

/** JVM settings for a one-CPU sandbox: small, single-threaded GC, no perf files in /tmp. */
const JVM_FLAGS = ['-XX:+UseSerialGC', '-XX:ActiveProcessorCount=1', '-XX:-UsePerfData', '-Xshare:auto'];
const JAVA_HOME = '/opt/java/openjdk';

export const LANGUAGE_REGISTRY: Record<CodeLanguage, LanguageSpec> = {
  [CodeLanguage.PYTHON]: {
    language: CodeLanguage.PYTHON,
    displayName: CODE_LANGUAGES[CodeLanguage.PYTHON].label,
    monacoId: 'python',
    imageEnvKey: 'RUNNER_PYTHON_IMAGE',
    defaultImage: 'python:3.12-slim',
    sourcePath: '/tmp/main.py',
    // Reports syntax and indentation errors before any test runs, without executing the code.
    // Not `-m py_compile`: it prints indentation errors as a one-line "Sorry: …"; this prints
    // them exactly as running the file would.
    compileCommand: ['python3', '-I', '-B', '-c', PYTHON_COMPILE_CHECK, '/tmp/main.py'],
    compileTimeLimitMs: 5000,
    // -I: isolated mode (ignores PYTHON* env vars and user site-packages); -B: no .pyc files.
    runCommand: ['python3', '-I', '-B', '/tmp/main.py'],
    defaultStarterCode: CODE_LANGUAGES[CodeLanguage.PYTHON].defaultStarter,
  },
  [CodeLanguage.C]: {
    language: CodeLanguage.C,
    displayName: CODE_LANGUAGES[CodeLanguage.C].label,
    monacoId: 'c',
    imageEnvKey: 'RUNNER_GCC_IMAGE',
    defaultImage: 'secure-exam/runner-gcc:1',
    sourcePath: '/tmp/main.c',
    // GNU dialects (like Codeforces' and HackerRank's gcc): POSIX functions such as getline() stay available.
    compileCommand: ['gcc', '-std=gnu17', ...GCC_FLAGS, '/tmp/main.c', '-lm'],
    compileTimeLimitMs: 10_000,
    runCommand: ['/tmp/main'],
    defaultStarterCode: CODE_LANGUAGES[CodeLanguage.C].defaultStarter,
    sandbox: { ...COMPILED, stackMb: 64 },
  },
  [CodeLanguage.CPP]: {
    language: CodeLanguage.CPP,
    displayName: CODE_LANGUAGES[CodeLanguage.CPP].label,
    monacoId: 'cpp',
    imageEnvKey: 'RUNNER_GCC_IMAGE',
    defaultImage: 'secure-exam/runner-gcc:1',
    sourcePath: '/tmp/main.cpp',
    compileCommand: ['g++', '-std=gnu++17', ...GCC_FLAGS, '/tmp/main.cpp', '-lm'],
    compileTimeLimitMs: 10_000,
    runCommand: ['/tmp/main'],
    defaultStarterCode: CODE_LANGUAGES[CodeLanguage.CPP].defaultStarter,
    sandbox: { ...COMPILED, stackMb: 64 },
  },
  [CodeLanguage.JAVA]: {
    language: CodeLanguage.JAVA,
    displayName: CODE_LANGUAGES[CodeLanguage.JAVA].label,
    monacoId: 'java',
    imageEnvKey: 'RUNNER_JAVA_IMAGE',
    defaultImage: 'secure-exam/runner-java:21',
    // The file name must match `public class Main`.
    sourcePath: '/tmp/Main.java',
    compileCommand: [
      `${JAVA_HOME}/bin/javac`,
      '-J-Xmx256m', ...JVM_FLAGS.map((f) => `-J${f}`), '-J-XX:TieredStopAtLevel=1',
      '-encoding', 'UTF-8', '-Xmaxerrs', '5', '-d', '/tmp', '/tmp/Main.java',
    ],
    compileTimeLimitMs: 15_000,
    // -Xmx is the question's memory limit; the JVM's own memory comes from memoryOverheadMb.
    runCommand: ({ memoryLimitMb }) => [`${JAVA_HOME}/bin/java`, `-Xmx${memoryLimitMb}m`, '-Xss64m', ...JVM_FLAGS, '-cp', '/tmp', 'Main'],
    defaultStarterCode: CODE_LANGUAGES[CodeLanguage.JAVA].defaultStarter,
    // JVM start-up (~0.3–0.5 s per test) is why judges like HackerRank give Java more time.
    sandbox: { ...COMPILED, memoryOverheadMb: 320, pidsLimit: 128, timeFactor: 2 },
  },
};

export function getLanguageSpec(language: CodeLanguage): LanguageSpec {
  const spec = LANGUAGE_REGISTRY[language];
  if (!spec) throw new Error(`Unsupported language: ${language}`);
  return spec;
}
