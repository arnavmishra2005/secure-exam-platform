/**
 * Owner: Person C.
 *
 * TypeORM wraps driver errors in `QueryFailedError`; depending on version,
 * the underlying `pg` driver error's fields (`code`, `constraint`) show up
 * either directly on the error instance or nested under `.driverError`.
 * This checks both shapes defensively rather than assuming one.
 *
 * Postgres SQLSTATE '23505' = unique_violation.
 */
export function isUniqueViolation(err: unknown, constraintName?: string): boolean {
  const code = (err as any)?.code ?? (err as any)?.driverError?.code;
  if (code !== '23505') return false;
  if (!constraintName) return true;
  const constraint = (err as any)?.constraint ?? (err as any)?.driverError?.constraint;
  return constraint === constraintName;
}
