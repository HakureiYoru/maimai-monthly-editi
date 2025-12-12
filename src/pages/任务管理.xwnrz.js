/**
 * 任务管理页面 - 管理员专用
 * 显示所有用户的任务分配情况和权重算法详情
 */

import wixData from "wix-data";
import wixWindow from "wix-window";
import { checkIsSeaSelectionMember } from "backend/auditorManagement.jsw";
import { getUserPublicInfo } from "backend/getUserPublicInfo.jsw";
import {
  getAllUsersTaskManagementData,
  forceRefreshUserTasks,
  getAllWorksWeightComparison,
} from "backend/ratingTaskManager.jsw";

let allUsersData = [];
let filteredUsersData = [];
let userInfoCache = {}; // 缓存用户公开信息
let worksWeightComparisonData = null; // 作品权重对比数据
let taskSummaryData = null; // 作品任务占用统计
let currentFilters = {
  quality: 'all',
  completion: 'all',
  search: ''
}; // 保存当前的筛选状态
let currentSortBy = 'completion'; // 保存当前的排序方式

$w.onReady(async function () {
  // 权限检查
  const hasPermission = await checkIsSeaSelectionMember();
  if (!hasPermission) {
    const errorPayload = {
      type: "error",
      message: "您没有权限访问此页面",
    };
    $w("#htmlTask").postMessage(errorPayload);
    safePostToTasksum(errorPayload);
    return;
  }

  // 显示加载状态
  $w("#htmlTask").postMessage({
    type: "loading",
    message: "正在加载任务管理数据...",
  });

  // 加载数据
  await loadAllUsersTaskData();

  // 设置事件监听器
  setupEventListeners();
});

/**
 * 批量获取用户公开信息（分批并行加载，提高性能）
 * @param {Array<string>} userIds - 用户ID列表
 * @param {number} batchSize - 每批加载的数量
 * @param {Function} onBatchComplete - 每批完成后的回调
 */
async function batchLoadUserInfo(userIds, batchSize = 15, onBatchComplete = null) {
  const uniqueIds = [...new Set(userIds)];
  
  // 过滤出需要加载的用户ID
  const idsToLoad = uniqueIds.filter(userId => !userInfoCache[userId]);
  
  if (idsToLoad.length === 0) {
    return; // 所有用户信息都已缓存
  }
  
  // 分批加载
  for (let i = 0; i < idsToLoad.length; i += batchSize) {
    const batch = idsToLoad.slice(i, i + batchSize);
    
    // 并行加载当前批次，缩短超时时间到2秒
    const batchPromises = batch.map(async (userId) => {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 2000)
        );
        
        const userInfoPromise = getUserPublicInfo(userId);
        const userInfo = await Promise.race([userInfoPromise, timeoutPromise]);
        
        if (userInfo) {
          userInfoCache[userId] = {
            name: userInfo.name || "未知用户",
            profileImageUrl: userInfo.profileImageUrl || "",
            slug: userInfo.userslug || ""
          };
        } else {
          userInfoCache[userId] = {
            name: "未知用户",
            profileImageUrl: "",
            slug: ""
          };
        }
      } catch (error) {
        // 快速失败，使用默认值
        userInfoCache[userId] = {
          name: "未知用户",
          profileImageUrl: "",
          slug: ""
        };
      }
    });
    
    // 等待当前批次完成
    await Promise.allSettled(batchPromises);
    
    // 触发回调，更新UI
    if (onBatchComplete) {
      await onBatchComplete(i + batch.length, idsToLoad.length);
    }
  }
}

/**
 * 加载所有用户的任务数据（优化版）
 */
