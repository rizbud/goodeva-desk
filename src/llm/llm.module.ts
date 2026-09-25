import { Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { RedisModule } from '../redis/redis.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { LlmProcessor } from './llm.processor.js';

@Module({
  imports: [RedisModule, TicketsModule],
  providers: [LlmService, LlmProcessor],
  exports: [LlmService],
})
export class LlmModule {}
