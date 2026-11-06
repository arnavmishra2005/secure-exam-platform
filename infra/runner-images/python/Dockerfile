# Owner: Person B. Hardened image for the Python code-runner sandbox (#19).
# Build all images: npm run runner:images --workspace=apps/api  (or ./build.sh)
# Use:    RUNNER_PYTHON_IMAGE=secure-exam/runner-python:3.12@sha256:<digest of your build>
# See docs/execution-security.md → "Runner images".
#
# Pin the base by digest for reproducible builds, e.g.
#   --build-arg BASE=python:3.12-slim@sha256:<digest>
ARG BASE=python:3.12-slim
FROM ${BASE}
COPY harden.sh /tmp/harden.sh
RUN sh /tmp/harden.sh
# The sandbox runs as uid 65534 anyway (`docker run --user`); this is the default for manual use.
USER 65534:65534
WORKDIR /tmp
