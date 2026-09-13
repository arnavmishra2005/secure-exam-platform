'use client';

import { useCallback, useEffect, useState } from 'react';
import { listAuditEvents, type PaginatedAuditEvents } from '@secure-exam/api-client';

const EVENT_TYPES = [
  'LOGIN',
  'EXAM_STARTED',
  'ANSWER_SAVED',
  'SUBMITTED',
  'AUTO_SUBMITTED',
  'SECURITY_CHECK_FAILED',
];

/**
 * Owner: Person C. Consumes Person A's GET /audit endpoint via
 * packages/api-client/audit.api.ts#listAuditEvents.
 *
 * The exact AuditEvent field names rendered below (createdAt/type/actorId/
 * metadata) are a best-effort guess based on the documented
 * `AuditService.logEvent(type, metadata, actorId)` signature — confirm
 * against A's real audit.types.ts and adjust the field accessors if needed.
 */
export default function AuditPage() {
  const [data, setData] = useState<PaginatedAuditEvents | null>(null);
  const [examId, setExamId] = useState('');
  const [attemptId, setAttemptId] = useState('');
  const [eventType, setEventType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAuditEvents({
        examId: examId || undefined,
        attemptId: attemptId || undefined,
        eventType: (eventType || undefined) as any,
        limit: 50,
      });
      setData(result);
      setError(null);
    } catch {
      setError('Could not load audit events. Confirm the audit endpoint is available.');
    } finally {
      setLoading(false);
    }
  }, [examId, attemptId, eventType]);

  useEffect(() => {
    load();
  }, [load]);

  const events = Array.isArray(data) ? data : (data?.items ?? []);

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Audit Log</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="rounded border px-3 py-1.5 text-sm"
          placeholder="Filter by exam ID"
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
        />
        <input
          className="rounded border px-3 py-1.5 text-sm"
          placeholder="Filter by attempt ID"
          value={attemptId}
          onChange={(e) => setAttemptId(e.target.value)}
        />
        <select
          className="rounded border px-3 py-1.5 text-sm"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        >
          <option value="">All event types</option>
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button className="rounded border px-3 py-1.5 text-sm" onClick={load}>
          Refresh
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={4}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && events.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={4}>
                  No audit events match this filter.
                </td>
              </tr>
            )}
            {events.map((event: any) => (
              <tr key={event.id} className="border-t align-top">
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                  {new Date(event.createdAt ?? event.timestamp).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-medium">{event.type}</td>
                <td className="px-3 py-2 font-mono text-xs">{event.actorId}</td>
                <td className="px-3 py-2">
                  <pre className="max-w-md overflow-x-auto whitespace-pre-wrap text-xs text-gray-600">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        This screen renders whatever Person A&apos;s <code>GET /audit</code> endpoint returns; field names
        above are a best-effort guess and should be checked against A&apos;s actual AuditEvent shape.
      </p>
    </div>
  );
}
