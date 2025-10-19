// 注意：如遇到 IDE 标红（Cannot find module 'backend/xxx.jsw'），可忽略。Wix Velo 环境下路径无误。
// @ts-ignore
import { getUserPublicInfo, getUserInfoBySlug } from 'backend/getUserPublicInfo.jsw';
// @ts-ignore
import { uploadContestItemToMajnet } from 'backend/majnetUploader.jsw';
import wixData from 'wix-data';
import { 
    extractSlugFromURL, 
    calculateTotalPp, 
    getMaxSequenceId 
} from 'backend/utils';
import { COLLECTIONS } from 'backend/constants.js';
import { logError, logInfo } from 'backend/errorHandler.js';

/**
 * Team数据插入前的处理
 * 重新计算totalPp字段
 */
export function Team_beforeInsert(item, context) {
    item.totalPp = calculateTotalPp(item.order, item.performance2, item.performance3);
    return item;
}

/**
 * Team数据更新前的处理
 * 重新计算totalPp字段，并根据网址更新用户信息
 */
export async function Team_beforeUpdate(item, context) {
    // 重新计算 totalPp
    item.totalPp = calculateTotalPp(item.order, item.performance2, item.performance3);

    // 检查是否有网址，并从中提取用户 slug
    if (item.website && item.totalPp === 0) {
        const userSlug = extractSlugFromURL(item.website);
        if (userSlug) {
            try {
                const userInfo = await getUserInfoBySlug(userSlug);
                if (userInfo) {
                    // 更新团队成员信息
                    item.title = userInfo.nickname;
                    item.photo = userInfo.profilePhoto;
                    item.realId = userInfo.realId;
                }
            } catch (error) {
                logError('Team_beforeUpdate', error, { 
                    itemId: item._id, 
                    userSlug: userSlug 
                });
            }
        }
    }

    return item;
}

/**
 * enterContest034数据插入前的处理
 * 为新上传的谱面分配一个顺序ID
 */
export async function enterContest034_beforeInsert(item, context) {
    try {
        const maxSequenceId = await getMaxSequenceId(COLLECTIONS.ENTER_CONTEST_034, 'sequenceId');
        item.sequenceId = maxSequenceId + 1;
        return item;
    } catch (error) {
        logError('enterContest034_beforeInsert', error, { itemId: item._id });
        // 如果获取最大ID失败，仍然返回item，让系统继续处理
        return item;
    }
}

/**
 * enterContest034数据插入后的处理
 * 自动将新提交的谱面上传到Majnet平台
 * 
 * 重要：
 * 1. afterInsert钩子不应该返回值（数据已保存）
 * 2. 使用 setTimeout 将上传操作推迟到事件循环的下一个周期
 * 3. 确保不会干扰 Wix 的数据保存流程
 */
export function enterContest034_afterInsert(item, context) {
    // 记录日志（同步操作，安全）
    logInfo('enterContest034_afterInsert', `新作品创建，准备上传到Majnet: ${item.firstName || '未命名'}`);
    
    // 使用 setTimeout 延迟执行上传，确保数据保存完成
    // 这样做可以避免钩子干扰数据库事务
    setTimeout(() => {
        uploadContestItemToMajnet(item)
            .then(async (result) => {
                if (result.success) {
                    logInfo('enterContest034_afterInsert', `作品 "${item.firstName}" 已自动上传到Majnet`);
                    
                    // 更新majnetUploaded字段为true
                    // 重要：先获取完整数据，再更新特定字段，避免覆盖其他字段
                    try {
                        // 先获取当前完整数据
                        const currentItem = await wixData.get(COLLECTIONS.ENTER_CONTEST_034, item._id);
                        
                        // 只更新上传状态字段，保留其他所有字段
                        await wixData.update(COLLECTIONS.ENTER_CONTEST_034, {
                            ...currentItem,  // 保留所有现有字段
                            majnetUploaded: true,
                            majnetUploadTime: new Date()
                        });
                        logInfo('enterContest034_afterInsert', `已标记作品 "${item.firstName}" 的上传状态`);
                    } catch (updateError) {
                        logError('enterContest034_afterInsert - 更新上传状态失败', updateError, { 
                            itemId: item._id,
                            itemTitle: item.firstName 
                        });
                    }
                } else {
                    logError('enterContest034_afterInsert - Majnet上传失败', result.error || result.message, { 
                        itemId: item._id,
                        itemTitle: item.firstName 
                    });
                }
            })
            .catch((error) => {
                logError('enterContest034_afterInsert - 上传异常', error, { 
                    itemId: item._id,
                    itemTitle: item.firstName 
                });
            });
    }, 0); // 延迟0ms，推迟到下一个事件循环
    
    // afterInsert 钩子不需要返回值，数据已经保存
    // 不返回任何值以避免潜在的数据覆盖问题
}

