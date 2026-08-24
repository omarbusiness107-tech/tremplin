-- =====================================================================
-- Arabic labels for the domain vocabulary.
--
-- The interface is French, English and Arabic, and domain tags appear on
-- every card and in the field filter. Without a third label column an
-- Arabic reader gets a French tag on an otherwise Arabic page.
-- =====================================================================

alter table public.domains add column if not exists label_ar text;

update public.domains set label_ar = v.label_ar
from (values
  ('ai-data-science',      'الذكاء الاصطناعي وعلوم البيانات'),
  ('software-it',          'المعلوميات والبرمجيات'),
  ('engineering',          'الهندسة'),
  ('civil-engineering',    'الهندسة المدنية والبناء'),
  ('energy-environment',   'الطاقة والبيئة'),
  ('agriculture',          'الفلاحة والصناعات الغذائية'),
  ('health-medicine',      'الصحة والطب'),
  ('law',                  'القانون'),
  ('economics-finance',    'الاقتصاد والمالية'),
  ('management-business',  'التدبير والتجارة'),
  ('administration',       'الإدارة العمومية'),
  ('education-teaching',   'التربية والتعليم'),
  ('humanities',           'الآداب والعلوم الإنسانية'),
  ('sciences',             'العلوم الأساسية'),
  ('architecture-design',  'الهندسة المعمارية والتصميم'),
  ('communication-media',  'الاتصال والإعلام'),
  ('logistics-transport',  'اللوجستيك والنقل'),
  ('tourism-hospitality',  'السياحة والفندقة'),
  ('security-defense',     'الأمن والدفاع'),
  ('customer-service',     'علاقات الزبناء ومراكز الاتصال'),
  ('other',                'أخرى')
) as v(slug, label_ar)
where domains.slug = v.slug;

-- Every seeded domain must have one; a missing label would render as a
-- blank chip rather than falling back to anything sensible.
alter table public.domains alter column label_ar set not null;
