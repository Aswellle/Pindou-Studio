import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'

/**
 * 头像圆形裁剪器 — 自实现,不依赖第三方库。
 * 交互:
 *  - 拖动:鼠标/单指 平移图片
 *  - 缩放:滚轮(PC)/ 双指捏合(移动端),以容器中心为锚点
 *  - 输出:容器中心正方形区域,240×240 webp blob
 * 圆形遮罩 + 外圈暗色,直观展示最终头像范围。
 */
const SIZE = 260          // 容器边长(px)
const OUT_SIZE = 240      // 输出头像边长
const MIN_SCALE_FACTOR = 1
const MAX_SCALE_FACTOR = 5

const AvatarCropper = forwardRef(function AvatarCropper({ imageSrc, onConfirm, onCancel, busy }, ref) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  // 状态:scale(相对 cover 基线的倍率), offset(容器坐标系中图片左上角)
  const [state, setState] = useState({ scale: 1, ox: 0, oy: 0, base: 1 })
  const stateRef = useRef(state)
  stateRef.current = state

  // 拖动状态
  const dragRef = useRef(null) // { startX, startY, startOx, startOy }
  // 双指缩放状态
  const pinchRef = useRef(null) // { startDist, startScale }

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    const { scale, ox, oy, base } = stateRef.current
    const s = base * scale

    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.save()
    // 圆形裁剪区域
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.translate(ox, oy)
    ctx.scale(s, s)
    ctx.drawImage(img, 0, 0)
    ctx.restore()

    // 圆形外暗色遮罩
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, SIZE, SIZE)
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2, true)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fill('evenodd')
    ctx.restore()

    // 圆形边缘
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 0.5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 2
    ctx.stroke()
  }, [])

  // 加载图片并初始化 cover 布局
  useEffect(() => {
    if (!imageSrc) return
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const base = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight)
      setState({
        scale: 1,
        base,
        ox: (SIZE - img.naturalWidth * base) / 2,
        oy: (SIZE - img.naturalHeight * base) / 2,
      })
    }
    img.src = imageSrc
  }, [imageSrc])

  useEffect(() => {
    render()
  }, [state, render])

  // ── 拖动平移 ────────────────────────────────────────────
  const onPointerDown = (e) => {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOx: stateRef.current.ox,
      startOy: stateRef.current.oy,
    }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    setState(prev => ({
      ...prev,
      ox: d.startOx + (e.clientX - d.startX),
      oy: d.startOy + (e.clientY - d.startY),
    }))
  }
  const onPointerUp = () => { dragRef.current = null }

  // ── 滚轮缩放(PC,以容器中心为锚点) ────────────────────────
  const onWheel = (e) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    setState(prev => {
      const next = clamp(prev.scale * factor)
      return zoomAround(prev, next)
    })
  }

  const clamp = (s) => Math.min(MAX_SCALE_FACTOR, Math.max(MIN_SCALE_FACTOR, s))

  const zoomAround = (prev, next) => {
    if (next === prev.scale) return prev
    const cx = SIZE / 2
    const cy = SIZE / 2
    const ratio = next / prev.scale
    return {
      ...prev,
      scale: next,
      ox: cx - (cx - prev.ox) * ratio,
      oy: cy - (cy - prev.oy) * ratio,
    }
  }

  // ── 触摸:单指拖动 / 双指捏合缩放 ──────────────────────────
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        startDist: Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        ),
        startScale: stateRef.current.scale,
      }
      dragRef.current = null
    } else if (e.touches.length === 1) {
      const t = e.touches[0]
      dragRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        startOx: stateRef.current.ox,
        startOy: stateRef.current.oy,
      }
    }
  }
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const next = clamp(pinchRef.current.startScale * (dist / pinchRef.current.startDist))
      setState(prev => zoomAround(prev, next))
    } else if (e.touches.length === 1 && dragRef.current) {
      const t = e.touches[0]
      const d = dragRef.current
      setState(prev => ({
        ...prev,
        ox: d.startOx + (t.clientX - d.startX),
        oy: d.startOy + (t.clientY - d.startY),
      }))
    }
  }
  const onTouchEnd = () => {
    dragRef.current = null
    pinchRef.current = null
  }

  // ── 输出中心正方形区域为 240×240 blob ─────────────────────
  const handleConfirm = () => {
    const img = imgRef.current
    if (!img) return
    const { scale, ox, oy, base } = stateRef.current
    const s = base * scale
    // 容器中心 → 图片坐标
    const cx = (SIZE / 2 - ox) / s
    const cy = (SIZE / 2 - oy) / s
    const r = SIZE / 2 / s
    // 越界保护:限制输出区域在图片内
    const srcX = Math.max(0, Math.min(cx - r, img.naturalWidth - 2 * r))
    const srcY = Math.max(0, Math.min(cy - r, img.naturalHeight - 2 * r))
    const srcR = Math.min(r, img.naturalWidth - srcX, img.naturalHeight - srcY)
    const canvas = document.createElement('canvas')
    canvas.width = OUT_SIZE
    canvas.height = OUT_SIZE
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, srcX, srcY, srcR * 2, srcR * 2, 0, 0, OUT_SIZE, OUT_SIZE)
    canvas.toBlob(blob => { if (blob) onConfirm(blob) }, 'image/webp', 0.9)
  }

  // 暴露输出方法给父组件(确认按钮在父组件)
  useImperativeHandle(ref, () => ({
    output: () => handleConfirm(),
  }))

  return (
    <div className="avatar-cropper">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="avatar-cropper-canvas"
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      />
      <style>{`
        .avatar-cropper {
          position: relative;
          width: 100%;
          max-width: ${SIZE}px;
          aspect-ratio: 1;
          margin: 0 auto;
          background: var(--bg-tertiary);
          border-radius: 50%;
          overflow: hidden;
          user-select: none;
          -webkit-user-select: none;
          cursor: grab;
        }
        .avatar-cropper:active { cursor: grabbing; }
        .avatar-cropper-canvas { display: block; }
      `}</style>
    </div>
  )
})

export default AvatarCropper
