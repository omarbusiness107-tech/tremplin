-- =====================================================================
-- "Recommended for you"
--
-- Scoring lives in SQL so ranking happens next to the data instead of
-- fetching every open listing to sort it in the app. Weights are plain
-- integers on purpose: the result is explainable, and `match_reasons`
-- hands the UI the actual reasons rather than an opaque number.
-- =====================================================================

-- The enum's declaration order puts `other` last, which is meaningless as
-- a level, so ranking goes through an explicit mapping.
create or replace function public.education_rank(p_level public.education_level)
returns integer
language sql
immutable
as $$
  select case p_level
    when 'bac'        then 1
    when 'bac_plus_2' then 2
    when 'licence'    then 3
    when 'master'     then 4
    when 'doctorat'   then 5
    else 0                       -- 'other' and null: unknown, not lowest
  end;
$$;

create or replace function public.recommended_opportunities(p_limit integer default 12)
returns table (
  opportunity   public.opportunities,
  match_score   integer,
  match_reasons text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  -- Joined rather than read through scalar subqueries: the arrays are then
  -- plain array values (`= any(me.target_types)`), and an empty profile
  -- yields no rows at all, so "no preferences" needs no separate guard.
  with me as (
    select *
      from public.user_preferences
     where user_id = auth.uid()
       and (
         education_level is not null
         or cardinality(fields_of_interest) > 0
         or cardinality(target_types) > 0
         or cardinality(preferred_cities) > 0
       )
  ),
  scored as (
    select
      o,
      -- Type is the strongest signal: someone looking for a Master is not
      -- served by a perfectly on-topic job posting.
      (case when o.type = any(me.target_types) then 4 else 0 end)
      -- Field overlap, capped so a listing tagged with three of someone's
      -- interests cannot outweigh everything else.
      + least(6, 3 * (
          select count(*) from unnest(o.domains) d where d = any(me.fields_of_interest)
        ))
      + (case
           when o.is_remote and me.open_to_remote then 2
           when o.location_city = any(me.preferred_cities) then 2
           else 0
         end)
      -- Meeting the stated requirement helps; falling short of it hurts,
      -- so unreachable listings sink instead of merely not rising.
      + (case
           when o.required_education_level is null then 0
           when public.education_rank(me.education_level) = 0 then 0
           when public.education_rank(me.education_level)
                >= public.education_rank(o.required_education_level) then 3
           else -2
         end)
      -- A small nudge towards what is still actionable.
      + (case when o.deadline is not null
                   and o.deadline < now() + interval '30 days' then 1 else 0 end)
        as score,
      -- Ordered most specific first: the UI shows the leading reason, and
      -- "matches the type you want" is true of nearly every recommendation,
      -- so it would otherwise be the only thing anyone ever sees.
      array_remove(array[
        case when exists (
               select 1 from unnest(o.domains) d where d = any(me.fields_of_interest)
             ) then 'In one of your fields' end,
        case when o.is_remote and me.open_to_remote then 'Remote'
             when o.location_city = any(me.preferred_cities) then 'In a city you chose' end,
        case when o.required_education_level is not null
                  and public.education_rank(me.education_level) > 0
                  and public.education_rank(me.education_level)
                      >= public.education_rank(o.required_education_level)
             then 'You meet the education requirement' end,
        case when o.type = any(me.target_types)
             then 'Matches the type you are looking for' end
      ], null) as reasons
    from public.opportunities o
    cross join me
    where o.status in ('open', 'closing_soon', 'unknown')
  )
  select s.o, s.score, s.reasons
    from scored s
   where s.score > 0
   order by s.score desc, (s.o).deadline asc nulls last
   limit greatest(1, least(p_limit, 50));
$$;

comment on function public.recommended_opportunities(integer) is
  'Ranks open opportunities against the calling user''s preferences. Returns nothing when the profile is empty.';
