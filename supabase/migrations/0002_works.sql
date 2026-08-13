-- ============================================================
-- 拼豆 Studio 作品云端同步(在 Supabase SQL Editor 中一次性执行,幂等可重跑)
-- 表: works(用户私有作品,RLS:仅本人可读写)
-- 权限模型:
--   · 每个用户只读写自己的 works(user_id = auth.uid())
--   · 游客不可见/不可写 —— 登录后作品从本机一次性同步到云端
-- ============================================================

-- ── 作品表(云端同步,跨设备) ──────────────────────────────
create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  canvas_data jsonb not null,
  grid_size integer not null,
  grid_width integer,
  grid_height integer,
  palette_id text not null default 'perler',
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists works_user_id_idx on public.works (user_id);

-- 迁移幂等:同用户下 (saved_at, name) 唯一 —— 登录时一次性合并本地作品,
-- 重复执行不产生重复(与 useSavedWorks 的 savedAt+name 去重键对应)
create unique index if not exists works_user_savedat_name_key
  on public.works (user_id, saved_at, name);

-- ── 行级安全(RLS):仅本人可读写 ─────────────────────────────
alter table public.works enable row level security;

drop policy if exists "works_own_all" on public.works;
create policy "works_own_all"
  on public.works for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
