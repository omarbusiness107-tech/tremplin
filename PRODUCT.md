# Tremplin product context

## Product truth

Tremplin is a multilingual web product that helps people discover and act on opportunities in Morocco. It aggregates public listings for jobs, internships, Bachelor and Licence programmes, Master programmes, Doctorates, scholarships, and public-sector concours. Listings are refreshed by a modular scraper pipeline and normalized into one searchable catalogue.

## Primary audience

- Moroccan students choosing their next programme or scholarship.
- Graduates and early-career candidates looking for internships, jobs, and concours.
- French, Arabic, and English readers on mobile and desktop.
- Signed-in users who save opportunities, set preferences, receive recommendations, and manage deadline alerts.

## Core jobs to be done

1. Understand what opportunities are currently open.
2. Search and filter by type, domain, city, deadline, and status.
3. Compare essential facts quickly, especially institution, location, and deadline.
4. Open a complete detail page and continue to the original source to apply.
5. Save relevant opportunities and tune personal recommendations.
6. Monitor the health of source collectors as an administrator.

## Stable information architecture

- Locale home: browse, search, filter, sort, recommendations, and pagination.
- Opportunity detail: description, eligibility, structured facts, source provenance, related opportunities, save and apply actions.
- Saved opportunities.
- Profile and recommendation preferences.
- Sign in through Supabase Auth.
- Collector administration.

## Product constraints

- Preserve French, Arabic, and English routes and bidirectional text behavior.
- Preserve Supabase-backed authentication, bookmarks, preferences, recommendations, catalogue queries, and admin data.
- Preserve source links and the disclaimer that candidates must verify information with the original publisher.
- Treat scraped content as data, not promotional proof. Do not invent statistics, institutions, testimonials, or outcomes.
- Make missing images, empty results, loading, configuration failures, and data errors intentional states.
- Keep search, filtering, saving, applying, and profile controls keyboard accessible with visible focus.
- Respect reduced-motion preferences and WCAG AA contrast for normal text.

## Evidence available in the product

- Live catalogue totals, source totals, and closing-soon counts.
- Real opportunity titles, institutions, cities, deadlines, source provenance, and source-provided logos when available.
- Real source announcements reached through the application link.

## Voice

Direct, useful, calm, and specific. Tremplin should read like a trusted public-interest guide, not a recruiter, a government body, or an aspirational lifestyle brand. Interface copy should avoid hype and avoid implying that every source is official.
