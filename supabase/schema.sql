create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique,
  first_name text not null check (length(first_name) between 1 and 100),
  last_name text not null check (length(last_name) between 1 and 100),
  age smallint not null check (age between 1 and 120),
  email text not null check (length(email) <= 254),
  language text not null check (language in ('en', 'fa')),
  questionnaire_version text not null,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  current_question smallint not null default 0 check (current_question between 0 and 11),
  revision integer not null default 0 check (revision >= 0),
  privacy_notice_version text not null default 'v1',
  consented_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.submissions enable row level security;
revoke all on table public.submissions from anon, authenticated;
grant select, insert, update, delete on table public.submissions to service_role;

create index submissions_started_at_idx on public.submissions (started_at desc, id desc);
