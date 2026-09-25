import { Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';
import { ThrottlerStorageRedisService } from './throttler-storage-redis.service.js';

@Module({
  providers: [RedisService, ThrottlerStorageRedisService],
  exports: [RedisService, ThrottlerStorageRedisService],
})
export class RedisModule {}
