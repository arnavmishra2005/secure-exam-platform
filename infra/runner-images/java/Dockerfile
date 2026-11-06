# Owner: Person B (#16). Java sandbox: Temurin JDK 21 plus python3 for the harness.
# Use: RUNNER_JAVA_IMAGE=secure-exam/runner-java:21@sha256:<digest of your build>
ARG JDK=eclipse-temurin:21-jdk
ARG BASE=python:3.12-slim
FROM ${JDK} AS jdk
FROM ${BASE}
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
COPY harden.sh /tmp/harden.sh
RUN sh /tmp/harden.sh && /opt/java/openjdk/bin/java -version
USER 65534:65534
WORKDIR /tmp
