/**
 * useChartImport — 图片图纸识别的工作图与状态编排(浏览器侧)
 *
 * 职责边界:
 *   - 组件负责选择文件、门控、渲染;
 *   - 本 hook 负责「把图片解码到工作分辨率、跑检测、按当前参数重建项目」这类
 *     需要 canvas/DOM 的胶水;
 *   - 识别算法本身全部在 services/chart/*(纯函数),这里不重复实现。
 *
 * 工作分辨率:原图可能很大(手机照片 4000×3000),逐格采样不需要全分辨率。
 * 统一缩到长边 ≤1600px —— 200×200 的图纸每格仍有 8px,采样中心区域足够;
 * 同时把内存占用从 ~48MB 降到 ~10MB,移动端不会因为识别而爆内存。
 * 检测得到的 bounds 与采样都在这套**工作坐标**下进行,比例与原图一致。
 */

import { useCallback, useRef, useState } from 'react'
import { analyzeChart, buildChartProject } from '../services/chart/chartImport'
import { checkImageFile, checkImagePixels } from '../utils/imageGuard'
import { fingerprintImage, loadSession } from '../services/project/chartImportStore'

/** 工作分辨率长边上限 */
export const WORK_MAX_SIDE = 1600

/** 把 File 解码为 { imageData, previewUrl, width, height } */
async function decodeToImageData(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('imageDecodeFailed'))
      el.src = url
    })
    const scale = Math.min(1, WORK_MAX_SIDE / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    return { imageData, width, height, sourceWidth: img.width, sourceHeight: img.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function useChartImport() {
  const [image, setImage] = useState(null) // { imageData, width, height, sourceWidth, sourceHeight }
  const [detection, setDetection] = useState(null)
  const [fileError, setFileError] = useState('')
  const [busy, setBusy] = useState(false)
  // 当前图片的会话 id(图片指纹)。用于把人工修正写回 IndexedDB,
  // 以及判断「重选同一张图」时能否恢复上次的修正。
  const [sessionId, setSessionId] = useState(null)
  // 恢复出来的历史状态:{ cols, rows, paletteId, removeBackground, bounds, overrides }
  // 由组件在挂载后读取一次,用于还原参数与逐格修正。
  const [restored, setRestored] = useState(null)
  // 当前图片的原始 Blob(会话写回 IndexedDB 时需要连同原图一起存)
  const [imageBlob, setImageBlob] = useState(null)
  const genRef = useRef(0)

  const reset = useCallback(() => {
    genRef.current++
    setImage(null)
    setDetection(null)
    setFileError('')
    setBusy(false)
    setSessionId(null)
    setRestored(null)
    setImageBlob(null)
  }, [])

  /**
   * 选择图片:门控 → 解码到工作分辨率 → 自动检测网格 → 查历史修正。
   * @returns {Promise<boolean>} 是否成功进入识别状态
   */
  const loadFile = useCallback(async (file) => {
    if (!file) return false
    const code = checkImageFile(file)
    if (code) {
      setFileError(code)
      return false
    }
    try {
      const head = await file.slice(0, 65536).arrayBuffer()
      const pixelCode = checkImagePixels(head)
      if (pixelCode) {
        setFileError(pixelCode)
        return false
      }
    } catch {
      // 文件头读不出来不阻断,解码阶段会自然失败并给出提示
    }

    const gen = ++genRef.current
    setBusy(true)
    setFileError('')
    setRestored(null)
    try {
      const fp = await fingerprintImage(file)
      const decoded = await decodeToImageData(file)
      if (gen !== genRef.current) return false // 期间换了图片/取消了
      const result = analyzeChart(decoded.imageData)
      // 检测失败也要给一个可用边界(整张图),否则用户连手动设置列数/行数都做不了。
      // status 仍保留 'failed' + reason,UI 据此提示「请手动设置网格」。
      const withBounds = result.bounds
        ? result
        : { ...result, bounds: { x0: 0, y0: 0, x1: decoded.width, y1: decoded.height } }

      // 同一张图重新导入:取回上次的参数与逐格修正。
      // 读不到(首次导入 / IndexedDB 不可用)就按全新会话处理。
      const saved = await loadSession(fp)
      if (gen !== genRef.current) return false

      setSessionId(fp)
      setImage(decoded)
      setImageBlob(file)
      setDetection(withBounds)
      if (saved?.state) {
        setRestored(saved.state)
        // 历史边界属于同一张图,直接沿用;否则用本次自动检测结果
        if (saved.state.bounds) {
          setDetection({ ...withBounds, bounds: saved.state.bounds })
        }
      }
      return true
    } catch {
      if (gen === genRef.current) setFileError('decodeFailed')
      return false
    } finally {
      if (gen === genRef.current) setBusy(false)
    }
  }, [])

  /** 用户手动改列数/行数:保留图片与边界,只改网格参数 */
  const applyManualGrid = useCallback((cols, rows) => {
    setDetection((prev) => {
      if (!prev?.bounds) return prev
      return { ...prev, ok: true, status: 'manual', cols, rows, reason: undefined }
    })
  }, [])

  /** 用户手动调整网格边界(工作坐标,0–1 归一化比例) */
  const applyManualBounds = useCallback((bounds) => {
    setDetection((prev) => (prev ? { ...prev, bounds } : prev))
  }, [])

  /**
   * 按当前图片/边界/参数生成项目。
   * @param {Object} params - 见 buildChartProject,imageData/bounds/cols/rows 由本 hook 补
   */
  const build = useCallback((params) => {
    if (!image || !detection?.bounds) {
      return { ok: false, errors: [{ code: 'chartNoImage' }] }
    }
    return buildChartProject({
      imageData: image.imageData,
      bounds: detection.bounds,
      cols: detection.cols,
      rows: detection.rows,
      ...params,
    })
  }, [image, detection])

  return {
    image,
    detection,
    fileError,
    busy,
    sessionId,
    restored,
    imageBlob,
    loadFile,
    applyManualGrid,
    applyManualBounds,
    build,
    reset,
  }
}
