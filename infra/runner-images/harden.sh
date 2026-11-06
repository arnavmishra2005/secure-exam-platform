#!/bin/sh
# Owner: Person B (#19). Shared hardening for every runner image; run as the
# last RUN step of each Dockerfile (build context: infra/runner-images).
set -eux
# No setuid/setgid programs: nothing in the sandbox can gain privileges.
find / -xdev -perm /6000 -type f -exec chmod a-s {} +
# No package managers or pip: the sandbox has no network, and the standard
# libraries are what the grader promises (docs/local-code-runner.md).
python3 -m pip uninstall -y pip setuptools wheel 2>/dev/null || true
rm -rf /usr/local/bin/pip* /usr/bin/apt* /usr/bin/dpkg* /usr/lib/apt /var/lib/apt /var/cache/apt /var/lib/dpkg /usr/share/doc /usr/share/man
# Tools useful for poking around a host, not for a solution.
rm -f /usr/bin/su /usr/bin/mount /usr/bin/umount /usr/bin/chsh /usr/bin/chfn /usr/bin/passwd /usr/bin/newgrp /usr/bin/gpasswd /usr/sbin/unix_chkpwd
# Fail the build if anything setuid survived.
test -z "$(find / -xdev -perm /6000 -type f)"
# The in-container harness is Python.
python3 -I -B -c 'import json, subprocess, sys; print(sys.version)'
rm -f "$0"
