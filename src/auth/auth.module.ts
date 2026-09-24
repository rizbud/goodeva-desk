import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key/api-key.guard.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';

@Module({
  imports: [OrganizationsModule],
  providers: [ApiKeyGuard],
  exports: [ApiKeyGuard, OrganizationsModule],
})
export class AuthModule {}
