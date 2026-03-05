/**
 * 前端等级评定工具
 * 提供作品评分等级划分相关的工具函数
 */

/**
 * 计算加权评分统计数据（唯一权威实现，前后端共用）
 *
 * 加权规则：高权重用户的评分计 2 票，低权重用户计 1 票
 * 加权平均分 = (高权重总和 × 2 + 低权重总和) / (高权重人数 × 2 + 低权重人数)
 *
 * @param {number} highWeightSum   - 高权重用户评分之和
 * @param {number} highWeightCount - 高权重用户人数
 * @param {number} lowWeightSum    - 低权重用户评分之和
 * @param {number} lowWeightCount  - 低权重用户人数
 * @returns {{ weightedAverage: number, originalAverage: number, ratio: number }}
 */
export function computeWeightedRating(
  highWeightSum,
  highWeightCount,
  lowWeightSum,
  lowWeightCount
) {
  const totalRatings = highWeightCount + lowWeightCount;

  const weightedAverage =
    totalRatings > 0
      ? (highWeightSum * 2 + lowWeightSum) /
        (highWeightCount * 2 + lowWeightCount)
      : 0;

  const originalAverage =
    totalRatings > 0 ? (highWeightSum + lowWeightSum) / totalRatings : 0;

  const ratio =
    lowWeightCount > 0
      ? highWeightCount / lowWeightCount
      : highWeightCount > 0
      ? 999
      : 0;

  return { weightedAverage, originalAverage, ratio };
}

/**
 * 根据百分位获取等级
 * 等级划分标准：
 * - T0: 前 5%
 * - T1: 5%-15%
 * - T2: 15%-40%
 * - T3: 40%-60%
 * - T4: 60%-100%
 * 
 * @param {number} percentile - 百分位值 (0-1之间)
 * @returns {string} 等级标识 (T0/T1/T2/T3/T4)
 */
// export function getTierFromPercentile(percentile) {
//   if (percentile <= 0.05) return "T0";
//   if (percentile <= 0.15) return "T1";
//   if (percentile <= 0.40) return "T2";
//   if (percentile <= 0.60) return "T3";
//   return "T4";
// }



export function getTierFromPercentile(percentile) {
  if (percentile <= 0.05) return "↑";
  if (percentile <= 0.15) return "↑";
  if (percentile <= 0.40) return "↑";
  if (percentile <= 0.60) return "↑";
  return "↑";
}























