# -*- coding: utf-8 -*-
"""一次性脚本:用户管理面板 i18n 键(4 语言)。"""
import json

ADD = {
 "zh-CN": {
  "admin": {
   "tab": {"users": "用户管理"},
   "users": {
    "title": "用户仪表盘",
    "privacyNote": "仅展示平台运营所需的注册信息(邮箱/昵称/角色/验证状态/注册时间),不包含密码等敏感数据,不收集行为数据",
    "total": "注册用户",
    "verified": "已验证邮箱",
    "unverified": "未验证邮箱",
    "admins": "管理员",
    "recent30": "近30天新增",
    "searchPlaceholder": "搜索邮箱或昵称",
    "email": "邮箱",
    "nickname": "昵称",
    "role": "角色",
    "status": "验证状态",
    "registeredAt": "注册时间",
    "verifiedYes": "已验证",
    "verifiedNo": "未验证",
    "roleAdmin": "管理员",
    "roleUser": "用户",
    "empty": "暂无匹配用户",
    "loadFailed": "加载失败",
    "pagePrev": "上一页",
    "pageNext": "下一页",
    "pageInfo": "第 {{page}} 页"
   }
  }
 },
 "en-US": {
  "admin": {
   "tab": {"users": "Users"},
   "users": {
    "title": "User Dashboard",
    "privacyNote": "Shows only registration data needed for operations (email/nickname/role/verification/joined). No sensitive data such as passwords, no behavior tracking.",
    "total": "Registered",
    "verified": "Verified Emails",
    "unverified": "Unverified",
    "admins": "Admins",
    "recent30": "New (30d)",
    "searchPlaceholder": "Search email or nickname",
    "email": "Email",
    "nickname": "Nickname",
    "role": "Role",
    "status": "Verification",
    "registeredAt": "Joined",
    "verifiedYes": "Verified",
    "verifiedNo": "Unverified",
    "roleAdmin": "Admin",
    "roleUser": "User",
    "empty": "No matching users",
    "loadFailed": "Load failed",
    "pagePrev": "Prev",
    "pageNext": "Next",
    "pageInfo": "Page {{page}}"
   }
  }
 },
 "ja-JP": {
  "admin": {
   "tab": {"users": "ユーザー管理"},
   "users": {
    "title": "ユーザーダッシュボード",
    "privacyNote": "運営に必要な登録情報のみ表示します(メール/ニックネーム/ロール/認証状態/登録日)。パスワード等の機密情報や行動データは含みません",
    "total": "登録ユーザー",
    "verified": "認証済みメール",
    "unverified": "未認証メール",
    "admins": "管理者",
    "recent30": "30日以内の新規",
    "searchPlaceholder": "メールまたはニックネームで検索",
    "email": "メール",
    "nickname": "ニックネーム",
    "role": "ロール",
    "status": "認証状態",
    "registeredAt": "登録日",
    "verifiedYes": "認証済み",
    "verifiedNo": "未認証",
    "roleAdmin": "管理者",
    "roleUser": "ユーザー",
    "empty": "該当するユーザーがいません",
    "loadFailed": "読み込みに失敗しました",
    "pagePrev": "前へ",
    "pageNext": "次へ",
    "pageInfo": "{{page}} ページ目"
   }
  }
 },
 "ko-KR": {
  "admin": {
   "tab": {"users": "사용자 관리"},
   "users": {
    "title": "사용자 대시보드",
    "privacyNote": "운영에 필요한 등록 정보만 표시합니다(이메일/닉네임/역할/인증 상태/가입일). 비밀번호 등 민감 정보와 행동 데이터는 포함하지 않습니다",
    "total": "등록 사용자",
    "verified": "인증된 이메일",
    "unverified": "미인증 이메일",
    "admins": "관리자",
    "recent30": "최근 30일 신규",
    "searchPlaceholder": "이메일 또는 닉네임 검색",
    "email": "이메일",
    "nickname": "닉네임",
    "role": "역할",
    "status": "인증 상태",
    "registeredAt": "가입일",
    "verifiedYes": "인증됨",
    "verifiedNo": "미인증",
    "roleAdmin": "관리자",
    "roleUser": "사용자",
    "empty": "일치하는 사용자가 없습니다",
    "loadFailed": "로드 실패",
    "pagePrev": "이전",
    "pageNext": "다음",
    "pageInfo": "{{page}}페이지"
   }
  }
 }
}

for loc, add in ADD.items():
    path = "src/i18n/locales/%s.json" % loc
    d = json.load(open(path, encoding="utf-8"))
    for section, vals in add.items():
        for k, v in vals.items():
            if isinstance(v, dict):
                d[section].setdefault(k, {})
                for kk, vv in v.items():
                    d[section][k][kk] = vv
            else:
                d[section][k] = v
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(loc, "OK")
