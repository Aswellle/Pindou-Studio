#!/bin/bash
# 安装本仓库的 git 钩子到 .git/hooks。
#
# 为什么需要这一步:`.git/hooks/` 不受版本控制,新克隆的仓库不会自动带上
# commit-msg 校验。运行一次本脚本即可启用;钩子本身在 scripts/git-hooks/ 里跟踪。
#
#   bash scripts/install-git-hooks.sh
#
# 已存在同名钩子时先备份为 <name>.bak(不覆盖用户自己的钩子内容)。

set -e
ROOT=$(git rev-parse --show-toplevel)
SRC="$ROOT/scripts/git-hooks"
DST="$ROOT/.git/hooks"

for hook in "$SRC"/*; do
  [ -f "$hook" ] || continue
  name=$(basename "$hook")
  if [ -f "$DST/$name" ] && ! cmp -s "$hook" "$DST/$name"; then
    echo "⚠️  $name 已存在且内容不同,备份为 $name.bak"
    cp "$DST/$name" "$DST/$name.bak"
  fi
  cp "$hook" "$DST/$name"
  chmod +x "$DST/$name"
  echo "✅ 已安装 $name"
done

echo ""
echo "提交信息规则见 CLAUDE.md / AGENTS.md 的「Git 提交规则」。"
