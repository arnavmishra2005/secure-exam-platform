// PlatformSecurity interface — linux.ts implements this for Linux.
// macos.ts / windows.ts are stubs; add them without touching this file.

export interface PlatformSecurity {
  /** Returns names of detected forbidden background processes, empty if clean. */
  scanForbiddenProcesses(): Promise<string[]>;
  /** Returns the display/compositor type detected, or null if unknown. */
  detectSessionType(): 'x11' | 'wayland' | 'unknown';
}

