/**
 * 生成器入口：把 src 下的引擎代码打包给 Node 脚本用。
 * 保证生成器与游戏用的是同一份求解/校验代码。
 */
export { NorinoriEngine, solvePuzzle, countSolutions } from '../src/solver'
export { validate } from '../src/validate'
export { planLogicSolve } from '../src/logic'
export { randomRegions, mulberry32 } from '../src/regions'
export type { Puzzle } from '../src/types'
