-- supabase/image_cache_schema.sql
-- Simple cache table for fetched image URLs

create table if not exists image_cache (
  query text primary key,
  url text not null,
  provider text,
  created_at timestamptz default now()
);

-- Optional: limit row size or add TTL using postgres policies or scheduled jobs
-- Example index for faster lookup
create index if not exists idx_image_cache_query on image_cache(query);
