import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (exception?.code === 'P2025') {
      // Prisma record not found error code
      status = HttpStatus.NOT_FOUND;
      message = {
        statusCode: 404,
        message: 'Resource not found',
        error: 'Not Found',
      };
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled Exception on ${request?.method} ${request?.url}: ${exception?.message || exception}`,
        exception?.stack,
      );
    } else {
      this.logger.warn(
        `HTTP ${status} on ${request?.method} ${request?.url}: ${JSON.stringify(message)}`,
      );
    }

    response
      .status(status)
      .json(
        typeof message === 'object' ? message : { statusCode: status, message },
      );
  }
}
