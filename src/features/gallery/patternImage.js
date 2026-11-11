/**
 * 图纸预览图片(构建期生成、运行时引用)。
 *
 * 为什么需要:整站的图纸缩略图都是 <canvas> 画的。canvas 能看,但图片搜索
 * 读不到 —— Google Images / Discover / 各家「图片」结果只认 <img>。图纸是
 * 这个站最核心的视觉资产,却一张图片都没提交过。
 *
 * 做法:构建期把每张图纸按与缩略图相同的构图(内容包围盒、留缝、近白描边)
 * 画成 PNG,路径带内容指纹;运行时详情页直接引用同一路径,构建脚本与浏览器
 * 用同一个纯函数算尺寸,不会出现「页面引用的图不存在」。
 *
 * 尺寸规则:长边约 720px,且每格是整数像素 —— 非整数格宽会让格子之间出现
 * 1px 接缝(与缩略图摩尔纹同一成因)。所以实际长边是 cell × 内容格数,
 * 落在 720–850 之间;200×200 的大图纸 cell 取 4,总宽 800。
 */

import { contentBox } from '../../utils/patternGeometry.js'
import { patternContentHash } from './patternHash.js'

/** 目标长边(px)。实际尺寸取整到整数格宽,见 patternImageMetrics */
export const PATTERN_IMAGE_MAX = 720

/** 预览图目录。带内容指纹的文件名可以长期缓存,见 vercel.json headers */
export const PATTERN_IMAGE_DIR = '/pattern-img'

/**
 * 预览图的位图尺寸。
 *
 * @param {Array<Array<string|null>>} pattern
 * @param {number} [max] 目标长边
 * @returns {{cell:number,width:number,height:number,box:{x0:number,y0:number,width:number,height:number}}|null}
 */
export function patternImageMetrics(pattern, max = PATTERN_IMAGE_MAX) {
  const box = contentBox(pattern)
  if (!box) return null
  const limit = Math.max(1, Number(max) || PATTERN_IMAGE_MAX)
  const longSide = Math.max(box.width, box.height)
  // 向上取整:图片长边不小于目标值;1 格图案(如单色方块)长边就等于 max
  const cell = Math.max(1, Math.ceil(limit / longSide))
  return { cell, width: cell * box.width, height: cell * box.height, box }
}

/**
 * 站内绝对路径。id 与指纹都编码:模板 id 来自数据库,不能假设是安全字符。
 */
export function patternImagePath(id, hash) {
  return `${PATTERN_IMAGE_DIR}/${encodeURIComponent(String(id))}-${hash}.png`
}

/**
 * 图片替代文本(详情页 <img> 与构建期静态正文共用)。
 *
 * 图片搜索按 alt 判断图里是什么,所以这里要写「什么图案 + 多大 + 多少颗」,
 * 而不是「拼豆图纸」这种所有图片都一样的泛称。
 *
 * @param {string} name 模板展示名
 * @param {number} width 网格宽
 * @param {number} height 网格高
 * @param {number} [beads] 豆子总数
 */
export function patternImageAlt(name, width, height, beads) {
  const title = String(name || '拼豆').trim() || '拼豆'
  const size = width > 0 && height > 0 ? ` · ${width}×${height}` : ''
  const count = beads > 0 ? ` · 共 ${beads} 颗豆子` : ''
  return `${title}拼豆图纸${size}${count}`
}

/**
 * 模板 → 预览图信息;无图案内容时返回 null(调用方退回 canvas 缩略图)。
 *
 * @param {object} template 云端模板(id/name/nameZh/paletteId/pattern)
 * @returns {{src:string,hash:string,cell:number,width:number,height:number,box:object}|null}
 */
export function patternImageFor(template, { max = PATTERN_IMAGE_MAX } = {}) {
  if (!template || template.id == null) return null
  const metrics = patternImageMetrics(template.pattern, max)
  if (!metrics) return null
  const hash = patternContentHash(template)
  return { src: patternImagePath(template.id, hash), hash, ...metrics }
}
