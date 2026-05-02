create table if not exists public.stock_news_cache (
  ticker text not null,
  data jsonb not null,
  updated_at timestamp with time zone not null default now(),
  constraint stock_news_cache_pkey primary key (ticker)
);

create index if not exists idx_stock_news_cache_updated_at
  on public.stock_news_cache (updated_at);

alter table public.stock_news_cache enable row level security;

create policy "service role only"
  on public.stock_news_cache
  for all
  using (auth.role() = 'service_role');
