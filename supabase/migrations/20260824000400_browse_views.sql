-- =====================================================================
-- Facets for the browse page's filter controls.
--
-- A view rather than a client-side distinct: the filter UI only needs the
-- handful of cities that actually have listings, and fetching every row to
-- work that out would grow with the table.
-- =====================================================================

create or replace view public.available_cities as
select
  location_city          as city,
  count(*)::int          as opportunity_count
from public.opportunities
where location_city is not null
  and status <> 'closed'
group by location_city
order by count(*) desc, location_city;

-- Runs as the caller, so the opportunities read policy still applies.
alter view public.available_cities set (security_invoker = on);

comment on view public.available_cities is
  'Cities that currently have open listings, with counts. Backs the city filter.';
