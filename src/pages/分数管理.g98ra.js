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
  getWorkWeightedRatingData,
} from "backend/ratingTaskManager.jsw";
import { RATING_CONFIG } from "public/constants.js";
import { getTierFromPercentile } from "public/tierUtils.js";

let allWorksData = [];
let filteredWorksData = [];
let userInfoCache = {}; // 缓存用户信息（包括 isHighQuality）

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
 * 批量获取用户信息（包括高权重标记）
 */
async function batchLoadUserInfo(userIds) {
  const uniqueIds = [...new Set(userIds)];

  const highQualityMap = {};
  const CHUNK_SIZE = 50; // hasSome 入参过多会报错，分批查询更稳

  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const batchIds = uniqueIds.slice(i, i + CHUNK_SIZE);
    const registrations = await wixData
      .query("jobApplication089")
      .hasSome("_owner", batchIds)
      .limit(1000)
      .find();

    registrations.items.forEach((reg) => {
      highQualityMap[reg._owner] = reg.isHighQuality === true;
    });
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
          };
        } else {
          userInfoCache[userId] = {
            name: "未知用户",
            profileImageUrl: "",
            slug: "",
            isHighQuality: highQualityMap[userId] || false,
          };
        }
      } catch (error) {
        console.error(`获取用户${userId}信息失败:`, error);
        userInfoCache[userId] = {
          name: "未知用户",
          profileImageUrl: "",
          slug: "",
          isHighQuality: false,
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

    // 3. 批量获取所有评论者的用户信息（包括高权重标记）
    const uniqueUserIds = [
      ...new Set(commentsResult.map((c) => c._owner)),
    ];
    await batchLoadUserInfo(uniqueUserIds);

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

      // 正确处理图片URL（可能是对象或字符串）
      let coverImageUrl = "";
      if (work.track的複本) {
        if (typeof work.track的複本 === "object" && work.track的複本.url) {
          coverImageUrl = work.track的複本.url;
        } else if (typeof work.track的複本 === "string") {
          coverImageUrl = work.track的複本;
        }
      }

      worksWithRatings.push({
        sequenceId: work.sequenceId,
        title: work.firstName || "未命名作品",
        coverImage: coverImageUrl,
        isDq: work.isDq === true,
        ownerId: work._owner,
        ...ratingData,
      });
    }

    // 6. 计算排名和等级（基于加权平均分）
    allWorksData = calculateTiers(worksWithRatings);
    filteredWorksData = [...allWorksData];

    // 7. 发送数据到HTML元件
    sendDataToHTML(filteredWorksData);
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
    const userInfo = userInfoCache[r._owner] || {
      name: "未知用户",
      profileImageUrl: "",
      slug: "",
      isHighQuality: false,
    };

    // 统计高低权重评分
    if (userInfo.isHighQuality) {
      highWeightSum += r.score;
      highWeightCount++;
    } else {
      lowWeightSum += r.score;
      lowWeightCount++;
    }

    return {
      userId: r._owner,
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

  // 加权平均分 = (高权重总和 × 2 + 低权重总和) / (高权重人数 × 2 + 低权重人数)
  const weightedAverage =
    totalRatings > 0
      ? (highWeightSum * 2 + lowWeightSum) /
        (highWeightCount * 2 + lowWeightCount)
      : 0;

  // 原始平均分
  const originalAverage =
    totalRatings > 0 ? (highWeightSum + lowWeightSum) / totalRatings : 0;

  // 当前高低权重比例
  const ratio =
    lowWeightCount > 0
      ? highWeightCount / lowWeightCount
      : highWeightCount > 0
      ? 999
      : 0;

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
 */
function sendDataToHTML(data) {
  $w("#htmlScore").postMessage({
    type: "data",
    works: data,
    config: { minRatingsForRanking: RATING_CONFIG.MIN_RATINGS_FOR_RANKING },
  });
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
    if (value === "all") {
      filteredWorksData = [...allWorksData];
    } else {
      filteredWorksData = allWorksData.filter((w) => w.tier === value);
    }
  } else if (filterType === "search") {
    const searchTerm = value.toLowerCase();
    filteredWorksData = allWorksData.filter(
      (w) =>
        w.sequenceId.toString().includes(searchTerm) ||
        w.title.toLowerCase().includes(searchTerm)
    );
  }
  sendDataToHTML(filteredWorksData);
}

/**
 * 处理排序
 */
function handleSort(sortBy) {
  if (sortBy === "id") {
    filteredWorksData.sort((a, b) => a.sequenceId - b.sequenceId);
  } else if (sortBy === "score") {
    // 按加权平均分排序
    filteredWorksData.sort((a, b) => b.weightedAverage - a.weightedAverage);
  } else if (sortBy === "ratings") {
    filteredWorksData.sort((a, b) => b.numRatings - a.numRatings);
  }
  sendDataToHTML(filteredWorksData);
}
