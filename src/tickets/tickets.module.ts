import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { TicketsController } from './tickets.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
