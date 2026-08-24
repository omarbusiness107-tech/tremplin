-- =====================================================================
-- Reference data: domain vocabulary + the source registry.
--
-- Idempotent, so it can be re-applied when a source or domain is added.
-- =====================================================================

insert into public.domains (slug, label_fr, label_en, sort_order) values
  ('ai-data-science',      'IA & Data Science',            'AI & Data Science',            10),
  ('software-it',          'Informatique & Logiciel',      'Software & IT',                20),
  ('engineering',          'Ingénierie',                   'Engineering',                  30),
  ('civil-engineering',    'Génie Civil & BTP',            'Civil Engineering',            40),
  ('energy-environment',   'Énergie & Environnement',      'Energy & Environment',         50),
  ('agriculture',          'Agriculture & Agroalimentaire','Agriculture & Food',           60),
  ('health-medicine',      'Santé & Médecine',             'Health & Medicine',            70),
  ('law',                  'Droit',                        'Law',                          80),
  ('economics-finance',    'Économie & Finance',           'Economics & Finance',          90),
  ('management-business',  'Gestion & Commerce',           'Management & Business',       100),
  ('administration',       'Administration Publique',      'Public Administration',       110),
  ('education-teaching',   'Éducation & Enseignement',     'Education & Teaching',        120),
  ('humanities',           'Lettres & Sciences Humaines',  'Humanities',                  130),
  ('sciences',             'Sciences Fondamentales',       'Fundamental Sciences',        140),
  ('architecture-design',  'Architecture & Design',        'Architecture & Design',       150),
  ('communication-media',  'Communication & Médias',       'Communication & Media',       160),
  ('logistics-transport',  'Logistique & Transport',       'Logistics & Transport',       170),
  ('tourism-hospitality',  'Tourisme & Hôtellerie',        'Tourism & Hospitality',       180),
  ('security-defense',     'Sécurité & Défense',           'Security & Defense',          190),
  ('other',                'Autre',                        'Other',                       999)
on conflict (slug) do update
  set label_fr   = excluded.label_fr,
      label_en   = excluded.label_en,
      sort_order = excluded.sort_order;

insert into public.sources (key, name, homepage_url, category, request_delay_seconds, notes) values
  (
    'emploi_public',
    'Emploi Public (MMSP)',
    'https://www.emploi-public.ma',
    'public_sector',
    2.0,
    'Official Moroccan public-sector concours portal. robots.txt only disallows /*/concours/download/ ; listing and detail pages are permitted.'
  )
on conflict (key) do update
  set name                  = excluded.name,
      homepage_url          = excluded.homepage_url,
      category              = excluded.category,
      request_delay_seconds = excluded.request_delay_seconds,
      notes                 = excluded.notes;
