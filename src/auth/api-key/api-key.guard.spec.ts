import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard.js';
import { OrganizationsService } from '../../organizations/organizations.service.js';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let organizationsService: {
    findOrganizationByApiKey: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    organizationsService = {
      findOrganizationByApiKey: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        {
          provide: OrganizationsService,
          useValue: organizationsService,
        },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  const createMockExecutionContext = (headers: Record<string, any>): ExecutionContext => {
    const request = {
      headers,
      ip: '127.0.0.1',
      method: 'GET',
      url: '/tickets',
      organization: undefined,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should throw UnauthorizedException when x-api-key header is missing', async () => {
    const context = createMockExecutionContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing X-API-Key header'),
    );
  });

  it('should throw UnauthorizedException when x-api-key header is invalid', async () => {
    const context = createMockExecutionContext({ 'x-api-key': 'sk_invalid' });
    organizationsService.findOrganizationByApiKey.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid API key'),
    );
    expect(organizationsService.findOrganizationByApiKey).toHaveBeenCalledWith('sk_invalid');
  });

  it('should attach organization to request and return true when API key is valid', async () => {
    const mockOrg = { id: 'org-1', name: 'Goodeva' };
    const context = createMockExecutionContext({ 'x-api-key': 'sk_valid_key' });
    organizationsService.findOrganizationByApiKey.mockResolvedValue(mockOrg);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const req = context.switchToHttp().getRequest();
    expect(req.organization).toEqual(mockOrg);
    expect(organizationsService.findOrganizationByApiKey).toHaveBeenCalledWith('sk_valid_key');
  });
});
