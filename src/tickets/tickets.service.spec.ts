import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { TicketsService } from './tickets.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketCategory, TicketStatus } from '../../generated/prisma/enums.js';

describe('TicketsService', () => {
  let service: TicketsService;
  let prismaService: {
    ticket: {
      create: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let queue: {
    add: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prismaService = {
      ticket: {
        create: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    queue = {
      add: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: getQueueToken('ticket-classification'),
          useValue: queue,
        },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a ticket and add a job to classification queue', async () => {
      const orgId = 'org-123';
      const dto = {
        customerEmail: 'user@example.com',
        subject: 'Cannot login',
        message: 'Getting error 500 when logging in',
      };
      const createdTicket = {
        id: 'ticket-1',
        organizationId: orgId,
        ...dto,
        category: null,
        suggestedReply: null,
        status: TicketStatus.OPEN,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaService.ticket.create.mockResolvedValue(createdTicket);
      queue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.create(orgId, dto);

      expect(prismaService.ticket.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          customerEmail: dto.customerEmail,
          subject: dto.subject,
          message: dto.message,
        },
      });
      expect(queue.add).toHaveBeenCalledWith('classify-ticket', {
        ticketId: 'ticket-1',
        subject: dto.subject,
        message: dto.message,
      });
      expect(result).toEqual(createdTicket);
    });
  });

  describe('findAll', () => {
    it('should find and paginate tickets scoped strictly to organizationId', async () => {
      const orgId = 'org-123';
      const query = {
        status: TicketStatus.OPEN,
        category: TicketCategory.TECHNICAL,
        customerEmail: 'user@example.com',
        page: 1,
        limit: 10,
      };

      const mockTickets = [
        {
          id: 'ticket-1',
          organizationId: orgId,
          subject: 'Technical issue',
          status: TicketStatus.OPEN,
          category: TicketCategory.TECHNICAL,
        },
      ];

      prismaService.ticket.count.mockResolvedValue(1);
      prismaService.ticket.findMany.mockResolvedValue(mockTickets);

      const result = await service.findAll(orgId, query);

      expect(prismaService.ticket.count).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          status: TicketStatus.OPEN,
          category: TicketCategory.TECHNICAL,
          customerEmail: 'user@example.com',
        },
      });

      expect(prismaService.ticket.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          status: TicketStatus.OPEN,
          category: TicketCategory.TECHNICAL,
          customerEmail: 'user@example.com',
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });

      expect(result).toEqual({
        data: mockTickets,
        page: 1,
        limit: 10,
        totalItems: 1,
        totalPages: 1,
      });
    });
  });

  describe('findOne', () => {
    it('should return ticket if exists and belongs to organization', async () => {
      const mockTicket = { id: 'ticket-1', organizationId: 'org-123' };
      prismaService.ticket.findFirst.mockResolvedValue(mockTicket);

      const result = await service.findOne('ticket-1', 'org-123');

      expect(prismaService.ticket.findFirst).toHaveBeenCalledWith({
        where: { id: 'ticket-1', organizationId: 'org-123' },
      });
      expect(result).toEqual(mockTicket);
    });
  });

  describe('updateStatus', () => {
    it('should update ticket status scoped to organization', async () => {
      const updatedTicket = { id: 'ticket-1', status: TicketStatus.IN_PROGRESS };
      prismaService.ticket.update.mockResolvedValue(updatedTicket);

      const result = await service.updateStatus('ticket-1', 'org-123', TicketStatus.IN_PROGRESS);

      expect(prismaService.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-1', organizationId: 'org-123' },
        data: { status: TicketStatus.IN_PROGRESS },
      });
      expect(result).toEqual(updatedTicket);
    });
  });

  describe('updateCategoryAndSuggestedReply', () => {
    it('should update classification fields', async () => {
      const updatedTicket = {
        id: 'ticket-1',
        category: TicketCategory.TECHNICAL,
        suggestedReply: 'Try restarting the device.',
      };
      prismaService.ticket.update.mockResolvedValue(updatedTicket);

      const result = await service.updateCategoryAndSuggestedReply(
        'ticket-1',
        TicketCategory.TECHNICAL,
        'Try restarting the device.',
      );

      expect(prismaService.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: {
          category: TicketCategory.TECHNICAL,
          suggestedReply: 'Try restarting the device.',
        },
      });
      expect(result).toEqual(updatedTicket);
    });
  });

  describe('remove', () => {
    it('should delete ticket scoped to organization', async () => {
      const deletedTicket = { id: 'ticket-1', organizationId: 'org-123' };
      prismaService.ticket.delete.mockResolvedValue(deletedTicket);

      const result = await service.remove('ticket-1', 'org-123');

      expect(prismaService.ticket.delete).toHaveBeenCalledWith({
        where: { id: 'ticket-1', organizationId: 'org-123' },
      });
      expect(result).toEqual(deletedTicket);
    });
  });
});
