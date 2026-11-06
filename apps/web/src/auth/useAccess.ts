// Owner: Person A
// What the signed-in instructor or TA may do, per course (GET /me/access).
// Only for showing or hiding menus and buttons: the API checks every request.

import { getMyAccess } from '@secure-exam/api-client';
import { CourseStaffRole, Permission, Role } from '@secure-exam/types';
import type { MyCourseAccess } from '@secure-exam/types';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { isStaffRole, useAuth } from './AuthContext';

export interface Access {
  isLoading: boolean;
  /** The account is an instructor (may create courses). */
  isInstructor: boolean;
  courses: MyCourseAccess[];
  /** On this course (or, without one, on any course), may the user do `permission`? */
  can: (permission: Permission, courseId?: string | null) => boolean;
  /** Is the user an instructor of this course? */
  teaches: (courseId: string | null | undefined) => boolean;
  /** The courses where the user may do `permission`. */
  coursesWith: (permission: Permission) => MyCourseAccess[];
}

export function useAccess(): Access {
  const { user } = useAuth();
  const staff = isStaffRole(user?.role);
  const { data, isPending } = useQuery({
    // Keyed by user, so a different sign-in in the same tab never sees the last one's access.
    queryKey: ['me', 'access', user?.id],
    queryFn: getMyAccess,
    enabled: staff,
    staleTime: 60_000,
  });
  const courses = useMemo(() => data?.courses ?? [], [data]);

  const can = useCallback(
    (permission: Permission, courseId?: string | null) =>
      courses.some((c) => (courseId ? c.courseId === courseId : true) && c.permissions.includes(permission)),
    [courses],
  );
  const teaches = useCallback(
    (courseId: string | null | undefined) =>
      !!courseId && courses.some((c) => c.courseId === courseId && c.role === CourseStaffRole.INSTRUCTOR),
    [courses],
  );
  const coursesWith = useCallback(
    (permission: Permission) => courses.filter((c) => c.permissions.includes(permission)),
    [courses],
  );

  return {
    isLoading: staff && isPending,
    isInstructor: user?.role === Role.INSTRUCTOR,
    courses,
    can,
    teaches,
    coursesWith,
  };
}
