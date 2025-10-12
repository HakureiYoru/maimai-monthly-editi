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
 * 批量获取用户公开信息
 */
async function batchLoadUserInfo(userIds) {
  const uniqueIds = [...new Set(userIds)];
  
  for (const userId of uniqueIds) {
    if (!userInfoCache[userId]) {
      try {
        const userInfo = await getUserPublicInfo(userId);
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
        console.error(`获取用户${userId}信息失败:`, error);
        userInfoCache[userId] = {
          name: "未知用户",
          profileImageUrl: "",
          slug: ""
        };
      }
    }
  }
}

/**
 * 加载所有用户的任务数据
 */
async function loadAllUsersTaskData() {
  try {
    // 并行获取任务管理数据和作品权重对比数据
    const [taskManagementData, worksComparison] = await Promise.all([
      getAllUsersTaskManagementData(),
      getAllWorksWeightComparison()
    ]);
    
    // 保存作品权重对比数据
    worksWeightComparisonData = worksComparison;
    
    // 批量获取所有用户的公开信息
    const userIds = taskManagementData.users.map(u => u.userId);
    await batchLoadUserInfo(userIds);
    
    // 组合用户信息和任务数据
    allUsersData = taskManagementData.users.map(userData => {
      const userInfo = userInfoCache[userData.userId] || {
        name: "未知用户",
        profileImageUrl: "",
        slug: ""
      };
      
      return {
        ...userData,
        userName: userInfo.name,
        userSlug: userInfo.slug,
        profileImageUrl: userInfo.profileImageUrl
      };
    });
    
    filteredUsersData = [...allUsersData];
    
    // 发送数据到HTML元件（包含作品权重对比数据）
    sendDataToHTML({
      users: filteredUsersData,
      stats: taskManagementData.stats,
      worksComparison: worksWeightComparisonData
    });
    
  } catch (error) {
    console.error("加载任务管理数据失败:", error);
    $w("#htmlTask").postMessage({
      type: "error",
      message: "数据加载失败: " + error.message,
    });
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
 * 处理筛选
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
    }
  } else if (filterType === "search") {
    const searchTerm = value.toLowerCase();
    filteredUsersData = allUsersData.filter(u =>
      u.userName.toLowerCase().includes(searchTerm) ||
      u.userId.toLowerCase().includes(searchTerm)
    );
  }
  
  sendDataToHTML({
    users: filteredUsersData,
    stats: {},
    worksComparison: worksWeightComparisonData
  });
}

/**
 * 处理排序
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
  
  sendDataToHTML({
    users: filteredUsersData,
    stats: {},
    worksComparison: worksWeightComparisonData
  });
}
