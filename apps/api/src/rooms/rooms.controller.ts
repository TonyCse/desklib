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
import { RoomsAvailabilityQueryDto } from './dto/rooms-availability.dto.js';
import { MyBookingsQueryDto } from '../bookings/dto/bookings-query.dto.js';
import { CreateRoomBookingDto } from './dto/room-booking.dto.js';
import { RoomsService } from './rooms.service.js';

@Controller()
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get('rooms/availability')
  availability(
    @Query() query: RoomsAvailabilityQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rooms.availability(query.date, query.floorId, user);
  }

  @Post('room-bookings')
  book(@CurrentUser() user: AuthUser, @Body() dto: CreateRoomBookingDto) {
    return this.rooms.book(user, dto);
  }

  @Delete('room-bookings/:id')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.cancel(user, id);
  }

  @Get('room-bookings/me')
  listMine(@CurrentUser() user: AuthUser, @Query() query: MyBookingsQueryDto) {
    return this.rooms.listMine(user, query.scope ?? 'upcoming');
  }
}
