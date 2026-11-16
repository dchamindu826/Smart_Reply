import { Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  Product,
  ProductCollection,
  collectionSchema,
  productListQuery,
  productSchema,
  updateCollectionSchema,
  updateProductSchema
} from '@smart-reply/shared';
import { Auth, Roles } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody, ZQuery } from '../../common/validation';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}

  @Get('collections')
  collections(@Auth() s: CompanySession): Promise<ProductCollection[]> {
    return this.svc.collections(s);
  }

  @Post('collections')
  @Roles('manager')
  createCollection(@Auth() s: CompanySession, @ZBody(collectionSchema) body: z.infer<typeof collectionSchema>): Promise<ProductCollection> {
    return this.svc.createCollection(s, body);
  }

  @Patch('collections/:id')
  @Roles('manager')
  updateCollection(
    @Auth() s: CompanySession,
    @Param('id') id: string,
    @ZBody(updateCollectionSchema) body: z.infer<typeof updateCollectionSchema>
  ): Promise<ProductCollection> {
    return this.svc.updateCollection(s, id, body);
  }

  @Delete('collections/:id')
  @Roles('manager')
  removeCollection(@Auth() s: CompanySession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.svc.removeCollection(s, id);
  }

  @Get('products')
  products(@Auth() s: CompanySession, @ZQuery(productListQuery) q: z.infer<typeof productListQuery>): Promise<Product[]> {
    return this.svc.products(s, q);
  }

  @Get('products/:id')
  product(@Auth() s: CompanySession, @Param('id') id: string): Promise<Product> {
    return this.svc.product(s, id);
  }

  @Post('products')
  @Roles('manager')
  createProduct(@Auth() s: CompanySession, @ZBody(productSchema) body: z.infer<typeof productSchema>): Promise<Product> {
    return this.svc.createProduct(s, body);
  }

  /** Managers change anything; staff with "edit prices" change the price fields only. */
  @Patch('products/:id')
  updateProduct(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(updateProductSchema) body: z.infer<typeof updateProductSchema>): Promise<Product> {
    return this.svc.updateProduct(s, id, body);
  }

  @Delete('products/:id')
  @Roles('manager')
  removeProduct(@Auth() s: CompanySession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.svc.removeProduct(s, id);
  }
}
