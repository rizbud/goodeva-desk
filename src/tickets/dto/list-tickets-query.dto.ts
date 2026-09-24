import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  TicketCategory,
  TicketStatus,
} from '../../../generated/prisma/enums.js';

export class ListTicketsQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus, description: 'Ticket status' })
  @IsOptional()
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketCategory, description: 'Ticket category' })
  @IsOptional()
  category?: TicketCategory;

  @ApiPropertyOptional({ description: 'Customer email to filter tickets by' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Number of tickets per page for pagination',
    default: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
