// Owner: Person A

import { deleteCourse, enrollStudents, getCourse, listCourseStudents, unenrollStudent } from '@secure-exam/api-client';
import { CourseStaffRole, Permission } from '@secure-exam/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime, roleLabel } from '@/lib/format';
import { CourseFormDialog } from './CourseFormDialog';
import { CourseStaffSection } from './CourseStaffSection';
import { StudentPickerDialog } from './StudentPickerDialog';

export default function CourseDetailPage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const course = useQuery({ queryKey: ['courses', courseId], queryFn: () => getCourse(courseId) });
  const students = useQuery({ queryKey: ['courses', courseId, 'students'], queryFn: () => listCourseStudents(courseId) });
  const enrolledIds = useMemo(() => new Set((students.data ?? []).map((e) => e.studentId)), [students.data]);
  const isInstructor = course.data?.myRole === CourseStaffRole.INSTRUCTOR;
  const canManageStudents = !!course.data?.myPermissions.includes(Permission.STUDENTS_MANAGE);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
    void queryClient.invalidateQueries({ queryKey: ['exams'] });
  };

  if (course.error) return <ErrorState message={getErrorMessage(course.error)} onRetry={() => course.refetch()} />;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/instructor/courses" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Courses
          </Link>
        }
        title={
          course.data ? (
            <span className="flex flex-wrap items-center gap-3">
              {course.data.name}
              <Badge variant="outline" className="font-mono">
                {course.data.code}
              </Badge>
              <Badge variant="secondary">You: {roleLabel(course.data.myRole)}</Badge>
            </span>
          ) : (
            <Skeleton className="h-8 w-64" />
          )
        }
        description={course.data?.description ?? undefined}
        actions={
          isInstructor && (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
              <Button variant="outline" onClick={() => setDeleting(true)}>
                <Trash2 /> Delete
              </Button>
            </>
          )
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Enrolled students" value={course.data?.enrolledCount ?? '—'} />
        <StatCard label="Assigned to exams" value={course.data?.examCount ?? '—'} hint="Enrolled students are registered for these exams." />
        <StatCard label="Staff" value={course.data?.staffCount ?? '—'} hint="Instructors and teaching assistants." />
      </div>

      <CourseStaffSection courseId={courseId} canManage={isInstructor} />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold">Students</h2>
        {canManageStudents && (
          <Button onClick={() => setEnrolling(true)}>
            <UserPlus /> Enrol students
          </Button>
        )}
      </div>

      {students.error ? (
        <ErrorState message={getErrorMessage(students.error)} onRetry={() => students.refetch()} />
      ) : students.isPending ? (
        <TableSkeleton columns={4} />
      ) : students.data.length === 0 ? (
        <EmptyState icon={Users} title="No students enrolled" description="Enrol students to register them for this course's exams." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>College ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Enrolled</TableHead>
              {canManageStudents && <TableHead className="w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.data.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs">{e.student.collegeId}</TableCell>
                <TableCell>
                  {e.student.fullName}
                  {!e.student.isActive && (
                    <Badge variant="secondary" className="ml-2">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{e.student.email}</TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(e.enrolledAt)}</TableCell>
                {canManageStudents && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${e.student.fullName}`}
                      onClick={() => setRemoving({ id: e.studentId, name: e.student.fullName })}
                    >
                      <UserMinus />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CourseFormDialog
        open={editing}
        onOpenChange={setEditing}
        course={course.data}
        onSaved={() => {
          toast.success('Course updated');
          refresh();
        }}
      />

      <StudentPickerDialog
        open={enrolling}
        onOpenChange={setEnrolling}
        title="Enrol students"
        description="Enrolled students are also registered for every exam this course is assigned to."
        confirmLabel="Enrol"
        excludeIds={enrolledIds}
        onConfirm={async (ids) => {
          const result = await enrollStudents(courseId, ids);
          toast.success(
            `Enrolled ${result.enrolledCount} student(s)` +
              (result.registrationsCreated ? `, ${result.registrationsCreated} exam registration(s) created` : ''),
          );
          if (result.notFound.length) toast.warning(`Not found: ${result.notFound.join(', ')}`);
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? 'student'}?`}
        description="They will also be unregistered from this course's exams, unless another assigned course or a manual registration covers them. Attempts already made are kept."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          try {
            const result = await unenrollStudent(courseId, removing.id);
            toast.success(`Removed. ${result.registrationsRemoved} exam registration(s) dropped.`);
            refresh();
          } catch (err) {
            toast.error(getErrorMessage(err));
          }
        }}
      />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${course.data?.code ?? 'course'}?`}
        description="Only a course that owns no exams can be deleted. It is unassigned from other exams and its enrolments and staff are removed. Registrations it created are dropped unless another course or a manual registration covers the student."
        confirmLabel="Delete course"
        destructive
        onConfirm={async () => {
          try {
            await deleteCourse(courseId);
            toast.success('Course deleted');
            refresh();
            navigate('/instructor/courses', { replace: true });
          } catch (err) {
            toast.error(getErrorMessage(err));
          }
        }}
      />
    </>
  );
}
