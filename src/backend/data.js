import { updateUserPoints } from 'backend/forumPoints.jsw';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';
import wixData from 'wix-data';
import { getUserInfoBySlug } from 'backend/getUserPublicInfo';
import { 
    extractSlugFromURL, 
    calculateTotalPp, 
    getMaxSequenceId 
} from 'backend/utils';
import { COLLECTIONS } from 'backend/constants';
import { logError } from 'backend/errorHandler';

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

// 注释掉的afterUpdate函数保留，以备将来需要时使用
/*
export async function Team_afterUpdate(item, context) {
    if (item.totalPp && item.totalPp != 0) {
        const userSlug = extractSlugFromURL(item.website);

        if (userSlug) {
            try {
                const userInfo = await getUserInfoBySlug(userSlug);

                if (userInfo) {
                    // 获取完整的当前条目数据
                    const currentItem = await wixData.get("Team", item._id);
                    if (currentItem) {
                        // 重新计算 totalPp
                        const totalPp = calculateTotalPp(
                            currentItem.order, 
                            currentItem.performance2, 
                            currentItem.performance3
                        );

                        // 检查是否需要更新（比较昵称、头像和 realId）
                        if (currentItem.title !== userInfo.nickname || 
                            currentItem.photo !== userInfo.profilePhoto || 
                            currentItem.realId !== userInfo.realId) {
                            
                            // 更新条目
                            const updatedItem = await wixData.update("Team", {
                                ...currentItem,
                                title: userInfo.nickname,
                                realId: userInfo.realId,
                                totalPp: totalPp
                            });
                            console.log("Team item updated successfully:", updatedItem);
                        } else {
                            console.log("No changes required for the item.");
                        }
                    }
                }
            } catch (error) {
                logError('Team_afterUpdate', error, { itemId: item._id });
            }
        }
    }
}
*/





