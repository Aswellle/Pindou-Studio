-- ============================================================
-- 模板下载计数去重:匿名/登录均按「主体 + 模板 + 自然日」只计一次
--
-- 0005 的 increment_template_download 对 anon 开放且无任何限制,
-- 任意脚本可以对同一模板无限调用,把 download_count 刷到任意值。
--
-- 本次改成:
--   · 登录用户:主体 = auth.uid();
--   · 游客:主体 = 请求 IP(尽力从请求头提取);
--   · 同一主体、同一模板、同一天只 +1;历史记录保留 7 天用于清理。
-- 拿不到 IP 的匿名请求不计数,避免所有无头流量挤进同一个桶。
--
-- 表在 private schema,API 角色不可达;函数仍以 security definer 执行。
-- 幂等,可重复执行。
-- ============================================================

create table if not exists private.template_download_seen (
  template_id uuid not null,
  subject text not null,
  day date not null default current_date,
  primary key (template_id, subject, day)
);

-- 仅内部使用:从 PostgREST 请求头尽力取客户端 IP;失败返回 null。
create or replace function private.request_ip()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  headers jsonb;
  ip text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
    ip := btrim(coalesce(
      headers ->> 'cf-connecting-ip',
      headers ->> 'x-real-ip',
      headers ->> 'x-forwarded-for',
      ''
    ));
    if ip like '%,%' then
      ip := btrim((string_to_array(ip, ','))[array_length(string_to_array(ip, ','), 1)]);
    end if;
    return nullif(left(ip, 64), '');
  exception when others then
    return null;
  end;
end;
$$;

revoke all on function private.request_ip() from public, anon, authenticated;

create or replace function public.increment_template_download(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
begin
  if p_id is null then
    return;
  end if;

  if not exists (select 1 from public.templates t where t.id = p_id) then
    return;
  end if;

  if auth.uid() is not null then
    v_subject := 'u:' || auth.uid()::text;
  else
    v_subject := 'ip:' || coalesce(private.request_ip(), '');
  end if;

  -- 匿名且拿不到 IP:不计数(无法去重,宁可少计也不给刷量开口)。
  if v_subject = 'ip:' then
    return;
  end if;

  insert into private.template_download_seen(template_id, subject, day)
  values (p_id, v_subject, current_date)
  on conflict do nothing;

  if not found then
    return;
  end if;

  -- 顺手清理 7 天前的去重记录,表大小有界。
  delete from private.template_download_seen where day < current_date - 7;

  update public.templates
  set download_count = coalesce(download_count, 0) + 1
  where id = p_id;
end;
$$;

revoke execute on function public.increment_template_download(uuid) from public;
grant execute on function public.increment_template_download(uuid) to anon, authenticated;

comment on function public.increment_template_download(uuid) is
  '模板下载计数:按登录用户或游客 IP + 模板 + 自然日去重,防止匿名刷量。';
