/**
 * 通用加载过渡组件 — 带淡入动画的旋转指示器 + 文案。
 * 用于懒加载 Suspense fallback、后台登录态检查、云端数据加载等,
 * 避免"一闪而过"的生硬画面切换。
 */
export default function LoadingScreen({ text }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      {text && <p className="loading-text">{text}</p>}
      <style>{`
        .loading-screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          min-height: 240px;
          padding: 40px;
          animation: loadingFadeIn 0.25s ease;
        }
        .loading-spinner {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 3px solid var(--border-color);
          border-top-color: var(--accent);
          animation: loadingSpin 0.8s linear infinite;
        }
        .loading-text {
          margin: 0;
          color: var(--text-muted);
          font-size: var(--text-sm);
        }
        @keyframes loadingSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes loadingFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
