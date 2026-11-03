/** 浏览器测试共用：Edge 路径解析 + profile 一律放项目内（output/.browser 已 gitignore） */
import fs from 'node:fs'
import path from 'node:path'

export function edgePath() {
  if (process.env.EDGE_PATH && fs.existsSync(process.env.EDGE_PATH)) return process.env.EDGE_PATH
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c
  throw new Error('找不到 Edge 可执行文件，请用 EDGE_PATH 指定')
}

/** 所有浏览器 profile 都放项目内，避免把数据写到项目外目录 */
export function profileDir(name) {
  const dir = path.resolve('output/.browser', name)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
