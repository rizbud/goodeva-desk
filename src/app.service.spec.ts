import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisService } from './redis/redis.service.js';

describe('AppService', () => {
  let service: AppService;
  let prismaService: {
    $queryRaw: ReturnType<typeof vi.fn>;
  };
  let redisService: {
    ping: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prismaService = {
      $queryRaw: vi.fn(),
    };
    redisService = {
      ping: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHello', () => {
    it('should return "Hello World!"', () => {
      expect(service.getHello()).toBe('Hello World!');
    });
  });

  describe('getHealth', () => {
    it('should return status ok when both database and redis are healthy', async () => {
      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisService.ping.mockResolvedValue('PONG');

      const result = await service.getHealth();

      expect(result.status).toBe('ok');
      expect(result.services).toEqual({
        database: 'up',
        redis: 'up',
      });
      expect(result.timestamp).toBeDefined();
    });

    it('should throw ServiceUnavailableException when database is down', async () => {
      prismaService.$queryRaw.mockRejectedValue(new Error('DB connection failed'));
      redisService.ping.mockResolvedValue('PONG');

      await expect(service.getHealth()).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException when redis is down', async () => {
      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisService.ping.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.getHealth()).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
