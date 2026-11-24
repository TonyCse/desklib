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
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { MyBookingsQueryDto } from './dto/bookings-query.dto.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookings.create(user, dto);
  }

  @Delete(':id')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.cancel(user, id);
  }

  @Get('me')
  listMine(@CurrentUser() user: AuthUser, @Query() query: MyBookingsQueryDto) {
    return this.bookings.listMine(user, query.scope ?? 'upcoming');
  }
}
