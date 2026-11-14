/**
 * 熨烫参考页的数据组织(纯函数,按语言取数)。
 *
 * 不另写一份温度表:品牌档位与翻车处理直接取教程数据里的表格块,
 * 页面、静态快照与教程三处永远是同一份说法。教程数据有四语言版本,
 * 页面按当前语言取对应表格;zh 具名导出仅供构建期(预渲染/llms.txt,
 * 始终输出中文)使用 —— 界面一律走 ironingReference(lang)。
 */

import { TUTORIALS_ZH } from '../../data/tutorials.zh.js'
import { TUTORIALS_EN } from '../../data/tutorials.en.js'
import { TUTORIALS_JA } from '../../data/tutorials.ja.js'
import { TUTORIALS_KO } from '../../data/tutorials.ko.js'

/** 教程数据集按语言索引;未知语言回退中文 */
const TUTORIAL_SETS = {
  'zh-CN': TUTORIALS_ZH,
  'en-US': TUTORIALS_EN,
  'ja-JP': TUTORIALS_JA,
  'ko-KR': TUTORIALS_KO,
}

/** 'en'/'en-US' 都归一化到数据集键;未知语言回退 zh-CN */
export function normalizeTutorialLang(lang) {
  if (typeof lang !== 'string') return 'zh-CN'
  if (TUTORIAL_SETS[lang]) return lang
  const base = lang.split('-')[0]
  const hit = Object.keys(TUTORIAL_SETS).find(key => key.split('-')[0] === base)
  return hit || 'zh-CN'
}

/** 与熨烫页直接相关的教程文章(按阅读顺序) */
export const IRONING_ARTICLE_IDS = [
  'brands-guide',
  'ironing-technique',
  'double-sided-ironing',
  'ironing-rescue',
  'why-warping',
  'weight-pressing',
]

/**
 * 熨烫要点:四语言(界面按语言取,构建期用 zh 具名导出)。
 * 每一条都能在教程原文或品牌官方口径里找到对应说法,不新造温度数字:
 * Perler 官方=中温干熨/隔纸画圈 10–20 秒,Hama 官方=画圆移动不停留,
 * Artkal 官方=中温 160–180°C。
 */
export const IRONING_RULES_I18N = {
  'zh-CN': [
    ['中温、关闭蒸汽', '主流品牌的官方口径一致:中温、关蒸汽、边熨边看。宁可低温多次,也不要高温一次。'],
    ['隔纸、移动、观察', '珠子表面盖一层熨纸,熨斗画圆弧从中心向外移动,不要停在原地;表面微微反光即可。'],
    [
      '温度参考 160–180°C',
      'Artkal 官方给出 160–180°C 的中温区间,家用熨斗差异大,宁可偏低多次。深色珠子吸热更多,大图案应延长时间而不是调高温度。',
    ],
    ['双面烫 + 压重', '正面 30–50 秒、背面 20–30 秒;完成后趁温热压重,冷却至少 30 分钟再取下重物。'],
  ],
  'en-US': [
    [
      'Medium heat, no steam',
      'Official guidance from the major brands agrees: medium heat, steam off, and iron while you watch. Several low passes beat one hot pass.',
    ],
    [
      'Cover, move, watch',
      'Lay ironing paper over the beads, move the iron in circles from the center outward, and never park it in one spot; stop once the surface looks slightly glossy.',
    ],
    [
      'Reference 160–180°C',
      'Artkal officially recommends 160–180°C. Home irons vary a lot, so start low and repeat. Dark beads absorb more heat; for larger boards, extend the time instead of raising the temperature.',
    ],
    [
      'Iron both sides + press',
      '30–50 seconds on the front, 20–30 on the back; press with a book while still warm and let it cool under weight for at least 30 minutes.',
    ],
  ],
  'ja-JP': [
    [
      '中温・蒸気なし',
      '主要ブランドの公式見解は一致しています:中温・蒸気オフ・様子を見ながらアイロンがけ。高温を一度当てるより、低温で複数回が安全です。',
    ],
    [
      '当て紙・移動・観察',
      'ビーズの上に当て紙を敷き、アイロンを中心から外へ円を描くように動かし、同じ場所に止めない。表面がわずかに光ったら仕上げのサインです。',
    ],
    [
      '温度の目安 160–180°C',
      'Artkal 公式は 160–180°C の範囲を提示しています。家庭用アイロンの個体差が大きいため、低めで複数回が基本。濃色ビーズは熱を吸収しやすく、大きい図案では温度を上げずに時間を延ばします。',
    ],
    [
      '両面アイロン+重し',
      '表面 30–50 秒、裏面 20–30 秒。仕上げに温かいうちに本などで押さえ、少なくとも 30 分冷ましてから重りを外します。',
    ],
  ],
  'ko-KR': [
    [
      '중간 온도, 스팀 OFF',
      '주요 브랜드의 공식 가이드는 모두 같습니다: 중간 온도, 스팀 차단, 아이런을 옮기며 확인. 높은 온도 한 번보다 낮은 온도 여러 번이 안전합니다.',
    ],
    [
      '종이 덮기, 이동, 관찰',
      '비즈 위에 아이런 종이를 덮고 다리미를 중심에서 바깥으로 원을 그리며 이동하고, 한 곳에 멈추지 않습니다. 표면이 살짝 윤기 나면 완성입니다.',
    ],
    [
      '온도 기준 160–180°C',
      'Artkal 공식 기준은 160–180°C입니다. 가정용 다리미는 편차가 크므로 낮은 온도로 여러 번이 기본. 진한 색 비즈는 열을 더 흡수하므로 큰 도안은 온도를 올리지 말고 시간을 늘리세요.',
    ],
    [
      '양면 다림질 + 눌러두기',
      '앞면 30–50초, 뒷면 20–30초. 완성 후 따뜻할 때 책으로 눌러 최소 30분 식힌 뒤 무게를 치웁니다.',
    ],
  ],
}

