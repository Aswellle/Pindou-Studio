# -*- coding: utf-8 -*-
"""一次性脚本:个人资料设置菜单的 i18n 键(4 语言)。"""
import json

ADD = {
 "zh-CN": {
  "profile": {
   "title": "个人资料",
   "changeAvatar": "更换头像",
   "uploadAvatar": "上传图片",
   "cropHint": "拖动图片或双指缩放,选取要保留的头像区域",
   "confirmCrop": "确认裁剪",
   "cancelCrop": "重新选择",
   "avatarUpdated": "头像已更新",
   "avatarFailed": "头像上传失败,请重试",
   "nickname": "昵称",
   "nicknamePlaceholder": "给自己起个昵称",
   "saved": "已保存",
   "saveFailed": "保存失败,请重试",
   "resetPassword": "修改密码",
   "resetConfirmTitle": "确认发送重置邮件",
   "resetConfirmText": "将向 {{email}} 发送密码重置邮件。确认发送?",
   "confirmSend": "确认发送",
   "resetSent": "密码重置邮件已发送,请查收邮箱"
  }
 },
 "en-US": {
  "profile": {
   "title": "Profile",
   "changeAvatar": "Change Avatar",
   "uploadAvatar": "Upload Image",
   "cropHint": "Drag or pinch to zoom, select the area to keep",
   "confirmCrop": "Apply Crop",
   "cancelCrop": "Choose Again",
   "avatarUpdated": "Avatar updated",
   "avatarFailed": "Upload failed, please try again",
   "nickname": "Nickname",
   "nicknamePlaceholder": "Pick a nickname",
   "saved": "Saved",
   "saveFailed": "Save failed, please try again",
   "resetPassword": "Change Password",
   "resetConfirmTitle": "Confirm Password Reset",
   "resetConfirmText": "A password reset email will be sent to {{email}}. Send it?",
   "confirmSend": "Send",
   "resetSent": "Password reset email sent. Check your inbox"
  }
 },
 "ja-JP": {
  "profile": {
   "title": "プロフィール",
   "changeAvatar": "アバター変更",
   "uploadAvatar": "画像をアップロード",
   "cropHint": "ドラッグまたはピンチでズームし、残す範囲を選択してください",
   "confirmCrop": "切り抜きを適用",
   "cancelCrop": "選び直す",
   "avatarUpdated": "アバターを更新しました",
   "avatarFailed": "アップロードに失敗しました。もう一度お試しください",
   "nickname": "ニックネーム",
   "nicknamePlaceholder": "ニックネームを入力",
   "saved": "保存しました",
   "saveFailed": "保存に失敗しました。もう一度お試しください",
   "resetPassword": "パスワード変更",
   "resetConfirmTitle": "リセットメールの送信確認",
   "resetConfirmText": "{{email}} にパスワードリセットメールを送信します。送信しますか?",
   "confirmSend": "送信する",
   "resetSent": "パスワードリセットメールを送信しました。メールを確認してください"
  }
 },
 "ko-KR": {
  "profile": {
   "title": "프로필",
   "changeAvatar": "아바타 변경",
   "uploadAvatar": "이미지 업로드",
   "cropHint": "드래그하거나 핀치로 확대하여 유지할 영역을 선택하세요",
   "confirmCrop": "자르기 적용",
   "cancelCrop": "다시 선택",
   "avatarUpdated": "아바타가 업데이트되었습니다",
   "avatarFailed": "업로드 실패, 다시 시도하세요",
   "nickname": "닉네임",
   "nicknamePlaceholder": "닉네임을 입력하세요",
   "saved": "저장됨",
   "saveFailed": "저장 실패, 다시 시도하세요",
   "resetPassword": "비밀번호 변경",
   "resetConfirmTitle": "재설정 메일 보내기 확인",
   "resetConfirmText": "{{email}}로 비밀번호 재설정 메일을 보냅니다. 보내시겠습니까?",
   "confirmSend": "보내기",
   "resetSent": "비밀번호 재설정 메일을 보냈습니다. 메일함을 확인하세요"
  }
 }
}

for loc, add in ADD.items():
    path = "src/i18n/locales/%s.json" % loc
    d = json.load(open(path, encoding="utf-8"))
    for section, vals in add.items():
        d[section] = vals
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(loc, "OK")
