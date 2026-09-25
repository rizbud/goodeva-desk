import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service.js';
import { generateText, Output } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { TicketCategory } from '../../generated/prisma/enums.js';
import { LlmClassificationResult } from './llm.type.js';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly cacheTtl = 24 * 60 * 60; // Cache for 24 hours
  private readonly customOpenAi: ReturnType<typeof createOpenAICompatible>;
  private readonly modelId: string;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    const baseURL = this.configService.get<string>(
      'LLM_API_BASE_URL',
      'https://generativelanguage.googleapis.com/v1beta/openai',
    );
    const apiKey = this.configService.getOrThrow<string>('LLM_API_KEY');
    this.modelId = this.configService.get<string>(
      'LLM_MODEL_ID',
      'gemini-2.5-flash-lite',
    );

    this.customOpenAi = createOpenAICompatible({
      baseURL,
      name: 'custom-openai-compatible',
      apiKey,
    });
  }

  private sanitizeInput(input: string): string {
    return input.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
  }

  private buildCacheKey(subject: string, message: string): string {
    const sanitizedSubject = this.sanitizeInput(subject);
    const sanitizedMessage = this.sanitizeInput(message);
    const key = `llm:${sanitizedSubject}:${sanitizedMessage}`;

    return key;
  }

  private buildPrompt(subject: string, message: string): string {
    return [
      'Classify the following ticket into a category and provide a suggested reply:',
      `Subject: ${subject}`,
      `Message: ${message}`,
      `Supported categories: ${Object.values(TicketCategory).join(' | ')}`,
      'Return the result in JSON format with "category" and "suggestedReply" fields.',
    ].join('\n');
  }

  async classifyTicket(
    subject: string,
    message: string,
  ): Promise<LlmClassificationResult> {
    const cacheKey = this.buildCacheKey(subject, message);
    const cachedResult = await this.redisService.get(cacheKey);
    if (cachedResult) {
      try {
        const parsed = JSON.parse(cachedResult) as LlmClassificationResult;
        this.logger.log(`Cache hit for key ${cacheKey}`);
        return parsed;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to parse cached result for key ${cacheKey}: ${errorMessage}`,
        );
      }
    }

    this.logger.log(
      `Cache miss for key ${cacheKey}. Requesting LLM completion...`,
    );

    try {
      const startTime = Date.now();
      const result = await generateText({
        model: this.customOpenAi.chatModel(this.modelId),
        prompt: this.buildPrompt(subject, message),
        output: Output.object({
          schema: z.object({
            category: z.enum(TicketCategory),
            suggestedReply: z.string(),
          }),
        }),
      });

      const duration = Date.now() - startTime;
      const { category, suggestedReply } = result.output;
      this.logger.log(
        `LLM classified ticket in ${duration}ms as ${category}`,
      );

      await this.redisService.set(
        cacheKey,
        JSON.stringify({ category, suggestedReply }),
        this.cacheTtl,
      );

      return { category, suggestedReply };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error classifying ticket with subject: "${subject}" and message: "${message}": ${errorMessage}`,
      );
      throw error;
    }
  }
}
