# -*- coding: utf-8 -*-
"""
通过 Supabase Management API(HTTPS)执行 SQL —— 用于无法直连数据库(5432)的网络环境。
用法:
  python scripts/supabase-query.py --ref <project-ref> --file supabase/migrations/0001_init.sql
  python scripts/supabase-query.py --ref <project-ref> --sql "select 1"
  python scripts/supabase-query.py --ref <project-ref> --sql "select * from public.templates limit 3" --json-output
"""
import argparse
import json
import os
import sys
import urllib.request

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True, help='Supabase project ref')
    ap.add_argument('--file', help='SQL file to execute')
    ap.add_argument('--sql', help='Inline SQL to execute')
    args = ap.parse_args()

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

    sql = ''
    if args.file:
        with open(args.file, encoding='utf-8') as f:
            sql = f.read()
    elif args.sql:
        sql = args.sql
    if not sql.strip():
        print('ERROR: no SQL provided', file=sys.stderr)
        sys.exit(1)

    url = f'https://api.supabase.com/v1/projects/{args.ref}/database/query'
    body = json.dumps({'query': sql}).encode('utf-8')
    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', 'application/json')
    # Cloudflare 会拦截默认的 Python-urllib UA(错误 1010),改用浏览器 UA
    req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36')

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read().decode('utf-8')
            print(f'HTTP {resp.status}')
            if data.strip():
                print(data)
            else:
                print('(empty response — OK)')
    except urllib.error.HTTPError as e:
        print(f'HTTP {e.code}: {e.read().decode("utf-8")}', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
