import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  Product,
  ProductCollection,
  ProductInput,
  collectionSchema,
  formatMoney,
  productListQuery,
  updateCollectionSchema,
  updateProductSchema
} from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError, forbidden } from '../../common/errors';
import { CompanySession, can } from '../../common/session';
import { findOwned } from '../../common/tenant';
import { FilesService } from '../../core/files.service';
import type { Db } from '../../db/client';
import { productCollections, products } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { defined, likePattern } from './util';

type ProductRow = typeof products.$inferSelect;
type UpdateProduct = z.infer<typeof updateProductSchema>;
const PRICE_FIELDS = new Set<keyof UpdateProduct>(['priceMinor', 'oldPriceMinor']);

@Injectable()
export class CatalogService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly files: FilesService,
    private readonly audit: Audit
  ) {}

  /* ───────── Collections ───────── */

  async collections(s: CompanySession): Promise<ProductCollection[]> {
    const rows = await this.db
      .select({ id: productCollections.id, name: productCollections.name, position: productCollections.position, productCount: count(products.id) })
      .from(productCollections)
      .leftJoin(products, eq(products.collectionId, productCollections.id))
      .where(eq(productCollections.companyId, s.companyId))
      .groupBy(productCollections.id)
      .orderBy(asc(productCollections.position), asc(productCollections.name));
    return rows.map(r => ({ ...r, productCount: Number(r.productCount) }));
  }

  private async collection(s: CompanySession, id: string): Promise<ProductCollection> {
    const found = (await this.collections(s)).find(c => c.id === id);
    if (!found) throw new AppError('NOT_FOUND', 'Collection not found.');
    return found;
  }

  async createCollection(s: CompanySession, input: z.infer<typeof collectionSchema>): Promise<ProductCollection> {
    const [row] = await this.db.insert(productCollections).values({ companyId: s.companyId, name: input.name, position: input.position }).returning();
    await this.audit.log(s, { action: 'catalog.collection_create', targetType: 'collection', targetId: row.id, summary: `Added collection “${row.name}”` });
    return { id: row.id, name: row.name, position: row.position, productCount: 0 };
  }

  async updateCollection(s: CompanySession, id: string, input: z.infer<typeof updateCollectionSchema>): Promise<ProductCollection> {
    const row = await findOwned(this.db, productCollections, s.companyId, id, 'Collection');
    const patch = defined(input);
    if (Object.keys(patch).length) await this.db.update(productCollections).set(patch).where(eq(productCollections.id, row.id));
    await this.audit.log(s, { action: 'catalog.collection_update', targetType: 'collection', targetId: row.id, summary: `Changed collection “${patch.name ?? row.name}”` });
    return this.collection(s, row.id);
  }

  async removeCollection(s: CompanySession, id: string): Promise<{ ok: true }> {
    const row = await findOwned(this.db, productCollections, s.companyId, id, 'Collection');
    await this.db.delete(productCollections).where(eq(productCollections.id, row.id));
    await this.audit.log(s, { action: 'catalog.collection_delete', targetType: 'collection', targetId: row.id, summary: `Deleted collection “${row.name}”` });
    return { ok: true };
  }

  /* ───────── Products ───────── */

  private async present(rows: ProductRow[]): Promise<Product[]> {
    if (!rows.length) return [];
    const companyId = rows[0].companyId;
    const cols = await this.db.select().from(productCollections).where(eq(productCollections.companyId, companyId));
    const colName = new Map(cols.map(c => [c.id, c.name]));
    const refs = await this.files.refs(rows.map(r => r.imageFileId).filter((x): x is string => Boolean(x)));
    return rows.map(r => ({
      id: r.id,
      collectionId: r.collectionId,
      collectionName: r.collectionId ? (colName.get(r.collectionId) ?? '') : '',
      name: r.name,
      sku: r.sku,
      price: { amountMinor: r.priceMinor, currency: r.currency },
      oldPrice: r.oldPriceMinor !== null ? { amountMinor: r.oldPriceMinor, currency: r.currency } : null,
      priceUnit: r.priceUnit,
      note: r.note,
      status: r.status,
      imageUrl: r.imageFileId ? (refs.get(r.imageFileId)?.url ?? null) : null,
      imageFileId: r.imageFileId
    }));
  }

  async products(s: CompanySession, q: z.infer<typeof productListQuery>): Promise<Product[]> {
    const rows = await this.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.companyId, s.companyId),
          q.collection === 'none' ? isNull(products.collectionId) : q.collection ? eq(products.collectionId, q.collection) : undefined,
          q.search ? or(ilike(products.name, likePattern(q.search)), ilike(products.sku, likePattern(q.search))) : undefined
        )
      )
      .orderBy(asc(products.name));
    return this.present(rows);
  }

  async product(s: CompanySession, id: string): Promise<Product> {
    return (await this.present([await findOwned(this.db, products, s.companyId, id, 'Product')]))[0];
  }

  private async checkRefs(s: CompanySession, input: { collectionId?: string | null; imageFileId?: string | null }): Promise<void> {
    if (input.collectionId) await findOwned(this.db, productCollections, s.companyId, input.collectionId, 'Collection');
    if (input.imageFileId) {
      const [f] = await this.files.requireUploaded(s.companyId, [input.imageFileId]);
      if (f.kind !== 'image') throw new AppError('BAD_REQUEST', 'The product photo must be an image.');
    }
  }

  async createProduct(s: CompanySession, input: ProductInput): Promise<Product> {
    await this.checkRefs(s, input);
    const [row] = await this.db.insert(products).values({ companyId: s.companyId, ...input }).returning();
    await this.audit.log(s, {
      action: 'catalog.product_create',
      targetType: 'product',
      targetId: row.id,
      summary: `Added product “${row.name}” at ${formatMoney(row.priceMinor, row.currency)}`
    });
    return this.product(s, row.id);
  }

  async updateProduct(s: CompanySession, id: string, input: UpdateProduct): Promise<Product> {
    const row = await findOwned(this.db, products, s.companyId, id, 'Product');
    const patch = defined(input);
    if (s.role !== 'manager') {
      if (!can(s, 'editPrices')) throw forbidden('Your manager has not turned on price editing for you.');
      const other = (Object.keys(patch) as (keyof UpdateProduct)[]).filter(k => !PRICE_FIELDS.has(k));
      if (other.length) throw forbidden('You can change prices only.');
    }
    await this.checkRefs(s, patch);
    if (Object.keys(patch).length) await this.db.update(products).set(patch).where(eq(products.id, row.id));
    const priceChanged = (patch.priceMinor !== undefined && patch.priceMinor !== row.priceMinor) || (patch.oldPriceMinor !== undefined && patch.oldPriceMinor !== row.oldPriceMinor);
    const currency = patch.currency ?? row.currency;
    await this.audit.log(s, {
      action: priceChanged ? 'catalog.price_change' : 'catalog.product_update',
      targetType: 'product',
      targetId: row.id,
      summary: priceChanged
        ? `Changed the price of “${row.name}” from ${formatMoney(row.priceMinor, row.currency)} to ${formatMoney(patch.priceMinor ?? row.priceMinor, currency)}`
        : `Changed product “${patch.name ?? row.name}”`
    });
    return this.product(s, row.id);
  }

  async removeProduct(s: CompanySession, id: string): Promise<{ ok: true }> {
    const row = await findOwned(this.db, products, s.companyId, id, 'Product');
    await this.db.delete(products).where(eq(products.id, row.id));
    await this.audit.log(s, { action: 'catalog.product_delete', targetType: 'product', targetId: row.id, summary: `Deleted product “${row.name}”` });
    return { ok: true };
  }
}
