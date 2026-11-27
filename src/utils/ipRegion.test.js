import { describe, it, expect } from 'vitest'
import { formatRegion, isPrivateIp, normalizeRegionPart } from './ipRegion'

describe('normalizeRegionPart · 去掉行政级别后缀', () => {
  it('省级/地级/县级通用后缀', () => {
    expect(normalizeRegionPart('江苏省')).toBe('江苏')
    expect(normalizeRegionPart('南京市')).toBe('南京')
    expect(normalizeRegionPart('昆山市')).toBe('昆山')
    expect(normalizeRegionPart('朝阳区')).toBe('朝阳')
    expect(normalizeRegionPart('浦东新区')).toBe('浦东')
    expect(normalizeRegionPart('大兴安岭地区')).toBe('大兴安岭')
    expect(normalizeRegionPart('阿拉善盟')).toBe('阿拉善')
  })

  it('五个省级自治区', () => {
    expect(normalizeRegionPart('广西壮族自治区')).toBe('广西')
    expect(normalizeRegionPart('新疆维吾尔自治区')).toBe('新疆')
    expect(normalizeRegionPart('宁夏回族自治区')).toBe('宁夏')
    expect(normalizeRegionPart('西藏自治区')).toBe('西藏')
    expect(normalizeRegionPart('内蒙古自治区')).toBe('内蒙古')
  })

  it('自治州/自治县/自治旗去掉民族名', () => {
    expect(normalizeRegionPart('延边朝鲜族自治州')).toBe('延边')
    expect(normalizeRegionPart('湘西土家族苗族自治州')).toBe('湘西')
    expect(normalizeRegionPart('巴音郭楞蒙古自治州')).toBe('巴音郭楞')
    expect(normalizeRegionPart('克孜勒苏柯尔克孜自治州')).toBe('克孜勒苏')
    expect(normalizeRegionPart('黔东南苗族侗族自治州')).toBe('黔东南')
  })

  it('特别行政区与直辖市', () => {
    expect(normalizeRegionPart('香港特别行政区')).toBe('香港')
    expect(normalizeRegionPart('澳门特别行政区')).toBe('澳门')
    expect(normalizeRegionPart('北京市')).toBe('北京')
    expect(normalizeRegionPart('上海市')).toBe('上海')
  })

  it('英文后缀', () => {
    expect(normalizeRegionPart('New York City')).toBe('New York')
    expect(normalizeRegionPart('Jiangsu Province')).toBe('Jiangsu')
    expect(normalizeRegionPart('Singapore')).toBe('Singapore')
  })
})

describe('formatRegion · 逐级拼接', () => {
  it('中国省市区去掉后缀并用空格连接', () => {
    expect(formatRegion({ success: true, country: '中国', region: '江苏省', city: '南京市' })).toBe(
      '中国 江苏 南京'
    )
  })

  it('相邻重复段只保留一次', () => {
    expect(formatRegion({ success: true, country: '中国', region: '北京市', city: '北京市' })).toBe(
      '中国 北京'
    )
    expect(
      formatRegion({ success: true, country: 'Singapore', region: 'Singapore', city: 'Singapore' })
    ).toBe('Singapore')
  })

  it('接口失败或空数据返回 null', () => {
    expect(formatRegion(null)).toBeNull()
    expect(formatRegion({ success: false })).toBeNull()
    expect(formatRegion({ success: true, country: '', region: '', city: '' })).toBeNull()
  })
})

describe('isPrivateIp', () => {
  it('识别内网、保留与链路本地地址', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '100.64.0.1',
      '169.254.1.1',
      '192.168.1.1',
      '198.18.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '',
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('公网地址不误判', () => {
    for (const ip of ['8.8.8.8', '114.114.114.114', '1.1.1.1', '2001:db8::1']) {
      expect(isPrivateIp(ip), ip).toBe(false)
    }
  })
})
