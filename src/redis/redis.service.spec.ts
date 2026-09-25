import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service.js';

const mockRedisClient = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  flushall: vi.fn(),
  ping: vi.fn(),
  multi: vi.fn(),
  quit: vi.fn(),
  on: vi.fn(),
};

vi.mock('ioredis', () => {
  class MockRedis {
    constructor() {
      return mockRedisClient;
    }
  }

  return {
    default: {
      default: MockRedis,
    },
  };
});

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('redis://localhost:6379'),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get & set', () => {
    it('should set key without ttl', async () => {
      await service.set('key', 'val');
      expect(mockRedisClient.set).toHaveBeenCalledWith('key', 'val');
    });

    it('should set key with ttl', async () => {
      await service.set('key', 'val', 60);
      expect(mockRedisClient.set).toHaveBeenCalledWith('key', 'val', 'EX', 60);
    });

    it('should get key', async () => {
      mockRedisClient.get.mockResolvedValue('val');
      const result = await service.get('key');
      expect(mockRedisClient.get).toHaveBeenCalledWith('key');
      expect(result).toBe('val');
    });

    it('should del key', async () => {
      await service.del('key');
      expect(mockRedisClient.del).toHaveBeenCalledWith('key');
    });

    it('should ping', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      const result = await service.ping();
      expect(result).toBe('PONG');
    });

    it('should increment a fixed window atomically', async () => {
      const tx = {
        set: vi.fn().mockReturnThis(),
        incr: vi.fn().mockReturnThis(),
        pttl: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 'OK'],
          [null, 1],
          [null, 60000],
        ]),
      };
      mockRedisClient.multi.mockReturnValue(tx);

      const result = await service.incrementWindow('key1', 60000);

      expect(tx.set).toHaveBeenCalledWith('key1', 0, 'PX', 60000, 'NX');
      expect(tx.incr).toHaveBeenCalledWith('key1');
      expect(result).toEqual([1, 60000]);
    });

    it('should disconnect on destroy', async () => {
      await service.onModuleDestroy();
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });
});