/** 按语言取熨烫要点(界面用) */
export function ironingRules(lang) {
  return IRONING_RULES_I18N[normalizeTutorialLang(lang)]
}

/** zh 具名导出:仅供构建期(预渲染快照 / llms.txt,始终中文)使用 */
export const IRONING_RULES = IRONING_RULES_I18N['zh-CN']

/** 品牌官方渠道(页面与静态正文同一份;外链带 noopener)。
 *  label 是中文(构建期);界面按 brand/domain 用 toolsPage.ironing.sourceLabel 模板翻译。 */
export const IRONING_SOURCES = [
  {
    brand: 'Perler',
    domain: 'perler.com',
    label: 'Perler 官方使用说明(perler.com)',
    href: 'https://www.perler.com',
  },
  {
    brand: 'Hama',
    domain: 'hamabeads.com',
    label: 'Hama 官方使用说明(hamabeads.com)',
    href: 'https://www.hamabeads.com/how-to-use',
  },
  {
    brand: 'Artkal',
    domain: 'artkalfusebeads.com',
    label: 'Artkal 官方使用说明(artkalfusebeads.com)',
    href: 'https://www.artkalfusebeads.com/blogs/faq/how-to-use-artkal-beads',
  },
]

const ARTICLE_SETS = Object.fromEntries(
  Object.entries(TUTORIAL_SETS).map(([lang, sections]) => {
    const map = new Map()
    for (const section of sections) {
      for (const article of section.children || []) {
        if (article?.id) map.set(article.id, { article, section })
      }
    }
    return [lang, map]
  })
)

/** 按 id 取教程文章(可指定语言,默认中文);不存在返回 null */
export function tutorialArticle(id, lang = 'zh-CN') {
  const entry = ARTICLE_SETS[normalizeTutorialLang(lang)]?.get(id)
  return entry ? { ...entry.article, sectionTitle: entry.section.title } : null
}

/** 取文章里的第一个表格块(headers/rows),没有则返回 null */
function tableBlock(article) {
  const block = (article?.blocks || []).find(b => b && b.type === 'table')
  return block ? { headers: block.headers || [], rows: block.rows || [] } : null
}

/**
 * 熨烫页需要的全部参考数据。
 *
 * @returns {{
 *   brandTable: {headers:string[],rows:string[][]}|null,
 *   failureTable: {headers:string[],rows:string[][]}|null,
 *   brandArticle: object|null,
 *   articles: Array<object>,
 * }}
 */
export function ironingReference(lang = 'zh-CN') {
  const brand = tutorialArticle('brands-guide', lang)
  const rescue = tutorialArticle('ironing-rescue', lang)
  return {
    brandTable: tableBlock(brand),
    failureTable: tableBlock(rescue),
    brandArticle: brand,
    articles: IRONING_ARTICLE_IDS.map(id => tutorialArticle(id, lang)).filter(Boolean),
  }
}
