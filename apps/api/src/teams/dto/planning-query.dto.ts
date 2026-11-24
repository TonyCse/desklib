import { Matches } from 'class-validator';

export class PlanningQueryDto {
  @Matches(/^\d{4}-W\d{2}$/, { message: 'week doit être au format YYYY-Www' })
  week!: string;
}
