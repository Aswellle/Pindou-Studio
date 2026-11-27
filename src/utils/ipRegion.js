/**
 * IP 归属地的展示规范化(纯函数)。
 *
 * 第三方接口返回的是「中国 / 江苏省 / 南京市」这类带行政级别后缀的名称。
 * 后台只需要逐级名称,例如「中国 江苏 南京」:
 *   · 去掉省 / 市 / 县 / 区 / 盟 / 旗 / 地区 / 新区等通用后缀;
 *   · 去掉自治区 / 自治州 / 自治县 / 自治旗及其前面的民族名;
 *   · 去掉特别行政区;
 *   · 相邻重复段只保留一次(新加坡这类国家/地区/城市同名的数据)。
 *
 * 该函数同时被前端展示与 /api/ip-region 使用,保证两边格式一致。
 */

// 常见民族名(用于匹配「XX族自治州/县/旗」)。长的放前面,避免短词抢先匹配。
const ETHNIC =
  '(?:布依族|维吾尔族?|哈萨克族?|柯尔克孜族?|乌孜别克族?|俄罗斯族?|达斡尔族?|鄂温克族?|鄂伦春族?|土家族|朝鲜族|景颇族|傈僳族|拉祜族|纳西族|仡佬族|仫佬族|毛南族|塔吉克族?|锡伯族?|裕固族?|保安族?|撒拉族?|东乡族?|赫哲族?|门巴族?|珞巴族?|基诺族?|布朗族?|阿昌族?|普米族?|独龙族?|德昂族?|高山族?|壮族|回族|藏族?|蒙古族?|苗族|彝族|侗族|哈尼族|傣族|白族|佤族|羌族|怒族?|水族?|京族?|瑶族?|畲族?|黎族?|土族?)'

// 五个省级自治区:整段替换,避免「内蒙古」被民族名规则误切成「内」。
const AUTONOMOUS_REGIONS = {
  广西壮族自治区: '广西',
  新疆维吾尔自治区: '新疆',
  宁夏回族自治区: '宁夏',
  西藏自治区: '西藏',
  内蒙古自治区: '内蒙古',
}

/**
 * 规范化单个行政级别名称。
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeRegionPart(value) {
  let s = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return ''

  if (AUTONOMOUS_REGIONS[s]) return AUTONOMOUS_REGIONS[s]

  // 特别行政区:香港/澳门
  s = s.replace(/特别行政区$/, '')

  // 自治州 / 自治县 / 自治旗:去掉民族名与「自治…」后缀
  s = s.replace(new RegExp(`${ETHNIC}+自治(?:州|县|旗)$`), '')

  // 普通行政级别后缀。顺序上先长后短,避免「地区」只被切掉「区」。
  s = s.replace(/(?:地区|新区|省|市|县|区|盟|旗)$/, '')

  // 英文地名常见的行政级别后缀
  s = s.replace(/\s+(?:Province|State|County|City|Prefecture|Region|District)$/i, '')

  return s.trim()
}

/**
 * 把 ipwho.is 风格的 { country, region, city } 格式化为「中国 江苏 南京」。
 * @param {{success?:boolean,country?:string,region?:string,city?:string}|null} data
 * @returns {string|null}
 */
export function formatRegion(data) {
  if (!data || data.success === false) return null

  const parts = [data.country, data.region, data.city].map(normalizeRegionPart).filter(Boolean)

  const deduped = []
  for (const part of parts) {
    const prev = deduped[deduped.length - 1]
    if (!prev || prev.toLowerCase() !== part.toLowerCase()) deduped.push(part)
  }

  return deduped.length ? deduped.join(' ') : null
}

/** 内网 / 保留地址:没有公网归属地,也不应触发任何外部查询 */
export function isPrivateIp(ip) {
  const s = String(ip || '').trim()
  if (!s) return true
  return (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(s) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(s) ||
    /^(100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(s) ||
    /^(198\.(18|19)\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(s) ||
    /^(22[4-9]|23\d|24\d|25[0-5])\./.test(s) ||
    /^(::1|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)/i.test(s) ||
    s === 'localhost'
  )
}
