import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service.js';

// Blocks until the window ends; blockDuration is ignored (it defaults to ttl anyway).
@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): ReturnType<ThrottlerStorage['increment']> {
    const [totalHits, ttlMs] = await this.redisService.incrementWindow(
      `throttle:${throttlerName}:${key}`,
      ttl,
    );
    const timeToExpire = Math.max(0, Math.ceil(ttlMs / 1000));
    const isBlocked = totalHits > limit;

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }
}
