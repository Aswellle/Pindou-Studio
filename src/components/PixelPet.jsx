import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPetCorpus, PICK } from '../data/pet'
import { poseGrid, PET_W, PET_H, C, CELL, GAP, GRID_W, GRID_H } from '../data/petSprite'

/*
 * 拼豆爱宠「豆豆」— 柯基,站点内陪伴宠物(仅 PC/桌面端渲染)。
 * - 以「豆子」逐格绘制(canvas,每格一颗珠、6px + 1px 间隙 → 拼豆网格感)
 * - 在浏览器视口底部的边界线上行走,初始在最右侧蜷睡 → 醒 → 抖擞 → 左行走走停停
 * - 交互:鼠标悬浮 / 点击(走动时几率汪汪叫 + 动画)、点击太多次 → 无奈回应
 * - 像素风消息气泡,语料按语言分文件(pet.{zh,en,ja,ko}.js)
 * - respects prefers-reduced-motion(不行走,仅停留发声)
 * 精灵绘制见 ../data/petSprite.js
 */

// 行为时间线(毫秒)
const SLEEP_MS = 3600
const WAKE_MS = 1500
const WALK_STRIDE_MS = 430   // 走一段
const WALK_PAUSE_MS = 720    // 停一会(走走停停)
const SELF_CD_MIN = 9000
const SELF_CD_MAX = 16000
const BUBBLE_MS = 3800
const BARK_CHANCE = 0.55
const ANNOY_THRESHOLD = 4

