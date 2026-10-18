import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthUser } from './current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

export const ACCESS_COOKIE = 'tf_access';

type JwtPayload = {
  sub: string;
  name: string;
  role: AuthUser['role'];
  companyId: string;
  locationId: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request?.cookies?.[ACCESS_COOKIE] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-only-change-me-to-a-long-random-secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const [employee, lockRows] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { id: payload.sub },
        include: { location: true },
      }),
      this.prisma.$queryRaw<Array<{ session_locked: boolean }>>`
        SELECT "session_locked" FROM "employees" WHERE "id" = ${payload.sub} LIMIT 1
      `,
    ]);

    return {
      id: payload.sub,
      name: payload.name,
      role: payload.role,
      companyId: payload.companyId,
      locationId: employee?.locationId ?? payload.locationId,
      locationName: employee?.location?.name ?? null,
      sessionLocked: Boolean(lockRows[0]?.session_locked),
    };
  }
}
