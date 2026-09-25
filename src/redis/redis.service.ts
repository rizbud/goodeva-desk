import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { default as Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redisClient: Redis.default;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    this.redisClient = new Redis.default(redisUrl, { lazyConnect: false });

    this.redisClient.on('connect', () => {
      this.logger.log('Redis client connected');
    });

    this.redisClient.on('error', (err) => {
      this.logger.error(`Redis client error: ${err.message}`);
    });
  }

  async set(
    key: string,
    value: string,
    expireInSeconds?: number,
  ): Promise<void> {
    if (expireInSeconds) {
      await this.redisClient.set(key, value, 'EX', expireInSeconds);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.redisClient.get(key);
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  async flushAll(): Promise<void> {
    await this.redisClient.flushall();
  }

  async ping(): Promise<string> {
    return await this.redisClient.ping();
  }

  async incrementWindow(key: string, ttlMs: number): Promise<[number, number]> {
    const results = await this.redisClient
      .multi()
      .set(key, 0, 'PX', ttlMs, 'NX')
      .incr(key)
      .pttl(key)
      .exec();
    return [results![1][1] as number, results![2][1] as number];
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }
}
