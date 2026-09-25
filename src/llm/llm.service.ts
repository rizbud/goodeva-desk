import 'dotenv/config';
import { Injectable, Logger } from '@nestjs/common';
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
  private readonly customOpenAi = createOpenAICompatible({
    baseURL:
      process.env.LLM_API_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta/openai',
    name: 'custom-openai-compatible',
    apiKey: process.env.LLM_API_KEY || '',
  });

  constructor(private readonly redisService: RedisService) {}

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
        return JSON.parse(cachedResult);
      } catch (error) {
        // If parsing fails, log the error and continue to generate a new result
        this.logger.error(
          `Failed to parse cached result for key ${cacheKey}: ${error}`,
        );
      }
    }

    try {
      const result = await generateText({
        model: this.customOpenAi.chatModel(
          process.env.LLM_MODEL_ID || 'gemini-2.5-flash-lite',
        ),
        prompt: this.buildPrompt(subject, message),
        output: Output.object({
          schema: z.object({
            category: z.enum(TicketCategory),
            suggestedReply: z.string(),
          }),
        }),
      });

      const { category, suggestedReply } = result.output;

      await this.redisService.set(
        cacheKey,
        JSON.stringify({ category, suggestedReply }),
        this.cacheTtl,
      );

      return { category, suggestedReply };
    } catch (error) {
      this.logger.error(
        `Error classifying ticket with subject: "${subject}" and message: "${message}": ${error}`,
      );
      throw error;
    }
  }
}
