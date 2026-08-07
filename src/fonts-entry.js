// 字体 CSS 独立入口:仅用于让 Vite 将 fonts-all.css 打包为独立 chunk,
// 由 generate-prerender-html.js 以 preload 方式注入 index.html
import './styles/fonts-all.css'
