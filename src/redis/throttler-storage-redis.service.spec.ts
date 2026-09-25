import { ThrottlerStorageRedisService } from './throttler-storage-redis.service.js';
import type { RedisService } from './redis.service.js';

describe('ThrottlerStorageRedisService', () => {
  const redisService = { incrementWindow: vi.fn() };
  const storage = new ThrottlerStorageRedisService(
    redisService as unknown as RedisService,
  );

  beforeEach(() => vi.clearAllMocks());

  it('should namespace keys per throttler and convert ms to seconds', async () => {
    redisService.incrementWindow.mockResolvedValue([3, 59_001]);

    const result = await storage.increment('abc', 60_000, 10, 60_000, 'org');

    expect(redisService.incrementWindow).toHaveBeenCalledWith(
      'throttle:org:abc',
      60_000,
    );
    expect(result).toEqual({
      totalHits: 3,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('should block until the window ends once over the limit', async () => {
    redisService.incrementWindow.mockResolvedValue([11, 30_000]);

    const result = await storage.increment('abc', 60_000, 10, 60_000, 'ip');

    expect(result.isBlocked).toBe(true);
    expect(result.timeToBlockExpire).toBe(30);
  });
});
