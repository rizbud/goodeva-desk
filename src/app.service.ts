import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisService } from './redis/redis.service.js';

@Injectable()
export class AppService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth() {
    let databaseStatus = 'down';
    let redisStatus = 'down';

    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      databaseStatus = 'up';
    } catch {
      databaseStatus = 'down';
    }

    try {
      const ping = await this.redisService.ping();
      if (ping === 'PONG') {
        redisStatus = 'up';
      }
    } catch {
      redisStatus = 'down';
    }

    const isHealthy = databaseStatus === 'up' && redisStatus === 'up';
    const report = {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: databaseStatus,
        redis: redisStatus,
      },
    };

    if (!isHealthy) {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
