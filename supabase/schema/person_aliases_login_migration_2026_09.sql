-- Picker login migration, September 2026.
-- Wolt switched current Holešovice picker usernames to the same login + trailing "1".
-- These are aliases of the existing people; they must not create new profiles.

insert into public.person_aliases(person_id,alias_type,alias_value,source,confirmed)
select p.id,
       'picker_username',
       p.display_name || '1',
       'login_migration_2026_09',
       true
from public.people p
where p.active=true
  and p.display_name is not null
  and lower(p.display_name) <> 'woltmarketholesovice'
on conflict(alias_type,normalized_value)
do update set
  person_id=excluded.person_id,
  alias_value=excluded.alias_value,
  source=excluded.source,
  confirmed=true;

-- "woltmarketholesovice" / PDF-truncated "woltmark…" is intentionally not
-- represented as a person alias. Parsers treat it as a technical store account.
