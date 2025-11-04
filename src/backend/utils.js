/**
 * 通用工具函数模块
 * 提供项目中常用的工具函数，减少代码重复
 */

import wixData from 'wix-data';
import { POINTS_CONFIG, COLLECTIONS } from 'backend/constants.js';

/**
 * 从URL中提取用户slug
 * @param {string} url - 包含用户profile的URL
 * @returns {string|null} 提取出的用户slug，失败返回null
 */
export function extractSlugFromURL(url) {
    console.log("URL to extract slug from:", url);
    
    const parts = url.split('/profile/');
    if (parts.length === 2) {
        const slugParts = parts[1].split('/');
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
    const results = await query.limit(pageSize).skip(accumulatedData.length).find();

    if (results.items.length > 0) {
        accumulatedData = accumulatedData.concat(results.items);
        if (results.items.length === pageSize) {
            return loadAllData(query, accumulatedData);
        }
    }
    return accumulatedData;
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
        console.error('JSON parsing error:', error);
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
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
}

/**
 * 获取数据库集合中的最大序列ID
 * @param {string} collectionName - 集合名称
 * @param {string} fieldName - 字段名称，默认为'sequenceId'
 * @returns {Promise<number>} 最大序列ID
 */
export async function getMaxSequenceId(collectionName, fieldName = 'sequenceId') {
    try {
        const results = await wixData.query(collectionName)
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
    return userRoles && userRoles.some(role => role.title === roleName);
}

/**
 * 格式化进度奖励消息
 * @param {number} progressValue - 进度百分比
 * @returns {string} 奖励消息
 */
export function formatProgressRewardMessage(progressValue) {
    if (progressValue >= 90) {
        return "您已经评论了绝大部分作品，小小蓝白会给予您800积分奖励~";
    } else if (progressValue >= 60) {
        return "您的评论已过大半，小小蓝白会给予您600积分奖励~";
    } else if (progressValue >= 40) {
        return "您已评论了接近半数的作品，小小蓝白会给予您400积分奖励~";
    } else {
        return "继续评论更多作品以获得更多奖励~";
    }
}

/**
 * 生成安全的RGB颜色值
 * @param {number} score - 分数
 * @param {number} maxScore - 最大分数，默认1000
 * @returns {string} RGB颜色字符串
 */
export function generateScoreBasedColor(score, maxScore = 1000) {
    const normalizedScore = Math.max(0, Math.min(score, maxScore));
    const redAmount = Math.floor(normalizedScore / maxScore * 255);
    return `rgb(${redAmount}, 0, 0)`;
}

/**
 * 创建统一的查询选项
 * @param {boolean} suppressAuth - 是否忽略权限设置
 * @returns {Object} 查询选项对象
 */
export function createQueryOptions(suppressAuth = true) {
    return suppressAuth ? { suppressAuth: true } : {};
}

/**
 * 验证必需字段
 * @param {Object} data - 要验证的数据对象
 * @param {Array<string>} requiredFields - 必需字段数组
 * @returns {Array<string>} 缺失的字段数组
 */
export function validateRequiredFields(data, requiredFields) {
    return requiredFields.filter(field => 
        data[field] === undefined || 
        data[field] === null || 
        data[field] === ''
    );
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== 文件处理工具 ====================

/**
 * 获取远程文件内容
 * @param {string} url - 文件URL
 * @returns {Promise<string>} 文件内容
 */
export async function getFileContent(url) {
    const { fetch } = await import('wix-fetch');
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    }
    
    return await response.text();
}

/**
 * 检查文件是否存在
 * @param {string} url - 文件URL
 * @returns {Promise<boolean>} 文件是否存在
 */
export async function checkFileExists(url) {
    try {
        const { fetch } = await import('wix-fetch');
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
}

/**
 * 获取文件基本信息
 * @param {string} url - 文件URL
 * @returns {Promise<Object>} 文件信息
 */
export async function getFileInfo(url) {
    try {
        const { fetch } = await import('wix-fetch');
        const response = await fetch(url, { method: 'HEAD' });
        
        return {
            url,
            exists: response.ok,
            contentType: response.headers.get('content-type'),
            contentLength: parseInt(response.headers.get('content-length') || '0'),
            lastModified: response.headers.get('last-modified')
        };
    } catch (error) {
        return {
            url,
            exists: false,
            contentType: null,
            contentLength: 0,
            lastModified: null,
            error: error.message
        };
    }
}

/**
 * 下载并解析JSON文件
 * @param {string} url - JSON文件URL
 * @returns {Promise<Object>} 解析后的JSON对象
 */
export async function downloadJsonFile(url) {
    const content = await getFileContent(url);
    return safeJsonParse(content, {});
}

/**
 * 批量检查文件是否存在
 * @param {Array<string>} urls - 文件URL数组
 * @returns {Promise<Array<Object>>} 文件状态数组
 */
export async function batchCheckFiles(urls) {
    const promises = urls.map(async (url) => {
        const exists = await checkFileExists(url);
        return { url, exists };
    });
    
    return Promise.all(promises);
} 