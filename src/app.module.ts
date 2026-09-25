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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
