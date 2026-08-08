# -*- coding: utf-8 -*-
"""
通过 Supabase Management API 查看/更新 Auth 配置(含邮件模板)。
用法:
  python scripts/supabase-auth-config.py --ref <ref> --get
  python scripts/supabase-auth-config.py --ref <ref> --set-templates <模板json文件>
  python scripts/supabase-auth-config.py --ref <ref> --verify
"""
import argparse
import json
import os
import sys
import urllib.request

API = 'https://api.supabase.com/v1'

def get_token():
    token = os.environ.get('SUPABASE_ACCESS_TOKEN', '')
    if not token:
        for p in [os.path.expanduser('~/.supabase/access-token'),
                  os.path.join(os.environ.get('APPDATA', ''), 'supabase', 'access-token'),
                  os.path.join(os.environ.get('LOCALAPPDATA', ''), 'supabase', 'access-token')]:
            if os.path.exists(p):
                with open(p, encoding='utf-8') as f:
                    token = f.read().strip()
                break
    if not token:
        print('ERROR: access token not found (set SUPABASE_ACCESS_TOKEN)', file=sys.stderr)
        sys.exit(1)
    return token

def request(method, url, token, body=None):
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36')
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    else:
        data = None
    try:
        with urllib.request.urlopen(req, data=data, timeout=60) as resp:
            raw = resp.read().decode('utf-8')
            return resp.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        print(f'HTTP {e.code}: {e.read().decode("utf-8")}', file=sys.stderr)
        sys.exit(1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True)
    ap.add_argument('--get', action='store_true', help='打印当前 auth 配置')
    ap.add_argument('--set-templates', metavar='FILE', help='从 JSON 文件更新 MAILER_TEMPLATES_*')
    ap.add_argument('--verify', action='store_true', help='打印当前模板与 SMTP 状态')
    args = ap.parse_args()

    token = get_token()
    url = f'{API}/projects/{args.ref}/config/auth'

    if args.get or args.verify:
        status, cfg = request('GET', url, token)
        print(f'HTTP {status}')
        # 一律按白名单输出(此前 --get 全量 dump 含 SMTP 密码等敏感字段会进终端/CI 日志)
        for k in ['site_url', 'mailer_autoconfirm', 'mailer_secure_email_change_enabled',
                  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_sender_name', 'smtp_admin_email']:
            if k in cfg:
                print(f'{k} = {cfg[k]}')
        if args.verify:
            templates = cfg.get('mailer_templates') or {}
            for name, tpl in templates.items():
                print(f'\n--- {name} ---')
                print(f'subject: {tpl.get("subject")}')
                print(f'content_type: {tpl.get("content_type")}')
                print(f'content: {tpl.get("content", "")[:200]}...')
        return

    if args.set_templates:
        with open(args.set_templates, encoding='utf-8') as f:
            payload = json.load(f)
        # 仅 PATCH 提供的字段(Management API 部分更新语义;
        # 不可合并完整配置 —— 其中 auth hooks 字段在免费组织不可配置会 402)
        status, res = request('PATCH', url, token, payload)
        print(f'HTTP {status}')
        print(json.dumps(res, ensure_ascii=False, indent=2)[:2000])
        return

    print('no action specified')

if __name__ == '__main__':
    main()
