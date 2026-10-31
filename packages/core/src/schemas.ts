import { z } from 'zod'
import { ALERT_SEVERITIES, POST_KINDS, POST_MAX_LENGTH } from './post'

/*
 * Validation schemas live behind their own entry point, `@civic/core/schemas`,
 * so the zod runtime (~500 KB minified) stays out of the web bundle: Metro
 * doesn't tree-shake, and the app only needs the plain helpers from
 * `@civic/core`. The API validates with these.
 */

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const createPostSchema = z
  .object({
    body: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, 'Write something first').max(POST_MAX_LENGTH, `Keep it under ${POST_MAX_LENGTH} characters`)),
    kind: z.enum(POST_KINDS).default('UPDATE'),
    severity: z.enum(ALERT_SEVERITIES).nullish(),
    area: z.string().trim().max(60).nullish(),
    category: z.string().trim().max(40).nullish(),
    location: geoPointSchema.nullish(),
    replyToId: z.uuid().nullish(),
  })
  .refine((input) => input.kind === 'UPDATE' || input.severity, {
    message: 'Alerts and advisories need a severity',
    path: ['severity'],
  })

export type CreatePostInput = z.input<typeof createPostSchema>
