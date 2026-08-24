# Deploying

Everything in the repo runs locally against a plain Postgres. This is what
it takes to put it in front of people.

Budget about 30 minutes. Four accounts, all with usable free tiers:
**Supabase** (database + auth), **Vercel** (the web app), **GitHub**
(the scheduled jobs — already there), and **Resend** (email, only needed
for alerts).

At the end, one command tells you whether it all worked:

```bash
python scripts/smoke_test.py --url https://your-app.vercel.app \
  --database-url "$SUPABASE_DB_URL" \
  --supabase-url https://YOUR-REF.supabase.co \
  --anon-key "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

---

## 1. Database — Supabase

Create a project at [supabase.com](https://supabase.com). Pick a region close
to your users; `eu-west` is the nearest to Morocco.

Apply the migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

Or paste each file in `supabase/migrations/` into the SQL editor **in
filename order**. Never apply anything from `supabase/local-dev/` — that
directory only exists to make a plain Postgres look enough like Supabase to
run the same migrations, and its grants would be wrong here.

Collect three values now; you will need all of them:

| Where | Value |
| --- | --- |
| Settings → API | Project URL — `https://YOUR-REF.supabase.co` |
| Settings → API | `anon` `public` key |
| Settings → Database | Connection string (URI), **session mode** |

The connection string is a database superuser credential. It goes in GitHub
Secrets and nowhere else — never in the web app's environment, and never in
a file you commit.

## 2. Ingestion — fill the database

Nothing is visible until listings exist. Either run it locally once:

```bash
cd scrapers
DATABASE_URL="postgresql://postgres:...@db.YOUR-REF.supabase.co:5432/postgres" \
  python -m morocco_scraper run --all
```

…or set up the GitHub secrets in step 4 first and trigger the **Daily
ingestion** workflow by hand from the Actions tab.

Expect roughly 80 listings across the three sources and two or three minutes
of runtime — the scrapers deliberately sleep between requests.

## 3. Web app — Vercel

Import the repository at [vercel.com/new](https://vercel.com/new).

**Set Root Directory to `web`.** This is the one setting people miss: the
Next.js app is not at the repository root, and without it the build fails
with "no Next.js version detected".

Environment variables (Settings → Environment Variables), for all three
environments:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR-REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon` `public` key |

Both are meant to be public — the anon key only grants what the RLS policies
allow, which is reading the catalogue and nothing else. The service role key
is deliberately **not** used by the web app.

Deploy, then open the URL. You should see listings.

## 4. Scheduled jobs — GitHub

Repository → Settings → Secrets and variables → Actions.

**Secrets**

| Name | Value |
| --- | --- |
| `SUPABASE_DB_URL` | the Postgres connection string from step 1 |
| `RESEND_API_KEY` | from step 6 — leave until then if you are skipping email |

**Variables**

| Name | Value |
| --- | --- |
| `SCRAPER_USER_AGENT` | `TremplinBot/1.0 (+https://your-app.vercel.app)` |
| `SITE_URL` | `https://your-app.vercel.app` |
| `NOTIFIER_FROM` | `Tremplin <alerts@your-domain.ma>` |

Put a real, reachable URL in the user agent. It is how a site owner reaches
you if the crawler ever misbehaves, and it is the difference between being
treated as a good citizen and being blocked.

The workflows then run themselves: **Daily ingestion** at 05:00 UTC (06:00 in
Casablanca), **Notifications** after it finishes, and **CI** on every push.
Trigger any of them by hand from the Actions tab.

## 5. Sign-in

Email magic links work as soon as the project exists — nothing to configure.

**Redirect URLs** (Authentication → URL Configuration) must include your
deployment, or every sign-in link will bounce back to localhost:

- Site URL: `https://your-app.vercel.app`
- Additional redirect URLs: `https://your-app.vercel.app/auth/callback`

Add `https://*-your-team.vercel.app/auth/callback` too if you want sign-in to
work on preview deployments.

**Google** (optional): Authentication → Providers → Google. You need a Google
Cloud OAuth client; Supabase shows the exact callback URL to paste into it.
Until you do this the "Continue with Google" button will error — the email
link is unaffected.

Supabase's built-in email sender is rate-limited to a handful of messages an
hour, which is fine for you and a few testers. Point Authentication → SMTP at
Resend before inviting real users.

## 6. Email alerts — Resend

Sign up at [resend.com](https://resend.com), add your domain, and add the DNS
records it gives you. Sending from an unverified domain will be rejected or
land in spam.

Add `RESEND_API_KEY` to GitHub Secrets and `NOTIFIER_FROM` to Variables, using
an address on the verified domain.

Check it before it emails anyone real:

```bash
cd notifier
DATABASE_URL="$SUPABASE_DB_URL" SITE_URL="https://your-app.vercel.app" \
  python -m morocco_notifier send --all --dry-run
```

That prints the exact messages and rolls back, so nothing is recorded as sent.

## 7. Make yourself an admin

`/admin` returns 404 to everyone, including you, until your profile says
otherwise. Sign in first so the row exists, then in the SQL editor:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

## 8. Check it

```bash
python scripts/smoke_test.py --url https://your-app.vercel.app \
  --database-url "$SUPABASE_DB_URL" \
  --supabase-url https://YOUR-REF.supabase.co \
  --anon-key "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Twenty-three checks across the public pages (all three locales), the RLS
rules and the database. Exit code is 0 only if all of them pass, so it works in CI or a cron. Warnings are
things worth a look, not breakages — "last run partial" usually means one
listing was missing a field, which the admin page will show you.

---

## When something is wrong

| Symptom | Cause |
| --- | --- |
| Build fails, "no Next.js version detected" | Root Directory is not set to `web` |
| "Supabase is not configured yet" | Env vars missing on Vercel, or set for the wrong environment — redeploy after adding them |
| Browse page is empty | No listings yet; run the ingestion workflow |
| Sign-in link opens localhost | Redirect URLs in Supabase still point at localhost |
| `/admin` 404s for you | `is_admin` is not set on your profile row |
| Ingestion fails on one source | Usually the site changed its markup. `/admin` shows which source and the error; the warnings column fills up before a scraper breaks outright |
| Everything closed / nothing "closing soon" | Statuses only refresh when ingestion runs. `python -m morocco_scraper refresh-status` re-derives them |

## Costs

Free tiers cover a project this size comfortably. The things that eventually
cost money, in the order they will:

- **Supabase** pauses a free project after a week of inactivity, and free
  storage is 500 MB — thousands of listings, not a concern soon.
- **Resend** allows 100 emails a day free. One digest per user per day means
  that is roughly 100 active users.
- **Vercel** and **GitHub Actions** free tiers are not close to binding for a
  daily job and a low-traffic site.
