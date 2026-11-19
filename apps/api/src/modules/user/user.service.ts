// Owner: Person A (Identity/Auth/Security)

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UpdateStudentDto } from '@secure-exam/validation';
import { AuditEventType, Role } from '@secure-exam/types';
import type { StudentDirectoryPage, StudentSummary } from '@secure-exam/types';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { StudentEntity } from './entities/student.entity';
import { UserEntity } from './entities/user.entity';

const BCRYPT_ROUNDS = 12;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolvedStudents {
  /** Keyed by the identifier the caller passed in. */
  found: Map<string, StudentEntity>;
  notFound: string[];
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    private readonly auditService: AuditService,
  ) {}

  async findByEmailWithPassword(email: string): Promise<UserEntity | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .addSelect('user.refreshTokenHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async setRefreshTokenHash(userId: string, refreshTokenHash: string | null): Promise<void> {
    await this.userRepository.update({ id: userId }, { refreshTokenHash });
  }

  async getRefreshTokenHash(userId: string): Promise<string | null> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.refreshTokenHash')
      .where('user.id = :userId', { userId })
      .getOne();
    return user?.refreshTokenHash ?? null;
  }

  /** Students enrolled in at least one of `courseIds` (staff see only their own courses' students). */
  async listStudentsInCourses(courseIds: string[]): Promise<StudentEntity[]> {
    if (courseIds.length === 0) return [];
    return this.studentRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'user')
      .where(
        's.id IN (SELECT e."studentId" FROM "course_enrollments" e WHERE e."courseId" = ANY(:courseIds::uuid[]))',
        { courseIds },
      )
      .getMany();
  }

  /** Case-insensitive, since people type emails in any case. */
  findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() })
      .getOne();
  }

  /**
   * An instructor or TA account. Instructors come from the seed script (no
   * one in the app can create them); TAs are created by an instructor when
   * added to a course.
   */
  async createStaffUser(input: {
    email: string;
    fullName: string;
    password: string;
    role: Role.INSTRUCTOR | Role.TA;
  }): Promise<UserEntity> {
    if (input.password.length < 8) throw new BadRequestException('The password must be at least 8 characters');
    if (await this.findByEmail(input.email)) throw new ConflictException('Email already registered');
    return this.userRepository.save(
      this.userRepository.create({
        email: input.email.trim(),
        fullName: input.fullName.trim(),
        role: input.role,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      }),
    );
  }

  async findStudentById(id: string): Promise<StudentEntity | null> {
    return this.studentRepository.findOne({ where: { id }, relations: ['user'] });
  }

  /**
   * Resolves a mixed list of students.id, users.id or college IDs to Student
   * records, so staff screens can accept whichever the operator has to hand.
   */
  async resolveStudents(identifiers: string[]): Promise<ResolvedStudents> {
    const unique = [...new Set(identifiers.map((i) => i.trim()).filter(Boolean))];
    const uuids = unique.filter((i) => UUID_PATTERN.test(i));
    const collegeIds = unique.filter((i) => !UUID_PATTERN.test(i));

    const candidates: StudentEntity[] = [];
    if (uuids.length > 0) {
      candidates.push(
        ...(await this.studentRepository.find({
          where: [{ id: In(uuids) }, { userId: In(uuids) }],
          relations: ['user'],
        })),
      );
    }
    if (collegeIds.length > 0) {
      candidates.push(
        ...(await this.studentRepository.find({ where: { collegeId: In(collegeIds) }, relations: ['user'] })),
      );
    }

    const found = new Map<string, StudentEntity>();
    for (const identifier of unique) {
      const match = candidates.find(
        (s) => s.id === identifier || s.userId === identifier || s.collegeId === identifier,
      );
      if (match) found.set(identifier, match);
    }
    return { found, notFound: unique.filter((i) => !found.has(i)) };
  }

  /** Students by students.id, with their user loaded. */
  findStudentsByIds(ids: string[]): Promise<StudentEntity[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.studentRepository.find({ where: { id: In(ids) }, relations: ['user'] });
  }

  /** Students by users.id (what attempts and results reference), with their user loaded. */
  findStudentsByUserIds(userIds: string[]): Promise<StudentEntity[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.studentRepository.find({ where: { userId: In(userIds) }, relations: ['user'] });
  }

  findStudentByUserId(userId: string): Promise<StudentEntity | null> {
    return this.studentRepository.findOne({ where: { userId }, relations: ['user'] });
  }

  async findByCollegeId(collegeId: string): Promise<StudentEntity | null> {
    return this.studentRepository.findOne({
      where: { collegeId },
      relations: ['user'],
    });
  }

  /**
   * The college's student list, for enrolling and registering students: every
   * student account, searched by college ID, email or name. Accounts come from
   * the seeded college list; staff can't create them.
   */
  async searchStudentDirectory(search: string | undefined, limit: number, offset: number): Promise<StudentDirectoryPage> {
    const qb = this.studentRepository.createQueryBuilder('s').innerJoinAndSelect('s.user', 'user');
    const q = search?.trim();
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      qb.where('(s.collegeId ILIKE :pattern OR user.email ILIKE :pattern OR user.fullName ILIKE :pattern)', { pattern });
    }
    const [rows, total] = await qb.orderBy('s.collegeId', 'ASC').skip(offset).take(limit).getManyAndCount();
    return {
      items: rows.map((s) => ({
        id: s.id,
        collegeId: s.collegeId,
        fullName: s.user.fullName,
        email: s.user.email,
        isActive: s.user.isActive,
      })),
      total,
    };
  }

  async updateStudent(
    id: string,
    dto: UpdateStudentDto,
    actorId: string,
  ): Promise<StudentEntity> {
    const student = await this.studentRepository.findOne({ where: { id }, relations: ['user'] });
    if (!student) throw new NotFoundException('Student not found');

    if (dto.fullName || dto.email || dto.isActive !== undefined) {
      await this.userRepository.update(
        { id: student.userId },
        {
          ...(dto.fullName ? { fullName: dto.fullName } : {}),
          ...(dto.email ? { email: dto.email } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      );
    }

    await this.auditService.logEvent(
      AuditEventType.STUDENT_UPDATED,
      { studentId: id, changes: dto },
      actorId,
    );

    return this.studentRepository.findOneOrFail({ where: { id }, relations: ['user'] });
  }
}

export function toStudentSummary(student: StudentEntity): StudentSummary {
  return {
    id: student.id,
    userId: student.userId,
    collegeId: student.collegeId,
    fullName: student.user?.fullName ?? '',
    email: student.user?.email ?? '',
    isActive: student.user?.isActive ?? false,
  };
}
