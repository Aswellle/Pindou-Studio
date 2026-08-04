# -*- coding: utf-8 -*-
"""一次性脚本:移除旧 PIN 门禁 i18n 键,加入云端/鉴权相关键(4 语言同步)。"""
import json

REMOVE_ADMIN = ['gate.title', 'gate.hint', 'gate.password', 'gate.unlock', 'gate.setTitle',
  'gate.setHint', 'gate.confirm', 'gate.setBtn', 'gate.wrongPin', 'gate.mismatch',
  'gate.tooShort', 'gate.updated', 'changePassword', 'lock', 'changePasswordTitle',
  'oldPassword', 'newPassword', 'confirmNewPassword']

ADD = {
 "zh-CN": {
  "admin": {
   "gate": {"setupTitle": "云端未配置", "setupHint": "请按照 docs/SUPABASE_SETUP.md 完成 Supabase 配置(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)后重新部署,即可使用账号体系与云端模板库",
    "loginTitle": "管理员登录", "loginHint": "请使用管理员账号登录以访问模板库后台(首次使用:注册 → 邮箱验证 → 授予 admin 权限)",
    "loginBtn": "登录 / 注册", "noPermission": "当前账号无管理员权限",
    "noPermissionHint": "只有被标记为 admin 的账号才能访问后台,请与站点管理员联系", "checking": "正在检查登录状态..."},
   "signOut": "退出登录", "resetPassword": "修改密码", "resetSent": "密码重置邮件已发送,请查收邮箱",
   "cloud": {"migrateTitle": "迁移本地数据到云端", "migrateHint": "将内置模板与当前设备 localStorage 中的自定义模板/分类一次性写入云端模板库(可重复执行,不会产生重复)",
    "migrateBtn": "开始迁移", "migrateDone": "迁移完成,共写入 {{n}} 个模板", "migrateFail": "迁移失败:{{detail}}",
    "localCounts": "待迁移:内置 {{builtin}} 个 + 本机自定义 {{custom}} 个"},
   "err": {"dbError": "数据库操作失败:", "cloudNotConfigured": "云端未配置"}
  },
  "gallery": {"cloudLoading": "正在加载云端模板库...", "cloudEmpty": "云端模板库为空", "cloudEmptyHint": "请管理员登录后台,在「模板管理」页完成本地数据迁移"},
  "auth": {"forgotPassword": "忘记密码?", "resetTitle": "重置密码", "resetHint": "输入注册邮箱,我们将发送重置链接",
   "sendReset": "发送重置链接", "resetSent": "重置链接已发送,请查收邮件",
   "verifyEmailTitle": "请验证邮箱", "verifyEmailHint": "注册成功!请前往邮箱点击验证链接后再登录"},
  "errors": {"invalidCredentials": "邮箱或密码错误", "emailNotConfirmed": "邮箱尚未验证,请先点击邮件中的验证链接",
   "emailInUse": "该邮箱已注册", "tooManyAttempts": "尝试过于频繁,请稍后再试", "cloudNotConfigured": "云端未配置,无法使用账号功能"}
 },
 "en-US": {
  "admin": {
   "gate": {"setupTitle": "Cloud Not Configured", "setupHint": "Follow docs/SUPABASE_SETUP.md to configure Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) and redeploy to enable accounts and the cloud template library.",
    "loginTitle": "Admin Login", "loginHint": "Sign in with the admin account to manage the template library (first-time: register, verify email, then grant admin role).",
    "loginBtn": "Login / Sign Up", "noPermission": "No Admin Permission",
    "noPermissionHint": "Only accounts marked as admin can access the backend. Contact the site administrator.", "checking": "Checking session..."},
   "signOut": "Sign Out", "resetPassword": "Change Password", "resetSent": "Password reset email sent. Check your inbox.",
   "cloud": {"migrateTitle": "Migrate Local Data to Cloud", "migrateHint": "Write built-in templates and this device localStorage custom templates/categories into the cloud library (safe to re-run, no duplicates).",
    "migrateBtn": "Start Migration", "migrateDone": "Migration complete: {{n}} templates written", "migrateFail": "Migration failed: {{detail}}",
    "localCounts": "To migrate: {{builtin}} built-in + {{custom}} local custom"},
   "err": {"dbError": "Database operation failed:", "cloudNotConfigured": "Cloud not configured"}
  },
  "gallery": {"cloudLoading": "Loading cloud template library...", "cloudEmpty": "Cloud template library is empty", "cloudEmptyHint": "An admin should sign in and run the local migration on the Templates tab."},
  "auth": {"forgotPassword": "Forgot password?", "resetTitle": "Reset Password", "resetHint": "Enter your registered email and we will send a reset link.",
   "sendReset": "Send Reset Link", "resetSent": "Reset link sent. Check your inbox.",
   "verifyEmailTitle": "Verify Your Email", "verifyEmailHint": "Registration successful! Check your email and click the verification link to sign in."},
  "errors": {"invalidCredentials": "Incorrect email or password", "emailNotConfirmed": "Email not verified yet, click the link in your email first",
   "emailInUse": "This email is already registered", "tooManyAttempts": "Too many attempts. Try again later.", "cloudNotConfigured": "Cloud not configured, accounts are unavailable"}
 },
 "ja-JP": {
  "admin": {
   "gate": {"setupTitle": "クラウド未設定", "setupHint": "docs/SUPABASE_SETUP.md に従って Supabase を設定(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)し、再デプロイするとアカウントとクラウドテンプレートが利用できます。",
    "loginTitle": "管理者ログイン", "loginHint": "管理者アカウントでログインしてテンプレートライブラリを管理してください(初回:登録 → メール認証 → admin 権限付与)",
    "loginBtn": "ログイン / 登録", "noPermission": "管理者権限がありません",
    "noPermissionHint": "admin とマークされたアカウントのみバックエンドにアクセスできます。サイト管理者に連絡してください。", "checking": "セッションを確認中..."},
   "signOut": "ログアウト", "resetPassword": "パスワード変更", "resetSent": "パスワードリセットメールを送信しました。メールを確認してください。",
   "cloud": {"migrateTitle": "ローカルデータをクラウドへ移行", "migrateHint": "内蔵テンプレートとこの端末の localStorage のカスタムテンプレート/カテゴリをクラウドに書き込みます(繰り返し実行しても重複しません)。",
    "migrateBtn": "移行を開始", "migrateDone": "移行完了:{{n}} 件のテンプレートを書き込みました", "migrateFail": "移行に失敗:{{detail}}",
    "localCounts": "移行対象:内蔵 {{builtin}} 件 + ローカルカスタム {{custom}} 件"},
   "err": {"dbError": "データベース操作に失敗:", "cloudNotConfigured": "クラウド未設定"}
  },
  "gallery": {"cloudLoading": "クラウドテンプレートライブラリを読み込み中...", "cloudEmpty": "クラウドテンプレートライブラリは空です", "cloudEmptyHint": "管理者がログインし、「テンプレート管理」タブでローカルデータの移行を実行してください。"},
  "auth": {"forgotPassword": "パスワードをお忘れですか?", "resetTitle": "パスワードリセット", "resetHint": "登録済みのメールアドレスを入力してください。リセットリンクを送信します。",
   "sendReset": "リセットリンクを送信", "resetSent": "リセットリンクを送信しました。メールを確認してください。",
   "verifyEmailTitle": "メールを認証してください", "verifyEmailHint": "登録が完了しました!メールの認証リンクをクリックしてからログインしてください。"},
  "errors": {"invalidCredentials": "メールアドレスまたはパスワードが正しくありません", "emailNotConfirmed": "メールが未認証です。メール内のリンクを先にクリックしてください",
   "emailInUse": "このメールアドレスは既に登録されています", "tooManyAttempts": "試行回数が多すぎます。しばらくしてから再試行してください。", "cloudNotConfigured": "クラウド未設定のためアカウント機能は利用できません"}
 },
 "ko-KR": {
  "admin": {
   "gate": {"setupTitle": "클라우드 미설정", "setupHint": "docs/SUPABASE_SETUP.md에 따라 Supabase를 설정(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)하고 다시 배포하면 계정과 클라우드 템플릿 라이브러리를 사용할 수 있습니다.",
    "loginTitle": "관리자 로그인", "loginHint": "관리자 계정으로 로그인하여 템플릿 라이브러리를 관리하세요(첫 사용: 가입 → 이메일 인증 → admin 권한 부여)",
    "loginBtn": "로그인 / 가입", "noPermission": "관리자 권한이 없습니다",
    "noPermissionHint": "admin으로 표시된 계정만 백엔드에 접근할 수 있습니다. 사이트 관리자에게 문의하세요.", "checking": "세션 확인 중..."},
   "signOut": "로그아웃", "resetPassword": "비밀번호 변경", "resetSent": "비밀번호 재설정 메일을 보냈습니다. 메일함을 확인하세요.",
   "cloud": {"migrateTitle": "로컬 데이터를 클라우드로 마이그레이션", "migrateHint": "내장 템플릿과 이 기기의 localStorage 사용자 정의 템플릿/카테고리를 클라우드에 기록합니다(반복 실행해도 중복되지 않음).",
    "migrateBtn": "마이그레이션 시작", "migrateDone": "마이그레이션 완료: 템플릿 {{n}}개 기록", "migrateFail": "마이그레이션 실패: {{detail}}",
    "localCounts": "마이그레이션 대상: 내장 {{builtin}}개 + 로컬 사용자 정의 {{custom}}개"},
   "err": {"dbError": "데이터베이스 작업 실패:", "cloudNotConfigured": "클라우드 미설정"}
  },
  "gallery": {"cloudLoading": "클라우드 템플릿 라이브러리 로드 중...", "cloudEmpty": "클라우드 템플릿 라이브러리가 비어 있습니다", "cloudEmptyHint": "관리자가 로그인하여 '템플릿 관리' 탭에서 로컬 데이터 마이그레이션을 실행하세요."},
  "auth": {"forgotPassword": "비밀번호를 잊으셨나요?", "resetTitle": "비밀번호 재설정", "resetHint": "가입한 이메일을 입력하면 재설정 링크를 보내드립니다.",
   "sendReset": "재설정 링크 보내기", "resetSent": "재설정 링크를 보냈습니다. 메일함을 확인하세요.",
   "verifyEmailTitle": "이메일을 인증하세요", "verifyEmailHint": "가입 완료! 메일의 인증 링크를 클릭한 후 로그인하세요."},
  "errors": {"invalidCredentials": "이메일 또는 비밀번호가 올바르지 않습니다", "emailNotConfirmed": "이메일이 아직 인증되지 않았습니다. 메일의 링크를 먼저 클릭하세요",
   "emailInUse": "이미 가입된 이메일입니다", "tooManyAttempts": "시도 횟수가 너무 많습니다. 잠시 후 다시 시도하세요.", "cloudNotConfigured": "클라우드 미설정으로 계정 기능을 사용할 수 없습니다"}
 }
}

for loc, add in ADD.items():
    path = "src/i18n/locales/%s.json" % loc
    d = json.load(open(path, encoding="utf-8"))
    for key in REMOVE_ADMIN:
        parts = key.split('.')
        if len(parts) == 2:
            d["admin"].get(parts[0], {}).pop(parts[1], None)
        else:
            d["admin"].pop(parts[0], None)
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
