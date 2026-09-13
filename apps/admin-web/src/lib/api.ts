// [SHARED, thin re-export] — screens import from here rather than reaching
// into packages/api-client directly, so the import path stays stable if the
// underlying package ever moves.

export * from '@secure-exam/api-client';