/* ── 组件 ──────────────────────────────────────────────── */
export default function PixelPet() {
  const { i18n } = useTranslation()
  const corpusRef = useRef(getPetCorpus(i18n.language))
  useEffect(() => { corpusRef.current = getPetCorpus(i18n.language) }, [i18n.language])

  const canvasRef = useRef(null)
  const [bubble, setBubble] = useState(null)     // { text, type, id }

  // 动画状态(存 ref,避免每帧 re-render)
  const S = useRef({
    x: 0, facing: -1, pose: 'sleep', frame: 0,
    phase: 'sleep',           // sleep | wake | idle | walk
    last: 0,                // 上次 rAF 时间
    elapsed: 0,             // 距睡觉开始
    walkTimer: 0, idleTimer: 0, selfCd: 0,
    sleepStart: performance.now(),
    maxX: 0, clicks: 0, clickReset: 0,
    reduced: false, seed: Math.floor(Math.random() * 1e6),
  })

  // 气泡展示 + 计时关闭
  const showBubble = (text, type) => {
    setBubble({ text, type, id: S.current.seed + (++S.current.frame) })
    clearTimeout(S.current._bt)
    S.current._bt = setTimeout(() => setBubble(null), BUBBLE_MS)
  }

  const render = (g) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return // jsdom / 无 canvas 上下文时兜底,避免测试或异常环境崩溃
    ctx.clearRect(0, 0, PET_W, PET_H)
    // 落地阴影(软椭圆)
    ctx.fillStyle = 'rgba(43,36,32,0.14)'
    ctx.beginPath()
    ctx.ellipse(PET_W / 2, PET_H - 2, PET_W * 0.36, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    // 逐格画珠
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const c = g[y][x]
        if (!c) continue
        ctx.fillStyle = c
        ctx.fillRect(x * CELL, y * CELL, CELL - GAP, CELL - GAP)
        // 顶角轻微高光,增加"豆子"立体感
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - GAP - 2, 2)
      }
    }
    // 吠叫:嘴前短声波线
    if (S.current.pose === 'bark') {
      ctx.strokeStyle = C.outline
      ctx.lineWidth = 2
      const t = S.current.frame % 2
      for (let i = 0; i < 2; i++) {
        ctx.beginPath()
        ctx.moveTo(PET_W * 0.62 + i * 7, PET_H * 0.42 + (t ? 1 : 0))
        ctx.lineTo(PET_W * 0.62 + i * 7 + 8, PET_H * 0.40 + (t ? -3 : 0))
        ctx.stroke()
      }
    }
  }

  /* ── 主循环:状态机 + 行走 ─────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = S.current

    s.maxX = Math.max(0, window.innerWidth - PET_W - 24)
    s.x = s.maxX                         // 初始在最右侧
    S.current.facing = -1
    S.current.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    S.current.last = performance.now()
    S.current.sleepStart = performance.now()

    let raf
    const tick = (now) => {
      const dt = Math.min(0.05, (now - S.current.last) / 1000)
      S.current.last = now
      const s = S.current

      if (s.reduced) {
        // 减弱动画:仅停留发声,不走动
        s.selfCd -= dt * 1000
        if (s.selfCd <= 0) { showBubble(PICK(corpusRef.current.selfSpeech), 'self'); s.selfCd = rand(SELF_CD_MIN, SELF_CD_MAX) }
        s.pose = 'idle'
        render(poseGrid('idle', s.frame))
        raf = requestAnimationFrame(tick)
        return
      }

      switch (s.phase) {
        case 'sleep': {
          s.elapsed = now - s.sleepStart
          const breath = Math.floor(now / 900) % 2 === 0
          render(poseGrid('sleep', 0, breath))
          s.frame++
          if (s.elapsed >= SLEEP_MS) { s.phase = 'wake'; s.walkTimer = 0 }
          break
        }
        case 'wake': {
          render(poseGrid('shake', s.frame))
          s.frame++
          if (s.frame * 1000 / 60 >= WAKE_MS) { s.phase = 'idle'; s.selfCd = rand(2400, 4200) }
          break
        }
        case 'idle': {
          // 停留:自发放话 + 等待一段时间后开始逛
          s.selfCd -= dt * 1000
          if (s.selfCd <= 0) {
            showBubble(PICK(corpusRef.current.selfSpeech), 'self')
            s.selfCd = rand(SELF_CD_MIN, SELF_CD_MAX)
          }
          if (S.current.reduced) { render(poseGrid('idle', s.frame)); break }
          s.idleTimer += dt * 1000
          if (s.idleTimer >= 2600) { s.phase = 'walk'; s.walkTimer = 0; s.idleTimer = 0 }
          render(poseGrid('idle', s.frame))
          s.frame++
          break
        }
        case 'walk': {
          s.walkTimer += dt * 1000
          const moving = s.walkTimer % (WALK_STRIDE_MS + WALK_PAUSE_MS) < WALK_STRIDE_MS
          if (moving) {
            const speed = 55 // css px/s(走得慢)
            s.x += s.facing * speed * dt
            render(poseGrid(s.pose === 'bark' ? 'bark' : 'walk', s.frame))
            s.frame++
          } else {
            // 停,站定(汪汪时仍张嘴)
            render(poseGrid(s.pose === 'bark' ? 'bark' : 'idle', s.frame))
            s.frame++
          }
          // 边缘折返
          if (s.x <= 0) { s.x = 0; s.facing = 1 }
          else if (s.x >= s.maxX) { s.x = s.maxX; s.facing = -1 }
          break
        }
        default:
          render(poseGrid('idle', s.frame))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onResize = () => { s.maxX = Math.max(0, window.innerWidth - PET_W - 24) }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      clearTimeout(S.current._bt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── 交互 ──────────────────────────────────────────── */
  const onHover = () => {
    if (bubble) return
    showBubble(PICK(corpusRef.current.hover), 'hover')
  }
  const onClick = () => {
    const s = S.current
    s.clicks++
    s.clickReset = performance.now()
    const moving = s.phase === 'walk' || s.phase === 'wake'
    // 频繁点击 → 无奈回应
    if (s.clicks >= ANNOY_THRESHOLD) {
      s.clicks = 0
      showBubble(PICK(corpusRef.current.annoyed), 'annoyed')
      return
    }
    if (moving && Math.random() < BARK_CHANCE) {
      s.pose = 'bark'
      showBubble(PICK(corpusRef.current.bark), 'bark')
      setTimeout(() => { if (s.pose === 'bark') s.pose = s.phase === 'walk' ? 'walk' : 'idle' }, 1100)
      return
    }
    showBubble(PICK(corpusRef.current.clickIdle), 'click')
  }
  // 点击间隔过大,重置计数
  useEffect(() => {
    const iv = setInterval(() => {
      if (S.current.clicks > 0 && performance.now() - S.current.clickReset > 2600) S.current.clicks = 0
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  // 悬浮给出"注意到你"的微反应(头略抬)通过 pose 提示
  const handleEnter = () => { if (bubble == null) onHover() }

  const bubbleClassName = bubble ? `pet-bubble pet-bubble-${bubble.type}` : 'pet-bubble'

  return (
    <div className="pet-dock" aria-hidden={false}>
      <div className="pet-dock-inner" style={{ transform: `translateX(${S.current.x}px)` }}>
        {bubble && (
          <div key={bubble.id} className={`${bubbleClassName} pet-bubble-visible`}>
            {bubble.text}
            <span className="pet-bubble-tail" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={PET_W}
          height={PET_H}
          className="pet-canvas"
          onMouseEnter={handleEnter}
          onMouseLeave={() => {}}
          onClick={onClick}
          role="button"
          aria-label="拼豆爱宠豆豆"
        />
      </div>
      <style>{petCss}</style>
    </div>
  )
}

function rand(min, max) { return min + Math.floor(Math.random() * (max - min)) }

const petCss = `
  .pet-dock {
    position: fixed;
    left: 0;
    bottom: 4px;
    z-index: 1600;
    pointer-events: none;
    width: 100%;
  }
  .pet-dock-inner {
    position: relative;
    width: ${PET_W}px;
    pointer-events: none;
    /* 行走位移由组件 translateX 控制 */
  }
  .pet-canvas {
    pointer-events: auto;
    cursor: pointer;
    image-rendering: pixelated;
    display: block;
    filter: drop-shadow(0 2px 4px rgba(43,36,32,0.18));
    transition: transform 0.12s;
  }
  .pet-canvas:hover { transform: translateY(-2px); }
  /* 像素风气泡 */
  .pet-bubble {
    position: absolute;
    left: 50%;
    bottom: ${PET_H + 10}px;
    transform: translateX(-50%) scale(0.9);
    opacity: 0;
    transform-origin: bottom center;
    background: #fffdf8;
    border: 2px solid var(--accent);
    box-shadow: 0 0 0 1px #fff inset, 2px 2px 0 1px rgba(43,36,32,0.22);
    color: #3a2a1e;
    font-size: 13px;
    line-height: 1.5;
    max-width: 240px;
    padding: 8px 12px;
    border-radius: 8px;
    white-space: pre-wrap;
    pointer-events: none;
    transition: opacity 0.2s, transform 0.2s;
    font-weight: 500;
  }
  .pet-bubble-visible { opacity: 1; transform: translateX(-50%) scale(1); }
  .pet-bubble-tail {
    position: absolute;
    bottom: -8px;
    left: 50%;
    width: 10px; height: 10px;
    background: #fffdf8;
    border-right: 2px solid var(--accent);
    border-bottom: 2px solid var(--accent);
    transform: translateX(-50%) rotate(45deg);
  }
  .pet-bubble-bark { background: #fff2ec; border-color: #e08a2b; color: #7a3b1a; }
  .pet-bubble-annoyed { background: #fdeeee; border-color: #cf8a7a; color: #7a3a33; }
  @media (prefers-reduced-motion: reduce) {
    .pet-canvas:hover { transform: none; }
  }
`
