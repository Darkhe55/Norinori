/**
 * 识图工具入口：把 src/vision.ts 与求解/校验打包给 Node 脚本用。
 * 保证命令行识图与网页里用的是同一份识别代码。
 */
export { recognizePuzzle, VisionError } from '../src/vision'
export type { RgbaImage, VisionResult, VisionOptions } from '../src/vision'
export { countSolutions } from '../src/solver'
export { validate } from '../src/validate'