/**
 * jobApplication089数据插入后的处理
 * 自动检查用户是否在Team排名数据集中，如果存在则标记为高质量用户
 * 
 * 重要：
 * 1. afterInsert钩子不应该返回值（数据已保存）
 * 2. 使用 setTimeout 将更新操作推迟到事件循环的下一个周期
 * 3. 先获取完整数据再更新，确保不会覆盖其他字段
 */
export function jobApplication089_afterInsert(item, context) {
    // 记录日志
    logInfo('jobApplication089_afterInsert', `用户报名成功，正在检查是否为Qualified用户: ${item._owner}`);
    
    // 使用 setTimeout 延迟执行检查和更新，确保数据保存完成
    setTimeout(() => {
        checkAndMarkQualifiedUser(item)
            .then(async (result) => {
                if (result.isQualified) {
                    logInfo('jobApplication089_afterInsert', `用户 ${item._owner} 已自动标记为Qualified用户`);
                    
                    // 更新isHighQuality字段
                    // 重要：先获取完整数据，再更新特定字段，避免覆盖其他字段
                    try {
                        // 先获取当前完整数据
                        const currentItem = await wixData.get(COLLECTIONS.JOB_APPLICATION_089, item._id);
                        
                        // 只更新isHighQuality字段，保留其他所有字段
                        await wixData.update(COLLECTIONS.JOB_APPLICATION_089, {
                            ...currentItem,  // 保留所有现有字段
                            isHighQuality: true
                        });
                        logInfo('jobApplication089_afterInsert', `已标记用户 ${item._owner} 为Qualified用户`);
                    } catch (updateError) {
                        logError('jobApplication089_afterInsert - 更新Qualified状态失败', updateError, { 
                            itemId: item._id,
                            userId: item._owner 
                        });
                    }
                } else {
                    logInfo('jobApplication089_afterInsert', `用户 ${item._owner} 不在Team排名中，保持普通用户状态`);
                }
            })
            .catch((error) => {
                logError('jobApplication089_afterInsert - 检查Qualified状态异常', error, { 
                    itemId: item._id,
                    userId: item._owner 
                });
            });
    }, 0); // 延迟0ms，推迟到下一个事件循环
    
    // afterInsert 钩子不需要返回值，数据已经保存
}

/**
 * 检查用户是否为Qualified用户（是否在Team排名数据集中）
 * @param {Object} applicationItem - 报名记录对象
 * @returns {Promise<Object>} { isQualified: boolean }
 */
async function checkAndMarkQualifiedUser(applicationItem) {
    try {
        const userId = applicationItem._owner;
        
        if (!userId) {
            return { isQualified: false };
        }
        
        // 查询Team数据集，检查用户是否存在
        // 只通过realId字段匹配
        const teamResults = await wixData
            .query(COLLECTIONS.TEAM)
            .eq('realId', userId)
            .find();
        
        // 如果在Team中找到记录，说明是Qualified用户
        if (teamResults.items.length > 0) {
            logInfo('checkAndMarkQualifiedUser', `用户 ${userId} 在Team排名中找到（realId匹配），标记为Qualified`);
            return { isQualified: true };
        }
        
        return { isQualified: false };
        
    } catch (error) {
        logError('checkAndMarkQualifiedUser', error, { userId: applicationItem._owner });
        return { isQualified: false };
    }
}








