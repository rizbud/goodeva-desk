import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TicketStatus } from '../../../generated/prisma/enums.js';

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TicketStatus, description: 'New status for the ticket' })
  @IsEnum(TicketStatus)
  status: TicketStatus;
}
