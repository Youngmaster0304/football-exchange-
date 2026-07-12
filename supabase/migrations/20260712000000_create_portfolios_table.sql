-- Create portfolios table for Football Stock Exchange
create table if not exists public.portfolios (
    user_id text primary key,
    cash numeric not null default 10000.0,
    holdings jsonb not null default '{}'::jsonb,
    history jsonb not null default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.portfolios enable row level security;

-- Set up public read and write access policies for global leaderboard and demo users
create policy "Allow public read access"
    on public.portfolios for select
    using (true);

create policy "Allow public insert access"
    on public.portfolios for insert
    with check (true);

create policy "Allow public update access"
    on public.portfolios for update
    using (true)
    with check (true);
