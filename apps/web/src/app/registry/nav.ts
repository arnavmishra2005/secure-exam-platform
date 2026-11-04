// [SHARED — Day 1 contract] Sidebar/header navigation.
// Add your entry as ONE line; don't reorder other people's.

import { Permission } from '@secure-exam/types';
import type { LucideIcon } from 'lucide-react';
import { Activity, BarChart3, BookOpen, ClipboardList, LayoutDashboard, Library, Users } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  owner: 'A' | 'B' | 'C';
  /** Staff nav: shown only to someone with this permission on at least one course. */
  permission?: Permission;
}

/** Under /instructor, for instructors and TAs. */
export const staffNav: NavItem[] = [
  { to: '/instructor/exams', label: 'Exams', icon: ClipboardList, owner: 'A', permission: Permission.EXAM_VIEW },
  { to: '/instructor/courses', label: 'Courses', icon: BookOpen, owner: 'A' },
  { to: '/instructor/students', label: 'Students', icon: Users, owner: 'A', permission: Permission.STUDENTS_MANAGE },
  { to: '/instructor/results', label: 'Results', icon: BarChart3, owner: 'A', permission: Permission.RESULTS_VIEW },
  { to: '/instructor/monitoring', label: 'Live monitoring', icon: Activity, owner: 'C', permission: Permission.MONITOR },
  { to: '/instructor/questions', label: 'Question bank', icon: Library, owner: 'B', permission: Permission.QUESTION_BANK_VIEW },
];

export const studentNav: NavItem[] = [
  { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard, owner: 'C' },
];
