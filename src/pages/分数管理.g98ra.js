/**
 * 分数管理页面 - 管理员专用
 * 显示所有作品的评分详情、等级、评论者信息（包含高权重标记）
 */

import wixData from "wix-data";
import wixWindow from "wix-window";
import { checkIsSeaSelectionMember } from "backend/auditorManagement.jsw";
import { getUserPublicInfo } from "backend/getUserPublicInfo.jsw";
import {
  fetchAllMainComments,
  fetchAllWorks,
  fetchAllRegistrations,
  getWorkWeightedRatingData,
} from "backend/ratingTaskManager.jsw";
import { RATING_CONFIG } from "public/constants.js";
import { getTierFromPercentile, computeWeightedRating } from "public/tierUtils.js";

let allWorksData = [];
let filteredWorksData = [];
let userInfoCache = {}; // 缓存用户信息（包括 isHighQuality）
let currentFilters = {
  tier: "all",
  search: "",
};
let currentSortBy = "id-asc";

$w.onReady(async function () {
  // 权限检查
  const hasPermission = await checkIsSeaSelectionMember();
  if (!hasPermission) {
    $w("#htmlScore").postMessage({
      type: "error",
      message: "您没有权限访问此页面",
    });
    return;
  }

  // 显示加载状态
  $w("#htmlScore").postMessage({
    type: "loading",
    message: "正在加载数据...",
  });

  // 加载数据
  await loadAllWorksData();

  // 设置搜索和筛选事件
  setupEventListeners();
});

/**
 * 验证用户ID是否有效（是否为有效的GUID格式）
 */
function isValidUserId(userId) {
  if (!userId || typeof userId !== "string") {
    return false;
  }
  // Wix GUID 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return guidRegex.test(userId.trim());
}

