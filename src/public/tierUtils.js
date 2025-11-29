/**
 * 前端等级评定工具
 * 提供作品评分等级划分相关的工具函数
 */

/**
 * 根据百分位获取等级
 * 等级划分标准：
 * - T0: 前 5%
 * - T1: 5%-20%
 * - T2: 20%-40%
 * - T3: 40%-60%
 * - T4: 60%-100%
 * 
 * @param {number} percentile - 百分位值 (0-1之间)
 * @returns {string} 等级标识 (T0/T1/T2/T3/T4)
 */
export function getTierFromPercentile(percentile) {
  if (percentile <= 0.05) return "T0";
  if (percentile <= 0.20) return "T1";
  if (percentile <= 0.40) return "T2";
  if (percentile <= 0.60) return "T3";
  return "T4";
}







