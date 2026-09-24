import { Injectable } from '@nestjs/common';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto.js';
import { TicketStatus } from '../../generated/prisma/enums.js';

@Injectable()
export class TicketsService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(organizationId: string, createTicketDto: CreateTicketDto) {
    return this.prismaService.ticket.create({
      data: {
        organizationId: organizationId,
        customerEmail: createTicketDto.customerEmail,
        subject: createTicketDto.subject,
        message: createTicketDto.message,
      },
    });
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

  async updateStatus(id: string, organizationId: string, status: TicketStatus) {
    return this.prismaService.ticket.update({
      where: { id: id, organizationId: organizationId },
      data: { status },
    });
  }

  async remove(id: string, organizationId: string) {
    return this.prismaService.ticket.delete({
      where: { id: id, organizationId: organizationId },
    });
  }
}
