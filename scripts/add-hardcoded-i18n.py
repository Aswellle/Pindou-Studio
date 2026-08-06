# -*- coding: utf-8 -*-
"""一次性脚本:硬编码文本修补的 i18n 键(4 语言)。"""
import json

ADD = {
 "zh-CN": {
  "quantizer": {
   "presets": {
    "29x29": "29 × 29（标准）",
    "57x57": "57 × 57（大图）",
    "114x114": "114 × 114（超大）",
    "140x140": "140 × 140（专业站）",
    "57x29": "57 × 29（横幅）",
    "29x57": "29 × 57（竖幅）",
    "aspect": "按原图比例（指定长边）",
    "custom": "自定义宽×高"
   }
  },
  "errors": {"storageFull": "存储空间已满，请删除部分作品后再保存。"},
  "export": {
   "defaultName": "拼豆图案",
   "legendTitle": "颜色清单",
   "legendTotal": "共 {{n}} 色，{{m}} 粒",
   "groupMajor": "主色（≥5%）",
   "groupMinor": "辅色（1–5%）",
   "groupAccent": "点缀色",
   "groupTrace": "微量色 ⚠ 采购注意",
   "centerBeadMark": "★ = 中心珠"
  }
 },
 "en-US": {
  "quantizer": {
   "presets": {
    "29x29": "29 × 29 (Standard)",
    "57x57": "57 × 57 (Large)",
    "114x114": "114 × 114 (Extra Large)",
    "140x140": "140 × 140 (Pro)",
    "57x29": "57 × 29 (Banner)",
    "29x57": "29 × 57 (Portrait)",
    "aspect": "Aspect ratio (set long edge)",
    "custom": "Custom W×H"
   }
  },
  "errors": {"storageFull": "Storage is full. Delete some works before saving."},
  "export": {
   "defaultName": "Untitled Design",
   "legendTitle": "Color Legend",
   "legendTotal": "{{n}} colors, {{m}} beads",
   "groupMajor": "Major (≥5%)",
   "groupMinor": "Minor (1–5%)",
   "groupAccent": "Accent",
   "groupTrace": "Trace ⚠ buy carefully",
   "centerBeadMark": "★ = Center bead"
  }
 },
 "ja-JP": {
  "quantizer": {
   "presets": {
    "29x29": "29 × 29（標準）",
    "57x57": "57 × 57（大）",
    "114x114": "114 × 114（特大）",
    "140x140": "140 × 140（プロ）",
    "57x29": "57 × 29（バナー）",
    "29x57": "29 × 57（縦長）",
    "aspect": "元の比率（長辺指定）",
    "custom": "カスタム 幅×高さ"
   }
  },
  "errors": {"storageFull": "ストレージ容量がいっぱいです。一部の作品を削除してから保存してください。"},
  "export": {
   "defaultName": "無題のデザイン",
   "legendTitle": "カラーリスト",
   "legendTotal": "{{n}} 色、{{m}} 粒",
   "groupMajor": "メイン（5%以上）",
   "groupMinor": "サブ（1–5%）",
   "groupAccent": "アクセント",
   "groupTrace": "微量 ⚠ 購入注意",
   "centerBeadMark": "★ = 中央ビーズ"
  }
 },
 "ko-KR": {
  "quantizer": {
   "presets": {
    "29x29": "29 × 29（표준）",
    "57x57": "57 × 57（대형）",
    "114x114": "114 × 114（초대형）",
    "140x140": "140 × 140（프로）",
    "57x29": "57 × 29（배너）",
    "29x57": "29 × 57（세로）",
    "aspect": "원본 비율（긴 변 지정）",
    "custom": "사용자 지정 가로×세로"
   }
  },
  "errors": {"storageFull": "저장 공간이 가득 찼습니다. 일부 작품을 삭제한 후 저장하세요."},
  "export": {
   "defaultName": "제목 없는 디자인",
   "legendTitle": "색상 목록",
   "legendTotal": "{{n}}색, {{m}}알",
   "groupMajor": "주요색（≥5%）",
   "groupMinor": "보조색（1–5%）",
   "groupAccent": "포인트색",
   "groupTrace": "미량 ⚠ 구매 주의",
   "centerBeadMark": "★ = 중심 비즈"
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
