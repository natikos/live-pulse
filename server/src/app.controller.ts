import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
