import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { TicketStatus } from '../../../generated/prisma/enums.js';

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TicketStatus, description: 'New status for the ticket' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(TicketStatus)
  status: TicketStatus;
}
