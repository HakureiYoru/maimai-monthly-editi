// API Reference: https://www.wix.com/velo/reference/api-overview/introduction
// 评论检索页面 - 海选成员使用
// 【优化】添加分页功能，参考主会场的评论分页机制

import wixData from 'wix-data';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';
import { getWorkWeightedRatingData } from 'backend/ratingTaskManager.jsw';

// ==================== 分页配置 ====================
const WORKS_PER_PAGE = 10; // 每页显示10个作品

// ==================== 全局状态管理 ====================
let allWorksCache = []; // 缓存所有作品基础信息
let workOwnerMapCache = {}; // 缓存作品所有者映射
let paginationState = {
    currentPage: 1,
    totalWorks: 0,
    totalPages: 0,
    viewMode: 'work', // 'work' 或 'user'
    searchFilter: '',
    sortBy: 'id'
};

// 作品评论数据缓存（按页缓存）
let workDataCache = new Map(); // key: pageNumber, value: worksData[]

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
    console.log('[评论检索] 页面初始化...');
    
    // 初始化：预加载所有作品基础信息
    await initializeWorksCache();
    
    // 加载第一页数据
    await loadPageData(1);
    
    // 监听来自自定义HTML元件的消息
    // @ts-ignore - 自定义HTML元件ID
    const htmlElement = $w('#commentSearchHtml');
    if (htmlElement && htmlElement.onMessage) {
        htmlElement.onMessage(async (event) => {
            await handleHtmlMessage(event);
        });
    }
});

/**
 * 【新增】初始化作品缓存 - 一次性加载所有作品基础信息
 */
async function initializeWorksCache() {
    try {
        console.log('[评论检索] 初始化作品缓存...');
        
        // 1. 查询所有作品基础信息
        const worksResult = await wixData.query("enterContest034")
            .limit(1000)
            .find();
        
        console.log(`[评论检索] 查询到 ${worksResult.items.length} 个作品`);
        
        // 2. 构建作品所有者映射
        workOwnerMapCache = {};
        allWorksCache = [];
        
        worksResult.items.forEach(work => {
            workOwnerMapCache[work.sequenceId] = work._owner;
            allWorksCache.push({
                sequenceId: work.sequenceId,
                title: work.firstName || '未知作品',
                _owner: work._owner
            });
        });
        
        console.log('[评论检索] 作品缓存初始化完成');
        
    } catch (error) {
        console.error('[评论检索] 初始化作品缓存失败:', error);
    }
}

/**
 * 【优化】加载指定页的数据
 */
async function loadPageData(pageNumber, searchFilter = '', sortBy = 'id') {
    try {
        console.log(`[评论检索] 加载第 ${pageNumber} 页数据...`);
        
        // 更新分页状态
        paginationState.currentPage = pageNumber;
        paginationState.searchFilter = searchFilter;
        paginationState.sortBy = sortBy;
        
        // 1. 获取所有有评论的作品列表
        const worksWithComments = await getWorksWithComments();
        
        // 2. 应用搜索筛选
        let filteredWorks = worksWithComments;
        if (searchFilter) {
            filteredWorks = worksWithComments.filter(work => {
                const idMatch = String(work.sequenceId).includes(searchFilter);
                const titleMatch = work.title.toLowerCase().includes(searchFilter.toLowerCase());
                return idMatch || titleMatch;
            });
        }
        
        // 3. 应用排序
        if (sortBy === 'id') {
            filteredWorks.sort((a, b) => a.sequenceId - b.sequenceId);
        } else if (sortBy === 'comments') {
            filteredWorks.sort((a, b) => b.commentCount - a.commentCount);
        }
        
        // 4. 计算分页信息
        paginationState.totalWorks = filteredWorks.length;
        paginationState.totalPages = Math.max(1, Math.ceil(filteredWorks.length / WORKS_PER_PAGE));
        
        // 确保页码在有效范围内
        if (pageNumber > paginationState.totalPages) {
            pageNumber = paginationState.totalPages;
            paginationState.currentPage = pageNumber;
        }
        
        // 5. 获取当前页的作品
        const startIndex = (pageNumber - 1) * WORKS_PER_PAGE;
        const endIndex = startIndex + WORKS_PER_PAGE;
        const pagedWorks = filteredWorks.slice(startIndex, endIndex);
        
        console.log(`[评论检索] 当前页: ${pageNumber}/${paginationState.totalPages}, 作品数: ${pagedWorks.length}`);
        
        // 6. 加载当前页作品的详细评论数据
        const worksData = await loadWorksDetailData(pagedWorks);
        
        // 7. 发送数据到HTML元件
        const htmlElement = $w('#commentSearchHtml');
        if (htmlElement && htmlElement.postMessage) {
            htmlElement.postMessage({
                action: 'updateData',
                works: worksData,
                pagination: {
                    currentPage: pageNumber,
                    totalPages: paginationState.totalPages,
                    totalWorks: paginationState.totalWorks,
                    worksPerPage: WORKS_PER_PAGE
                }
            });
        }
        
        console.log(`[评论检索] 第 ${pageNumber} 页数据已发送`);
        
    } catch (error) {
        console.error('[评论检索] 加载页面数据失败:', error);
        
        // 发送错误信息到HTML元件
        const htmlElement = $w('#commentSearchHtml');
        if (htmlElement && htmlElement.postMessage) {
            htmlElement.postMessage({
                action: 'error',
                message: '加载数据失败，请刷新重试'
            });
        }
    }
}

