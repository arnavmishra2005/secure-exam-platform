// Owner: Person A
// Who may sit this exam: assigned courses (every enrolled student) plus
// individually added students.

import {
  assignCourseToExam,
  listCourses,
  listExamCourses,
  listExamRegistrations,
  registerStudentsForExam,
  unassignCourseFromExam,
  unregisterStudentFromExam,
} from '@secure-exam/api-client';
import { RegistrationSource } from '@secure-exam/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Search, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { StudentPickerDialog } from '@/features/courses/StudentPickerDialog';
import { getErrorMessage } from '@/lib/errors';
import type { ExamTabProps } from '../examTabs.registry';

export function RegistrationsTab({ exam }: ExamTabProps) {
  const queryClient = useQueryClient();
  const [courseToAdd, setCourseToAdd] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<
    { kind: 'course'; id: string; label: string } | { kind: 'student'; id: string; label: string } | null
  >(null);

  const courses = useQuery({ queryKey: ['courses'], queryFn: listCourses });
  const examCourses = useQuery({ queryKey: ['exams', exam.id, 'courses'], queryFn: () => listExamCourses(exam.id) });
  const registrations = useQuery({ queryKey: ['exams', exam.id, 'registrations'], queryFn: () => listExamRegistrations(exam.id) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['exams', exam.id] });
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
  };

  const assignedCourseIds = new Set((examCourses.data ?? []).map((c) => c.courseId));
  const courseCode = new Map((courses.data ?? []).map((c) => [c.id, c.code]));
  const registeredIds = useMemo(() => new Set((registrations.data ?? []).map((r) => r.studentId)), [registrations.data]);
  const q = search.trim().toLowerCase();
  const visible = (registrations.data ?? []).filter(
    (r) =>
      !q ||
      r.student.collegeId.toLowerCase().includes(q) ||
      r.student.fullName.toLowerCase().includes(q) ||
      r.student.email.toLowerCase().includes(q),
  );

  async function assignCourse() {
    if (!courseToAdd) return;
    setAssigning(true);
    try {
      const result = await assignCourseToExam(exam.id, courseToAdd);
      toast.success(`Course assigned. ${result.registrationsCreated} student(s) registered.`);
      setCourseToAdd('');
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Courses</CardTitle>
          <CardDescription>Everyone enrolled in an assigned course is registered, including students enrolled later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {examCourses.isPending ? (
            <TableSkeleton rows={2} columns={1} />
          ) : examCourses.data?.length ? (
            <ul className="space-y-2">
              {examCourses.data.map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <Link to={`/admin/courses/${link.courseId}`} className="font-medium hover:underline">
                      <span className="font-mono text-xs">{link.course.code}</span> {link.course.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{link.enrolledCount} enrolled</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Unassign ${link.course.code}`}
                    onClick={() => setConfirm({ kind: 'course', id: link.courseId, label: link.course.code })}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No courses assigned.</p>
          )}
          <div className="flex gap-2">
            <Select value={courseToAdd} onChange={(e) => setCourseToAdd(e.target.value)} className="flex-1" aria-label="Course to assign">
              <option value="">Assign a course…</option>
              {(courses.data ?? [])
                .filter((c) => !assignedCourseIds.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name} ({c.enrolledCount})
                  </option>
                ))}
            </Select>
            <Button onClick={assignCourse} disabled={!courseToAdd} loading={assigning}>
              Assign
            </Button>
          </div>
          {courses.data?.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No courses exist yet. <Link to="/admin/courses" className="text-primary hover:underline">Create one</Link>.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-serif text-lg font-semibold">
            Registered students <span className="text-muted-foreground">({registrations.data?.length ?? 0})</span>
          </h3>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="w-56 pl-8" placeholder="Search students" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search registered students" />
            </div>
            <Button variant="outline" onClick={() => setPicking(true)}>
              <UserPlus /> Add students
            </Button>
          </div>
        </div>

        {registrations.error ? (
          <ErrorState message={getErrorMessage(registrations.error)} onRetry={() => registrations.refetch()} />
        ) : registrations.isPending ? (
          <TableSkeleton columns={4} />
        ) : registrations.data.length === 0 ? (
          <EmptyState icon={Users} title="Nobody is registered" description="Assign a course or add students individually." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>College ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Via</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.student.collegeId}</TableCell>
                  <TableCell>
                    <p>{r.student.fullName}</p>
                    <p className="text-xs text-muted-foreground">{r.student.email}</p>
                  </TableCell>
                  <TableCell>
                    {r.source === RegistrationSource.COURSE ? (
                      <Badge variant="info">
                        <BookOpen className="h-3 w-3" /> {courseCode.get(r.courseId ?? '') ?? 'Course'}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Manual</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Unregister ${r.student.fullName}`}
                      onClick={() => setConfirm({ kind: 'student', id: r.studentId, label: r.student.fullName })}
                    >
                      <UserMinus />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <StudentPickerDialog
        open={picking}
        onOpenChange={setPicking}
        title="Register students"
        description={exam.publishedAt ? 'The exam is published: new students are notified straight away.' : undefined}
        confirmLabel="Register"
        excludeIds={registeredIds}
        onConfirm={async (ids) => {
          const result = await registerStudentsForExam(exam.id, ids);
          toast.success(`Registered ${result.registeredCount} student(s)`);
          if (result.notFound.length) toast.warning(`Not found: ${result.notFound.join(', ')}`);
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === 'course' ? `Unassign ${confirm.label}?` : `Unregister ${confirm?.label ?? ''}?`}
        description={
          confirm?.kind === 'course'
            ? "Students registered through this course are unregistered, unless another assigned course covers them. Manual registrations and attempts already made are kept."
            : 'They will no longer be able to start this exam. An attempt already made is kept.'
        }
        confirmLabel={confirm?.kind === 'course' ? 'Unassign' : 'Unregister'}
        destructive
        onConfirm={async () => {
          if (!confirm) return;
          try {
            if (confirm.kind === 'course') {
              const result = await unassignCourseFromExam(exam.id, confirm.id);
              toast.success(`Unassigned. ${result.registrationsRemoved} registration(s) removed.`);
            } else {
              await unregisterStudentFromExam(exam.id, confirm.id);
              toast.success('Unregistered');
            }
            refresh();
          } catch (err) {
            toast.error(getErrorMessage(err));
          }
        }}
      />
    </div>
  );
}
