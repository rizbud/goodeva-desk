import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service.js';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @SkipThrottle({ ip: true, org: true })
  @ApiOperation({ summary: 'Application and dependencies health check' })
  @ApiResponse({
    status: 200,
    description: 'Application and all dependencies are healthy',
  })
  @ApiResponse({
    status: 503,
    description: 'One or more dependencies (Database/Redis) are down',
  })
  async getHealth() {
    return this.appService.getHealth();
  }
}
