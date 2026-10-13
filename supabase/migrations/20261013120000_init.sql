-- Syk dżungli: wyniki rozgrywek i wznawianie przerwanej gry.
-- Gracz loguje się e-mailem (magic link); e-mail zostaje w auth.users,
-- publicznie widoczny jest tylko nick.

-- ---------------------------------------------------------------
-- players — profil gracza (nick do tabeli wyników)
-- ---------------------------------------------------------------
create table public.players (
  id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nick       text not null unique check (char_length(nick) between 3 and 20),
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;

create policy "players: odczyt dla wszystkich"
  on public.players for select
  to anon, authenticated
  using (true);

create policy "players: gracz zakłada własny profil"
  on public.players for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "players: gracz zmienia własny nick"
  on public.players for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------
-- scores — każda zakończona gra (przegrana lub wygrana)
-- ---------------------------------------------------------------
-- 397 = plansza 20×20 (400 pól) minus 3 segmenty startowe.
create table public.scores (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.players (id) on delete cascade,
  score       int not null check (score between 0 and 397),
  result      text not null check (result in ('over', 'won')),
  duration_ms int not null check (duration_ms >= 0),
  created_at  timestamptz not null default now()
);

create index scores_user_score_idx on public.scores (user_id, score desc);
create index scores_score_idx on public.scores (score desc);

alter table public.scores enable row level security;

create policy "scores: odczyt dla wszystkich"
  on public.scores for select
  to anon, authenticated
  using (true);

-- Wyników nie da się edytować ani kasować — brak polityk update/delete.
create policy "scores: gracz dodaje własny wynik"
  on public.scores for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- saved_games — przerwana gra, najwyżej jedna na gracza
-- ---------------------------------------------------------------
create table public.saved_games (
  user_id    uuid primary key default auth.uid() references public.players (id) on delete cascade,
  state      jsonb not null check (jsonb_typeof(state) = 'object'),
  score      int not null check (score between 0 and 397),
  updated_at timestamptz not null default now()
);

alter table public.saved_games enable row level security;

create policy "saved_games: gracz czyta własny zapis"
  on public.saved_games for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "saved_games: gracz tworzy własny zapis"
  on public.saved_games for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "saved_games: gracz nadpisuje własny zapis"
  on public.saved_games for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "saved_games: gracz kasuje własny zapis"
  on public.saved_games for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- leaderboard — najlepszy wynik każdego gracza z nickiem
-- ---------------------------------------------------------------
-- security_invoker: widok respektuje RLS tabel bazowych.
create view public.leaderboard
with (security_invoker = true) as
select distinct on (s.user_id)
  p.nick,
  s.score,
  s.result,
  s.created_at
from public.scores s
join public.players p on p.id = s.user_id
order by s.user_id, s.score desc, s.created_at asc;

grant select on public.leaderboard to anon, authenticated;
