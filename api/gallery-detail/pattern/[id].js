/**
 * /gallery/pattern/:id 的存在性校验入口。
 * vercel.json 把「无静态快照」的详情请求 rewrite 到这里,见 ../../_galleryDetail.js。
 */
import { handleGalleryDetail } from '../../_galleryDetail.js'

export default async function handler(req, res) {
  await handleGalleryDetail(req, res, { type: 'pattern', value: String(req.query.id || '') })
}
