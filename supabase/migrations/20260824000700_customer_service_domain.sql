-- =====================================================================
-- Adds a domain tag for call-centre / customer-relations work.
--
-- Offshoring and BPO is one of the largest employers of young
-- French- and Spanish-speaking Moroccans, and the whole of
-- moncallcenter.ma falls into it. Without its own tag those listings
-- pile up under "Management & Business", which makes the field filter
-- much less useful for exactly the people who need it most.
-- =====================================================================

insert into public.domains (slug, label_fr, label_en, sort_order) values
  ('customer-service', 'Relation Client & Centres d''appels', 'Customer Service & Call Centres', 175)
on conflict (slug) do update
  set label_fr   = excluded.label_fr,
      label_en   = excluded.label_en,
      sort_order = excluded.sort_order;
