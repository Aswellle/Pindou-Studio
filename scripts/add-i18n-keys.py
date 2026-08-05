# -*- coding: utf-8 -*-
"""一次性脚本:添加密码可见性 + 修改密码确认对话框的 i18n 键(4 语言)。"""
import json

ADD = {
 "zh-CN": {
  "auth": {"showPassword": "显示密码", "hidePassword": "隐藏密码"},
  "admin": {
   "resetConfirmTitle": "确认发送重置邮件",
   "resetConfirmText": "将向 {{email}} 发送密码重置邮件。确认发送?",
   "confirmSend": "确认发送"
  }
 },
 "en-US": {
  "auth": {"showPassword": "Show password", "hidePassword": "Hide password"},
  "admin": {
   "resetConfirmTitle": "Confirm Password Reset",
   "resetConfirmText": "A password reset email will be sent to {{email}}. Send it?",
   "confirmSend": "Send"
  }
 },
 "ja-JP": {
  "auth": {"showPassword": "パスワードを表示", "hidePassword": "パスワードを隠す"},
  "admin": {
   "resetConfirmTitle": "リセットメールの送信確認",
   "resetConfirmText": "{{email}} にパスワードリセットメールを送信します。送信しますか?",
   "confirmSend": "送信する"
  }
 },
 "ko-KR": {
  "auth": {"showPassword": "비밀번호 표시", "hidePassword": "비밀번호 숨기기"},
  "admin": {
   "resetConfirmTitle": "재설정 메일 보내기 확인",
   "resetConfirmText": "{{email}}로 비밀번호 재설정 메일을 보냅니다. 보내시겠습니까?",
   "confirmSend": "보내기"
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
