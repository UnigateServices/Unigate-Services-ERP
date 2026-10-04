import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch {
      console.warn('[Prisma] PostgreSQL is not reachable. Start it with: docker compose up -d');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
