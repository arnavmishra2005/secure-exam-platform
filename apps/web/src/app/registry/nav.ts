// [SHARED — Day 1 contract] Sidebar/header navigation.
// Add your entry as ONE line; don't reorder other people's.

import type { LucideIcon } from 'lucide-react';
import { Activity, BarChart3, BookOpen, ClipboardList, LayoutDashboard, Library, Users } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  owner: 'A' | 'B' | 'C';
}

export const adminNav: NavItem[] = [
  { to: '/admin/exams', label: 'Exams', icon: ClipboardList, owner: 'A' },
  { to: '/admin/courses', label: 'Courses', icon: BookOpen, owner: 'A' },
  { to: '/admin/students', label: 'Students', icon: Users, owner: 'A' },
  { to: '/admin/results', label: 'Results', icon: BarChart3, owner: 'A' },
  { to: '/admin/monitoring', label: 'Live monitoring', icon: Activity, owner: 'C' },
  { to: '/admin/questions', label: 'Question bank', icon: Library, owner: 'B' },
];

export const studentNav: NavItem[] = [
  { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard, owner: 'C' },
];
