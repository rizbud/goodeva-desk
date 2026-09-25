import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;
  let appService: {
    getHello: ReturnType<typeof vi.fn>;
    getHealth: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    appService = {
      getHello: vi.fn().mockReturnValue('Hello World!'),
      getHealth: vi.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return health status report from appService', async () => {
      const mockHealth = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: { database: 'up', redis: 'up' },
      };
      appService.getHealth.mockResolvedValue(mockHealth);

      const result = await appController.getHealth();
      expect(appService.getHealth).toHaveBeenCalled();
      expect(result).toEqual(mockHealth);
    });
  });
});