function normalizeWixImageUrl(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "object") {
    const candidates = [value.url, value.src, value.fileUrl];
    for (const candidate of candidates) {
      const normalized = normalizeWixImageUrl(candidate);
      if (normalized) {
        return normalized;
      }
    }
    return "";
  }

  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("wix:image://")) {
    const match = trimmed.match(/^wix:image:\/\/v1\/([^/#]+)(?:\/[^#]*)?(?:#.*)?$/);
    return match ? `https://static.wixstatic.com/media/${match[1]}` : "";
  }

  return trimmed;
}

/**
 * 批量获取用户信息（包括高权重标记）
 * 使用游标分页获取所有注册记录，避免 _owner 字段的 hasSome 错误
 */
async function batchLoadUserInfo(userIds, registrationInfoMap = {}) {
  // 过滤掉无效的用户ID（undefined、null、空字符串、无效GUID）
  const validUserIds = userIds.filter(isValidUserId);
  const uniqueIds = [...new Set(validUserIds)];
  const uniqueIdSet = new Set(uniqueIds);

  const invalidCount = userIds.length - validUserIds.length;
  if (invalidCount > 0) {
    console.log(`过滤掉 ${invalidCount} 个无效的用户ID`);
  }

  const highQualityMap = {};
  const registrationNameMap = {};

  if (registrationInfoMap && Object.keys(registrationInfoMap).length > 0) {
    Object.entries(registrationInfoMap).forEach(([ownerId, info]) => {
      if (!uniqueIdSet.has(ownerId)) {
        return;
      }
      highQualityMap[ownerId] = info.isHighQuality === true;
      if (info.registrationName) {
        registrationNameMap[ownerId] = info.registrationName;
      }
    });
  } else {

  try {
    // 使用游标分页获取所有注册记录（绕过 1000 条限制和 _owner hasSome 限制）
    const allRegistrations = await fetchAllRegistrations();
    
    // 构建高权重映射（只保留需要的用户）
    allRegistrations.forEach((reg) => {
      if (uniqueIdSet.has(reg._owner)) {
        highQualityMap[reg._owner] = reg.isHighQuality === true;
        const registrationName = reg.registrationName || reg.firstName || "";
        if (registrationName) {
          registrationNameMap[reg._owner] = registrationName;
        }
      }
    });

    console.log(`成功加载 ${allRegistrations.length} 条注册记录，匹配到 ${Object.keys(highQualityMap).length} 个评论者`);
  } catch (error) {
    console.error("获取注册记录失败:", error);
    // 失败时继续，但所有用户的 isHighQuality 都为 false
  }

  // 批量获取用户公开信息
  }

  for (const userId of uniqueIds) {
    if (!userInfoCache[userId]) {
      try {
        const userInfo = await getUserPublicInfo(userId);
        if (userInfo) {
          userInfoCache[userId] = {
            name: userInfo.name || "未知用户",
            profileImageUrl: userInfo.profileImageUrl || "",
            slug: userInfo.userslug || "",
            isHighQuality: highQualityMap[userId] || false,
            registrationName: registrationNameMap[userId] || "",
          };
        } else {
          userInfoCache[userId] = {
            name: "未知用户",
            profileImageUrl: "",
            slug: "",
            isHighQuality: highQualityMap[userId] || false,
            registrationName: registrationNameMap[userId] || "",
          };
        }
      } catch (error) {
        console.error(`获取用户${userId}信息失败:`, error);
        userInfoCache[userId] = {
          name: "未知用户",
          profileImageUrl: "",
          slug: "",
          isHighQuality: false,
          registrationName: registrationNameMap[userId] || "",
        };
      }
    }
  }
}

/**
 * 加载所有作品的评分数据
 */
async function loadAllWorksData() {
  try {
    // 1. 获取所有作品
    const worksResult = await fetchAllWorks();

    // 2. 获取所有评论
    const commentsResult = await fetchAllMainComments();
    const registrationsResult = await fetchAllRegistrations();
    const registrationInfoMap = {};
    registrationsResult.forEach((reg) => {
      if (!reg || !reg._owner) {
        return;
      }
      if (!isValidUserId(reg._owner)) {
        return;
      }
      registrationInfoMap[reg._owner] = {
        isHighQuality: reg.isHighQuality === true,
        registrationName: reg.registrationName || reg.firstName || "",
      };
    });

    // 3. 批量获取所有评论者的用户信息（包括高权重标记）
    // 注意：这里包含了所有评论的 _owner，包括可能的无效ID
    const uniqueUserIds = [
      ...new Set([
        ...commentsResult.map((c) => c._owner),
        ...worksResult.map((w) => w._owner),
      ]),
    ];
    // batchLoadUserInfo 会自动过滤无效ID
    await batchLoadUserInfo(uniqueUserIds, registrationInfoMap);

    // 4. 构建作品-评论映射
    const workCommentsMap = {};
    commentsResult.forEach((comment) => {
      if (!workCommentsMap[comment.workNumber]) {
        workCommentsMap[comment.workNumber] = [];
      }
      workCommentsMap[comment.workNumber].push(comment);
    });

    // 5. 计算每个作品的评分数据
    const worksWithRatings = [];
    for (const work of worksResult) {
      const comments = workCommentsMap[work.sequenceId] || [];

      // 排除作者自评，只计算正式评分
      const formalRatings = comments.filter(
        (comment) => comment._owner !== work._owner
      );

      const ratingData = calculateRatingData(formalRatings, work._owner);
      const ownerInfo = userInfoCache[work._owner] || {};
      const registrationInfo = registrationInfoMap[work._owner];
      const ownerRegistrationName =
        (registrationInfo && registrationInfo.registrationName) ||
        ownerInfo.registrationName ||
        "";

      const coverImageUrl = normalizeWixImageUrl(work.track的複本);

      worksWithRatings.push({
        sequenceId: work.sequenceId,
        title: work.firstName || "未命名作品",
        coverImage: coverImageUrl,
        isDq: work.isDq === true,
        ownerId: work._owner,
        ownerName: ownerInfo.name || "未知投稿人",
        ownerSlug: ownerInfo.slug || "",
        ownerRegistrationName: ownerRegistrationName,
        ...ratingData,
      });
    }

    // 6. 计算排名和等级（基于加权平均分）
    allWorksData = calculateTiers(worksWithRatings);

    // 7. 应用当前筛选和排序后发送数据到 HTML 元件
    applyCurrentView();
  } catch (error) {
    console.error("加载数据失败:", error);
    $w("#htmlScore").postMessage({
      type: "error",
      message: "数据加载失败: " + error.message,
    });
  }
}

/**
 * 计算评分数据（使用加权平均分）
 */
function calculateRatingData(formalRatings, workOwnerId) {
  if (formalRatings.length === 0) {
    return {
      numRatings: 0,
      averageScore: 0,
      weightedAverage: 0,
      originalAverage: 0,
      highWeightCount: 0,
      lowWeightCount: 0,
      ratio: 0,
      raters: [],
    };
  }

  let highWeightSum = 0;
  let highWeightCount = 0;
  let lowWeightSum = 0;
  let lowWeightCount = 0;

  const raters = formalRatings.map((r) => {
    // 处理无效的用户ID
    const userId = r._owner;
    const isInvalidUser = !isValidUserId(userId);
    
    const userInfo = isInvalidUser
      ? {
          name: "[无效用户ID]",
          profileImageUrl: "",
          slug: "",
          isHighQuality: false,
        }
      : (userInfoCache[userId] || {
          name: "未知用户",
          profileImageUrl: "",
          slug: "",
          isHighQuality: false,
        });

    // 统计高低权重评分
    if (userInfo.isHighQuality) {
      highWeightSum += r.score;
      highWeightCount++;
    } else {
      lowWeightSum += r.score;
      lowWeightCount++;
    }

    return {
      userId: isInvalidUser ? "invalid-user" : userId,
      userName: userInfo.name,
      userSlug: userInfo.slug,
      profileImageUrl: userInfo.profileImageUrl,
      isHighQuality: userInfo.isHighQuality,
      score: r.score,
      comment: r.comment,
      createdDate: r._createdDate,
    };
  });

  const totalRatings = highWeightCount + lowWeightCount;
  const { weightedAverage, originalAverage, ratio } = computeWeightedRating(
    highWeightSum,
    highWeightCount,
    lowWeightSum,
    lowWeightCount
  );

  return {
    numRatings: formalRatings.length,
    averageScore: weightedAverage, // 主要显示加权平均分
    weightedAverage: weightedAverage,
    originalAverage: originalAverage,
    highWeightCount: highWeightCount,
    lowWeightCount: lowWeightCount,
    ratio: ratio,
    raters: raters,
  };
}

/**
 * 计算等级（基于加权平均分的百分位）
 */
function calculateTiers(worksData) {
  // 只对有足够评分且未淘汰的作品排名
  const validWorks = worksData.filter(
    (w) => w.numRatings >= RATING_CONFIG.MIN_RATINGS_FOR_RANKING && !w.isDq
  );

  // 按加权平均分降序排序
  validWorks.sort((a, b) => b.weightedAverage - a.weightedAverage);

  // 计算百分位和等级
  validWorks.forEach((work, index) => {
    const percentile = (index + 1) / validWorks.length;
    work.tier = getTierFromPercentile(percentile);
    work.rank = index + 1;
  });

  // 为其他作品设置默认等级
  worksData.forEach((work) => {
    if (!work.tier) {
      if (work.isDq) {
        work.tier = "已淘汰";
      } else if (work.numRatings < RATING_CONFIG.MIN_RATINGS_FOR_RANKING) {
        work.tier = "评分不足";
      } else {
        work.tier = "未排名";
      }
      work.rank = null;
    }
  });

  // 按sequenceId排序返回完整列表
  return worksData.sort((a, b) => a.sequenceId - b.sequenceId);
}

/**
 * 发送数据到HTML元件
 * score-management.html 会基于 works[].raters 与 originalAverage（作品内简单均分）做评分分析。
 */
function sendDataToHTML(data) {
  $w("#htmlScore").postMessage({
    type: "data",
    works: data,
    config: { minRatingsForRanking: RATING_CONFIG.MIN_RATINGS_FOR_RANKING },
  });
}

function getSortConfig(sortValue) {
  const [field, direction] = (sortValue || "").split("-");
  const safeField = ["id", "score", "ratings"].includes(field) ? field : "id";
  const defaultDirection = safeField === "id" ? "asc" : "desc";
  const safeDirection =
    direction === "asc" || direction === "desc" ? direction : defaultDirection;

  return { field: safeField, direction: safeDirection };
}

function applyCurrentView() {
  const searchTerm = currentFilters.search.trim().toLowerCase();

  filteredWorksData = allWorksData.filter((work) => {
    const tierMatched =
      currentFilters.tier === "all" || work.tier === currentFilters.tier;
    const searchMatched =
      !searchTerm ||
      work.sequenceId.toString().includes(searchTerm) ||
      work.title.toLowerCase().includes(searchTerm);

    return tierMatched && searchMatched;
  });

  const { field: sortField, direction: sortDirection } = getSortConfig(currentSortBy);
  const directionMultiplier = sortDirection === "desc" ? -1 : 1;

  filteredWorksData.sort((a, b) => {
    let diff = 0;

    if (sortField === "id") {
      diff = a.sequenceId - b.sequenceId;
    } else if (sortField === "score") {
      diff = a.weightedAverage - b.weightedAverage;
    } else if (sortField === "ratings") {
      diff = a.numRatings - b.numRatings;
    }

    if (diff !== 0) {
      return diff * directionMultiplier;
    }

    return a.sequenceId - b.sequenceId;
  });

  sendDataToHTML(filteredWorksData);
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
  // 接收来自HTML元件的消息
  $w("#htmlScore").onMessage((event) => {
    if (event.data.action === "filter") {
      handleFilter(event.data.filterType, event.data.value);
    } else if (event.data.action === "sort") {
      handleSort(event.data.sortBy);
    } else if (event.data.action === "ready") {
      // HTML元件准备就绪，发送数据
      sendDataToHTML(filteredWorksData);
    }
  });
}

/**
 * 处理筛选
 */
function handleFilter(filterType, value) {
  if (filterType === "tier") {
    currentFilters.tier = value || "all";
  } else if (filterType === "search") {
    currentFilters.search = (value || "").toString();
  }
  applyCurrentView();
}

/**
 * 处理排序
 */
function handleSort(sortBy) {
  currentSortBy = sortBy || "id-asc";
  applyCurrentView();
}
