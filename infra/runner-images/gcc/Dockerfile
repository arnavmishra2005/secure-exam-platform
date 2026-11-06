# Owner: Person B (#16). C and C++ sandbox: gcc/g++ (C17, C++17) plus python3 for the harness.
# Use: RUNNER_GCC_IMAGE=secure-exam/runner-gcc:1@sha256:<digest of your build>
ARG BASE=python:3.12-slim
FROM ${BASE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc g++ libc6-dev \
 && rm -rf /var/lib/apt/lists/*
COPY harden.sh /tmp/harden.sh
RUN sh /tmp/harden.sh && gcc --version | head -1 && g++ --version | head -1
USER 65534:65534
WORKDIR /tmp
