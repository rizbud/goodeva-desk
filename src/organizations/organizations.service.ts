import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prismaService: PrismaService) {}

  async findOrganizationByApiKey(apiKey: string) {
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    const organization = await this.prismaService.organization.findUnique({
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
      where: { apiKey: apiKeyHash },
    });

    return organization;
  }
}
