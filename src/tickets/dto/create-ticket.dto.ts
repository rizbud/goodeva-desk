import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTicketDto {
  @ApiProperty({ description: 'Customer email address' })
  @IsEmail()
  customerEmail: string;

  @ApiProperty({ description: 'Ticket subject' })
  @IsString()
  @MinLength(1, { message: 'Subject must not be empty' })
  @MaxLength(255, { message: 'Subject must not exceed 255 characters' })
  subject: string;

  @ApiProperty({ description: 'Ticket message' })
  @IsString()
  @MinLength(1, { message: 'Message must not be empty' })
  @MaxLength(5000, { message: 'Message must not exceed 5000 characters' })
  message: string;
}
