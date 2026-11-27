import { describe, it, expect } from 'vitest'
import { isPrivateIp } from './ipGeolocation'

describe('isPrivateIp', () => {
  it('识别内网与保留地址', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.10',
      '172.16.0.5',
      '172.31.255.1',
      '169.254.1.1',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'localhost',
      '',
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('公网地址返回 false', () => {
    for (const ip of ['8.8.8.8', '114.114.114.114', '172.32.0.1', '2001:db8::1']) {
      expect(isPrivateIp(ip), ip).toBe(false)
    }
  })
})
