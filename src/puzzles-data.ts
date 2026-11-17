/* 自动生成，勿手改。scripts/gen-puzzles.mjs（node scripts/gen-puzzles.mjs 重新生成） */
export type RawPuzzle = {
  id: string
  name: string
  width: number
  height: number
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  series: string
  /** 逗号分隔的区域编号，长度 = width*height */
  regions: string
  /** 参考解：每格 0=未定 1=黑 2=白，长度 = width*height */
  sol: string
  /** 纯逻辑规则（不搜索）可解 */
  logic: boolean
}

export const RAW_PUZZLES: RawPuzzle[] = [
  { id: "easy-5x5-A", name: "入门 · 5×5 A", width: 5, height: 5, difficulty: "easy", series: "easy", regions: "0,0,0,1,1,0,2,1,1,1,2,2,3,1,4,2,5,3,1,4,5,5,5,5,4", sol: "2211211221221211212212211", logic: true },
  { id: "easy-5x5-B", name: "入门 · 5×5 B", width: 5, height: 5, difficulty: "easy", series: "easy", regions: "0,0,0,0,0,1,2,2,3,3,1,2,2,3,4,1,5,5,4,4,1,5,5,5,4", sol: "2122121221121121222121121", logic: true },
  { id: "easy-5x5-C", name: "入门 · 5×5 C", width: 5, height: 5, difficulty: "easy", series: "easy", regions: "0,0,1,2,2,0,0,1,1,2,0,3,1,1,4,3,3,5,4,4,3,3,5,4,4", sol: "1212112121222221212112121", logic: true },
  { id: "easy-5x5-D", name: "入门 · 5×5 D", width: 5, height: 5, difficulty: "medium", series: "easy", regions: "0,1,1,2,2,0,0,1,2,2,0,3,3,3,4,0,3,3,4,4,5,5,5,5,5", sol: "1121122122221211122122112", logic: false },
  { id: "easy-5x5-E", name: "入门 · 5×5 E", width: 5, height: 5, difficulty: "easy", series: "easy", regions: "0,0,0,0,1,0,2,2,3,1,2,2,3,3,1,4,4,4,5,1,4,4,5,5,5", sol: "2121121222121121222121121", logic: true },
  { id: "easy-5x5-F", name: "入门 · 5×5 F", width: 5, height: 5, difficulty: "easy", series: "easy", regions: "0,0,0,1,1,0,0,0,1,1,2,3,0,4,4,2,3,3,3,4,2,3,5,5,5", sol: "1121122222112112222211211", logic: true },
  { id: "easy-5x5-G", name: "入门 · 5×5 G", width: 5, height: 5, difficulty: "easy", series: "easy", regions: "0,1,1,1,2,0,0,1,1,2,3,4,4,5,5,3,3,4,5,5,3,4,4,4,5", sol: "1212112121222221212112121", logic: true },
  { id: "easy-5x5-H", name: "入门 · 5×5 H", width: 5, height: 5, difficulty: "easy", series: "easy", regions: "0,0,0,1,1,2,2,2,1,1,2,2,2,1,3,2,4,5,3,3,4,4,5,5,3", sol: "1211212221221212212211211", logic: true },
  { id: "small-6x6-A", name: "轻松 · 6×6 A", width: 6, height: 6, difficulty: "easy", series: "small", regions: "0,0,0,0,1,1,0,0,2,2,3,1,4,4,5,6,3,3,5,5,5,6,3,7,8,5,5,6,6,7,8,8,8,7,7,7", sol: "112211221122112211221122112211221122", logic: true },
  { id: "small-6x6-B", name: "轻松 · 6×6 B", width: 6, height: 6, difficulty: "easy", series: "small", regions: "0,0,0,1,1,1,2,2,0,0,1,3,2,2,4,4,3,3,5,4,4,4,6,3,5,4,7,6,6,8,5,7,7,7,8,8", sol: "212121212121121212121212222121112121", logic: true },
  { id: "small-6x6-C", name: "轻松 · 6×6 C", width: 6, height: 6, difficulty: "easy", series: "small", regions: "0,0,0,0,1,1,2,2,2,1,1,3,4,4,2,2,5,3,4,6,6,6,5,3,4,6,7,7,5,5,4,4,7,7,7,5", sol: "211221122121122122211211222222211211", logic: true },
  { id: "small-6x6-D", name: "轻松 · 6×6 D", width: 6, height: 6, difficulty: "easy", series: "small", regions: "0,0,1,2,2,2,0,1,1,1,2,2,0,1,3,3,4,4,0,5,5,5,4,4,6,6,5,7,7,4,6,6,6,7,7,4", sol: "221122112221221121112222221122112211", logic: true },
  { id: "small-6x6-E", name: "轻松 · 6×6 E", width: 6, height: 6, difficulty: "easy", series: "small", regions: "0,0,1,1,1,2,0,0,1,1,1,2,0,3,3,4,2,2,3,3,4,4,4,5,6,7,7,7,5,5,6,6,6,6,5,5", sol: "211211222222121212121212212121212121", logic: true },
  { id: "relax-7x7-A", name: "休闲 · 7×7 A", width: 7, height: 7, difficulty: "easy", series: "relax", regions: "0,0,0,0,1,1,1,2,3,0,4,1,1,5,2,3,3,4,6,6,5,2,3,7,4,4,6,6,3,3,7,4,8,6,9,10,10,7,8,8,9,9,10,10,10,8,8,9,9", sol: "2112112122122112212212112212122221212121212212121", logic: true },
  { id: "relax-7x7-B", name: "休闲 · 7×7 B", width: 7, height: 7, difficulty: "easy", series: "relax", regions: "0,0,0,1,1,2,2,0,3,0,2,2,2,2,4,3,3,5,5,5,2,4,4,3,5,5,6,6,4,7,3,3,8,8,6,4,7,7,9,8,10,10,4,7,9,9,8,10,10", sol: "1121121222222112121121212221212212121221222211211", logic: true },
  { id: "relax-7x7-C", name: "休闲 · 7×7 C", width: 7, height: 7, difficulty: "easy", series: "relax", regions: "0,0,0,1,2,2,2,0,0,0,1,2,2,3,4,4,0,5,5,3,3,6,5,5,5,5,7,3,6,6,8,8,8,7,7,6,9,9,9,8,7,7,6,6,9,9,9,10,10", sol: "1121211222122211222112221122211221122211222112211", logic: true },
  { id: "relax-7x7-D", name: "休闲 · 7×7 D", width: 7, height: 7, difficulty: "easy", series: "relax", regions: "0,0,1,1,1,2,2,0,3,3,4,4,4,2,5,3,3,6,6,6,2,5,3,3,6,6,6,2,5,5,7,7,8,8,8,5,7,7,9,9,8,10,7,7,9,9,9,10,10", sol: "1211222122211221212212121221121211212122212221121", logic: true },
  { id: "relax-7x7-E", name: "休闲 · 7×7 E", width: 7, height: 7, difficulty: "easy", series: "relax", regions: "0,1,1,2,2,2,3,0,0,1,2,2,4,3,0,0,5,5,4,4,3,6,5,5,5,7,8,3,6,6,5,7,7,8,8,6,6,9,9,10,8,8,9,9,9,9,10,8,8", sol: "1122212221121221221212122121121122212221212112121", logic: true },
  { id: "medium-10x10-A", name: "进阶 · 10×10 A", width: 10, height: 10, difficulty: "medium", series: "medium", regions: "0,0,0,1,2,2,3,3,3,3,4,0,0,1,2,2,2,5,6,6,4,4,7,1,5,5,5,5,6,6,4,8,7,7,9,9,5,10,10,10,8,8,7,9,9,9,9,10,11,11,12,8,7,13,13,14,14,10,11,15,12,7,7,13,13,16,14,14,11,15,12,17,17,13,13,16,16,18,18,15,12,17,17,19,19,20,20,18,15,15,17,17,17,19,19,20,20,20,15,15", sol: "1121121212222222121211211222212222211221112122211222212112222112222212122121121212212221212112112121", logic: false },
  { id: "medium-10x10-B", name: "进阶 · 10×10 B", width: 10, height: 10, difficulty: "medium", series: "medium", regions: "0,0,1,1,1,2,2,2,3,3,0,0,1,1,1,2,2,4,3,3,5,0,6,7,7,7,2,4,4,8,5,5,6,6,9,7,10,11,11,8,5,12,12,9,9,10,10,11,11,8,13,12,12,9,14,14,10,8,8,8,13,12,12,15,15,14,14,14,16,8,13,13,17,17,15,14,18,16,16,16,13,19,17,17,15,18,18,18,20,20,13,19,19,17,18,18,21,21,20,20", sol: "2112112211122222112212121122112212221122112121221122212122221212121212121212121221222222212121121121", logic: true },
]
