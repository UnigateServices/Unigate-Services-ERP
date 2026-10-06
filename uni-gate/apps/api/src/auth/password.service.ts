import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, passwordIssue } from '@unigate/shared';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.cost());
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  async changeOwn(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const matches = user ? await this.verify(currentPassword, user.passwordHash) : false;
    if (!user || !matches) {
      throw new UnauthorizedException({
        code: ErrorCode.WRONG_CREDENTIALS,
        message: 'The current password is not valid.',
      });
    }
    this.assertPolicy(newPassword);
    await this.writeHash(userId, newPassword);
  }

  /**
   * Administrator reset. The users phase will expose this after it authorizes the actor.
   * Sessions issued before the reset stop working because authVersion changes.
   */
  async resetPassword(userId: string, newPassword: string): Promise<void> {
    this.assertPolicy(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'User was not found.' });
    }
    await this.writeHash(userId, newPassword);
  }

  private assertPolicy(password: string) {
    if (!passwordIssue(password)) return;
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Password must be at least 8 characters and include a letter and a number.',
    });
  }

  private async writeHash(userId: string, password: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.hash(password),
        authVersion: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  }

  private cost(): number {
    const cost = Number(this.config.get<string>('BCRYPT_COST') ?? 12);
    return Number.isInteger(cost) ? cost : 12;
  }
}
