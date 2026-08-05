# -*- coding: utf-8 -*-
"""一次性脚本:邮箱验证码(OTP)流程 i18n 键(4 语言)。"""
import json

ADD = {
 "zh-CN": {
  "auth": {
   "verifyTitle": "邮箱验证",
   "verifyHint": "验证码已发送至 {{email}},请在下方输入(无需打开任何链接)",
   "code": "验证码",
   "codeHint": "6 位数字验证码,请在邮件中查看",
   "verifyBtn": "验证并继续",
   "resend": "重新发送验证码",
   "resendIn": "{{n}} 秒后可重新发送",
   "sendCode": "发送验证码",
   "changeEmail": "更换邮箱",
   "codeInvalid": "验证码格式不正确(应为 6 位数字)",
   "setPasswordTitle": "设置新密码",
   "setPasswordHint": "验证通过,请设置新的登录密码",
   "newPassword": "新密码",
   "setPasswordBtn": "确认设置"
  },
  "errors": {"emailNotFound": "该邮箱尚未注册"},
  "profile": {
   "changePassword": "修改密码",
   "changePasswordTitle": "修改密码",
   "oldPassword": "当前密码",
   "newPassword": "新密码",
   "confirmNewPassword": "确认新密码",
   "oldPasswordRequired": "请输入当前密码",
   "wrongPassword": "当前密码错误",
   "passwordUpdated": "密码已更新"
  }
 },
 "en-US": {
  "auth": {
   "verifyTitle": "Email Verification",
   "verifyHint": "A verification code was sent to {{email}}. Enter it below (no link to open).",
   "code": "Verification code",
   "codeHint": "6-digit code, check your email",
   "verifyBtn": "Verify & Continue",
   "resend": "Resend code",
   "resendIn": "Resend in {{n}}s",
   "sendCode": "Send Code",
   "changeEmail": "Change email",
   "codeInvalid": "Invalid code format (6 digits)",
   "setPasswordTitle": "Set New Password",
   "setPasswordHint": "Verified. Set a new password to sign in.",
   "newPassword": "New password",
   "setPasswordBtn": "Set Password"
  },
  "errors": {"emailNotFound": "This email is not registered"},
  "profile": {
   "changePassword": "Change Password",
   "changePasswordTitle": "Change Password",
   "oldPassword": "Current password",
   "newPassword": "New password",
   "confirmNewPassword": "Confirm new password",
   "oldPasswordRequired": "Enter your current password",
   "wrongPassword": "Current password is incorrect",
   "passwordUpdated": "Password updated"
  }
 },
 "ja-JP": {
  "auth": {
   "verifyTitle": "メール認証",
   "verifyHint": "{{email}} に認証コードを送信しました。下に入力してください(リンクを開く必要はありません)",
   "code": "認証コード",
   "codeHint": "6 桁の数字コードをメールでご確認ください",
   "verifyBtn": "認証して続行",
   "resend": "コードを再送信",
   "resendIn": "{{n}} 秒後に再送信できます",
   "sendCode": "認証コードを送信",
   "changeEmail": "メールを変更",
   "codeInvalid": "認証コードの形式が正しくありません(6 桁の数字)",
   "setPasswordTitle": "新しいパスワードを設定",
   "setPasswordHint": "認証に成功しました。新しいパスワードを設定してください",
   "newPassword": "新しいパスワード",
   "setPasswordBtn": "設定する"
  },
  "errors": {"emailNotFound": "このメールアドレスは登録されていません"},
  "profile": {
   "changePassword": "パスワード変更",
   "changePasswordTitle": "パスワード変更",
   "oldPassword": "現在のパスワード",
   "newPassword": "新しいパスワード",
   "confirmNewPassword": "新しいパスワードの確認",
   "oldPasswordRequired": "現在のパスワードを入力してください",
   "wrongPassword": "現在のパスワードが正しくありません",
   "passwordUpdated": "パスワードを更新しました"
  }
 },
 "ko-KR": {
  "auth": {
   "verifyTitle": "이메일 인증",
   "verifyHint": "{{email}}로 인증 코드를 보냈습니다. 아래에 입력하세요(링크를 열 필요 없음)",
   "code": "인증 코드",
   "codeHint": "6자리 숫자 코드, 이메일에서 확인하세요",
   "verifyBtn": "인증하고 계속",
   "resend": "코드 다시 보내기",
   "resendIn": "{{n}}초 후 재전송 가능",
   "sendCode": "인증 코드 보내기",
   "changeEmail": "이메일 변경",
   "codeInvalid": "인증 코드 형식이 올바르지 않습니다(6자리 숫자)",
   "setPasswordTitle": "새 비밀번호 설정",
   "setPasswordHint": "인증 완료. 새 로그인 비밀번호를 설정하세요.",
   "newPassword": "새 비밀번호",
   "setPasswordBtn": "설정하기"
  },
  "errors": {"emailNotFound": "등록되지 않은 이메일입니다"},
  "profile": {
   "changePassword": "비밀번호 변경",
   "changePasswordTitle": "비밀번호 변경",
   "oldPassword": "현재 비밀번호",
   "newPassword": "새 비밀번호",
   "confirmNewPassword": "새 비밀번호 확인",
   "oldPasswordRequired": "현재 비밀번호를 입력하세요",
   "wrongPassword": "현재 비밀번호가 올바르지 않습니다",
   "passwordUpdated": "비밀번호가 변경되었습니다"
  }
 }
}

for loc, add in ADD.items():
    path = "src/i18n/locales/%s.json" % loc
    d = json.load(open(path, encoding="utf-8"))
    for section, vals in add.items():
        for k, v in vals.items():
            d[section][k] = v
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(loc, "OK")
