// API Reference: https://www.wix.com/velo/reference/api-overview/introduction
// 评论检索页面 - 海选成员使用

import wixData from 'wix-data';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';
import { getWorkWeightedRatingData } from 'backend/ratingTaskManager.jsw';

/**
 * 本地函数：获取用户昵称
 */
async function getUserNickname(userId) {
    try {
        // 首先尝试使用getUserPublicInfo
        const userInfo = await getUserPublicInfo(userId);
        if (userInfo && userInfo.name) {
            return userInfo.name;
        }
        
        // 如果getUserPublicInfo失败，尝试直接查询Members/PublicData
        const result = await wixData.query("Members/PublicData")
            .eq("_id", userId)
            .find();
            
        if (result.items.length > 0 && result.items[0].nickname) {
            return result.items[0].nickname;
        }
        
        // 如果都失败了，返回"未知用户"
        return '未知用户';
        
    } catch (error) {
        console.error('获取用户昵称失败:', error);
        return '未知用户';
    }
}

$w.onReady(async function () {
    // 加载评论数据
    await loadCommentsData();
    
    // 监听来自自定义HTML元件的消息
    // @ts-ignore - 自定义HTML元件ID
    const htmlElement = $w('#commentSearchHtml');
    if (htmlElement && htmlElement.onMessage) {
        htmlElement.onMessage((event) => {
            handleHtmlMessage(event);
        });
    }
});

/**
 * 加载评论数据
 */
async function loadCommentsData() {
    try {
        console.log('开始加载评论数据...');
        
        // 1. 查询所有作品
        const worksResult = await wixData.query("enterContest034")
            .limit(1000)
            .find();
        
        console.log(`查询到 ${worksResult.items.length} 个作品`);
        
        // 2. 查询所有主评论（排除楼中楼）
        const commentsResult = await wixData.query("BOFcomment")
            .isEmpty("replyTo")
            .limit(1000)
            .find();
        
        console.log(`查询到 ${commentsResult.items.length} 条评论`);
        
        // 3. 构建作品所有者映射
        const workOwnerMap = {};
        worksResult.items.forEach(work => {
            workOwnerMap[work.sequenceId] = work._owner;
        });
        
        // 4. 按作品分组评论数据
        const workCommentsMap = {};
        
        for (const comment of commentsResult.items) {
            const workNumber = comment.workNumber;
            
            if (!workCommentsMap[workNumber]) {
                workCommentsMap[workNumber] = [];
            }
            
            // 判断是否为作者自评
            const workOwner = workOwnerMap[workNumber];
            const isAuthorComment = comment._owner === workOwner;
            
            // 排除作者自评
            if (!isAuthorComment) {
                workCommentsMap[workNumber].push({
                    userId: comment._owner,
                    score: comment.score,
                    comment: comment.comment,
                    createdDate: comment._createdDate
                });
            }
        }
        
        console.log('评论分组完成');
        
        // 5. 构建最终数据结构
        const worksData = [];
        
        for (const work of worksResult.items) {
            const workNumber = work.sequenceId;
            const comments = workCommentsMap[workNumber] || [];
            
            // 只包含有评论的作品
            if (comments.length === 0) {
                continue;
            }
            
            // 获取权重评分数据
            let weightedData = null;
            try {
                weightedData = await getWorkWeightedRatingData(workNumber);
            } catch (error) {
                console.error(`获取作品 ${workNumber} 权重数据失败:`, error);
            }
            
            // 标记每个评论的权重
            const ratersWithWeight = comments.map(comment => {
                // 根据权重数据判断该用户是否为高权重
                let isHighQuality = false;
                if (weightedData && weightedData.userQualityMap) {
                    isHighQuality = weightedData.userQualityMap[comment.userId] === true;
                }
                
                return {
                    ...comment,
                    isHighQuality: isHighQuality
                };
            });
            
            worksData.push({
                sequenceId: workNumber,
                title: work.firstName || '未知作品',
                numRatings: comments.length,
                highWeightCount: weightedData ? weightedData.highWeightCount : 0,
                lowWeightCount: weightedData ? weightedData.lowWeightCount : 0,
                raters: ratersWithWeight
            });
        }
        
        console.log(`构建了 ${worksData.length} 个作品的评论数据`);
        
        // 6. 按ID排序
        worksData.sort((a, b) => a.sequenceId - b.sequenceId);
        
        // 7. 发送数据到自定义HTML元件
        // @ts-ignore - 自定义HTML元件ID
        const htmlElement = $w('#commentSearchHtml');
        if (htmlElement && htmlElement.postMessage) {
            htmlElement.postMessage({
                action: 'init',
                works: worksData
            });
        }
        
        console.log('数据已发送到HTML元件');
        
    } catch (error) {
        console.error('加载评论数据失败:', error);
    }
}

/**
 * 处理来自HTML元件的消息
 */
async function handleHtmlMessage(event) {
    const data = event.data;
    
    // 目前没有需要处理的消息
    // 用户名已在HTML端加密，不需要从后端获取
}
