// C:\dev\bhash\backend\src\users\users.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Req() req: any) {
    // req.user.sub vem do JwtStrategy
    return this.users.listActiveExcluding(req.user.sub);
  }
}
