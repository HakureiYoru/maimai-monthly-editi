/**
 * 分数管理页面 - 管理员专用
 * 显示所有作品的评分详情、等级、评论者信息
 */

import wixData from "wix-data";
import wixWindow from "wix-window";
import { checkIsSeaSelectionMember } from "backend/auditorManagement.jsw";
import { getUserPublicInfo } from "backend/getUserPublicInfo.jsw";

let allWorksData = [];
let filteredWorksData = [];
let userInfoCache = {}; // 缓存用户信息

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
 * 批量获取用户信息
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
 * 加载所有作品的评分数据
 */
async function loadAllWorksData() {
  try {
    // 1. 获取所有作品
    const worksResult = await wixData
      .query("enterContest034")
      .limit(1000)
      .find();

    // 2. 获取所有评论
    const commentsResult = await wixData
      .query("BOFcomment")
      .isEmpty("replyTo")
      .limit(1000)
      .find();

    // 3. 批量获取所有评论者的用户信息
    const uniqueUserIds = [...new Set(commentsResult.items.map(c => c._owner))];
    await batchLoadUserInfo(uniqueUserIds);

    // 4. 构建作品-评论映射
    const workCommentsMap = {};
    commentsResult.items.forEach((comment) => {
      if (!workCommentsMap[comment.workNumber]) {
        workCommentsMap[comment.workNumber] = [];
      }
      workCommentsMap[comment.workNumber].push(comment);
    });

    // 5. 计算每个作品的评分数据
    const worksWithRatings = [];
    for (const work of worksResult.items) {
      const comments = workCommentsMap[work.sequenceId] || [];

      // 排除作者自评，只计算正式评分
      const formalRatings = comments.filter(
        (comment) => comment._owner !== work._owner
      );

      const ratingData = calculateRatingData(formalRatings);

      // 正确处理图片URL（可能是对象或字符串）
      let coverImageUrl = "";
      if (work.track的複本) {
        if (typeof work.track的複本 === 'object' && work.track的複本.url) {
          coverImageUrl = work.track的複本.url;
        } else if (typeof work.track的複本 === 'string') {
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

    // 6. 计算排名和等级
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
 * 计算评分数据
 */
function calculateRatingData(formalRatings) {
  if (formalRatings.length === 0) {
    return {
      numRatings: 0,
      averageScore: 0,
      raters: [],
    };
  }

  const totalScore = formalRatings.reduce((sum, r) => sum + r.score, 0);
  const averageScore = totalScore / formalRatings.length;

  const raters = formalRatings.map((r) => {
    const userInfo = userInfoCache[r._owner] || { name: "未知用户", profileImageUrl: "", slug: "" };
    return {
      userId: r._owner,
      userName: userInfo.name,
      userSlug: userInfo.slug,
      profileImageUrl: userInfo.profileImageUrl,
      score: r.score,
      comment: r.comment,
      createdDate: r._createdDate,
    };
  });

  return {
    numRatings: formalRatings.length,
    averageScore: averageScore,
    raters: raters,
  };
}

/**
 * 计算等级（基于百分位）
 */
function calculateTiers(worksData) {
  // 只对有足够评分且未淘汰的作品排名
  const validWorks = worksData.filter((w) => w.numRatings >= 5 && !w.isDq);

  // 按平均分降序排序
  validWorks.sort((a, b) => b.averageScore - a.averageScore);

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
      } else if (work.numRatings < 5) {
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
 * 根据百分位获取等级
 */
function getTierFromPercentile(percentile) {
  if (percentile <= 0.05) return "T0";
  if (percentile <= 0.2) return "T1";
  if (percentile <= 0.4) return "T2";
  if (percentile <= 0.6) return "T3";
  return "T4";
}

/**
 * 发送数据到HTML元件
 */
function sendDataToHTML(data) {
  $w("#htmlScore").postMessage({
    type: "data",
    works: data,
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
    filteredWorksData.sort((a, b) => b.averageScore - a.averageScore);
  } else if (sortBy === "ratings") {
    filteredWorksData.sort((a, b) => b.numRatings - a.numRatings);
  }
  sendDataToHTML(filteredWorksData);
}
