import type { CellState, GameState, Puzzle } from './types'
import { NorinoriEngine, type Decision, type RuleId } from './solver'

export interface PlaybackFrame {
  /** 一步落子 */
  change: { index: number; from: CellState; to: CellState }
  /** 触发该步的规则 */
  rule: RuleId
  /** 规则中文名（回放时展示） */
  label: string
  /** 连拍数：同规则连续步数，用于音高/动画节奏 */
  streak: number
}

export interface LogicPlan {
  puzzleId: string
  frames: PlaybackFrame[]
  /** 规则命中总步数 */
  ruleSteps: number
  /** 推理后是否已解出 */
  solved: boolean
  /** 推理是否已饱和（false = 纯逻辑到极限仍未解出） */
  saturated: boolean
  /** 终态（供 UI 直接采用） */
  finalState: GameState | null
}

const RULE_LABEL: Record<RuleId, string> = {
  'region-full': '区域已满 2 格，其余涂白',
  'region-last': '区域候选恰够，全部涂黑',
  'pair-clean': '多米诺已成双，邻格涂白',
  'lone-partner': '孤黑格唯一出路，必须涂黑',
  'no-room': '放黑也成不了多米诺，只能涂白',
  'touch-clean': '候选邻格公共邻格必白',
  'block-2x2': '小矩形内黑格数已满，其余涂白',
  'hypo-shade': '假设涂黑会矛盾，只能涂白',
  'hypo-forbid': '假设涂白会矛盾，必须涂黑',
}

/**
 * 逻辑解题：前向规则 + 单格假设检验（反证法，不做多格搜索），
 * 从当前盘面推理到饱和，产出可逐帧回放的计划。
 * 推不动了就停，剩余交给「显示解」或玩家自己。
 * maxTests 限制假设检验次数，避免大盘在浏览器里长时间卡住。
 */
export function planLogicSolve(puzzle: Puzzle, cells: CellState[], maxTests = 4000): LogicPlan {
  const engine = new NorinoriEngine(puzzle, Int8Array.from(cells))
  const decisions: Decision[] = []
  const ok = engine.logicSolve(decisions, maxTests)
  const saturated = ok
  const solved = ok && engine.solvedNow()

  const frames: PlaybackFrame[] = []
  let lastRule: RuleId | null = null
  let streak = 0
  for (const d of decisions) {
    if (d.rule === lastRule) streak++
    else streak = 1
    lastRule = d.rule
    frames.push({
      change: { index: d.index, from: d.from, to: d.to },
      rule: d.rule,
      label: RULE_LABEL[d.rule],
      streak,
    })
  }

  return {
    puzzleId: puzzle.id,
    frames,
    ruleSteps: decisions.length,
    solved,
    saturated,
    finalState: ok ? engine.toGameState() : null,
  }
}
