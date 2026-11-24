import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ROLES } from '@ilot/shared';
import type { Role } from '@ilot/shared';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateDeskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  label!: string;

  @IsString()
  @MinLength(1)
  floorId!: string;

  @IsInt()
  @Min(0)
  @Max(5000)
  x!: number;

  @IsInt()
  @Min(0)
  @Max(5000)
  y!: number;

  @IsInt()
  @Min(10)
  @Max(400)
  width!: number;

  @IsInt()
  @Min(10)
  @Max(400)
  height!: number;

  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  features: string[] = [];

  /** null = poste ouvert à tous. */
  @ValidateIf((_, value: unknown) => value !== null)
  @IsOptional()
  @IsString()
  reservedTeamId: string | null = null;

  @IsBoolean()
  isActive: boolean = true;
}

export class UpdateDeskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  x?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  y?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(400)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(400)
  height?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  features?: string[];

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsOptional()
  reservedTeamId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  maxAdvanceDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weeklyQuota?: number;
}

export class UpdateUserDto {
  @IsOptional()
  @IsIn([...ROLES], { message: 'role invalide' })
  role?: Role;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsOptional()
  teamId?: string | null;
}

export class RangeQueryDto {
  @Matches(ISO_DATE, { message: 'from doit être au format YYYY-MM-DD' })
  from!: string;

  @Matches(ISO_DATE, { message: 'to doit être au format YYYY-MM-DD' })
  to!: string;
}

export class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  to?: string;
}
