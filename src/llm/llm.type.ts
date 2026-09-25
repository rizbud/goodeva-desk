import { TicketCategory } from '../../generated/prisma/enums.js';

export interface LlmClassificationRequest {
  ticketId: string;
  subject: string;
  message: string;
}

export interface LlmClassificationResult {
  category: TicketCategory;
  suggestedReply: string;
}
