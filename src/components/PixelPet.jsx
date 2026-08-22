import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { bichito } from 'bichito'
import { getPetCorpus, PICK } from '../data/pet'

/*
 * 拼豆爱宠 — 基于开源桌面像素宠物引擎 `bichito`(npm, MIT, canvas, 零依赖)。
 * - 采用其引擎 + 内置法国斗牛犬(`loki`,黄褐+深面具):idle 呼吸/眨眼、walk 四向、
 *   peek、jump、heart —— 稳定、有开发者背书、许可友好。
 * - 定制:把宠物「钉」在浏览器视口底部边界线上(每帧强制 top=下缘,只让水平 left 滑动),
 *   不遮挡画布;叠加中文可爱文本气泡(语料 pet.{zh,en,ja,ko}.js)。
 * - 交互直接挂在 bichito 画布上(走到哪都能点);频繁点击 → 无奈回应。
 * - 挂载 bichito()、卸载 destroy();桌面端渲染;respects prefers-reduced-motion。
 */

const PET_SIZE = 128
const SELF_CD_MIN = 9000
const SELF_CD_MAX = 16000
const BUBBLE_MS = 3800
const ANNOY_THRESHOLD = 4

export default function PixelPet() {
  const { i18n } = useTranslation()
  const corpusRef = useRef(getPetCorpus(i18n.language))
  useEffect(() => { corpusRef.current = getPetCorpus(i18n.language) }, [i18n.language])

  const holderRef = useRef(null)
  const bubbleRef = useRef(null)
  const handlerRef = useRef(() => {})
  const [bubble, setBubble] = useState(null)
  const S = useRef({
    clicks: 0, clickReset: 0, selfCd: 0,
    bubbleActive: false, seed: Math.random() * 1e6,
  })

  const showBubble = (text, type) => {
    setBubble({ text, type, id: Math.round(S.current.seed + Math.random() * 1e6) })
    S.current.bubbleActive = true
    clearTimeout(S.current._bt)
    S.current._bt = setTimeout(() => { setBubble(null); S.current.bubbleActive = false }, BUBBLE_MS)
  }

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    // jsdom / 无 canvas 2D 上下文时 bichito 可能抛错,兜底不让整棵应用崩溃(冒烟测试安全)
    let destroy = () => {}
    try {
      destroy = bichito({ pet: 'loki', size: PET_SIZE, container: holder })
    } catch (e) {
      destroy = () => {}
    }

    // 点击直接挂在 bichito 画布上(它随行走移动,走到哪都能点)
    const c = holder.querySelector('canvas')
    const onClick = (e) => handlerRef.current(e)
    if (c) c.addEventListener('click', onClick)

    if (reduced) return () => { c?.removeEventListener('click', onClick); destroy() }

    // 钉在底部边界:每帧强制 top=下缘,bubble 跟随其水平位置
    let raf = 0
    const pin = () => {
      const cv = holder.querySelector('canvas')
      if (cv) {
        const h = cv.offsetHeight || PET_SIZE
        cv.style.top = `${window.innerHeight - h - 6}px`
        const left = parseFloat(cv.style.left) || 0
        const bb = bubbleRef.current
        if (bb) {
          bb.style.left = `${left + cv.offsetWidth / 2 - bb.offsetWidth / 2}px`
          bb.style.top = `${window.innerHeight - h - 6 - bb.offsetHeight - 10}px`
        }
      }
      raf = requestAnimationFrame(pin)
    }
    raf = requestAnimationFrame(pin)
    return () => { cancelAnimationFrame(raf); c?.removeEventListener('click', onClick); destroy() }
  }, [])

  // 停留时自发放话(用 ref 判断是否已有气泡,避免过期闭合)
  useEffect(() => {
    const iv = setInterval(() => {
      if (S.current.bubbleActive) return
      S.current.selfCd -= 1500
      if (S.current.selfCd <= 0) {
        showBubble(PICK(corpusRef.current.selfSpeech), 'self')
        S.current.selfCd = SELF_CD_MIN + Math.floor(Math.random() * (SELF_CD_MAX - SELF_CD_MIN))
      }
    }, 1500)
    return () => clearInterval(iv)
  }, [])

  // 点击:频繁 → 无奈;否则可爱回应
  const handleClick = (e) => {
    e?.stopPropagation?.()
    const s = S.current
    s.clicks++
    s.clickReset = performance.now()
    if (s.clicks >= ANNOY_THRESHOLD) {
      s.clicks = 0
      showBubble(PICK(corpusRef.current.annoyed), 'annoyed')
      return
    }
    // 走动时点击有几率「汪汪」吠叫;否则可爱回应
    const text = Math.random() < 0.25 ? PICK(corpusRef.current.bark) : PICK(corpusRef.current.clickIdle)
    showBubble(text, Math.random() < 0.25 ? 'bark' : 'click')
  }
  handlerRef.current = handleClick

  // 点击间隔过大,重置计数
  useEffect(() => {
    const iv = setInterval(() => {
      if (S.current.clicks > 0 && performance.now() - S.current.clickReset > 2600) S.current.clicks = 0
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  const bubbleClassName = bubble ? `pet-bubble pet-bubble-${bubble.type}` : 'pet-bubble'

  return (
    <div className="pet-dock" aria-hidden={false}>
      <div ref={holderRef} className="pet-holder" />
      {bubble && (
        <div ref={bubbleRef} key={bubble.id} className={`${bubbleClassName} pet-bubble-visible`}>
          {bubble.text}
          <span className="pet-bubble-tail" />
        </div>
      )}
      <style>{petCss}</style>
    </div>
  )
}

const petCss = `
  .pet-dock { position: fixed; inset: 0; pointer-events: none; z-index: 1600; }
  .pet-holder { pointer-events: none; }
  .pet-holder canvas { pointer-events: auto; cursor: pointer; }
  .pet-bubble {
    position: fixed;
    left: 0; top: 0;
    transform: translateY(4px);
    opacity: 0;
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
  .pet-bubble-visible { opacity: 1; transform: translateY(0); }
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
    .pet-holder canvas { display: none; }
  }
`
