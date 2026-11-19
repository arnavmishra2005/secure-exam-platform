// Owner: Person A — student register (restyled port of the Phase 1 screen).
// Lists the students enrolled in courses where you may manage students.
// Student accounts come from the college's student list: staff can't create
// them, they enrol them from a course page.

import { listStudents, updateStudent } from '@secure-exam/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/errors';

type StatusFilter = 'all' | 'active' | 'inactive';

export default function StudentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['students'], queryFn: listStudents });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['students'] });
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((s) => status === 'all' || (status === 'active') === s.user.isActive)
      .filter(
        (s) =>
          !q ||
          s.collegeId.toLowerCase().includes(q) ||
          s.user.fullName.toLowerCase().includes(q) ||
          s.user.email.toLowerCase().includes(q),
      )
      .sort((a, b) => a.collegeId.localeCompare(b.collegeId));
  }, [data, search, status]);

  async function toggleActive(id: string, isActive: boolean) {
    setTogglingId(id);
    try {
      await updateStudent(id, { isActive: !isActive });
      toast.success(isActive ? 'Student deactivated' : 'Student reactivated');
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Students"
        description="Students enrolled in your courses. Student accounts come from the college's student list: to add a student to a course, open the course and use Enrol students. Deactivated students can't sign in."
        actions={
          <Button variant="outline" asChild>
            <Link to="/instructor/courses">Go to courses</Link>
          </Button>
        }
      />

      {error ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={4} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students enrolled yet"
          description="Open one of your courses and use Enrol students to pick students from the college's student list (search by email or college ID)."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-8" placeholder="Search name, email or college ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="w-40" aria-label="Filter by status">
              <option value="all">All ({data.length})</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>College ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.collegeId}</TableCell>
                  <TableCell>{s.user.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{s.user.email}</TableCell>
                  <TableCell>
                    {s.user.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" loading={togglingId === s.id} onClick={() => toggleActive(s.id, s.user.isActive)}>
                      {s.user.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No students match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
