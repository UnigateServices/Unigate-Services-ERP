import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { FinanceModule } from './finance/finance.module';
import { HealthModule } from './health/health.module';
import { LocationsModule } from './locations/locations.module';
import { ModulesModule } from './modules/modules.module';
import { PlatformModule } from './platform/platform.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '../../packages/database/.env', '.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    PlatformModule,
    LocationsModule,
    ModulesModule,
    RolesModule,
    UsersModule,
    FinanceModule,
  ],
})
export class AppModule {}
