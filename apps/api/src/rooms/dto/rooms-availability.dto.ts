import { IsString, Matches, MinLength } from 'class-validator';

export class RoomsAvailabilityQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date doit être au format YYYY-MM-DD',
  })
  date!: string;

  @IsString()
  @MinLength(1)
  floorId!: string;
}
