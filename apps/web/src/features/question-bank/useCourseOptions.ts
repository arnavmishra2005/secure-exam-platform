import { listCourses } from '@secure-exam/api-client';
import { useQuery } from '@tanstack/react-query';

/** Person A's courses, shaped for B's course pickers. */
export function useCourseOptions(): { id: string; name: string }[] | undefined {
  const { data } = useQuery({ queryKey: ['courses'], queryFn: listCourses });
  return data?.map((c) => ({ id: c.id, name: c.name }));
}
