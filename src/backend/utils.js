/**
 * 通用工具函数模块
 * 提供项目中常用的工具函数，减少代码重复
 */

import wixData from "wix-data";
import {
  POINTS_CONFIG,
  APPROVAL_CONFIG,
  COLLECTIONS,
} from "backend/constants.js";

/**
 * 从URL中提取用户slug
 * @param {string} url - 包含用户profile的URL
 * @returns {string|null} 提取出的用户slug，失败返回null
 */
export function extractSlugFromURL(url) {
  console.log("URL to extract slug from:", url);

  const parts = url.split("/profile/");
  if (parts.length === 2) {
    const slugParts = parts[1].split("/");
    if (slugParts.length >= 1) {
      const extractedSlug = slugParts[0];
      console.log("Extracted Slug:", extractedSlug);
      return extractedSlug;
    }
  }

  console.log("No valid slug found, returning null");
  return null;
}

/**
 * 计算团队总分
 * @param {number} order - 排名分数
 * @param {number} performance2 - 表现分2
 * @param {number} performance3 - 表现分3
 * @returns {number} 总分
 */
export function calculateTotalPp(order, performance2, performance3) {
  return (order || 0) + (performance2 || 0) + (performance3 || 0);
}

/**
 * 递归分页加载所有数据
 * @param {Object} query - wixData查询对象
 * @param {Array} accumulatedData - 累积的数据数组
 * @returns {Promise<Array>} 完整的数据数组
 */
export async function loadAllData(query, accumulatedData = []) {
  const pageSize = POINTS_CONFIG.PAGE_SIZE;
  const results = await query
    .limit(pageSize)
    .skip(accumulatedData.length)
    .find();

  if (results.items.length > 0) {
    accumulatedData = accumulatedData.concat(results.items);
    if (results.items.length === pageSize) {
      return loadAllData(query, accumulatedData);
    }
  }
  return accumulatedData;
}

/**
 * 计算查看数对应的投票数
 * @param {number} viewedCount - 查看次数
 * @returns {number} 对应的投票数
 */
export function calculateViewedVotes(viewedCount) {
  let viewedVotes = 0;
  if (viewedCount >= APPROVAL_CONFIG.VIEWED_VOTES_THRESHOLD_1) {
    viewedVotes = APPROVAL_CONFIG.VIEWED_VOTES_VALUE_1;
  }
  if (viewedCount >= APPROVAL_CONFIG.VIEWED_VOTES_THRESHOLD_2) {
    viewedVotes = APPROVAL_CONFIG.VIEWED_VOTES_VALUE_2;
  }
  return viewedVotes;
}

/**
 * 判断作品是否通过审核
 * @param {number} approvedCount - 审核通过数
 * @param {number} viewedCount - 查看次数
 * @returns {boolean} 是否通过审核
 */
export function isWorkApproved(approvedCount, viewedCount) {
  const viewedVotes = calculateViewedVotes(viewedCount);
  const totalVotes = approvedCount + viewedVotes;
  return totalVotes >= APPROVAL_CONFIG.MIN_VOTES_FOR_APPROVAL;
}

/**
 * 安全解析JSON字符串
 * @param {string} jsonString - JSON字符串
 * @param {*} defaultValue - 解析失败时的默认值
 * @returns {*} 解析结果或默认值
 */
export function safeJsonParse(jsonString, defaultValue = []) {
  try {
    return jsonString ? JSON.parse(jsonString) : defaultValue;
  } catch (error) {
    console.error("JSON parsing error:", error);
    return defaultValue;
  }
}

/**
 * 检查日期是否为同一天
 * @param {Date} date1 - 日期1
 * @param {Date} date2 - 日期2
 * @returns {boolean} 是否为同一天
 */
export function isSameDay(date1, date2) {
  return (
    date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear()
  );
}

/**
 * 获取数据库集合中的最大序列ID
 * @param {string} collectionName - 集合名称
 * @param {string} fieldName - 字段名称，默认为'sequenceId'
 * @returns {Promise<number>} 最大序列ID
 */
export async function getMaxSequenceId(
  collectionName,
  fieldName = "sequenceId"
) {
  try {
    const results = await wixData
      .query(collectionName)
      .descending(fieldName)
      .limit(1)
      .find();

    return results.items.length > 0 ? results.items[0][fieldName] : 0;
  } catch (error) {
    console.error(`Error fetching max ${fieldName}:`, error);
    return 0;
  }
}

/**
 * 按字段值对数组进行分组
 * @param {Array} items - 要分组的数组
 * @param {string} groupBy - 分组依据的字段名
 * @param {string} valueField - 值字段名，如果指定则只提取该字段的值
 * @returns {Object} 分组后的对象
 */
export function groupByField(items, groupBy, valueField = null) {
  return items.reduce((acc, item) => {
    const key = item[groupBy];
    if (!acc[key]) {
      acc[key] = [];
    }

    const value = valueField ? item[valueField] : item;
    acc[key].push(value);
    return acc;
  }, {});
}

/**
 * 检查用户是否具有指定角色
 * @param {Array} userRoles - 用户角色数组
 * @param {string} roleName - 要检查的角色名称
 * @returns {boolean} 是否具有该角色
 */
export function hasRole(userRoles, roleName) {
  return userRoles && userRoles.some((role) => role.title === roleName);
}

/**
 * 创建统一的查询选项
 * @param {boolean} suppressAuth - 是否忽略权限设置
 * @returns {Object} 查询选项对象
 */
export function createQueryOptions(suppressAuth = true) {
  return suppressAuth ? { suppressAuth: true } : {};
}
