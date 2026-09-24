import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TicketsModule } from './tickets/tickets.module.js';

@Module({
  imports: [PrismaModule, OrganizationsModule, AuthModule, TicketsModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
