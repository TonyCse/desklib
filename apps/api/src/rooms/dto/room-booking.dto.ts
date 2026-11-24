import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const VEHICLE_HALF_INPUTS = ['AM', 'PM', 'FULL'] as const;
export type RoomHalfInput = (typeof VEHICLE_HALF_INPUTS)[number];

export class CreateRoomBookingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  roomId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date doit être au format YYYY-MM-DD',
  })
  date!: string;

  @IsIn(VEHICLE_HALF_INPUTS, { message: 'half doit valoir AM, PM ou FULL' })
  half!: RoomHalfInput;
}
