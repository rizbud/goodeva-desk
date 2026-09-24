import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { ApiKeyGuard } from '../auth/api-key/api-key.guard.js';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto.js';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto.js';

@UseGuards(ApiKeyGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}
  @Post()
  create(
    @CurrentOrg('id') organizationId: string,
    @Body() createTicketDto: CreateTicketDto,
  ) {
    try {
      return this.ticketsService.create(organizationId, createTicketDto);
    } catch {
      throw new InternalServerErrorException('Failed to create ticket');
    }
  }

  @Get()
  findAll(
    @CurrentOrg('id') organizationId: string,
    @Query() listTicketsQueryDto: ListTicketsQueryDto,
  ) {
    return this.ticketsService.findAll(organizationId, listTicketsQueryDto);
  }

  @Get(':id')
  async findOne(
    @CurrentOrg('id') organizationId: string,
    @Param('id') id: string,
  ) {
    const ticket = await this.ticketsService.findOne(id, organizationId);
    if (!ticket) {
      throw new NotFoundException('Resource not found');
    }
  }

  @Patch(':id/status')
  update(
    @CurrentOrg('id') organizationId: string,
    @Param('id') id: string,
    @Body() { status }: UpdateTicketStatusDto,
  ) {
    try {
      return this.ticketsService.updateStatus(id, organizationId, status);
    } catch {
      throw new InternalServerErrorException('Failed to update ticket status');
    }
  }

  @Delete(':id')
  async remove(
    @CurrentOrg('id') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.ticketsService.remove(id, organizationId);
  }
}
