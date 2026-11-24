import { IsIn, IsOptional } from 'class-validator';

export class MyBookingsQueryDto {
  @IsOptional()
  @IsIn(['upcoming', 'past'], { message: 'scope doit valoir upcoming ou past' })
  scope?: 'upcoming' | 'past';
}
