// API Reference: https://www.wix.com/velo/reference/api-overview/introduction
// 评论检索页面 - 海选成员使用
// 【优化】添加分页功能，参考主会场的评论分页机制

import wixData from 'wix-data';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';
import {
    fetchAllMainComments,
    fetchAllWorks,
    getWorkWeightedRatingData
} from 'backend/ratingTaskManager.jsw';

// ==================== 分页配置 ====================
const WORKS_PER_PAGE = 10; // 每页显示10个作品

// ==================== 全局状态管理 ====================
let allWorksCache = []; // 缓存所有作品基础信息
let workOwnerMapCache = {}; // 缓存作品所有者映射
let workTitleMapCache = {}; // 缓存作品ID到标题的映射（快速查找）
let allCommentsCache = []; // 缓存所有评论数据
let commentsByWorkCache = {}; // 按作品ID分组的评论缓存
let weightDataCache = new Map(); // 权重数据缓存 key: workNumber, value: weightedData
let paginationState = {
    currentPage: 1,
    totalWorks: 0,
    totalPages: 0,
    viewMode: 'work', // 'work' 或 'user'
    searchFilter: '',
    sortBy: 'id',
    selectedUserId: '' // 用户视图下选中的用户ID
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
    
    const startTime = Date.now();
    
    // 初始化：预加载所有作品基础信息和评论数据
    await initializeWorksCache();
    
    const cacheTime = Date.now();
    console.log(`[评论检索] 缓存初始化耗时: ${cacheTime - startTime}ms`);
    
    // 加载第一页数据（默认作品视图）
    await loadPageData(1, 'work', '', 'id', '');
    
    const loadTime = Date.now();
    console.log(`[评论检索] 首页加载耗时: ${loadTime - cacheTime}ms，总耗时: ${loadTime - startTime}ms`);
    
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
 * 【新增】初始化作品缓存 - 一次性加载所有作品基础信息和评论数据
 */
async function initializeWorksCache() {
    try {
        console.log('[评论检索] 初始化作品缓存...');
        
        // 1. 查询所有作品基础信息
        const worksResult = await fetchAllWorks();
        
        console.log(`[评论检索] 查询到 ${worksResult.length} 个作品`);
        
        // 2. 构建作品所有者映射和标题映射
        workOwnerMapCache = {};
        workTitleMapCache = {};
        allWorksCache = [];
        
        let emptyTitleCount = 0;
        
        worksResult.forEach(work => {
            // 获取作品标题，优先使用firstName，如果为空则使用其他字段
            let title = work.firstName || work.title || work.name || `作品#${work.sequenceId}`;
            
            // 清理标题（去除前后空格）
            title = String(title).trim();
            
            // 如果清理后为空，使用默认值
            if (!title) {
                title = `作品#${work.sequenceId}`;
                emptyTitleCount++;
            }
            
            workOwnerMapCache[work.sequenceId] = work._owner;
            workTitleMapCache[work.sequenceId] = title;
            
            allWorksCache.push({
                sequenceId: work.sequenceId,
                title: title,
                _owner: work._owner
            });
        });
        
        if (emptyTitleCount > 0) {
            console.log(`[评论检索] 警告：有 ${emptyTitleCount} 个作品标题为空，已使用默认标题`);
        }
        
        console.log(`[评论检索] 作品缓存构建完成，示例数据：`, {
            totalWorks: allWorksCache.length,
            sampleWork: allWorksCache[0],
            titleMapSample: Object.keys(workTitleMapCache).slice(0, 3).map(id => ({
                id: id,
                title: workTitleMapCache[id]
            }))
        });
        
        // 3. 加载所有评论数据
        const commentsResult = await fetchAllMainComments();
        
        console.log(`[评论检索] 查询到 ${commentsResult.length} 条评论`);
        
        // 过滤掉作者自评并按作品分组
        allCommentsCache = [];
        commentsByWorkCache = {};
        let missingWorkCount = 0;
        
        for (const comment of commentsResult) {
            const workOwner = workOwnerMapCache[comment.workNumber];
            const isAuthorComment = comment._owner === workOwner;
            
            // 检查作品是否存在
            if (!workTitleMapCache[comment.workNumber]) {
                missingWorkCount++;
                if (missingWorkCount <= 5) {
                    console.log(`[评论检索] 警告：评论关联的作品 #${comment.workNumber} 不存在`);
                }
            }
            
            if (!isAuthorComment) {
                const commentData = {
                    userId: comment._owner,
                    workNumber: comment.workNumber,
                    score: comment.score,
                    comment: comment.comment,
                    createdDate: comment._createdDate
                };
                
                allCommentsCache.push(commentData);
                
                // 按作品分组
                if (!commentsByWorkCache[comment.workNumber]) {
                    commentsByWorkCache[comment.workNumber] = [];
                }
                commentsByWorkCache[comment.workNumber].push(commentData);
            }
        }
        
        if (missingWorkCount > 0) {
            console.log(`[评论检索] 警告：共有 ${missingWorkCount} 条评论关联的作品不存在`);
        }
        
        console.log(`[评论检索] 评论缓存初始化完成，共 ${allCommentsCache.length} 条有效评论`);
        
    } catch (error) {
        console.error('[评论检索] 初始化作品缓存失败:', error);
    }
}

/**
 * 【优化】加载指定页的数据
 */
async function loadPageData(pageNumber, viewMode = 'work', searchFilter = '', sortBy = 'id', userId = '') {
    try {
        console.log(`[评论检索] 加载第 ${pageNumber} 页数据 (视图: ${viewMode})...`);
        
        // 【新增】发送加载状态到前端
        const htmlElement = $w('#commentSearchHtml');
        if (htmlElement && htmlElement.postMessage) {
            htmlElement.postMessage({
                action: 'loading'
            });
        }
        
        // 更新分页状态
        paginationState.currentPage = pageNumber;
        paginationState.viewMode = viewMode;
        paginationState.searchFilter = searchFilter;
        paginationState.sortBy = sortBy;
        paginationState.selectedUserId = userId;
        
        let worksData = [];
        let userList = [];
        
        if (viewMode === 'user') {
            // 用户视图
            const result = await loadUserViewData(pageNumber, userId);
            worksData = result.worksData;
            userList = result.userList;
        } else {
            // 作品视图
            worksData = await loadWorkViewData(pageNumber, searchFilter, sortBy);
        }
        
        // 发送数据到HTML元件
        if (htmlElement && htmlElement.postMessage) {
            const message = {
                action: 'updateData',
                works: worksData,
                pagination: {
                    currentPage: pageNumber,
                    totalPages: paginationState.totalPages,
                    totalWorks: paginationState.totalWorks,
                    worksPerPage: WORKS_PER_PAGE
                }
            };
            
            // 如果是用户视图，附加用户列表
            if (viewMode === 'user') {
                message.userList = userList;
            }
            
            htmlElement.postMessage(message);
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
 * 【新增】加载作品视图数据
 */
async function loadWorkViewData(pageNumber, searchFilter, sortBy) {
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
    
    console.log(`[评论检索] 作品视图 - 当前页: ${pageNumber}/${paginationState.totalPages}, 作品数: ${pagedWorks.length}`);
    
    // 6. 加载当前页作品的详细评论数据
    const worksData = await loadWorksDetailData(pagedWorks);
    
    return worksData;
}

/**
 * 【新增】加载用户视图数据
 */
async function loadUserViewData(pageNumber, selectedUserId) {
    // 1. 按用户分组评论
    const userCommentsMap = {};
    
    for (const comment of allCommentsCache) {
        const userId = comment.userId;
        
        if (!userCommentsMap[userId]) {
            userCommentsMap[userId] = [];
        }
        
        userCommentsMap[userId].push({
            workNumber: comment.workNumber,
            score: comment.score,
            comment: comment.comment,
            createdDate: comment.createdDate
        });
    }
    
    // 2. 构建用户列表
    let userList = [];
    for (const userId in userCommentsMap) {
        userList.push({
            userId: userId,
            commentCount: userCommentsMap[userId].length
        });
    }
    
    // 按评论数排序
    userList.sort((a, b) => b.commentCount - a.commentCount);
    
    // 3. 应用用户筛选
    let filteredUsers = userList;
    if (selectedUserId) {
        filteredUsers = userList.filter(user => user.userId === selectedUserId);
    }
    
    // 4. 计算分页信息
    paginationState.totalWorks = filteredUsers.length;
    paginationState.totalPages = Math.max(1, Math.ceil(filteredUsers.length / WORKS_PER_PAGE));
    
    // 确保页码在有效范围内
    if (pageNumber > paginationState.totalPages) {
        pageNumber = paginationState.totalPages;
        paginationState.currentPage = pageNumber;
    }
    
    // 5. 获取当前页的用户
    const startIndex = (pageNumber - 1) * WORKS_PER_PAGE;
    const endIndex = startIndex + WORKS_PER_PAGE;
    const pagedUsers = filteredUsers.slice(startIndex, endIndex);
    
    console.log(`[评论检索] 用户视图 - 当前页: ${pageNumber}/${paginationState.totalPages}, 用户数: ${pagedUsers.length}`);
    
    // 6. 构建用户评论数据（用于在HTML中按用户分组显示）
    const worksData = await buildUserWorksData(pagedUsers, userCommentsMap);
    
    return {
        worksData: worksData,
        userList: userList
    };
}

/**
 * 【优化】构建用户评论数据
 */
async function buildUserWorksData(pagedUsers, userCommentsMap) {
    const worksData = [];
    
    // 【优化】收集需要加载权重数据的作品ID
    const workNumbersToLoad = new Set();
    for (const user of pagedUsers) {
        const comments = userCommentsMap[user.userId];
        if (comments.length > 0) {
            // 只需要第一个作品的权重数据
            workNumbersToLoad.add(comments[0].workNumber);
        }
    }
    
    // 【优化】批量加载权重数据
    await batchLoadWeightData(Array.from(workNumbersToLoad));
    
    for (const user of pagedUsers) {
        const userId = user.userId;
        const comments = userCommentsMap[userId];
        
        // 【优化】从缓存获取权重数据
        let isHighQuality = false;
        if (comments.length > 0) {
            const firstWorkNumber = comments[0].workNumber;
            const weightedData = weightDataCache.get(firstWorkNumber);
            if (weightedData && weightedData.userQualityMap) {
                isHighQuality = weightedData.userQualityMap[userId] === true;
            }
        }
        
        // 构建评论列表（附带作品信息）
        const ratersWithWork = comments.map(comment => {
            // 使用快速查找映射获取作品标题
            let workTitle = workTitleMapCache[comment.workNumber];
            
            if (!workTitle) {
                workTitle = `作品#${comment.workNumber}`;
            }
            
            return {
                userId: userId,
                workId: comment.workNumber,
                workTitle: workTitle,
                score: comment.score,
                comment: comment.comment,
                createdDate: comment.createdDate,
                isHighQuality: isHighQuality
            };
        });
        
        // 按作品ID排序
        ratersWithWork.sort((a, b) => a.workId - b.workId);
        
        worksData.push({
            sequenceId: userId, // 使用userId作为sequenceId（用于前端识别）
            title: `用户评论`, // 标题不重要，前端会显示加密的用户名
            numRatings: comments.length,
            highWeightCount: isHighQuality ? comments.length : 0,
            lowWeightCount: isHighQuality ? 0 : comments.length,
            raters: ratersWithWork
        });
    }
    
    return worksData;
}

/**
 * 【优化】获取所有有评论的作品列表 - 使用缓存避免重复查询
 */
async function getWorksWithComments() {
    try {
        // 【优化】直接使用缓存数据统计
        const worksWithComments = [];
        
        for (const workNumber in commentsByWorkCache) {
            const comments = commentsByWorkCache[workNumber];
            if (comments && comments.length > 0) {
                const work = allWorksCache.find(w => w.sequenceId === parseInt(workNumber));
                if (work) {
                    worksWithComments.push({
                        sequenceId: work.sequenceId,
                        title: work.title,
                        commentCount: comments.length
                    });
                }
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
 * 【优化】加载作品的详细评论数据 - 使用缓存避免重复查询
 */
async function loadWorksDetailData(works) {
    const worksData = [];
    
    // 【优化】批量获取需要的权重数据
    const workNumbers = works.map(w => w.sequenceId);
    await batchLoadWeightData(workNumbers);
    
    for (const work of works) {
        try {
            const workNumber = work.sequenceId;
            
            // 【优化】从缓存获取评论，无需查询数据库
            const validComments = commentsByWorkCache[workNumber] || [];
            
            if (validComments.length === 0) {
                continue;
            }
            
            // 【优化】从缓存获取权重数据
            const weightedData = weightDataCache.get(workNumber);
            
            // 标记每个评论的权重
            const ratersWithWeight = validComments.map(comment => {
                let isHighQuality = false;
                if (weightedData && weightedData.userQualityMap) {
                    isHighQuality = weightedData.userQualityMap[comment.userId] === true;
                }
                
                return {
                    userId: comment.userId,
                    score: comment.score,
                    comment: comment.comment,
                    createdDate: comment.createdDate,
                    isHighQuality: isHighQuality
                };
            });
            
            // 使用标题映射确保标题正确
            const workTitle = workTitleMapCache[workNumber] || work.title || `作品#${workNumber}`;
            
            worksData.push({
                sequenceId: workNumber,
                title: workTitle,
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
 * 【新增】批量加载权重数据
 */
async function batchLoadWeightData(workNumbers) {
    const needToLoad = workNumbers.filter(num => !weightDataCache.has(num));
    
    if (needToLoad.length === 0) {
        return; // 全部已缓存
    }
    
    console.log(`[评论检索] 批量加载 ${needToLoad.length} 个作品的权重数据...`);
    
    // 并行加载权重数据（限制并发数）
    const batchSize = 5; // 每批5个
    for (let i = 0; i < needToLoad.length; i += batchSize) {
        const batch = needToLoad.slice(i, i + batchSize);
        const promises = batch.map(async workNumber => {
            try {
                const weightedData = await getWorkWeightedRatingData(workNumber);
                weightDataCache.set(workNumber, weightedData);
            } catch (error) {
                console.error(`[评论检索] 获取作品 ${workNumber} 权重数据失败:`, error);
                weightDataCache.set(workNumber, null); // 缓存失败结果避免重试
            }
        });
        
        await Promise.all(promises);
    }
    
    console.log(`[评论检索] 权重数据加载完成`);
}

/**
 * 处理来自HTML元件的消息
 */
async function handleHtmlMessage(event) {
    const data = event.data;
    
    if (data.action === 'changePage') {
        // 翻页请求
        const viewMode = data.viewMode || paginationState.viewMode;
        const userId = data.userId || paginationState.selectedUserId;
        await loadPageData(
            data.page, 
            viewMode,
            paginationState.searchFilter, 
            paginationState.sortBy,
            userId
        );
    } else if (data.action === 'search') {
        // 搜索请求（仅作品视图）
        await loadPageData(1, 'work', data.searchValue, paginationState.sortBy, '');
    } else if (data.action === 'sort') {
        // 排序请求（仅作品视图）
        await loadPageData(1, 'work', paginationState.searchFilter, data.sortBy, '');
    } else if (data.action === 'switchView') {
        // 视图切换请求
        const viewMode = data.viewMode;
        await loadPageData(1, viewMode, '', 'id', '');
    } else if (data.action === 'filterUser') {
        // 用户筛选请求（仅用户视图）
        await loadPageData(1, 'user', '', 'id', data.userId);
    } else if (data.action === 'ready') {
        // HTML元件初始化完成
        console.log('[评论检索] HTML元件已准备就绪');
    }
}
