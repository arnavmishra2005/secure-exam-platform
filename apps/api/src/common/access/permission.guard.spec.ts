import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, Role } from '@secure-exam/types';
import type { AccessService } from './access.service';
import { PermissionGuard } from './permission.guard';
import type { StaffAccessRule } from './require-permission.decorator';

function contextFor(user: unknown, params: Record<string, string> = {}): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  } as unknown as ExecutionContext;
}

function setup(rule: StaffAccessRule | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(rule) } as unknown as Reflector;
  const access = {
    isStaff: (u: { role: Role }) => u.role === Role.INSTRUCTOR || u.role === Role.TA,
    assertResource: jest.fn().mockResolvedValue(undefined),
    hasAnywhere: jest.fn().mockResolvedValue(false),
  };
  return { guard: new PermissionGuard(reflector, access as unknown as AccessService), access };
}

const instructor = { sub: 'i', role: Role.INSTRUCTOR };
const ta = { sub: 't', role: Role.TA };
const student = { sub: 's', role: Role.STUDENT };

describe('PermissionGuard', () => {
  it('does nothing on a route without an access rule', async () => {
    const { guard, access } = setup(undefined);
    await expect(guard.canActivate(contextFor(ta))).resolves.toBe(true);
    expect(access.assertResource).not.toHaveBeenCalled();
  });

  it('leaves students to @Roles and the services', async () => {
    const { guard, access } = setup({ permission: Permission.MONITOR, resource: { attempt: 'id' } });
    await expect(guard.canActivate(contextFor(student, { id: 'a-1' }))).resolves.toBe(true);
    expect(access.assertResource).not.toHaveBeenCalled();
  });

  it('checks the record named by the route parameter', async () => {
    const { guard, access } = setup({ permission: Permission.EXAM_EDIT, resource: { exam: 'examId' } });
    await expect(guard.canActivate(contextFor(ta, { examId: 'e-1' }))).resolves.toBe(true);
    expect(access.assertResource).toHaveBeenCalledWith(ta, 'exam', 'e-1', Permission.EXAM_EDIT, undefined);
  });

  it('passes instructor-only rules through', async () => {
    const { guard, access } = setup({ instructorOnly: true, resource: { course: 'id' } });
    await guard.canActivate(contextFor(instructor, { id: 'c-1' }));
    expect(access.assertResource).toHaveBeenCalledWith(instructor, 'course', 'c-1', undefined, true);
  });

  it('propagates the 404 from the record check', async () => {
    const { guard, access } = setup({ permission: Permission.EXAM_VIEW, resource: { exam: 'id' } });
    access.assertResource.mockRejectedValue(new NotFoundException());
    await expect(guard.canActivate(contextFor(ta, { id: 'e-9' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('without a record: refuses a TA who holds the permission nowhere', async () => {
    const { guard, access } = setup({ permission: Permission.RESULTS_VIEW });
    await expect(guard.canActivate(contextFor(ta))).rejects.toBeInstanceOf(ForbiddenException);
    access.hasAnywhere.mockResolvedValue(true);
    await expect(guard.canActivate(contextFor(ta))).resolves.toBe(true);
  });

  it('without a record: lets an instructor through (their lists are scoped, possibly empty)', async () => {
    const { guard, access } = setup({ permission: Permission.RESULTS_VIEW });
    await expect(guard.canActivate(contextFor(instructor))).resolves.toBe(true);
    expect(access.hasAnywhere).not.toHaveBeenCalled();
  });
});
