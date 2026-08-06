# -*- coding: utf-8 -*-
"""扫描 src 中硬编码的中文字符串(排除 i18n locales 与测试文件)。"""
import os
import re

cjk = re.compile(r'[一-鿿]')
results = {}
for root, dirs, files in os.walk('src'):
    dirs[:] = [d for d in dirs if d not in ('i18n', 'node_modules')]
    for f in files:
        if not (f.endswith('.jsx') or f.endswith('.js')) or '.test.' in f:
            continue
        path = os.path.join(root, f)
        try:
            text = open(path, encoding='utf-8').read()
        except Exception:
            continue
        n = len(cjk.findall(text))
        if n:
            results[path] = n

for p, n in sorted(results.items(), key=lambda x: -x[1]):
    print('%5d  %s' % (n, p))
