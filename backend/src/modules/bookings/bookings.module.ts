/**
 * Appointments made by the AI voice agent (and later by staff). Everyone in the company can see
 * them; managers and staff can mark one done or cancelled.
 */
import { Controller, Get, Injectable, Module, Param, Patch } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { z } from 'zod';
import { Booking, bookingsQuery, formatPhone, updateBookingSchema } from '@smart-reply/shared';
import { Auth } from '../../common/decorators';
import { notFound } from '../../common/errors';
import type { CompanySession } from '../../common/session';
import { ZBody, ZQuery } from '../../common/validation';
import type { Db } from '../../db/client';
import { bookings, contacts } from '../../db/schema';
import { InjectDb } from '../../infra/db';

type BookingRow = typeof bookings.$inferSelect;

@Injectable()
export class BookingsService {
  constructor(@InjectDb() private readonly db: Db) {}

  private async present(rows: BookingRow[]): Promise<Booking[]> {
    const ids = [...new Set(rows.map(r => r.contactId))];
    const cs = ids.length ? await this.db.select().from(contacts).where(inArray(contacts.id, ids)) : [];
    const by = new Map(cs.map(c => [c.id, c]));
    return rows.map(r => {
      const c = by.get(r.contactId);
      return {
        id: r.id,
        contactId: r.contactId,
        contactName: r.customerName || c?.name || c?.profileName || (c?.waId ? formatPhone(c.waId) : 'Customer'),
        contactPhone: c?.waId ? formatPhone(c.waId) : '',
        callId: r.callId,
        service: r.service,
        startsAt: r.startsAt.toISOString(),
        durationMinutes: r.durationMinutes,
        customerName: r.customerName,
        note: r.note,
        status: r.status,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString()
      };
    });
  }

  async list(s: CompanySession, q: z.infer<typeof bookingsQuery>): Promise<Booking[]> {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 24 * 3600_000);
    const rows = await this.db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.companyId, s.companyId),
          gte(bookings.startsAt, from),
          q.to ? lt(bookings.startsAt, new Date(q.to)) : undefined,
          q.contactId ? eq(bookings.contactId, q.contactId) : undefined,
          q.status ? eq(bookings.status, q.status) : undefined
        )
      )
      .orderBy(asc(bookings.startsAt))
      .limit(q.limit);
    return this.present(rows);
  }

  async update(s: CompanySession, id: string, status: Booking['status']): Promise<Booking> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Booking');
    const [row] = await this.db
      .update(bookings)
      .set({ status })
      .where(and(eq(bookings.id, id), eq(bookings.companyId, s.companyId)))
      .returning();
    if (!row) throw notFound('Booking');
    return (await this.present([row]))[0];
  }
}

@Controller('bookings')
export class BookingsController {
  constructor(private readonly svc: BookingsService) {}

  @Get()
  list(@Auth() s: CompanySession, @ZQuery(bookingsQuery) q: z.infer<typeof bookingsQuery>): Promise<Booking[]> {
    return this.svc.list(s, q);
  }

  @Patch(':id')
  update(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(updateBookingSchema) body: z.infer<typeof updateBookingSchema>): Promise<Booking> {
    return this.svc.update(s, id, body.status);
  }
}

@Module({ controllers: [BookingsController], providers: [BookingsService] })
export class BookingsModule {}
