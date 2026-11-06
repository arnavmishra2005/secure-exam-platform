// Owner: Person A (Identity/Auth/Security)
// A course's instructors and TAs. Only the course's instructors may change
// its staff (enforced on the routes by @RequireCourseStaff instructorOnly).

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ALL_PERMISSIONS,
  AuditEventType,
  CourseStaffRole,
  DEFAULT_TA_PERMISSIONS,
  Permission,
  Role,
} from '@secure-exam/types';
import type { CourseStaffMember } from '@secure-exam/types';
import { AddCourseStaffDto, UpdateCourseStaffDto } from '@secure-exam/validation';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UserEntity } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { CourseStaffEntity } from './entities/course-staff.entity';

@Injectable()
export class CourseStaffService {
  constructor(
    @InjectRepository(CourseStaffEntity)
    private readonly staffRepo: Repository<CourseStaffEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly userService: UserService,
    private readonly auditService: AuditService,
  ) {}

  async list(courseId: string): Promise<CourseStaffMember[]> {
    const rows = await this.staffRepo.find({ where: { courseId } });
    const users = rows.length ? await this.userRepo.find({ where: { id: In(rows.map((r) => r.userId)) } }) : [];
    const userBy = new Map(users.map((u) => [u.id, u]));
    const order = { [CourseStaffRole.INSTRUCTOR]: 0, [CourseStaffRole.TA]: 1 };
    return rows
      .filter((r) => userBy.has(r.userId))
      .map((r) => toStaffMember(r, userBy.get(r.userId)!))
      .sort((a, b) => order[a.role] - order[b.role] || a.fullName.localeCompare(b.fullName));
  }

  /** Called when an instructor creates a course: they become its first instructor. */
  async addCreator(courseId: string, userId: string): Promise<void> {
    await this.staffRepo.insert({ courseId, userId, role: CourseStaffRole.INSTRUCTOR, permissions: [], addedBy: null });
  }

  /**
   * Adds an existing instructor or TA account, or creates a TA account when
   * the email is new. Instructor accounts are never created here.
   */
  async add(courseId: string, dto: AddCourseStaffDto, actorId: string): Promise<CourseStaffMember> {
    let user = await this.userService.findByEmail(dto.email);
    let accountCreated = false;

    if (!user) {
      if (dto.role === CourseStaffRole.INSTRUCTOR) {
        throw new BadRequestException(
          'No instructor account has this email. Instructor accounts are created by the system administrator.',
        );
      }
      if (!dto.fullName?.trim() || !dto.password) {
        throw new BadRequestException('This email has no account yet: give the TA a name and a password (at least 8 characters).');
      }
      user = await this.userService.createStaffUser({
        email: dto.email,
        fullName: dto.fullName,
        password: dto.password,
        role: Role.TA,
      });
      accountCreated = true;
    } else if (user.role === Role.STUDENT) {
      throw new BadRequestException('This email belongs to a student account, which cannot be course staff.');
    } else if (dto.role === CourseStaffRole.INSTRUCTOR && user.role !== Role.INSTRUCTOR) {
      throw new BadRequestException('Only instructor accounts can be instructors of a course. Add this person as a TA.');
    }

    if (await this.staffRepo.exist({ where: { courseId, userId: user.id } })) {
      throw new ConflictException(`${user.fullName} is already on this course's staff`);
    }

    const permissions = dto.role === CourseStaffRole.TA ? normalize(dto.permissions ?? DEFAULT_TA_PERMISSIONS) : [];
    const saved = await this.staffRepo.save(
      this.staffRepo.create({ courseId, userId: user.id, role: dto.role, permissions, addedBy: actorId }),
    );
    await this.auditService.logEvent(
      AuditEventType.COURSE_STAFF_ADDED,
      { courseId, userId: user.id, role: dto.role, permissions, accountCreated },
      actorId,
    );
    return toStaffMember(saved, user);
  }

  async updatePermissions(
    courseId: string,
    userId: string,
    dto: UpdateCourseStaffDto,
    actorId: string,
  ): Promise<CourseStaffMember> {
    const row = await this.getOrThrow(courseId, userId);
    if (row.role === CourseStaffRole.INSTRUCTOR) {
      throw new BadRequestException('Instructors may do everything on their course; only TA permissions can be changed.');
    }
    const before = row.permissions;
    row.permissions = normalize(dto.permissions);
    const saved = await this.staffRepo.save(row);
    await this.auditService.logEvent(
      AuditEventType.COURSE_STAFF_UPDATED,
      { courseId, userId, before, after: saved.permissions },
      actorId,
    );
    return toStaffMember(saved, await this.userService.findById(userId));
  }

  /** A course always keeps at least one instructor. */
  async remove(courseId: string, userId: string, actorId: string): Promise<void> {
    const row = await this.getOrThrow(courseId, userId);
    if (row.role === CourseStaffRole.INSTRUCTOR) {
      const instructors = await this.staffRepo.count({ where: { courseId, role: CourseStaffRole.INSTRUCTOR } });
      if (instructors <= 1) {
        throw new BadRequestException('A course needs at least one instructor. Add another instructor first.');
      }
    }
    await this.staffRepo.remove(row);
    await this.auditService.logEvent(
      AuditEventType.COURSE_STAFF_REMOVED,
      { courseId, userId, role: row.role },
      actorId,
    );
  }

  private async getOrThrow(courseId: string, userId: string): Promise<CourseStaffEntity> {
    const row = await this.staffRepo.findOne({ where: { courseId, userId } });
    if (!row) throw new NotFoundException("This person is not on the course's staff");
    return row;
  }
}

/** Known permissions only, in a stable order. */
function normalize(permissions: readonly Permission[]): Permission[] {
  const wanted = new Set(permissions);
  return ALL_PERMISSIONS.filter((p) => wanted.has(p));
}

export function toStaffMember(row: CourseStaffEntity, user: UserEntity): CourseStaffMember {
  return {
    id: row.id,
    courseId: row.courseId,
    userId: row.userId,
    fullName: user.fullName,
    email: user.email,
    role: row.role,
    permissions: row.role === CourseStaffRole.TA ? normalize(row.permissions ?? []) : [],
    addedAt: row.createdAt.toISOString(),
  };
}
