import { createHash } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { RedisModule } from './redis/redis.module.js';
import { BullModule } from '@nestjs/bullmq';
import { LlmModule } from './llm/llm.module.js';
import { validateEnv } from './config/env.validation.js';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from './redis/throttler-storage-redis.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    OrganizationsModule,
    AuthModule,
    TicketsModule,
    RedisModule,
    LlmModule,

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
        },
      }),
    }),

    // Global limits (not per route). The guard runs before ApiKeyGuard, so the
    // org limit keys on the raw X-API-Key header.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, ThrottlerStorageRedisService],
      useFactory: (
        config: ConfigService,
        storage: ThrottlerStorageRedisService,
      ) => ({
        storage,
        generateKey: (_context, tracker, name) =>
          createHash('sha256').update(`${name}:${tracker}`).digest('hex'),
        throttlers: [
          {
            name: 'ip',
            ttl: seconds(config.get<number>('THROTTLE_IP_TTL', 60)),
            limit: config.get<number>('THROTTLE_IP_LIMIT', 60),
          },
          {
            name: 'org',
            ttl: seconds(config.get<number>('THROTTLE_ORG_TTL', 60)),
            limit: config.get<number>('THROTTLE_ORG_LIMIT', 120),
            getTracker: (req) => req.headers['x-api-key'],
            skipIf: (context) =>
              !context.switchToHttp().getRequest().headers['x-api-key'],
          },
        ],
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
