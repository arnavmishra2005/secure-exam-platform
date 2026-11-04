import { BadRequestException, ConflictException } from '@nestjs/common';
import { CourseStaffRole, DEFAULT_TA_PERMISSIONS, Permission, Role } from '@secure-exam/types';
import { CourseStaffService } from './course-staff.service';

const now = new Date('2026-11-05T10:00:00Z');

function setup() {
  const staffRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    exist: jest.fn().mockResolvedValue(false),
    count: jest.fn(),
    create: jest.fn((row) => row),
    save: jest.fn(async (row) => ({ id: 'staff-1', createdAt: now, ...row })),
    remove: jest.fn(),
    insert: jest.fn(),
  };
  const userRepo = { find: jest.fn() };
  const userService = { findByEmail: jest.fn(), createStaffUser: jest.fn(), findById: jest.fn() };
  const auditService = { logEvent: jest.fn() };
  const service = new CourseStaffService(staffRepo as never, userRepo as never, userService as never, auditService as never);
  return { service, staffRepo, userService, auditService };
}

const taUser = { id: 'ta-1', email: 'ta@x.dev', fullName: 'Tara', role: Role.TA };

describe('CourseStaffService.add', () => {
  it('creates a TA account for a new email, with the default permissions', async () => {
    const { service, userService, staffRepo, auditService } = setup();
    userService.findByEmail.mockResolvedValue(null);
    userService.createStaffUser.mockResolvedValue(taUser);

    const member = await service.add(
      'course-1',
      { email: 'ta@x.dev', fullName: 'Tara', password: 'Secret@123', role: CourseStaffRole.TA },
      'inst-1',
    );

    expect(userService.createStaffUser).toHaveBeenCalledWith(expect.objectContaining({ role: Role.TA, email: 'ta@x.dev' }));
    expect(staffRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: 'course-1', userId: 'ta-1', role: CourseStaffRole.TA, addedBy: 'inst-1' }),
    );
    expect(member.permissions).toEqual([...DEFAULT_TA_PERMISSIONS].sort((a, b) => order(a) - order(b)));
    expect(auditService.logEvent).toHaveBeenCalledWith(
      'COURSE_STAFF_ADDED',
      expect.objectContaining({ courseId: 'course-1', accountCreated: true }),
      'inst-1',
    );
  });

  it('needs a name and password to create a TA account', async () => {
    const { service, userService } = setup();
    userService.findByEmail.mockResolvedValue(null);
    await expect(service.add('c', { email: 'new@x.dev', role: CourseStaffRole.TA }, 'i')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(userService.createStaffUser).not.toHaveBeenCalled();
  });

  it('never creates an instructor account', async () => {
    const { service, userService } = setup();
    userService.findByEmail.mockResolvedValue(null);
    await expect(
      service.add('c', { email: 'x@x.dev', fullName: 'X', password: 'Secret@123', role: CourseStaffRole.INSTRUCTOR }, 'i'),
    ).rejects.toThrow('created by the system administrator');
  });

  it('refuses a student account, and a TA account as an instructor', async () => {
    const { service, userService } = setup();
    userService.findByEmail.mockResolvedValueOnce({ ...taUser, role: Role.STUDENT });
    await expect(service.add('c', { email: 's@x.dev', role: CourseStaffRole.TA }, 'i')).rejects.toThrow('student account');
    userService.findByEmail.mockResolvedValueOnce(taUser);
    await expect(service.add('c', { email: 'ta@x.dev', role: CourseStaffRole.INSTRUCTOR }, 'i')).rejects.toThrow(
      'Only instructor accounts',
    );
  });

  it('adds an existing instructor as a co-instructor, with no TA permissions', async () => {
    const { service, userService } = setup();
    userService.findByEmail.mockResolvedValue({ id: 'inst-2', email: 'b@x.dev', fullName: 'B', role: Role.INSTRUCTOR });
    const member = await service.add(
      'c',
      { email: 'b@x.dev', role: CourseStaffRole.INSTRUCTOR, permissions: [Permission.MONITOR] },
      'inst-1',
    );
    expect(member.role).toBe(CourseStaffRole.INSTRUCTOR);
    expect(member.permissions).toEqual([]);
  });

  it('refuses someone already on the staff', async () => {
    const { service, userService, staffRepo } = setup();
    userService.findByEmail.mockResolvedValue(taUser);
    staffRepo.exist.mockResolvedValue(true);
    await expect(service.add('c', { email: 'ta@x.dev', role: CourseStaffRole.TA }, 'i')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('CourseStaffService permissions and removal', () => {
  it("changes a TA's permissions but not an instructor's", async () => {
    const { service, staffRepo, userService } = setup();
    userService.findById.mockResolvedValue(taUser);
    staffRepo.findOne.mockResolvedValueOnce({ courseId: 'c', userId: 'ta-1', role: CourseStaffRole.TA, permissions: [], createdAt: now });
    const member = await service.updatePermissions('c', 'ta-1', { permissions: [Permission.MARKS_ADJUST, Permission.EXAM_VIEW] }, 'i');
    expect(member.permissions).toEqual([Permission.EXAM_VIEW, Permission.MARKS_ADJUST]);

    staffRepo.findOne.mockResolvedValueOnce({ courseId: 'c', userId: 'i', role: CourseStaffRole.INSTRUCTOR, permissions: [] });
    await expect(service.updatePermissions('c', 'i', { permissions: [] }, 'i')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps at least one instructor on a course', async () => {
    const { service, staffRepo } = setup();
    staffRepo.findOne.mockResolvedValue({ courseId: 'c', userId: 'i', role: CourseStaffRole.INSTRUCTOR });
    staffRepo.count.mockResolvedValue(1);
    await expect(service.remove('c', 'i', 'i')).rejects.toThrow('at least one instructor');
    expect(staffRepo.remove).not.toHaveBeenCalled();

    staffRepo.count.mockResolvedValue(2);
    await service.remove('c', 'i', 'i');
    expect(staffRepo.remove).toHaveBeenCalled();
  });
});

function order(p: Permission): number {
  return Object.values(Permission).indexOf(p);
}
