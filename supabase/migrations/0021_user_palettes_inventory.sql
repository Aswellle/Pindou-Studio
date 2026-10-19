-- ============================================================
-- 拼豆 Studio 个人色卡与豆子库存(在 Supabase SQL Editor 中执行,幂等可重跑)
-- 表:
--   user_palettes        个人色卡元数据(名称/品牌/系列/豆子直径)
--   user_palette_colors  个人色卡颜色(色号/名称/HEX/排序)
--   user_bead_inventory  库存记录(数量/状态;可关联个人颜色,也可记录内置色卡)
--
-- 权限模型(全部走 RLS,anon 没有任何策略 → 游客不可读写):
--   · 三张表都只允许本人读写(auth.uid() = user_id)
--   · 颜色行必须挂在本人色卡下(不能把别人的 palette_id 填进自己的颜色)
--   · 库存行若关联 palette_color_id,该颜色必须属于本人
--   · 内置色卡的库存用 palette_key('builtin:<paletteId>:<colorId>')记录,
--     palette_color_id 为 null —— 内置色卡不复制进公共表
--
-- 删除语义:删除个人色卡会级联删除其颜色与关联库存;
-- 已保存图纸的 canvasData 只存 HEX,不引用色卡行,因此不会被破坏。
-- ============================================================

-- ── 个人色卡 ────────────────────────────────────────────────
create table if not exists public.user_palettes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  brand_name text,
  series_name text,
  bead_size_mm numeric(4, 2) check (bead_size_mm is null or (bead_size_mm > 0 and bead_size_mm <= 20)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_palettes_user_id_idx on public.user_palettes (user_id);

-- ── 个人色卡颜色 ────────────────────────────────────────────
create table if not exists public.user_palette_colors (
  id uuid primary key default gen_random_uuid(),
  palette_id uuid not null references public.user_palettes (id) on delete cascade,
  -- 冗余 owner:RLS 直接判定,避免每次查询都 join 父表
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 24),
  name text,
  -- 只接受大写 #RRGGBB;客户端写入前会规范化(见 personalPalette.normalizeHex)
  hex text not null check (hex ~ '^#[0-9A-F]{6}$'),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_palette_colors_palette_id_idx on public.user_palette_colors (palette_id);
create index if not exists user_palette_colors_user_id_idx on public.user_palette_colors (user_id);

-- 同一色卡内色号唯一(大小写不敏感):与客户端「重复色号」校验一致
create unique index if not exists user_palette_colors_palette_code_key
  on public.user_palette_colors (palette_id, lower(btrim(code)));

-- ── 库存 ────────────────────────────────────────────────────
create table if not exists public.user_bead_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 个人色卡颜色;内置色卡库存为 null(用 palette_key 记录)
  palette_color_id uuid references public.user_palette_colors (id) on delete cascade,
  -- 稳定键:builtin:<paletteId>:<colorId> | user:<paletteId>:<colorId>
  palette_key text not null,
  -- null = 数量未知(只标记拥有),非负整数 = 已知数量
  quantity integer check (quantity is null or quantity >= 0),
  status text not null default 'owned' check (status in ('owned', 'low', 'out_of_stock')),
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists user_bead_inventory_user_id_idx on public.user_bead_inventory (user_id);
create unique index if not exists user_bead_inventory_user_key_key
  on public.user_bead_inventory (user_id, palette_key);

-- ── 一致性触发器(RLS 之外的防线)───────────────────────────
-- 颜色行的 user_id 必须与父色卡 owner 一致。
-- 触发器函数不用 security definer:以调用者身份执行,RLS 仍然生效;
-- 只有本人色卡能被看到,跨用户写入必然命中「不存在」分支。
create or replace function public.check_palette_color_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.user_palettes p
    where p.id = new.palette_id
      and p.user_id = new.user_id
  ) then
    raise exception 'palette does not belong to the user';
  end if;
  return new;
end;
$$;

drop trigger if exists user_palette_colors_owner_check on public.user_palette_colors;
create trigger user_palette_colors_owner_check
  before insert or update on public.user_palette_colors
  for each row execute procedure public.check_palette_color_owner();

-- 库存行若引用个人颜色,该颜色必须属于同一用户。
create or replace function public.check_inventory_color_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.palette_color_id is not null then
    if not exists (
      select 1
      from public.user_palette_colors c
      join public.user_palettes p on p.id = c.palette_id
      where c.id = new.palette_color_id
        and p.user_id = new.user_id
    ) then
      raise exception 'inventory color does not belong to the user';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_bead_inventory_color_owner on public.user_bead_inventory;
create trigger user_bead_inventory_color_owner
  before insert or update on public.user_bead_inventory
  for each row execute procedure public.check_inventory_color_owner();

-- ── 行级安全(RLS):仅本人可读写 ─────────────────────────────
alter table public.user_palettes enable row level security;
alter table public.user_palette_colors enable row level security;
alter table public.user_bead_inventory enable row level security;

drop policy if exists "user_palettes_own_all" on public.user_palettes;
create policy "user_palettes_own_all"
  on public.user_palettes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 颜色:本人所有 + 父色卡也必须属于本人(防止把别人的 palette_id 填进来)
drop policy if exists "user_palette_colors_own_all" on public.user_palette_colors;
create policy "user_palette_colors_own_all"
  on public.user_palette_colors for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_palettes p
      where p.id = palette_id
        and p.user_id = auth.uid()
    )
  );

-- 库存:仅本人。关联颜色的归属由 check_inventory_color_owner 触发器保证。
drop policy if exists "user_bead_inventory_own_all" on public.user_bead_inventory;
create policy "user_bead_inventory_own_all"
  on public.user_bead_inventory for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- anon 没有任何策略 → 游客既读不到也写不了。
-- 管理员不默认读取用户私有库存(与 works 的隐私边界一致)。
