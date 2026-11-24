import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const BOOKING_HALF_INPUTS = ['AM', 'PM', 'FULL'] as const;
export type BookingHalfInput = (typeof BOOKING_HALF_INPUTS)[number];

export class CreateBookingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  deskId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date doit être au format YYYY-MM-DD',
  })
  date!: string;

  @IsIn(BOOKING_HALF_INPUTS, { message: 'half doit valoir AM, PM ou FULL' })
  half!: BookingHalfInput;

  /** Renseigné seulement par un manager qui réserve pour un membre de son équipe. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;
}
