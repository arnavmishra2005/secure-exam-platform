// [SHARED] Tabs on the admin exam detail page. One line per tab; owners
// append, never reorder. Person B adds a richer question-bank tab here.

import type { Exam } from '@secure-exam/types';
import type { ComponentType } from 'react';
import { ExtensionsTab } from '@/features/monitoring/ExtensionsTab';
import { DetailsTab } from './tabs/DetailsTab';
import { QuestionsTab } from './tabs/QuestionsTab';
import { RegistrationsTab } from './tabs/RegistrationsTab';

export interface ExamTabProps {
  exam: Exam;
  /** Reload the exam after a change. */
  onChanged: () => void;
}

export interface ExamTab {
  id: string;
  label: string;
  component: ComponentType<ExamTabProps>;
  owner: 'A' | 'B' | 'C';
}

export const examTabs: ExamTab[] = [
  { id: 'details', label: 'Details', component: DetailsTab, owner: 'A' },
  { id: 'questions', label: 'Questions', component: QuestionsTab, owner: 'A' },
  { id: 'registrations', label: 'Registrations', component: RegistrationsTab, owner: 'A' },
  { id: 'extensions', label: 'Time extensions', component: ExtensionsTab, owner: 'C' },
];