async function loadAllUsersTaskData() {
  try {
    // 先加载主要的任务管理数据
    $w("#htmlTask").postMessage({
      type: "loading",
      message: "正在加载任务数据...",
    });
    safePostToTasksum({
      type: "loading",
      message: "正在汇总作品任务分配情况...",
    });
    
    // 设置30秒超时，防止无限等待
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('请求超时，请检查网络连接或稍后重试')), 30000)
    );
    
    const taskManagementData = await Promise.race([
      getAllUsersTaskManagementData(),
      timeoutPromise
    ]);
    
    // 创建初始数据，优先使用缓存的用户信息
    allUsersData = taskManagementData.users.map(userData => {
      const cachedUserInfo = userInfoCache[userData.userId];
      if (cachedUserInfo) {
        // 如果缓存中有用户信息，直接使用
        return {
          ...userData,
          userName: cachedUserInfo.name,
          userSlug: cachedUserInfo.slug,
          profileImageUrl: cachedUserInfo.profileImageUrl
        };
      } else {
        // 如果没有缓存，临时使用userId
        return {
          ...userData,
          userName: userData.userId,
          userSlug: "",
          profileImageUrl: ""
        };
      }
    });
    
    // 重新应用筛选器和排序
    applyFilters();
    applySorting();

    // 计算作品任务占用统计并发送到汇总面板
    taskSummaryData = computeTaskAssignmentSummary(taskManagementData.users || []);
    sendTaskSummaryToHtml(taskSummaryData);
    
    // 立即发送初始数据
    sendDataToHTML({
      users: filteredUsersData,
      stats: taskManagementData.stats,
      worksComparison: null
    });
    
    // 异步分批加载用户信息，每批完成后更新UI
    const userIds = taskManagementData.users.map(u => u.userId);
    const uncachedUserIds = userIds.filter(userId => !userInfoCache[userId]);
    
    // 只有在有未缓存的用户时才显示加载提示和进行加载
    if (uncachedUserIds.length > 0) {
      $w("#htmlTask").postMessage({
        type: "loading",
        message: `正在加载用户信息 (0/${uncachedUserIds.length})...`,
      });
      
      // 分批加载，每批15个用户
      await batchLoadUserInfo(userIds, 15, async (loadedCount, totalCount) => {
        // 更新进度提示
        $w("#htmlTask").postMessage({
          type: "loading",
          message: `正在加载用户信息 (${loadedCount}/${totalCount})...`,
        });
        
        // 更新allUsersData中已加载的用户信息
        allUsersData = taskManagementData.users.map(userData => {
          const userInfo = userInfoCache[userData.userId];
          if (userInfo) {
            return {
              ...userData,
              userName: userInfo.name,
              userSlug: userInfo.slug,
              profileImageUrl: userInfo.profileImageUrl
            };
          }
          return {
            ...userData,
            userName: userData.userId,
            userSlug: "",
            profileImageUrl: ""
          };
        });
        
        // 重新应用筛选器和排序
        applyFilters();
        applySorting();
        
        // 每批完成后更新UI（不重新发送作品对比数据）
        sendDataToHTML({
          users: filteredUsersData,
          stats: taskManagementData.stats,
          worksComparison: worksWeightComparisonData
        });
      });
    }
    
    // 最后异步加载作品权重对比数据（可选功能，失败也不影响主功能）
    loadWorksComparisonDataAsync();
    
  } catch (error) {
    console.error("加载任务管理数据失败:", error);
    $w("#htmlTask").postMessage({
      type: "error",
      message: "数据加载失败: " + error.message + "。请尝试刷新页面。",
    });
    safePostToTasksum({
      type: "error",
      message: "汇总数据加载失败: " + error.message,
    });
  }
}

/**
 * 异步加载作品权重对比数据（不阻塞主流程）
 */
async function loadWorksComparisonDataAsync() {
  try {
    $w("#htmlTask").postMessage({
      type: "loading",
      message: "正在加载作品权重对比数据...",
    });
    
    // 作品对比数据设置较短超时
    const worksTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('作品数据加载超时')), 15000)
    );
    
    const worksComparison = await Promise.race([
      getAllWorksWeightComparison(),
      worksTimeoutPromise
    ]);
    
    worksWeightComparisonData = worksComparison;
    
    // 更新数据，包含作品权重对比
    sendDataToHTML({
      users: filteredUsersData,
      stats: {},
      worksComparison: worksWeightComparisonData
    });
  } catch (worksError) {
    console.error("加载作品权重对比数据失败:", worksError);
    // 静默失败，不显示警告（因为这是可选功能）
  }
}

/**
 * 发送数据到HTML元件
 */
function sendDataToHTML(data) {
  $w("#htmlTask").postMessage({
    type: "data",
    data: data,
  });
}

