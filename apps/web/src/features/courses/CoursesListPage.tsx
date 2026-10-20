// Owner: Person A

import { listCourses } from '@secure-exam/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/errors';
import { CourseFormDialog } from './CourseFormDialog';

export default function CoursesListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['courses'], queryFn: listCourses });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <>
      <PageHeader
        title="Courses"
        description="Enrol students in a course, then assign the course to an exam to register them all at once."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New course
          </Button>
        }
      />

      {error ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={4} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="Create a course to group students for exam registration."
          action={<Button onClick={() => setCreating(true)}>Create the first course</Button>}
        />
      ) : (
        <div className="space-y-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input className="pl-8" placeholder="Search code or name" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search courses" />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Exams</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((course) => (
                <TableRow key={course.id} className="cursor-pointer" onClick={() => navigate(`/admin/courses/${course.id}`)}>
                  <TableCell className="font-mono text-xs font-semibold">{course.code}</TableCell>
                  <TableCell>
                    <Link to={`/admin/courses/${course.id}`} className="font-medium hover:underline">
                      {course.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{course.enrolledCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{course.examCount}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    No course matches "{search}".
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <CourseFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(course) => {
          toast.success(`Course ${course.code} created`);
          void queryClient.invalidateQueries({ queryKey: ['courses'] });
          navigate(`/admin/courses/${course.id}`);
        }}
      />
    </>
  );
}
