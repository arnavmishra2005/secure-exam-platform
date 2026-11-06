#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir=${1:?Usage: backup.sh /path/on/another/machine}
mkdir -p "$backup_dir"
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
backup_file="$backup_dir/secure-exam-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose --env-file "$script_dir/.env" -f "$script_dir/compose.yml" exec -T postgres pg_dump -U exam_user secure_exam | gzip > "$backup_file"
printf 'Backup written: %s\n' "$backup_file"