/**
 * 发送任务汇总数据到 HTML 元件
 */
function sendTaskSummaryToHtml(summary) {
  safePostToTasksum({
    type: "summary",
    data: summary,
  });
}

/**
 * 向任务汇总 HTML 元件安全发送消息（元件不存在时静默）
 */
function safePostToTasksum(payload) {
  try {
    $w("#htmlTasksum").postMessage(payload);
  } catch (err) {
    // 元件缺失时忽略，避免阻断主流程
  }
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
  $w("#htmlTask").onMessage(async (event) => {
    if (event.data.action === "filter") {
      handleFilter(event.data.filterType, event.data.value);
    } else if (event.data.action === "sort") {
      handleSort(event.data.sortBy);
    } else if (event.data.action === "ready") {
      // HTML元件准备就绪，发送数据
      if (filteredUsersData.length > 0) {
        sendDataToHTML({
          users: filteredUsersData,
          stats: {},
          worksComparison: worksWeightComparisonData
        });
      }
    } else if (event.data.action === "refresh") {
      // 刷新所有数据
      await loadAllUsersTaskData();
    } else if (event.data.action === "refreshUserTask") {
      // 刷新单个用户的任务
      await handleRefreshUserTask(event.data.userId);
    }
  });

  // 监听任务汇总 HTML 元件
  $w("#htmlTasksum").onMessage((event) => {
    if (event.data.action === "ready") {
      if (taskSummaryData) {
        sendTaskSummaryToHtml(taskSummaryData);
      } else {
        safePostToTasksum({
          type: "loading",
          message: "正在汇总作品任务分配情况...",
        });
      }
    }
  });
}

/**
 * 处理刷新单个用户任务
 */
async function handleRefreshUserTask(userId) {
  try {
    // 显示刷新中状态
    $w("#htmlTask").postMessage({
      type: "refreshing",
      userId: userId
    });
    
    // 调用后端强制刷新
    const result = await forceRefreshUserTasks(userId);
    
    if (result.success) {
      // 刷新成功，重新加载所有数据
      await loadAllUsersTaskData();
      
      // 发送成功消息
      $w("#htmlTask").postMessage({
        type: "refreshSuccess",
        userId: userId,
        message: `任务已刷新，新任务数：${result.newTasksCount}`
      });
    } else {
      // 刷新失败
      $w("#htmlTask").postMessage({
        type: "refreshError",
        userId: userId,
        message: result.message
      });
    }
    
  } catch (error) {
    console.error("刷新用户任务失败:", error);
    $w("#htmlTask").postMessage({
      type: "refreshError",
      userId: userId,
      message: "刷新失败: " + error.message
    });
  }
}

/**
 * 处理筛选（优化版 - 只发送必要数据）
 */
function handleFilter(filterType, value) {
  // 保存当前的筛选状态
  if (filterType === "quality") {
    currentFilters.quality = value;
  } else if (filterType === "completion") {
    currentFilters.completion = value;
  } else if (filterType === "search") {
    currentFilters.search = value;
  }
  
  // 重新应用所有筛选器
  applyFilters();
  
  // 只发送用户数据，不重复发送worksComparison（节省传输）
  sendDataToHTML({
    users: filteredUsersData,
    stats: {},
    worksComparison: null  // 不重新发送作品对比数据
  });
}

/**
 * 应用所有筛选器
 */
