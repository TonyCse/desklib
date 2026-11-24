import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/auth.decorators.js';
import { AvailabilityQueryDto } from '../floors/dto/availability-query.dto.js';
import { MyBookingsQueryDto } from '../bookings/dto/bookings-query.dto.js';
import { CreateVehicleBookingDto } from './dto/vehicle-booking.dto.js';
import { VehiclesService } from './vehicles.service.js';

@Controller()
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('vehicles/availability')
  availability(
    @Query() query: AvailabilityQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vehicles.availability(query.date, user);
  }

  @Post('vehicle-bookings')
  book(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleBookingDto) {
    return this.vehicles.book(user, dto);
  }

  @Delete('vehicle-bookings/:id')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.vehicles.cancel(user, id);
  }

  @Get('vehicle-bookings/me')
  listMine(@CurrentUser() user: AuthUser, @Query() query: MyBookingsQueryDto) {
    return this.vehicles.listMine(user, query.scope ?? 'upcoming');
  }
}
