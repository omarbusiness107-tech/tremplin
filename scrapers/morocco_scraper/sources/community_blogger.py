"""Community opportunity sources that expose Blogger JSON feeds."""

from __future__ import annotations

from ..models import OpportunityType
from ..registry import register
from ._blogger_feed import BloggerFeedScraper


@register
class AlMasterMarocScraper(BloggerFeedScraper):
    key = "almaster_maroc"
    name = "AlMaster Maroc — Masters"
    homepage_url = "https://www.almaster-maroc.com"
    DEFAULT_TYPE = OpportunityType.MASTER


@register
class CycleIngenieurMarocScraper(BloggerFeedScraper):
    key = "cycle_ingenieur_maroc"
    name = "Cycle Ingénieur Maroc"
    homepage_url = "https://www.cycle-ingenieur-maroc.com"
    DEFAULT_TYPE = OpportunityType.CONCOURS


@register
class JadidConcoursScraper(BloggerFeedScraper):
    key = "jadid_concours"
    name = "Jadid Concours"
    homepage_url = "https://www.jadid-concours.com"


@register
class AlwadifaMagScraper(BloggerFeedScraper):
    key = "alwadifa_mag"
    name = "Alwadifa Mag"
    homepage_url = "https://www.alwadifa-mag.com"


@register
class Concours24Scraper(BloggerFeedScraper):
    key = "concours24"
    name = "Concours24"
    homepage_url = "https://www.concours24.com"


@register
class MostajadatAlwadifaScraper(BloggerFeedScraper):
    key = "mostajadat_alwadifa"
    name = "Mostajadat Alwadifa"
    homepage_url = "https://www.mostajadat-alwadifa.com"


@register
class BoursesEtudesScraper(BloggerFeedScraper):
    key = "bourses_etudes"
    name = "Bourses Études"
    homepage_url = "https://www.boursesetudes.com"
    DEFAULT_TYPE = OpportunityType.SCHOLARSHIP
    USE_CATEGORY_INSTITUTION = False


@register
class LicenceProfessionnelleMarocScraper(BloggerFeedScraper):
    key = "licence_professionnelle_maroc"
    name = "Licence Professionnelle Maroc"
    homepage_url = "https://www.licence-professionnelle-maroc.com"
    DEFAULT_TYPE = OpportunityType.BACHELOR