function applyFilters() {
  let result = [...allUsersData];
  
  // 应用质量筛选
  if (currentFilters.quality === "high") {
    result = result.filter(u => u.isHighQuality);
  } else if (currentFilters.quality === "low") {
    result = result.filter(u => !u.isHighQuality);
  }
  
  // 应用完成度筛选
  if (currentFilters.completion === "completed") {
    result = result.filter(u => u.completedCount >= u.targetCompletion);
  } else if (currentFilters.completion === "incomplete") {
    result = result.filter(u => u.completedCount < u.targetCompletion);
  } else if (currentFilters.completion === "has-tasks") {
    result = result.filter(u => u.currentTasks && u.currentTasks.length > 0);
  } else if (currentFilters.completion === "low-weight-tasks") {
    // 筛选：有低权重任务 且 还没完成这些低权重任务的用户
    result = result.filter(u => {
      if (!u.currentTasks || u.currentTasks.length === 0) {
        return false; // 没有任务，不显示
      }
      
      // 获取用户所有已评论的作品（completedTasks + freeRatings）
      const allRatedWorks = [
        ...(u.completedTasks || []),
        ...(u.freeRatings || [])
      ];
      
      // 检查是否存在"低权重 且 还没完成"的任务
      const hasUncompletedLowWeightTask = u.currentTasks.some(task => {
        // 1. 任务权重低于30
        const isLowWeight = task.finalWeight < 30;
        // 2. 用户还没有评论这个作品
        const isNotCompleted = !allRatedWorks.includes(task.workNumber);
        
        return isLowWeight && isNotCompleted;
      });
      
      return hasUncompletedLowWeightTask;
    });
  }
  
  // 应用搜索筛选
  if (currentFilters.search && currentFilters.search.trim() !== '') {
    const searchTerm = currentFilters.search.toLowerCase();
    result = result.filter(u =>
      u.userName.toLowerCase().includes(searchTerm) ||
      u.userId.toLowerCase().includes(searchTerm)
    );
  }
  
  filteredUsersData = result;
}

/**
 * 处理排序（优化版 - 只发送必要数据）
 */
function handleSort(sortBy) {
  // 保存当前的排序方式
  currentSortBy = sortBy;
  
  // 应用排序
  applySorting();
  
  // 只发送用户数据，不重复发送worksComparison（节省传输）
  sendDataToHTML({
    users: filteredUsersData,
    stats: {},
    worksComparison: null  // 不重新发送作品对比数据
  });
}

/**
 * 应用排序
 */
function applySorting() {
  if (currentSortBy === "completion") {
    filteredUsersData.sort((a, b) => b.completedCount - a.completedCount);
  } else if (currentSortBy === "tasks") {
    filteredUsersData.sort((a, b) => (b.currentTasks?.length || 0) - (a.currentTasks?.length || 0));
  } else if (currentSortBy === "name") {
    filteredUsersData.sort((a, b) => a.userName.localeCompare(b.userName));
  } else if (currentSortBy === "quality") {
    filteredUsersData.sort((a, b) => (b.isHighQuality ? 1 : 0) - (a.isHighQuality ? 1 : 0));
  }
}

/**
 * 计算每个作品当前被多少用户持有为任务，并按数量排序
 * @param {Array<Object>} usersData
 * @returns {{items: Array, totals: {totalAssignments: number, uniqueWorks: number}}}
 */
function computeTaskAssignmentSummary(usersData) {
  const summaryMap = new Map();
  let totalAssignments = 0;

  usersData.forEach((user) => {
    (user.currentTasks || []).forEach((task) => {
      if (!task || task.workNumber === undefined || task.workNumber === null) {
        return;
      }

      totalAssignments += 1;
      const existing = summaryMap.get(task.workNumber);

      if (existing) {
        existing.assignedCount += 1;
        // 仅在数据缺失时补充字段，避免覆盖已有值
        if (!existing.workTitle && task.workTitle) {
          existing.workTitle = task.workTitle;
        }
        if (!existing.currentRatings && task.currentRatings) {
          existing.currentRatings = task.currentRatings;
        }
        if (!existing.baseWeight && task.baseWeight) {
          existing.baseWeight = task.baseWeight;
        }
        if (!existing.daysSinceSubmission && task.daysSinceSubmission) {
          existing.daysSinceSubmission = task.daysSinceSubmission;
        }
      } else {
        summaryMap.set(task.workNumber, {
          workNumber: task.workNumber,
          workTitle: task.workTitle || "未命名作品",
          assignedCount: 1,
          currentRatings: task.currentRatings || 0,
          baseWeight: task.baseWeight || 0,
          daysSinceSubmission: task.daysSinceSubmission || 0,
        });
      }
    });
  });

  const items = Array.from(summaryMap.values()).sort((a, b) => {
    if (b.assignedCount !== a.assignedCount) {
      return b.assignedCount - a.assignedCount;
    }
    return a.workNumber - b.workNumber;
  });

  return {
    items,
    totals: {
      totalAssignments,
      uniqueWorks: items.length,
    },
  };
}
