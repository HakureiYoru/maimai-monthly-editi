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
 */
export async function enterContest034_afterInsert(item, context) {
    logInfo('enterContest034_afterInsert', `新作品创建，准备上传到Majnet: ${item.firstName || '未命名'}`);
    
    // 异步上传，不阻塞数据保存操作
    uploadContestItemToMajnet(item)
        .then(async (result) => {
            if (result.success) {
                logInfo('enterContest034_afterInsert', `作品 "${item.firstName}" 已自动上传到Majnet`);
                
                // 更新majnetUploaded字段为true
                try {
                    await wixData.update(COLLECTIONS.ENTER_CONTEST_034, {
                        _id: item._id,
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
    
    return item;
}








