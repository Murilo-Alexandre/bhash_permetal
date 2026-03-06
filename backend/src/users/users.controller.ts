import { Controller, Get, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('companyId') companyId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.users.listActiveExcluding(req.user.sub, { q, companyId, departmentId });
  }

  @Get(':id/profile')
  getProfile(@Req() req: any, @Param('id') id: string) {
    if (!id) throw new BadRequestException('ID inválido');
    return this.users.getProfile(req.user.sub, id);
  }
}
