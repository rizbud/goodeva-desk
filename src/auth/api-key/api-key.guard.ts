import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { OrganizationsService } from '../../organizations/organizations.service.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly organizationsService: OrganizationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const apiKey = request.headers['x-api-key'];
    if (!apiKey || typeof apiKey !== 'string') {
      this.logger.warn(
        `Unauthorized request to ${request.method} ${request.url}: Missing X-API-Key header from ${request.ip}`,
      );
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const organization =
      await this.organizationsService.findOrganizationByApiKey(apiKey);
    if (!organization) {
      this.logger.warn(
        `Unauthorized request to ${request.method} ${request.url}: Invalid API key from ${request.ip}`,
      );
      throw new UnauthorizedException('Invalid API key');
    }

    request.organization = organization;

    return true;
  }
}
