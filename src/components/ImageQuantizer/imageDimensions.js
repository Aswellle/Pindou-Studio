// 预解码阶段只读取文件前缀字节解析 PNG/JPEG 尺寸，避免对超大像素图片做完整解码。
// 读取范围固定（与文件总大小无关），内存占用恒定可控。
const HEADER_READ_BYTES = 512 * 1024

export const INVALID_IMAGE = 'INVALID_IMAGE'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function readPngDimensions(view) {
  if (view.byteLength < 24) return INVALID_IMAGE
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (view.getUint8(i) !== PNG_SIGNATURE[i]) return INVALID_IMAGE
  }
  // IHDR 紧跟签名之后：4 字节长度 + 'IHDR' + 4 字节宽 + 4 字节高
  const width = view.getUint32(16, false)
  const height = view.getUint32(20, false)
  if (!width || !height) return INVALID_IMAGE
  return { width, height }
}

// SOF0-SOF15 中排除 DHT(0xC4)/JPG(0xC8)/DAC(0xCC)，剩余均为帧头标记
function isSofMarker(marker) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

function readJpegDimensions(view) {
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return INVALID_IMAGE

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return INVALID_IMAGE
    const marker = view.getUint8(offset + 1)
    offset += 2

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      continue // 无长度字段的独立标记
    }

    if (offset + 2 > view.byteLength) break
    const segmentLength = view.getUint16(offset, false)

    if (isSofMarker(marker)) {
      if (offset + 7 > view.byteLength) break
      const height = view.getUint16(offset + 3, false)
      const width = view.getUint16(offset + 5, false)
      if (!width || !height) return INVALID_IMAGE
      return { width, height }
    }

    if (marker === 0xd9 || marker === 0xda) break // EOI / SOS：到扫描数据，头部已结束
    offset += segmentLength
  }
  // 未在读取窗口内找到 SOF：窗口过小或文件损坏，保守拒绝
  return INVALID_IMAGE
}

// 返回 { width, height }（已识别格式）、INVALID_IMAGE（已识别格式但解析失败/损坏）
// 或 null（非 PNG/JPEG，交由字节大小限制把关）
export async function readImageDimensions(file) {
  const isPng = file.type === 'image/png'
  const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg'
  if (!isPng && !isJpeg) return null

  const header = await file.slice(0, HEADER_READ_BYTES).arrayBuffer()
  const view = new DataView(header)
  return isPng ? readPngDimensions(view) : readJpegDimensions(view)
}