/**
 * 【新增】获取所有有评论的作品列表（仅统计数量，不加载详细评论）
 */
async function getWorksWithComments() {
    try {
        // 查询所有主评论（排除楼中楼和作者自评）
        const commentsResult = await wixData.query("BOFcomment")
            .isEmpty("replyTo")
            .limit(1000)
            .find();
        
        // 按作品分组统计评论数量
        const workCommentsCount = {};
        
        for (const comment of commentsResult.items) {
            const workNumber = comment.workNumber;
            const workOwner = workOwnerMapCache[workNumber];
            const isAuthorComment = comment._owner === workOwner;
            
            // 排除作者自评
            if (!isAuthorComment) {
                workCommentsCount[workNumber] = (workCommentsCount[workNumber] || 0) + 1;
            }
        }
        
        // 构建有评论的作品列表
        const worksWithComments = [];
        for (const work of allWorksCache) {
            const commentCount = workCommentsCount[work.sequenceId] || 0;
            if (commentCount > 0) {
                worksWithComments.push({
                    sequenceId: work.sequenceId,
                    title: work.title,
                    commentCount: commentCount
                });
            }
        }
        
        console.log(`[评论检索] 共有 ${worksWithComments.length} 个作品有评论`);
        return worksWithComments;
        
    } catch (error) {
        console.error('[评论检索] 获取作品列表失败:', error);
        return [];
    }
}

/**
 * 【新增】加载作品的详细评论数据
 */
async function loadWorksDetailData(works) {
    const worksData = [];
    
    for (const work of works) {
        try {
            const workNumber = work.sequenceId;
            
            // 查询该作品的所有主评论
            const commentsResult = await wixData.query("BOFcomment")
                .eq("workNumber", workNumber)
                .isEmpty("replyTo")
                .limit(1000)
                .find();
            
            // 过滤掉作者自评
            const validComments = [];
            for (const comment of commentsResult.items) {
                const workOwner = workOwnerMapCache[workNumber];
                const isAuthorComment = comment._owner === workOwner;
                
                if (!isAuthorComment) {
                    validComments.push({
                        userId: comment._owner,
                        score: comment.score,
                        comment: comment.comment,
                        createdDate: comment._createdDate
                    });
                }
            }
            
            if (validComments.length === 0) {
                continue;
            }
            
            // 获取权重评分数据
            let weightedData = null;
            try {
                weightedData = await getWorkWeightedRatingData(workNumber);
            } catch (error) {
                console.error(`[评论检索] 获取作品 ${workNumber} 权重数据失败:`, error);
            }
            
            // 标记每个评论的权重
            const ratersWithWeight = validComments.map(comment => {
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
                title: work.title,
                numRatings: validComments.length,
                highWeightCount: weightedData ? weightedData.highWeightCount : 0,
                lowWeightCount: weightedData ? weightedData.lowWeightCount : 0,
                raters: ratersWithWeight
            });
            
        } catch (error) {
            console.error(`[评论检索] 加载作品 ${work.sequenceId} 数据失败:`, error);
        }
    }
    
    return worksData;
}

/**
 * 处理来自HTML元件的消息
 */
async function handleHtmlMessage(event) {
    const data = event.data;
    
    if (data.action === 'changePage') {
        // 翻页请求
        await loadPageData(data.page, paginationState.searchFilter, paginationState.sortBy);
    } else if (data.action === 'search') {
        // 搜索请求
        await loadPageData(1, data.searchValue, paginationState.sortBy);
    } else if (data.action === 'sort') {
        // 排序请求
        await loadPageData(1, paginationState.searchFilter, data.sortBy);
    } else if (data.action === 'ready') {
        // HTML元件初始化完成
        console.log('[评论检索] HTML元件已准备就绪');
    }
}
