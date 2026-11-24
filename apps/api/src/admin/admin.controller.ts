import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type AuthUser,
  CurrentUser,
  Roles,
} from '../common/decorators/auth.decorators.js';
import { AdminService } from './admin.service.js';
import {
  AuditQueryDto,
  CreateDeskDto,
  CreateUserDto,
  CreateVehicleDto,
  CreateRoomDto,
  UpdateRoomDto,
  UpdateVehicleDto,
  RangeQueryDto,
  UpdateDeskDto,
  UpdateSettingsDto,
  UpdateUserDto,
} from './dto/admin.dto.js';

/** Toutes les routes d'administration exigent le rôle ADMIN, contrôlé côté API. */
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('desks')
  listDesks() {
    return this.admin.listDesks();
  }

  @Post('desks')
  createDesk(@CurrentUser() actor: AuthUser, @Body() dto: CreateDeskDto) {
    return this.admin.createDesk(actor, dto);
  }

  @Patch('desks/:id')
  updateDesk(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDeskDto,
  ) {
    return this.admin.updateDesk(actor, id, dto);
  }

  @Get('vehicles')
  listVehicles() {
    return this.admin.listVehicles();
  }

  @Post('vehicles')
  createVehicle(@CurrentUser() actor: AuthUser, @Body() dto: CreateVehicleDto) {
    return this.admin.createVehicle(actor, dto);
  }

  @Patch('vehicles/:id')
  updateVehicle(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.admin.updateVehicle(actor, id, dto);
  }

  @Get('rooms')
  listRooms() {
    return this.admin.listRooms();
  }

  @Post('rooms')
  createRoom(@CurrentUser() actor: AuthUser, @Body() dto: CreateRoomDto) {
    return this.admin.createRoom(actor, dto);
  }

  @Patch('rooms/:id')
  updateRoom(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.admin.updateRoom(actor, id, dto);
  }

  @Get('settings')
  getSettings() {
    return this.admin.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() actor: AuthUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.admin.updateSettings(actor, dto);
  }

  @Get('users')
  listUsers() {
    return this.admin.listUsers();
  }

  @Get('teams')
  listTeams() {
    return this.admin.listTeams();
  }

  @Post('users')
  createUser(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.admin.createUser(actor, dto);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.admin.updateUser(actor, id, dto);
  }

  @Get('stats')
  stats(@Query() query: RangeQueryDto) {
    return this.admin.stats(query);
  }

  @Get('audit-logs')
  auditLogs(@Query() query: AuditQueryDto) {
    return this.admin.auditLogs(query);
  }

  @Get('audit-logs/actors')
  auditActors() {
    return this.admin.auditActors();
  }
}
