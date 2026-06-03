create table public.signup_rate_limit (
  id bigserial primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index signup_rate_limit_ip_time_idx on public.signup_rate_limit (ip, created_at desc);
alter table public.signup_rate_limit enable row level security;
-- No policies: only the service role (server-side) may read/write.