import { Injectable } from '@nestjs/common';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto.js';
import { TicketCategory, TicketStatus } from '../../generated/prisma/enums.js';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { LlmClassificationRequest } from '../llm/llm.type.js';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectQueue('ticket-classification')
    private readonly ticketClassificationQueue: Queue<LlmClassificationRequest>,
  ) {}

  async create(organizationId: string, createTicketDto: CreateTicketDto) {
    const ticket = await this.prismaService.ticket.create({
      data: {
        organizationId: organizationId,
        customerEmail: createTicketDto.customerEmail,
        subject: createTicketDto.subject,
        message: createTicketDto.message,
      },
    });

    await this.ticketClassificationQueue.add('classify-ticket', {
      ticketId: ticket.id,
      subject: createTicketDto.subject,
      message: createTicketDto.message,
    });

    return ticket;
  }

  async findAll(
    organizationId: string,
    listTicketsQueryDto: ListTicketsQueryDto,
  ) {
    const [totalItems, result] = await Promise.all([
      this.prismaService.ticket.count({
        where: {
          organizationId: organizationId,
          status: listTicketsQueryDto.status,
          category: listTicketsQueryDto.category,
          customerEmail: listTicketsQueryDto.customerEmail,
        },
      }),
      this.prismaService.ticket.findMany({
        where: {
          organizationId: organizationId,
          status: listTicketsQueryDto.status,
          category: listTicketsQueryDto.category,
          customerEmail: listTicketsQueryDto.customerEmail,
        },
        skip: listTicketsQueryDto.page
          ? (listTicketsQueryDto.page - 1) * (listTicketsQueryDto.limit || 10)
          : undefined,
        take: listTicketsQueryDto.limit || 10,
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      data: result,
      page: listTicketsQueryDto.page || 1,
      limit: listTicketsQueryDto.limit || 10,
      totalItems,
      totalPages: Math.ceil(totalItems / (listTicketsQueryDto.limit || 10)),
    };
  }

  async findOne(id: string, organizationId: string) {
    return this.prismaService.ticket.findFirst({
      where: { id: id, organizationId: organizationId },
    });
  }

  async findOneById(id: string) {
    return this.prismaService.ticket.findUnique({
      where: { id: id },
    });
  }

  async updateStatus(id: string, organizationId: string, status: TicketStatus) {
    return this.prismaService.ticket.update({
      where: { id: id, organizationId: organizationId },
      data: { status },
    });
  }

  async updateCategoryAndSuggestedReply(
    id: string,
    category: TicketCategory,
    suggestedReply: string,
  ) {
    return this.prismaService.ticket.update({
      where: { id: id },
      data: { category, suggestedReply },
    });
  }

  async remove(id: string, organizationId: string) {
    return this.prismaService.ticket.delete({
      where: { id: id, organizationId: organizationId },
    });
  }
}
