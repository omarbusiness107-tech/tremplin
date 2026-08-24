-- =====================================================================
-- Outbound email bookkeeping.
--
-- One row per (user, opportunity, kind). The unique constraint is the
-- guarantee: nobody is emailed twice about the same opportunity for the
-- same reason, however often the notifier runs.
-- =====================================================================

create type public.notification_kind as enum (
  'new_match',          -- a newly discovered listing matches their profile
  'deadline_reminder'   -- a bookmarked listing is about to close
);

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  kind            public.notification_kind not null,
  -- Row is written before the send is attempted, so a crash mid-send
  -- cannot silently produce a second email later.
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  error           text,

  constraint notifications_once_per_reason unique (user_id, opportunity_id, kind)
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_pending_idx on public.notifications (created_at)
  where sent_at is null;

alter table public.notifications enable row level security;

create policy "Users can read their own notifications"
  on public.notifications for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Superseded by the notifications table, which tracks every kind of send
-- in one place rather than one column per reason.
alter table public.bookmarks drop column if exists reminder_sent_at;
