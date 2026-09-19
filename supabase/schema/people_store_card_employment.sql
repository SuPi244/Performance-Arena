-- Store Card employment classification
-- Source: August 2026 Store Card hidden sheets + official Team Effort reconciliation.
-- Team Effort note: only HPP average. DPC/brigade workers are excluded.

alter table public.people
  add column if not exists employment_type text,
  add column if not exists team_effort_eligible boolean;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='people_employment_type_check'
      and conrelid='public.people'::regclass
  ) then
    alter table public.people
      add constraint people_employment_type_check
      check (employment_type is null or employment_type in ('HPP','DPC'));
  end if;
end $$;

update public.people
set employment_type='DPC', team_effort_eligible=false
where person_key in ('adam-ma','amir-u','filip-s');

update public.people
set employment_type='HPP', team_effort_eligible=true
where person_key in (
  'daniel-s','tomas-p','nataliia-ha','martin-po','pavel-k','ondra','jakub-v',
  'historical-michal-versluis-wolt-com','tereza-ch','michal-g','stanislav-m',
  'historical-miroslava-jaworska-wolt-com','stanislav-g'
);

comment on column public.people.employment_type is
  'Employment class used by Store Card logic. HPP participates in Team Effort; DPC does not.';
comment on column public.people.team_effort_eligible is
  'Explicit Store Card Team Effort inclusion flag.';
