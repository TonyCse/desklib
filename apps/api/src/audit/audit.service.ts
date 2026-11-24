import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Prisma.InputJsonValue;
}

/**
 * Écrit une ligne dans AuditLog. À appeler dans la même transaction que l'action auditée,
 * pour qu'une action ne soit jamais enregistrée sans sa trace, et inversement.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    entry: AuditEntry,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        payload: entry.payload ?? Prisma.JsonNull,
      },
    });
  }
}
