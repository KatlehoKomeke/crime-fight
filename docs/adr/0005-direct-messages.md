# ADR 0005 — Direct messages: Postgres for storage, AppSync Events for delivery

- **Status:** Accepted (November 2026)

## Goal

Instant one-to-one messages on web, iOS and Android: a message appears in the other person's open thread, inbox and unread badge as soon as it is sent, with no servers to run and nothing to pay while nobody is connected.

## Product rules

| Rule | Why |
| --- | --- |
| **Only people who follow each other can message.** Checked on every send, not just when a conversation starts. | Officials, newsrooms and support services can't be flooded by strangers, and nobody has to moderate a requests inbox. Unfollowing someone also stops them messaging you. |
| **The history stays readable after an unfollow.** The composer is replaced by a notice. | People keep a record of what was said, e.g. for a report. |
| **One-to-one for now.** | Membership is a table (`conversation_members`), so group conversations (neighbourhood watch) need no data migration. |
| **Personal details warn, never block**, in messages and posts alike. | Sharing a number with a support service can be the whole point. The composer flags ID numbers, card numbers, phone numbers, emails and addresses as you type, worded for the audience (`checkPrivacy(text, 'private')`), and the author decides. |

## Data

`conversations` (`direct_key` unique per pair, `last_message_at` orders the inbox) · `conversation_members` (`last_read_at` read marker) · `messages` (keyset index on `conversation_id, created_at desc, id desc`).

- **Unread** means newer than your read marker. Sending moves your own marker, so your messages are never unread to you; the badge counts conversations, not messages.
- **Marking read** moves the marker to the stored `last_message_at`, not to the clock, so a message committing at the same moment is never marked read unseen.
- A conversation opened but never written to stays out of both inboxes.

## Real-time delivery

| Option | Verdict |
| --- | --- |
| **AWS AppSync Events** ✅ | Managed WebSockets in af-south-1. Clients connect and subscribe with their Cognito ID token; a per-namespace `onSubscribe` handler (APPSYNC_JS) limits each user to their own channel; only IAM may publish, over HTTPS. No connection table, no Lambda per message, nothing billed while idle. CDK has L2 constructs (`EventApi`, `ChannelNamespace`). |
| API Gateway WebSocket API | Needs `$connect`/`$disconnect` Lambdas, a connections table, fan-out code and a Lambda invocation per delivered message. |
| GraphQL subscriptions (SSE) from Yoga | API Gateway and Lambda end requests after 29 s; long-lived connections would need always-on compute (ECS). |
| Polling | Not instant, and it would keep QA's Aurora from pausing. |

```
send ─► GraphQL Lambda ─► Postgres: insert, bump the inbox, move the sender's read marker
                     └──► for each member: run the app's `Inbox` subscription as that member
                          ─► POST /event (SigV4) ─► AppSync Events ─► /inbox/<sub> ─► app ─► Graphcache
```

- **Channels** are `/inbox/<Cognito sub>`. The handler rejects any other channel: `ctx.info.channel.path !== '/inbox/' + ctx.identity.sub`. The API exposes your channel as `viewer.inboxChannel` (owner only).
- **Events are GraphQL results.** The API takes the app's own `subscription Inbox` from the persisted-operation manifest and executes it once per recipient, as that recipient (`ctx.as(user)`). Viewer-specific fields (`isMine`, unread counts) are right for each person, and urql's `subscriptionExchange` feeds the result through the normalised cache like any other response. `sendMessage` and `markConversationRead` return the same `InboxEvent` shape, so one cache updater handles a sent message, a received one and a read on another device. Nothing is refetched.
- **Contract:** like persisted operations, the `Inbox` document may only grow. Installed apps keep reading the shape they shipped with.
- **Best effort:** a failed publish is logged; the message is already stored. The app refetches its inbox, badge and open thread whenever its connection comes back, and reconnects with jittered backoff and a fresh token.
- **Locally**, the dev API serves the same protocol at `ws://localhost:4000/event/realtime` from an in-memory hub, with the same own-channel rule, so the app's realtime client runs unchanged. The API tests use that hub to assert what each member receives.
- **The client** is under 200 lines (`apps/app/src/lib/realtime.ts`) rather than Amplify, to keep the web bundle small.

## Not done yet (recommended next)

- **Push notifications** when the app is closed (Expo push → APNs/FCM), sent from the same place the API publishes.
- **Read receipts and typing indicators.** The read marker already exists; typing would need a namespace that signed-in users may publish to, validated by `onPublish`.
- **Blocking and reporting** a conversation, deleting messages, and a retention policy.
- **Group conversations.**
- **Real-time alerts** can reuse this pipe: an `alerts` namespace any signed-in client may subscribe to.
