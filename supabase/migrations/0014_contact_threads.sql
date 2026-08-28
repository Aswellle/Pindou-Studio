-- ============================================================
-- 「联系我们」升级为线程式 IM:一条留言 = 一个参与者(participant_id)的一段对话。
--   · contact_messages 增加 participant_id(登录用户 id 或访客 localStorage UUID)与
--     author('user' | 'admin');用户消息 author='user',管理员回复 author='admin'
--   · 访客凭 participant_id 拉取自己的线程(RPC get_contact_thread,按时间正序),
--     因此重新打开弹层可见历史消息与管理员回复
--   · 管理员回复:admin_reply_contact(security definer + is_admin)补一条 author='admin'
--   · 重写 admin_list_contact_messages(补 participant_id/author 列;不能改返回类型,
--     先 drop 再 create)
-- 幂等,可重复执行。
-- ============================================================

-- ── 线程列 ──────────────────────────────────────────────────
alter table public.contact_messages
  add column if not exists participant_id text,
  add column if not exists author text not null default 'user';

create index if not exists contact_messages_participant_idx
  on public.contact_messages (participant_id, created_at desc);

-- ── 管理员列表:补 participant_id/author(旧签名不允许改返回类型,先 drop) ──
drop function if exists public.admin_list_contact_messages(int);
create function public.admin_list_contact_messages(p_limit int default 30)
returns table (id bigint, participant_id text, email text, author text, message text, created_at timestamptz)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select c.id, c.participant_id, c.email, c.author, c.message, c.created_at
    from public.contact_messages c
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 200);
end;
$$;
revoke execute on function public.admin_list_contact_messages(int) from public;
grant execute on function public.admin_list_contact_messages(int) to authenticated;

-- ── 拉取本人线程(能力即凭证:凭 participant_id,正序聊天流;管理员亦可拉任意线程) ──
create or replace function public.get_contact_thread(p_participant_id text, p_limit int default 60)
returns table (id bigint, author text, message text, created_at timestamptz)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if p_participant_id is null or p_participant_id = '' then
    raise exception 'invalid_participant';
  end if;
  return query
    select c.id, c.author, c.message, c.created_at
    from public.contact_messages c
    where c.participant_id = p_participant_id
    order by c.created_at asc
    limit least(greatest(p_limit, 1), 100);
end;
$$;
revoke execute on function public.get_contact_thread(text, int) from public;
grant execute on function public.get_contact_thread(text, int) to anon, authenticated;

-- ── 管理员回复(补一条 author='admin',挂在同一 participant 线程下) ──
create or replace function public.admin_reply_contact(p_participant_id text, p_message text)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_email text;
  v_msg text := nullif(trim(p_message), '');
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if v_msg is null or length(v_msg) > 2000 then
    raise exception 'invalid_message';
  end if;
  if p_participant_id is null or p_participant_id = '' then
    raise exception 'invalid_participant';
  end if;
  select email into v_email
    from public.contact_messages
    where participant_id = p_participant_id
    order by created_at desc
    limit 1;
  insert into public.contact_messages (participant_id, email, message, author)
  values (p_participant_id, v_email, v_msg, 'admin')
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.admin_reply_contact(text, text) from public;
grant execute on function public.admin_reply_contact(text, text) to authenticated;
