#!/bin/sh
# Owner: Person B. Builds every code-runner image (#16, #19). Run from anywhere.
# Pin the result by digest in production (docs/execution-security.md).
set -eu
cd "$(dirname "$0")"
docker build -t secure-exam/runner-python:3.12 -f python/Dockerfile .
docker build -t secure-exam/runner-gcc:1 -f gcc/Dockerfile .
docker build -t secure-exam/runner-java:21 -f java/Dockerfile .
docker images --digests --filter 'reference=secure-exam/runner-*'
