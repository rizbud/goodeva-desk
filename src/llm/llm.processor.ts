import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { LlmService } from './llm.service.js';
import { LlmClassificationRequest } from './llm.type.js';
import { Job, UnrecoverableError } from 'bullmq';
import { TicketsService } from '../tickets/tickets.service.js';
import { Logger } from '@nestjs/common';

@Processor('ticket-classification')
export class LlmProcessor extends WorkerHost {
  private readonly logger = new Logger(LlmProcessor.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly ticketService: TicketsService,
  ) {
    super();
  }

  async process(job: Job<LlmClassificationRequest>) {
    const {
      attemptsMade,
      opts: { attempts = 1 },
    } = job;

    const { ticketId, subject, message } = job.data;

    this.logger.log(
      `[Attempt ${attemptsMade + 1}/${attempts}] Processing ticket classification for ticket ID: ${ticketId}. Job ID: ${job.id}.`,
    );

    const ticket = await this.ticketService.findOneById(ticketId);
    if (!ticket) {
      throw new UnrecoverableError(`Ticket with ID ${ticketId} not found`);
    }

    const result = await this.llmService.classifyTicket(subject, message);

    await this.ticketService.updateCategoryAndSuggestedReply(
      ticketId,
      result.category,
      result.suggestedReply,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<LlmClassificationRequest>, error: Error) {
    const {
      id,
      attemptsMade,
      opts: { attempts = 1 },
      data,
    } = job;

    if (attemptsMade >= attempts) {
      this.logger.error(
        `Job ${id} for ticket ID: ${data.ticketId} permanently failed after ${attemptsMade} attempts: ${error.message}`,
      );
    } else {
      this.logger.warn(
        `Job ${id} for ticket ID: ${data.ticketId} failed on attempt ${attemptsMade}/${attempts}: ${error.message}`,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<LlmClassificationRequest>) {
    this.logger.log(
      `Job ${job.id} for ticket ID: ${job.data.ticketId} completed successfully.`,
    );
  }
}
