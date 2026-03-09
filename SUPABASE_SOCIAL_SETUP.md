# Supabase Social/Friends Setup

## Environment Variables

Set these in local `.env.local` and Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do **not** expose `SUPABASE_SERVICE_ROLE_KEY` to the client.

## Apply Migration

Run the SQL migration:

- `supabase/migrations/20260309_000001_social_friends_system.sql`
- `supabase/migrations/20260309_000002_social_usernames.sql`
- `supabase/migrations/20260310_000003_social_username_custom_flag.sql`
- `supabase/migrations/20260310_000004_social_shared_stats_details.sql`

This creates:

- `app_users`
- `privacy_settings`
- `friend_requests`
- `friendships`
- `shared_stats_snapshots`
- indexes, constraints, helper functions, `accept_friend_request(...)`, and RLS policies.

## Added Server APIs

All APIs require `Authorization: Bearer <google_access_token>`.

- `GET /api/social/me` -> provision/check internal user
- `PATCH /api/social/me` body `{ "username": "your_name" }` -> set/change custom username
- `GET /api/social/friends` -> list confirmed friends (+ friend-visible stats)
- `GET /api/social/requests` -> incoming/outgoing pending requests
- `POST /api/social/requests` actions:
  - `{ "action": "send", "recipientUsername": "..." }` (username; accepts optional legacy email input too)
  - `{ "action": "accept", "requestId": 123 }`
  - `{ "action": "decline", "requestId": 123 }`
  - `{ "action": "cancel", "requestId": 123 }`
- `DELETE /api/social/friendships/:friendId` -> remove friend
- `GET /api/social/privacy` -> read privacy settings
- `PATCH /api/social/privacy` -> update privacy settings
- `GET /api/social/profile/:userId` -> privacy-aware profile/stats for viewer
- `POST /api/social/snapshot` -> upsert sanitized shared stats snapshot

## Snapshot Integration Point

Snapshot upsert is integrated in:

- `src/hooks/useAnalyticsHistory.ts`

It auto-posts a sanitized stats payload (throttled) when analytics change and user has a Google access token.

## Notes

- Private planner/task data remains local (Dexie + Google Drive backup as before).
- Supabase stores only social metadata + sanitized stats snapshots.
- Friendship model is canonical (`user_low_id`, `user_high_id`) to prevent reverse duplicates.
