import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from './errors';

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    throw new AppError('VALIDATION_FAILED', `${where}${first?.message ?? 'Invalid input'}`, result.error.issues);
  }
  return result.data;
}

// Zod schemas have a `transform` method, so Nest would mistake a bare schema for a pipe.
// Wrap it in an object before handing it to createParamDecorator.
const bodyDecorator = createParamDecorator((data: { schema: ZodTypeAny }, ctx: ExecutionContext) =>
  parse(data.schema, ctx.switchToHttp().getRequest<Request>().body ?? {})
);
const queryDecorator = createParamDecorator((data: { schema: ZodTypeAny }, ctx: ExecutionContext) =>
  parse(data.schema, ctx.switchToHttp().getRequest<Request>().query ?? {})
);

/** `@ZBody(schema) body: z.infer<typeof schema>` validates the JSON body. */
export const ZBody = (schema: ZodTypeAny): ParameterDecorator => bodyDecorator({ schema });

/** `@ZQuery(schema) q: z.infer<typeof schema>` validates the query string. */
export const ZQuery = (schema: ZodTypeAny): ParameterDecorator => queryDecorator({ schema });
