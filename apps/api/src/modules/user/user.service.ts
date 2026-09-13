// Owner: Person A (Identity/Auth/Security)

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateStudentDto, UpdateStudentDto } from '@secure-exam/validation';
import { AuditEventType, Role } from '@secure-exam/types';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { StudentEntity } from './entities/student.entity';
import { UserEntity } from './entities/user.entity';

const BCRYPT_ROUNDS = 12;

export interface BulkImportResult {
  createdCount: number;
  skipped: Array<{ collegeId: string; reason: string }>;
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

  async listStudents(): Promise<StudentEntity[]> {
    return this.studentRepository.find({ relations: ['user'] });
  }

  async findStudentById(id: string): Promise<StudentEntity | null> {
    return this.studentRepository.findOne({ where: { id }, relations: ['user'] });
  }

  async findByCollegeId(collegeId: string): Promise<StudentEntity | null> {
    return this.studentRepository.findOne({
      where: { collegeId },
      relations: ['user'],
    });
  }

  async createStudent(dto: CreateStudentDto, actorId: string): Promise<StudentEntity> {
    const existingByEmail = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existingByEmail) throw new ConflictException('Email already registered');

    const existingByCollegeId = await this.studentRepository.findOne({
      where: { collegeId: dto.collegeId },
    });
    if (existingByCollegeId) throw new ConflictException('College ID already registered');

    const plainPassword = dto.password ?? randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

    const user = await this.userRepository.save(
      this.userRepository.create({
        email: dto.email,
        fullName: dto.fullName,
        role: Role.STUDENT,
        passwordHash,
      }),
    );

    const student = await this.studentRepository.save(
      this.studentRepository.create({
        userId: user.id,
        collegeId: dto.collegeId,
      }),
    );

    await this.auditService.logEvent(
      AuditEventType.STUDENT_CREATED,
      { studentId: student.id, collegeId: dto.collegeId },
      actorId,
    );

    return student;
  }

  async bulkImportStudents(
    dtos: CreateStudentDto[],
    actorId: string,
  ): Promise<BulkImportResult> {
    const result: BulkImportResult = { createdCount: 0, skipped: [] };

    for (const dto of dtos) {
      try {
        await this.createStudent(dto, actorId);
        result.createdCount += 1;
      } catch (err) {
        result.skipped.push({
          collegeId: dto.collegeId,
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    await this.auditService.logEvent(
      AuditEventType.STUDENT_BULK_IMPORTED,
      { attempted: dtos.length, createdCount: result.createdCount, skippedCount: result.skipped.length },
      actorId,
    );

    return result;
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
