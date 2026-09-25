import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { TicketStatus } from '../../generated/prisma/enums.js';
import { OrganizationsService } from '../organizations/organizations.service.js';

describe('TicketsController', () => {
  let controller: TicketsController;
  let service: {
    create: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      updateStatus: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [
        {
          provide: TicketsService,
          useValue: service,
        },
        {
          provide: OrganizationsService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<TicketsController>(TicketsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call ticketsService.create with organizationId and dto', async () => {
      const orgId = 'org-1';
      const dto = {
        customerEmail: 'test@example.com',
        subject: 'Billing inquiry',
        message: 'Where is my invoice?',
      };
      const expectedResult = { id: 'ticket-1', ...dto, organizationId: orgId };

      service.create.mockResolvedValue(expectedResult);

      const result = await controller.create(orgId, dto);
      expect(service.create).toHaveBeenCalledWith(orgId, dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findAll', () => {
    it('should call ticketsService.findAll with query', async () => {
      const orgId = 'org-1';
      const query = { status: TicketStatus.OPEN, page: 1, limit: 10 };
      const expectedResult = {
        data: [],
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 0,
      };

      service.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(orgId, query);
      expect(service.findAll).toHaveBeenCalledWith(orgId, query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findOne', () => {
    it('should return ticket when found', async () => {
      const orgId = 'org-1';
      const ticket = { id: 'ticket-1', organizationId: orgId };
      service.findOne.mockResolvedValue(ticket);

      const result = await controller.findOne(orgId, 'ticket-1');
      expect(service.findOne).toHaveBeenCalledWith('ticket-1', orgId);
      expect(result).toEqual(ticket);
    });

    it('should throw NotFoundException when ticket is not found', async () => {
      const orgId = 'org-1';
      service.findOne.mockResolvedValue(null);

      await expect(controller.findOne(orgId, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update ticket status', async () => {
      const orgId = 'org-1';
      const updated = { id: 'ticket-1', status: TicketStatus.CLOSED };
      service.updateStatus.mockResolvedValue(updated);

      const result = await controller.update(orgId, 'ticket-1', {
        status: TicketStatus.CLOSED,
      });

      expect(service.updateStatus).toHaveBeenCalledWith(
        'ticket-1',
        orgId,
        TicketStatus.CLOSED,
      );
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should remove ticket', async () => {
      const orgId = 'org-1';
      const deleted = { id: 'ticket-1' };
      service.remove.mockResolvedValue(deleted);

      const result = await controller.remove(orgId, 'ticket-1');
      expect(service.remove).toHaveBeenCalledWith('ticket-1', orgId);
      expect(result).toEqual(deleted);
    });
  });
});
