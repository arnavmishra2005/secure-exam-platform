// Owner: Person A (Platform, Courses, Publish, Results)
// In-app notifications. Other modules call notifyMany(); students read
// theirs through NotificationController. Email delivery (SMTP_*) is deferred.

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Notification, NotificationList, NotificationType } from '@secure-exam/types';
import { IsNull, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { NotificationEntity } from './entities/notification.entity';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const INSERT_CHUNK = 500;

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
  ) {}

  /** Sends the same notification to each user. Returns how many were created. */
  async notifyMany(userIds: string[], input: NotificationInput): Promise<number> {
    const unique = [...new Set(userIds)];
    for (let i = 0; i < unique.length; i += INSERT_CHUNK) {
      const rows = unique.slice(i, i + INSERT_CHUNK).map((userId) =>
        this.notificationRepo.create({
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: input.data ?? {},
          readAt: null,
        }),
      );
      // jsonb `data` trips TypeORM's deep-partial typing; the rows are complete entities.
      await this.notificationRepo.insert(rows as QueryDeepPartialEntity<NotificationEntity>[]);
    }
    return unique.length;
  }

  async listForUser(userId: string, limit = 50): Promise<NotificationList> {
    const [items, unreadCount] = await Promise.all([
      this.notificationRepo.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: Math.min(Math.max(limit, 1), 200),
      }),
      this.unreadCount(userId),
    ]);
    return { items: items.map(toNotificationDto), unreadCount };
  }

  unreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({ where: { userId, readAt: IsNull() } });
  }

  async markRead(userId: string, notificationId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({ where: { id: notificationId, userId } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationRepo.save(notification);
    }
    return toNotificationDto(notification);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepo.update({ userId, readAt: IsNull() }, { readAt: new Date() });
    return { updated: result.affected ?? 0 };
  }
}

export function toNotificationDto(entity: NotificationEntity): Notification {
  return {
    id: entity.id,
    userId: entity.userId,
    type: entity.type,
    title: entity.title,
    body: entity.body,
    data: entity.data ?? {},
    readAt: entity.readAt ? entity.readAt.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
  };
}
