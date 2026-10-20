// [SHARED — Day 1 contract] Tabs on the results detail page.
// One line per tab; append, never reorder. Person B registers:
//   { id: 'questions', label: 'Questions', component: QuestionsTab, owner: 'B' },
// (who-answered-which matrix, per-student drill-down, submitted code).

import type { ComponentType } from 'react';
import { QuestionsTab } from '@secure-exam/exam-content-ui';
import { OverviewTab } from './tabs/OverviewTab';
import { StudentsTab } from './tabs/StudentsTab';

export interface ResultsTabProps {
  examId: string;
}

export interface ResultsTab {
  id: string;
  label: string;
  component: ComponentType<ResultsTabProps>;
  owner: 'A' | 'B' | 'C';
}

export const resultsTabs: ResultsTab[] = [
  { id: 'overview', label: 'Overview', component: OverviewTab, owner: 'A' },
  { id: 'students', label: 'Students', component: StudentsTab, owner: 'A' },
  { id: 'questions', label: 'Questions', component: QuestionsTab, owner: 'B' },
];
