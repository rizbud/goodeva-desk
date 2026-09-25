import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { OrganizationsService } from './organizations.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prismaService: {
    organization: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prismaService = {
      organization: {
        findUnique: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrganizationByApiKey', () => {
    it('should query organization using SHA-256 hashed API key', async () => {
      const rawApiKey = 'sk_gd_test_api_key_123';
      const expectedHash = createHash('sha256').update(rawApiKey).digest('hex');
      const mockOrg = {
        id: 'org-1',
        name: 'Goodeva',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaService.organization.findUnique.mockResolvedValue(mockOrg);

      const result = await service.findOrganizationByApiKey(rawApiKey);

      expect(prismaService.organization.findUnique).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
        where: { apiKey: expectedHash },
      });
      expect(result).toEqual(mockOrg);
    });

    it('should return null when organization is not found', async () => {
      prismaService.organization.findUnique.mockResolvedValue(null);

      const result = await service.findOrganizationByApiKey('sk_invalid');
      expect(result).toBeNull();
    });
  });
});
