import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service.js';
import { RedisService } from '../redis/redis.service.js';
import { TicketCategory } from '../../generated/prisma/enums.js';
import * as aiModule from 'ai';

vi.mock('ai', () => {
  return {
    generateText: vi.fn(),
    Output: {
      object: vi.fn().mockImplementation((opts) => opts),
    },
  };
});

describe('LlmService', () => {
  let service: LlmService;
  let redisService: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };
  let configService: {
    get: ReturnType<typeof vi.fn>;
    getOrThrow: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    redisService = {
      get: vi.fn(),
      set: vi.fn(),
    };

    configService = {
      get: vi.fn().mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'LLM_API_BASE_URL') return 'https://example.com/v1';
        if (key === 'LLM_MODEL_ID') return 'test-model';
        return defaultValue;
      }),
      getOrThrow: vi.fn().mockReturnValue('test-api-key'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: RedisService,
          useValue: redisService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('classifyTicket', () => {
    it('should return cached result on cache hit without calling LLM', async () => {
      const cached = {
        category: TicketCategory.BILLING,
        suggestedReply: 'Your invoice has been resent.',
      };
      redisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.classifyTicket('Billing issue', 'Where is my invoice?');

      expect(redisService.get).toHaveBeenCalled();
      expect(aiModule.generateText).not.toHaveBeenCalled();
      expect(result).toEqual(cached);
    });

    it('should call LLM and cache result on cache miss', async () => {
      redisService.get.mockResolvedValue(null);
      const llmOutput = {
        category: TicketCategory.TECHNICAL,
        suggestedReply: 'Please try clearing your browser cache.',
      };

      vi.mocked(aiModule.generateText).mockResolvedValue({
        output: llmOutput,
      } as any);

      const result = await service.classifyTicket('App crashing', 'Error 500 on dashboard');

      expect(redisService.get).toHaveBeenCalled();
      expect(aiModule.generateText).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^llm:[a-f0-9]{64}$/),
        JSON.stringify(llmOutput),
        24 * 60 * 60,
      );
      expect(result).toEqual(llmOutput);
    });

    it('should generate identical cache key for inputs with different whitespace and casing', async () => {
      redisService.get.mockResolvedValue(null);
      vi.mocked(aiModule.generateText).mockResolvedValue({
        output: {
          category: TicketCategory.GENERAL,
          suggestedReply: 'Thank you for reaching out.',
        },
      } as any);

      await service.classifyTicket('  Payment   Issue  \n', 'Cannot   complete checkout.  ');
      const firstKey = redisService.get.mock.calls[0][0];

      redisService.get.mockClear();

      await service.classifyTicket('payment issue', 'cannot complete checkout.');
      const secondKey = redisService.get.mock.calls[0][0];

      expect(firstKey).toBe(secondKey);
    });
  });
});
