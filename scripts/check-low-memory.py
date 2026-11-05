#!/usr/bin/env python3
"""Run one verification command with conservative Linux resource limits.
Usage: python3 scripts/check-low-memory.py npm run web:typecheck
Stops its own process group if available RAM falls below 1.5 GiB or group RSS
exceeds 1.2 GiB. This is a guardrail, not a guarantee against host-wide pressure.
"""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def available_kb():
    for line in Path('/proc/meminfo').read_text().splitlines():
        if line.startswith('MemAvailable:'):
            return int(line.split()[1])
    return 0


def group_rss_kb(group):
    rss = 0
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            if os.getpgid(int(entry.name)) == group:
                for line in (entry / 'status').read_text().splitlines():
                    if line.startswith('VmRSS:'):
                        rss += int(line.split()[1])
        except (ProcessLookupError, PermissionError, FileNotFoundError):
            pass
    return rss


def prepare():
    os.nice(15)
    if hasattr(os, 'sched_getaffinity'):
        os.sched_setaffinity(0, {min(os.sched_getaffinity(0))})


if len(sys.argv) < 2:
    sys.exit('Supply one command to run.')
if available_kb() < 2 * 1024 * 1024:
    sys.exit('Check skipped: less than 2 GiB available RAM.')
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=768',
           UV_THREADPOOL_SIZE='1', RAYON_NUM_THREADS='1', GOMAXPROCS='1')
child = subprocess.Popen(sys.argv[1:], env=env, start_new_session=True, preexec_fn=prepare)
started = time.monotonic()
try:
    while child.poll() is None:
        if available_kb() < 1536 * 1024 or group_rss_kb(child.pid) > 1200 * 1024 or time.monotonic() - started > 600:
            print('Stopping check: memory guard or ten-minute time limit reached.', file=sys.stderr, flush=True)
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
            sys.exit(75)
        time.sleep(0.5)
    sys.exit(child.returncode)
except KeyboardInterrupt:
    os.killpg(child.pid, signal.SIGTERM)
    sys.exit(130)
