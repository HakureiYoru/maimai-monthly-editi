/**
 * 任务管理页面 - 管理员专用
 * 显示所有用户的任务分配情况和权重算法详情
 */

import wixData from "wix-data";
import wixWindow from "wix-window";
import { checkIsSeaSelectionMember } from "backend/auditorManagement.jsw";
import { getUserPublicInfo } from "backend/getUserPublicInfo.jsw";
import { getAllUsersTaskManagementData, forceRefreshUserTasks, getAllWorksWeightComparison } from "backend/ratingTaskManager.jsw";

let allUsersData = [];
let filteredUsersData = [];
let userInfoCache = {}; // 缓存用户公开信息
let worksWeightComparisonData = null; // 作品权重对比数据

$w.onReady(async function () {
  // 权限检查
  const hasPermission = await checkIsSeaSelectionMember();
  if (!hasPermission) {
    $w("#htmlTask").postMessage({
      type: "error",
      message: "您没有权限访问此页面",
    });
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
    
    // 设置30秒超时，防止无限等待
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('请求超时，请检查网络连接或稍后重试')), 30000)
    );
    
    const taskManagementData = await Promise.race([
      getAllUsersTaskManagementData(),
      timeoutPromise
    ]);
    
    // 先用userId创建初始数据，立即显示列表
    allUsersData = taskManagementData.users.map(userData => ({
      ...userData,
      userName: userData.userId, // 临时使用userId
      userSlug: "",
      profileImageUrl: ""
    }));
    
    filteredUsersData = [...allUsersData];
    
    // 立即发送初始数据，让用户看到列表（即使没有用户名）
    sendDataToHTML({
      users: filteredUsersData,
      stats: taskManagementData.stats,
      worksComparison: null
    });
    
    // 异步分批加载用户信息，每批完成后更新UI
    const userIds = taskManagementData.users.map(u => u.userId);
    
    $w("#htmlTask").postMessage({
      type: "loading",
      message: `正在加载用户信息 (0/${userIds.length})...`,
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
      
      filteredUsersData = [...allUsersData];
      
      // 每批完成后更新UI（不重新发送作品对比数据）
      sendDataToHTML({
        users: filteredUsersData,
        stats: taskManagementData.stats,
        worksComparison: worksWeightComparisonData
      });
    });
    
    // 最后异步加载作品权重对比数据（可选功能，失败也不影响主功能）
    loadWorksComparisonDataAsync();
    
  } catch (error) {
    console.error("加载任务管理数据失败:", error);
    $w("#htmlTask").postMessage({
      type: "error",
      message: "数据加载失败: " + error.message + "。请尝试刷新页面。",
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
  if (filterType === "quality") {
    if (value === "all") {
      filteredUsersData = [...allUsersData];
    } else if (value === "high") {
      filteredUsersData = allUsersData.filter(u => u.isHighQuality);
    } else if (value === "low") {
      filteredUsersData = allUsersData.filter(u => !u.isHighQuality);
    }
  } else if (filterType === "completion") {
    if (value === "all") {
      filteredUsersData = [...allUsersData];
    } else if (value === "completed") {
      filteredUsersData = allUsersData.filter(u => u.completedCount >= u.targetCompletion);
    } else if (value === "incomplete") {
      filteredUsersData = allUsersData.filter(u => u.completedCount < u.targetCompletion);
    } else if (value === "has-tasks") {
      filteredUsersData = allUsersData.filter(u => u.currentTasks && u.currentTasks.length > 0);
    } else if (value === "low-weight-tasks") {
      // 筛选：有低权重任务 且 还没完成这些低权重任务的用户
      filteredUsersData = allUsersData.filter(u => {
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
  } else if (filterType === "search") {
    const searchTerm = value.toLowerCase();
    filteredUsersData = allUsersData.filter(u =>
      u.userName.toLowerCase().includes(searchTerm) ||
      u.userId.toLowerCase().includes(searchTerm)
    );
  }
  
  // 只发送用户数据，不重复发送worksComparison（节省传输）
  sendDataToHTML({
    users: filteredUsersData,
    stats: {},
    worksComparison: null  // 不重新发送作品对比数据
  });
}

/**
 * 处理排序（优化版 - 只发送必要数据）
 */
function handleSort(sortBy) {
  if (sortBy === "completion") {
    filteredUsersData.sort((a, b) => b.completedCount - a.completedCount);
  } else if (sortBy === "tasks") {
    filteredUsersData.sort((a, b) => (b.currentTasks?.length || 0) - (a.currentTasks?.length || 0));
  } else if (sortBy === "name") {
    filteredUsersData.sort((a, b) => a.userName.localeCompare(b.userName));
  } else if (sortBy === "quality") {
    filteredUsersData.sort((a, b) => (b.isHighQuality ? 1 : 0) - (a.isHighQuality ? 1 : 0));
  }
  
  // 只发送用户数据，不重复发送worksComparison（节省传输）
  sendDataToHTML({
    users: filteredUsersData,
    stats: {},
    worksComparison: null  // 不重新发送作品对比数据
  });
}
