// Owner: Person A (Platform, Courses, Publish, Results)

import type { Notification, NotificationList } from '@secure-exam/types';
import { apiClient } from './client';

export async function listNotifications(limit = 50): Promise<NotificationList> {
  const { data } = await apiClient.get<NotificationList>('/notifications', { params: { limit } });
  return data;
}

export async function markNotificationRead(notificationId: string): Promise<Notification> {
  const { data } = await apiClient.post<Notification>(`/notifications/${notificationId}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const { data } = await apiClient.post<{ updated: number }>('/notifications/read-all');
  return data;
}
