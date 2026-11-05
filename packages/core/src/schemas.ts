import { z } from 'zod'
import {
  BOUNTY_BODY_MAX,
  BOUNTY_BODY_MIN,
  BOUNTY_DURATIONS_DAYS,
  BOUNTY_KIND_RULES,
  BOUNTY_KINDS,
  BOUNTY_MAX_CENTS,
  BOUNTY_MIN_CENTS,
  BOUNTY_NOTE_MAX,
  BOUNTY_REPORT_REASONS,
  BOUNTY_TITLE_MAX,
  CLAIM_BODY_MAX,
  CLAIM_BODY_MIN,
  CLAIM_LINKS_MAX,
  formatZar,
  MENTION,
  normaliseCaseNumber,
} from './bounty'
import { MESSAGE_MAX_LENGTH } from './message'
import { ALERT_SEVERITIES, POST_KINDS, POST_MAX_LENGTH } from './post'

/*
 * Validation schemas live behind their own entry point, `@civic/core/schemas`,
 * so the zod runtime (~500 KB minified) stays out of the web bundle: Metro
 * doesn't tree-shake, and the app only needs the plain helpers from
 * `@civic/core`. The API validates with these.
 */

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
    replyToId: z.uuid().nullish(),
  })
  .refine((input) => input.kind === 'UPDATE' || input.severity, {
    message: 'Alerts and advisories need a severity',
    path: ['severity'],
  })

export type CreatePostInput = z.input<typeof createPostSchema>

export const messageBodySchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, 'Write a message first').max(MESSAGE_MAX_LENGTH, `Keep it under ${MESSAGE_MAX_LENGTH} characters`))

/* Bounties. The numbers come from ./bounty so the app, the API and the terms agree. */

const trimmed = (min: number, max: number, short: string, long: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(min, short).max(max, long))

const noMentions = (what: string) => (value: string, ctx: z.RefinementCtx) => {
  if (MENTION.test(value)) ctx.addIssue({ code: 'custom', message: `Don’t name anyone in the ${what}. A bounty describes an outcome, never a person.` })
}

export const createBountySchema = z
  .object({
    kind: z.enum(BOUNTY_KINDS),
    title: trimmed(8, BOUNTY_TITLE_MAX, 'Give the bounty a clear title', `Keep the title under ${BOUNTY_TITLE_MAX} characters`).superRefine(noMentions('title')),
    body: trimmed(BOUNTY_BODY_MIN, BOUNTY_BODY_MAX, `Describe what happened in at least ${BOUNTY_BODY_MIN} characters`, `Keep it under ${BOUNTY_BODY_MAX} characters`).superRefine(
      noMentions('description'),
    ),
    area: z.string().trim().max(60).nullish(),
    amountCents: z
      .number()
      .int('Whole rands only')
      .min(BOUNTY_MIN_CENTS, `The minimum bounty is ${formatZar(BOUNTY_MIN_CENTS)}`)
      .max(BOUNTY_MAX_CENTS, `The maximum bounty is ${formatZar(BOUNTY_MAX_CENTS)} for now`)
      .refine((cents) => cents % 100 === 0, 'Whole rands only'),
    durationDays: z.number().int().refine((days): days is (typeof BOUNTY_DURATIONS_DAYS)[number] => (BOUNTY_DURATIONS_DAYS as readonly number[]).includes(days), 'Choose 30, 60 or 90 days'),
    sapsCaseNumber: z.string().trim().max(40).nullish(),
    postId: z.uuid().nullish(),
    /** Missing person: the poster is a parent, guardian, spouse/partner or close family member, and has no protection order against them. */
    relationship: z.string().trim().max(60).nullish(),
    termsAccepted: z.literal(true, 'Accept the bounty rules to continue'),
  })
  .superRefine((input, ctx) => {
    const rules = BOUNTY_KIND_RULES[input.kind]
    if (input.sapsCaseNumber && !normaliseCaseNumber(input.sapsCaseNumber)) {
      ctx.addIssue({ code: 'custom', path: ['sapsCaseNumber'], message: 'A SAPS case number looks like CAS 123/11/2026' })
    }
    if (rules.requiresCaseNumber && !input.sapsCaseNumber) {
      ctx.addIssue({ code: 'custom', path: ['sapsCaseNumber'], message: `A ${rules.label.toLowerCase()} bounty needs the SAPS case number` })
    }
    if (input.durationDays > rules.maxDays) {
      ctx.addIssue({ code: 'custom', path: ['durationDays'], message: `A ${rules.label.toLowerCase()} bounty can run for at most ${rules.maxDays} days` })
    }
    if (input.kind === 'MISSING_PERSON' && !input.relationship) {
      ctx.addIssue({ code: 'custom', path: ['relationship'], message: 'Tell us how you know the person' })
    }
  })

export type CreateBountyInput = z.input<typeof createBountySchema>

export const submitClaimSchema = z.object({
  body: trimmed(CLAIM_BODY_MIN, CLAIM_BODY_MAX, `Describe what happened in at least ${CLAIM_BODY_MIN} characters`, `Keep it under ${CLAIM_BODY_MAX} characters`),
  links: z.array(z.url().startsWith('https://', 'Links must start with https://').max(300)).max(CLAIM_LINKS_MAX, `Up to ${CLAIM_LINKS_MAX} links`).default([]),
  attested: z.literal(true, 'Confirm the declaration to continue'),
})

export type SubmitClaimInput = z.input<typeof submitClaimSchema>

export const bountyNoteSchema = trimmed(1, BOUNTY_NOTE_MAX, 'Add a short note', `Keep the note under ${BOUNTY_NOTE_MAX} characters`)

export const payoutAccountSchema = z.object({
  bankCode: z.string().trim().min(1, 'Choose a bank').max(20),
  accountNumber: z
    .string()
    .transform((value) => value.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{6,20}$/, 'Enter the account number, digits only')),
  accountName: trimmed(2, 80, 'Enter the name on the account', 'Keep the name under 80 characters'),
})

export type PayoutAccountInput = z.input<typeof payoutAccountSchema>

export const reportBountySchema = z.object({
  reason: z.enum(BOUNTY_REPORT_REASONS),
  note: z.string().trim().max(BOUNTY_NOTE_MAX).nullish(),
})
