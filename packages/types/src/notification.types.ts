/**
 * Owner: Person A (Platform, Courses, Publish, Results)
 *
 * In-app notifications. Email delivery is deferred (SMTP_* env vars are
 * reserved for it); this is the list a student sees on their dashboard.
 */

export enum NotificationType {
  EXAM_PUBLISHED = 'EXAM_PUBLISHED',
  EXAM_EXTENDED = 'EXAM_EXTENDED',
  RESULT_PUBLISHED = 'RESULT_PUBLISHED',
}

export interface Notification {
  id: string;
  /** users.id of the recipient. */
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Type-specific payload, e.g. { examId }. */
  data: Record<string, unknown>;
  /** ISO 8601, or null while unread. */
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: Notification[];
  unreadCount: number;
}
