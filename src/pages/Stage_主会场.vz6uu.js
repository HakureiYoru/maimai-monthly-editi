import wixUsers from "wix-users";
import wixData from "wix-data";
import wixWindow from "wix-window";
import {
  getMediaDownloadUrls,
  getFileDownloadUrlAndContent,
  getBatchDownloadUrls,
} from "backend/mediaManagement.jsw";
import { updateUserPoints } from "backend/forumPoints.jsw";
import {
  deleteComment,
  checkIsSeaSelectionMember,
} from "backend/auditorManagement.jsw";
import {
  markTaskCompleted,
  checkIfWorkInTaskList,
  getUserTaskData,
  getWorkWeightedRatingData,
  getAllWorksWeightedRatingData,
} from "backend/ratingTaskManager.jsw";
import { sendReplyNotification } from "backend/emailNotifications.jsw";
import { QUERY_LIMITS, RATING_CONFIG } from "public/constants.js";
import { getTierFromPercentile } from "public/tierUtils.js";

// 全局状态管理
let commentsCountByWorkNumber = {};
const itemsPerPage = QUERY_LIMITS.ITEMS_PER_PAGE;
const commentsPerPage = 10; // 评论列表每页显示数量
let titleValue;
const currentUserId = wixUsers.currentUser.id;
let isUserVerified = false;
const commentDataCache = new Map(); // 缓存分页查询结果
let selfScCommentIdCache = null; // 缓存作者自评评论ID集合
let isLoadingSelfScComments = false; // 防止并发加载作者自评评论ID

// 【新增】保存评论系统当前的筛选状态（避免面板切换时重置）
let currentCommentSystemState = {
  workFilter: "",
  filterMode: "default",
  currentPage: 1
};

// 缓存数据以减少API调用（性能优化）
let userFormalRatingsCache = null; // 缓存用户正式评分状态
let replyCountsCache = {}; // 缓存回复数量
let workOwnersCache = {}; // 缓存作品所有者信息
let allWorksRankingCache = null; // 缓存所有作品的排名信息
let workTitlesCache = {}; // 缓存作品标题信息

// 【新增】加载锁，防止并发重复加载
let isLoadingUserFormalRatings = false; // 防止并发加载用户评分状态
let isLoadingBatchData = false; // 防止并发加载批量数据
let isLoadingRanking = false; // 防止并发加载排名数据

// 【新增】批量数据缓存 - 一次性加载所有作品评分数据
let batchDataCache = null; // { workRatings, userQualityMap, workOwnerMap, workDQMap, commentCountMap }

// 【新增】任务数据缓存 - 避免重复调用
let userTaskDataCache = null; // 缓存用户任务数据

// 用户验证功能
async function checkUserVerification() {
  if (!currentUserId) {
    isUserVerified = false;
    return false;
  }

  try {
    const results = await wixData
      .query("jobApplication089")
      .eq("_owner", currentUserId)
      .find();

    if (results.items.length > 0) {
      isUserVerified = true;
      return true;
    } else {
      isUserVerified = false;
      return false;
    }
  } catch (error) {
    console.error("检查用户验证状态失败：", error);
    isUserVerified = false;
    return false;
  }
}

// 【已移除】updateCommentControlsVerificationStatus() - 只用于旧的原生组件
/*
function updateCommentControlsVerificationStatus() {
  if (!currentUserId) {
    $w("#submit").disable();
    $w("#submit").label = "未登录";
    $w("#Comment").disable();
    $w("#inputScore").disable();
    return;
  }

  if (!isUserVerified) {
    $w("#submit").disable();
    $w("#submit").label = "未报名";
    $w("#Comment").disable();
    $w("#inputScore").disable();
  } else {
    const workNumber = parseInt($w("#inputNumber").value);
    if (workNumber) {
      $w("#inputNumber").fireEvent("change");
    } else {
      $w("#submit").enable();
      $w("#submit").label = "提交评论";
      $w("#Comment").enable();
      $w("#inputScore").enable();
    }
  }
}
*/

// 【新增】批量加载所有数据（性能优化核心函数）
async function loadBatchData() {
  // 如果已有缓存，直接返回
  if (batchDataCache) {
    return batchDataCache;
  }

  // 【关键】如果正在加载，等待加载完成
  if (isLoadingBatchData) {
    // console.log("[性能优化] 批量数据正在加载中，等待完成...");
    let waitCount = 0;
    while (isLoadingBatchData && waitCount < 600) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      waitCount++;
    }
    return batchDataCache;
  }

  // 设置加载锁
  isLoadingBatchData = true;

  try {
    // console.log("[性能优化] 开始批量加载所有作品数据...");
    const startTime = Date.now();

    batchDataCache = await getAllWorksWeightedRatingData();

    // 从批量数据中提取评论计数
    commentsCountByWorkNumber = batchDataCache.commentCountMap || {};

    // 从批量数据中提取作品所有者信息
    workOwnersCache = batchDataCache.workOwnerMap || {};

    const endTime = Date.now();
    console.log(`加载完成，耗时: ${endTime - startTime}ms`);
    console.log(
      `加载了 ${
        Object.keys(batchDataCache.workRatings || {}).length
      } 个作品的评分数据`
    );
    console.log(
      `加载了 ${Object.keys(commentsCountByWorkNumber).length} 个作品的评论计数`
    );

    return batchDataCache;
  } catch (error) {
    console.error("[性能优化] 批量数据加载失败:", error);
    batchDataCache = {
      workRatings: {},
      userQualityMap: {},
      workOwnerMap: {},
      workDQMap: {},
      commentCountMap: {},
    };
    return batchDataCache;
  } finally {
    // 释放加载锁
    isLoadingBatchData = false;
  }
}

// 页面初始化
$w.onReady(async function () {
  // 初始化删除提示文字元件（隐藏）

  await checkUserVerification();
  // updateCommentControlsVerificationStatus(); // 【已移除】旧系统函数

  // 【优化】首先批量加载所有数据（一次API调用替代数百次）
  await loadBatchData();

  // 【优化】检查并刷新任务（仅调用一次并缓存）
  if (currentUserId && isUserVerified) {
    try {
      userTaskDataCache = await getUserTaskData(currentUserId);
      // console.log("[主会场] 任务同步检查完成，已缓存");
      // 【新增】如果返回错误状态（如未提交作品），也要正确缓存
      if (userTaskDataCache && userTaskDataCache.error) {
        console.log(
          "[主会场] 用户任务数据异常:",
          userTaskDataCache.message || "未知错误"
        );
      }
    } catch (error) {
      console.error("[主会场] 任务同步检查失败:", error);
      userTaskDataCache = {
        error: true,
        hasCompletedTarget: false,
        taskList: [],
      };
    }
  }

  // 初始化自定义HTML楼中楼回复面板
  initCommentRepliesPanel();

  // 初始化删除确认面板
  initDeleteConfirmationPanel();

  // 【新增】初始化评论系统HTML元件
  initCommentSystemPanel();

  // Repeater2: 作品显示
  $w("#repeater2").onItemReady(async ($item, itemData, index) => {
    const maidataUrl = itemData.inVideo的複本;
    const trackUrl = itemData.maidata的複本;
    const bgUrl = itemData.track的複本;
    const bgVideoUrl = itemData.上傳檔案欄;
    const submitTime = itemData.submissionTime;
    const formattedSubmitTime = formatDate(submitTime);

    const downloadUrl = await getMediaDownloadUrls(
      maidataUrl,
      trackUrl,
      bgUrl,
      bgVideoUrl
    );

    $item("#button3").label = "Download";

    // 视频显示控制
    if (bgVideoUrl) {
      $item("#movie").show();
    } else {
      $item("#movie").hide();
    }

    $item("#submitTime").text = formattedSubmitTime;
    await parseDifficultyLevels($item, maidataUrl);
    await updateItemEvaluationDisplay($item, itemData);
    await updateButtonStatus($item, itemData._id);
    await updateCommentStatus($item, itemData);

    // 淘汰作品视觉效果
    if (itemData.isDq === true) {
      $item("#container2").style.opacity = "0.5";
      $item("#container2").style.filter = "grayscale(100%)";
      $item("#container2").style.backgroundColor = "rgba(128, 128, 128, 0.2)";
    }

    setupItemEventListeners($item, itemData, downloadUrl);
  });

  // 【已移除】Repeater1评论显示功能已迁移到新的HTML元件（commentSystemPanel）

  // 数据初始化
  await updateRepeaterData(1, "", "");

  // 【优化】预加载用户评分状态（使用批量数据）
  if (currentUserId && isUserVerified) {
    await batchLoadUserFormalRatings();
  }

  // 【优化】预加载作品排名数据（使用批量数据）
  await calculateAllWorksRanking();

  // 【已移除】loadAllFormalComments() - 旧repeater1初始化，新系统通过HTML元件初始化

  // 预加载当前显示评论的回复数量（新系统会自动处理）
  // 【注释】旧repeater1的回复数量预加载已不需要

  // 【保留】作品列表（Repeater2）的事件监听器
  setupSearchAndPaginationEvents(); // 作品搜索、分页、排序

  // 【已迁移到新HTML元件】评论系统的事件监听器已移除
  // 所有评论相关功能现在由 commentSystemPanel HTML元件处理
});

// 核心功能函数

// 评论状态检查 - 优先级：淘汰 > 未登录 > 未验证 > 评论状态（任务/冷门高亮提示）
// ⚠️ 此函数被 Repeater2（作品列表）使用，用于显示作品的评论状态（#ifComment）
async function updateCommentStatus($item, itemData) {
  if (itemData.isDq === true) {
    $item("#ifComment").text = "已淘汰";
    $item("#ifComment").style.color = "#808080";
    return;
  }

  if (!currentUserId) {
    $item("#ifComment").text = "未登录";
    $item("#ifComment").style.color = "#A9A9A9";
    return;
  }

  if (!isUserVerified) {
    $item("#ifComment").text = "未报名";
    $item("#ifComment").style.color = "#FF0000";
    return;
  }

  try {
    const results = await wixData
      .query("BOFcomment")
      .eq("workNumber", itemData.sequenceId)
      .eq("_owner", currentUserId)
      .isEmpty("replyTo")
      .find();

    // 【优化】检查是否为任务作品或冷门作品 - 使用缓存避免重复调用
    // 【新增】同时检查用户任务数据是否有效（排除未提交作品等错误状态）
    const hasValidTaskData = userTaskDataCache && !userTaskDataCache.error;
    const taskCheck = hasValidTaskData
      ? await checkIfWorkInTaskList(currentUserId, itemData.sequenceId)
      : { inTaskList: false, alreadyCompleted: false };
    const hasCompletedTarget = hasValidTaskData
      ? userTaskDataCache.hasCompletedTarget || false
      : false;

    const isTask =
      taskCheck.inTaskList &&
      !taskCheck.alreadyCompleted &&
      !hasCompletedTarget;
    const isColdWork =
      taskCheck.inTaskList && !taskCheck.alreadyCompleted && hasCompletedTarget;

    if (results.items.length > 0) {
      $item("#ifComment").text = "已评论";
      $item("#ifComment").style.color = "#228B22";
    } else {
      // 未评论状态 - 区分任务和冷门作品
      if (isTask) {
        $item("#ifComment").text = "未评论（任务！！）";
        $item("#ifComment").style.color = "#0066FF"; // 蓝色高亮
        $item("#ifComment").style.fontWeight = "bold";
      } else if (isColdWork) {
        $item("#ifComment").text = "未评论（冷门）";
        $item("#ifComment").style.color = "#FFA500"; // 橙色
        $item("#ifComment").style.fontWeight = "bold";
      } else {
        $item("#ifComment").text = "未评论";
        $item("#ifComment").style.color = "#FF4500";
      }
    }
  } catch (err) {
    console.error("检查评论状态失败", err);
    $item("#ifComment").text = "检查失败";
    $item("#ifComment").style.color = "#A9A9A9";
  }
}

// Lightbox弹窗管理
function showTextPopup(content) {
  wixWindow.openLightbox("TextPopup", { content: content });
}

// 显示删除确认面板（替代原来的 lightbox）
async function handleDeleteComment(data, isSelfScComment = false) {
  try {
    // 显示删除确认面板
    $w("#deleteConfirmation").show();

    // 发送初始化数据到HTML元件
    $w("#deleteConfirmation").postMessage({
      action: "init",
      commentData: {
        commentId: data.commentId,
        workNumber: data.workNumber,
        score: data.score,
        comment: data.comment,
        isSelfScComment: data.isSelfScComment || isSelfScComment,
        _owner: data._owner,
      },
    });
  } catch (error) {
    console.error("显示删除确认面板失败:", error);
  }
}

// 关闭删除确认面板
function closeDeleteConfirmation() {
  try {
    $w("#deleteConfirmation").hide();
  } catch (error) {
    console.error("关闭删除确认面板失败:", error);
  }
}

// 执行删除操作
async function executeDelete(commentData, deleteReason) {
  try {
    // 执行删除
    const deleteResult = await deleteComment(
      commentData.commentId,
      currentUserId,
      deleteReason,
      commentData.isSelfScComment
    );

    if (deleteResult.success) {
      resetCommentDataCache();

      // 检查是否为作者自评
      let isAuthorComment = false;
      if (batchDataCache && batchDataCache.workOwnerMap) {
        const workOwner = batchDataCache.workOwnerMap[commentData.workNumber];
        isAuthorComment = commentData._owner === workOwner;
      }

      // 发送删除成功结果到HTML元件
      $w("#deleteConfirmation").postMessage({
        action: "deleteResult",
        result: {
          success: true,
          deleteReason: deleteReason,
          isAuthorComment: isAuthorComment,
        },
      });
    } else {
      // 发送删除失败结果到HTML元件
      $w("#deleteConfirmation").postMessage({
        action: "deleteResult",
        result: {
          success: false,
          message: deleteResult.message || "删除失败",
        },
      });
    }
  } catch (error) {
    console.error("执行删除操作失败:", error);

    // 发送错误结果到HTML元件
    $w("#deleteConfirmation").postMessage({
      action: "deleteResult",
      result: {
        success: false,
        message: error.message || "删除时发生异常",
      },
    });
  }
}

// 初始化删除确认面板
function initDeleteConfirmationPanel() {
  try {
    // 初始时隐藏面板
    $w("#deleteConfirmation").hide();

    // 监听来自HTML元件的消息
    $w("#deleteConfirmation").onMessage(async (event) => {
      const action = event.data.action;

      if (action === "confirmDelete") {
        // 执行删除操作
        await executeDelete(event.data.commentData, event.data.deleteReason);
      } else if (action === "cancelDelete") {
        // 取消删除
        closeDeleteConfirmation();
      } else if (action === "closeDeleteConfirmation") {
        // 关闭面板并刷新数据
        closeDeleteConfirmation();
        await refreshRepeaters();

        // 【修复】刷新评论系统时，保持用户当前的筛选状态
        if ($w("#commentSystemPanel")) {
          try {
            // 清空评论缓存
            resetCommentDataCache();
            
            // 【修复】使用保存的筛选状态，而不是硬编码的默认值
            await sendCommentsData({
              workFilter: currentCommentSystemState.workFilter,
              filterMode: currentCommentSystemState.filterMode,
              currentPage: currentCommentSystemState.currentPage,
            });
            console.log("[评论系统] 删除后已刷新评论列表（保持筛选状态）");
          } catch (error) {
            console.error("[评论系统] 刷新评论列表失败:", error);
          }
        }
      }
    });
  } catch (error) {
    console.error("初始化删除确认面板失败:", error);
  }
}

// 初始化自定义HTML楼中楼回复面板
function initCommentRepliesPanel() {
  // 确保HTML元件存在（需要在Wix编辑器中添加名为 commentRepliesPanel 的HTML元件）
  try {
    // 初始时隐藏面板
    $w("#commentRepliesPanel").hide();

    // 监听来自HTML元件的消息
    $w("#commentRepliesPanel").onMessage(async (event) => {
      const action = event.data.action;

      if (action === "getReplies") {
        // 获取回复数据
        await handleGetReplies(event.data.commentId);
      } else if (action === "submitReply") {
        // 提交回复
        await handleSubmitReply(event.data);
      } else if (action === "closeReplies") {
        // 关闭面板
        closeCommentRepliesPanel();
      }
    });
  } catch (error) {
    console.error("初始化楼中楼回复面板失败:", error);
  }
}

// 显示评论回复面板（替代原来的 lightbox）
async function showCommentReplies(commentId, workNumber, originalComment) {
  try {
    // 查询回复数据
    const replies = await wixData
      .query("BOFcomment")
      .eq("replyTo", commentId)
      .ascending("_createdDate")
      .find();

    // 显示HTML面板
    $w("#commentRepliesPanel").show();

    // 发送初始化数据到HTML元件
    $w("#commentRepliesPanel").postMessage({
      action: "init",
      commentData: {
        commentId: commentId,
        workNumber: workNumber,
        originalComment: originalComment,
        replies: replies.items,
      },
      currentUserId: currentUserId,
    });

    // 滚动到顶部以确保面板可见
    $w("#commentRepliesPanel").scrollTo();
  } catch (err) {
    console.error("显示评论回复失败", err);
  }
}

// 关闭评论回复面板
function closeCommentRepliesPanel() {
  try {
    $w("#commentRepliesPanel").hide();
    // 刷新页面数据
    refreshRepeaters();

    // 【修复】回复后刷新评论系统，清空缓存以显示最新回复数（保持当前筛选状态）
    if ($w("#commentSystemPanel")) {
      try {
        // 清空回复计数缓存和评论缓存
        replyCountsCache = {};
        resetCommentDataCache();
        
        // 【修复】使用保存的筛选状态，而不是硬编码的默认值
        sendCommentsData({
          workFilter: currentCommentSystemState.workFilter,
          filterMode: currentCommentSystemState.filterMode,
          currentPage: currentCommentSystemState.currentPage,
        });
        console.log("[评论系统] 回复后已刷新评论列表（保持筛选状态）");
      } catch (error) {
        console.error("[评论系统] 刷新评论列表失败:", error);
      }
    }
  } catch (error) {
    console.error("关闭回复面板失败:", error);
  }
}

// 处理获取回复数据请求
async function handleGetReplies(commentId) {
  try {
    const replies = await wixData
      .query("BOFcomment")
      .eq("replyTo", commentId)
      .ascending("_createdDate")
      .find();

    // 将回复数据发送回HTML元件
    $w("#commentRepliesPanel").postMessage({
      action: "repliesData",
      replies: replies.items,
    });
  } catch (error) {
    console.error("获取回复数据失败:", error);
    $w("#commentRepliesPanel").postMessage({
      action: "repliesData",
      replies: [],
    });
  }
}

// 处理提交回复请求
async function handleSubmitReply(data) {
  try {
    const { commentId, workNumber, replyContent } = data;

    if (!currentUserId) {
      $w("#commentRepliesPanel").postMessage({
        action: "submitReplyResult",
        success: false,
        error: "用户未登录",
      });
      return;
    }

    // 创建回复数据
    const replyData = {
      workNumber: workNumber,
      comment: replyContent,
      score: 0, // 回复不计分
      replyTo: commentId,
      submissionTime: new Date().toISOString(),
    };

    // 提交到数据库
    const insertedReply = await wixData.insert("BOFcomment", replyData);

    // 发送邮件通知（异步执行，不阻塞用户体验）
    try {
      await sendReplyNotification(
        commentId,
        replyContent,
        workNumber,
        currentUserId
      );
    } catch (emailError) {
      console.error("发送邮件通知失败（不影响回复提交）:", emailError);
    }

    // 通知HTML元件提交成功
    $w("#commentRepliesPanel").postMessage({
      action: "submitReplyResult",
      success: true,
    });
  } catch (error) {
    console.error("提交回复失败:", error);
    $w("#commentRepliesPanel").postMessage({
      action: "submitReplyResult",
      success: false,
      error: error.message || "提交失败",
    });
  }
}

// 辅助工具函数

// 【优化】获取所有作品的评分并计算排名百分位（排除淘汰作品）
// 使用批量缓存数据，避免逐个查询作品评分
async function calculateAllWorksRanking() {
  // 如果已有缓存，直接返回
  if (allWorksRankingCache) {
    return allWorksRankingCache;
  }

  // 【关键】如果正在加载，等待加载完成
  if (isLoadingRanking) {
    // console.log("[性能优化] 排名数据正在加载中，等待完成...");
    let waitCount = 0;
    while (isLoadingRanking && waitCount < 600) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      waitCount++;
    }
    return allWorksRankingCache;
  }

  // 设置加载锁
  isLoadingRanking = true;

  try {
    // console.log("[性能优化] 开始计算所有作品排名...");
    const startTime = Date.now();

    // 【优化】直接从批量缓存中获取数据
    if (!batchDataCache || !batchDataCache.workRatings) {
      console.warn("[性能提示] 批量缓存未加载，重新加载");
      await loadBatchData();
    }

    const workRatings = batchDataCache.workRatings;

    // 构建作品评分数组，排除淘汰作品
    const worksWithScores = [];
    for (const [workNumber, ratingData] of Object.entries(workRatings)) {
      // 排除淘汰作品
      if (ratingData.isDQ) continue;

      worksWithScores.push({
        sequenceId: parseInt(workNumber),
        averageScore: ratingData.weightedAverage,
        numRatings: ratingData.numRatings,
      });
    }

    // 只考虑有足够评分的作品（>=阈值人评分）
    const validWorks = worksWithScores.filter(
      (w) => w.numRatings >= RATING_CONFIG.MIN_RATINGS_FOR_RANKING
    );

    // 按平均分降序排序
    validWorks.sort((a, b) => b.averageScore - a.averageScore);

    // 创建排名映射
    const rankingMap = {};
    validWorks.forEach((work, index) => {
      const percentile = (index + 1) / validWorks.length;
      rankingMap[work.sequenceId] = {
        averageScore: work.averageScore,
        numRatings: work.numRatings,
        percentile: percentile,
        rank: index + 1,
      };
    });

    allWorksRankingCache = {
      rankingMap: rankingMap,
      totalValidWorks: validWorks.length,
    };

    const endTime = Date.now();
    console.log(
      `作品排名计算完成，共${validWorks.length}个有效作品，耗时: ${
        endTime - startTime
      }ms`
    );
    return allWorksRankingCache;
  } catch (error) {
    console.error("计算作品排名失败:", error);
    allWorksRankingCache = { rankingMap: {}, totalValidWorks: 0 };
    return allWorksRankingCache;
  } finally {
    // 释放加载锁
    isLoadingRanking = false;
  }
}

// 【优化】批量获取用户正式评分状态
// 使用批量缓存中的作品所有者信息，减少查询
async function batchLoadUserFormalRatings() {
  // 如果已有缓存，直接返回
  if (!currentUserId || !isUserVerified || userFormalRatingsCache) {
    return userFormalRatingsCache || {};
  }

  // 【关键】如果正在加载，等待加载完成
  if (isLoadingUserFormalRatings) {
    // console.log("[性能优化] 用户评分状态正在加载中，等待完成...");
    // 等待加载完成（最多等待60秒）
    let waitCount = 0;
    while (isLoadingUserFormalRatings && waitCount < 600) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      waitCount++;
    }
    return userFormalRatingsCache || {};
  }

  // 设置加载锁
  isLoadingUserFormalRatings = true;

  try {
    // console.log("[性能优化] 批量加载用户评分状态...");
    const startTime = Date.now();

    // 【优化】从批量缓存获取作品所有者信息
    if (!batchDataCache || !batchDataCache.workOwnerMap) {
      console.warn("[性能提示] 批量缓存未加载，重新加载");
      await loadBatchData();
    }

    const workOwnerMap = batchDataCache.workOwnerMap;

    // 获取用户所有评论
    const userComments = await wixData
      .query("BOFcomment")
      .eq("_owner", currentUserId)
      .isEmpty("replyTo")
      .limit(1000)
      .find();

    // 计算用户正式评分状态
    const formalRatings = {};
    userComments.items.forEach((comment) => {
      const workOwnerId = workOwnerMap[comment.workNumber];
      if (comment._owner !== workOwnerId) {
        formalRatings[comment.workNumber] = true;
      }
    });

    userFormalRatingsCache = formalRatings;
    const endTime = Date.now();
    console.log(
      `用户评分状态加载完成，共${
        Object.keys(formalRatings).length
      }个作品有正式评分，耗时: ${endTime - startTime}ms`
    );
    return formalRatings;
  } catch (error) {
    console.error("批量加载用户正式评分状态失败:", error);
    return {};
  } finally {
    // 释放加载锁
    isLoadingUserFormalRatings = false;
  }
}

// 检查用户是否对作品有正式评分（使用缓存）
async function checkUserHasFormalRating(workNumber) {
  if (!currentUserId || !isUserVerified) {
    return false;
  }

  if (!userFormalRatingsCache) {
    await batchLoadUserFormalRatings();
  }

  return userFormalRatingsCache[workNumber] || false;
}

// 【优化】清理缓存数据
function clearCaches() {
  userFormalRatingsCache = null;
  replyCountsCache = {};
  workOwnersCache = {};
  workTitlesCache = {}; // 清理作品标题缓存
  allWorksRankingCache = null;
  batchDataCache = null; // 清理批量数据缓存
  userTaskDataCache = null; // 清理任务数据缓存
  resetCommentDataCache(); // 清理评论分页缓存

  // 重置所有加载锁
  isLoadingUserFormalRatings = false;
  isLoadingBatchData = false;
  isLoadingRanking = false;

  // console.log("[性能优化] 缓存数据已清理");
}

// 【新增】增量热更新 - 评论提交后快速更新状态（无需完全刷新）
async function incrementalUpdateAfterComment(
  workNumber,
  score,
  comment,
  isAuthorComment = false
) {
  try {
    // console.log(`[热更新] 开始增量更新作品 #${workNumber} 的状态...`);
    const startTime = Date.now();

    // 1. 更新评论计数缓存
    if (batchDataCache && batchDataCache.commentCountMap) {
      const currentCount = batchDataCache.commentCountMap[workNumber] || 0;
      batchDataCache.commentCountMap[workNumber] = currentCount + 1;
      commentsCountByWorkNumber[workNumber] = currentCount + 1;
      // console.log(`[热更新] 评论计数更新: ${currentCount} -> ${currentCount + 1}`);
    }

    // 2. 如果不是作者自评，更新用户正式评分缓存和作品评分数据
    if (!isAuthorComment) {
      // 更新用户正式评分状态
      if (userFormalRatingsCache) {
        userFormalRatingsCache[workNumber] = true;
        // console.log(`[热更新] 用户评分状态已更新`);
      }

      // 【修复】等待评分数据更新完成后再更新显示
      let updatedRatingData = null;
      if (batchDataCache && batchDataCache.workRatings) {
        try {
          // 同步等待评分数据更新完成
          const newRating = await getWorkWeightedRatingData(workNumber);
          if (newRating && batchDataCache.workRatings) {
            const oldRating = batchDataCache.workRatings[workNumber] || {};
            batchDataCache.workRatings[workNumber] = {
              numRatings: newRating.numRatings,
              weightedAverage: newRating.weightedAverage,
              originalAverage: newRating.originalAverage,
              highWeightCount: newRating.highWeightCount,
              lowWeightCount: newRating.lowWeightCount,
              ratio: newRating.ratio,
              isDQ: oldRating.isDQ,
            };
            updatedRatingData = newRating;
            // console.log(`[热更新] 评分数据已更新: 作品 #${workNumber} 现有 ${newRating.numRatings}人评分`);
          }
        } catch (error) {
          console.error("[热更新] 更新评分数据失败:", error);
        }
      }

      // 清理排名缓存，强制重新计算（因为评分可能影响排名）
      allWorksRankingCache = null;
    }

    // 3. 热更新 Repeater2（作品列表）中当前页的该作品状态
    try {
      const repeater2Data = $w("#repeater2").data;
      let needUpdateRepeater2 = false;

      $w("#repeater2").forEachItem(($item, itemData, index) => {
        if (itemData.sequenceId === workNumber) {
          needUpdateRepeater2 = true;
          // 更新评论计数显示
          const newCount = commentsCountByWorkNumber[workNumber] || 0;
          $item("#Commments").text = `${newCount}`;

          // 更新评论状态（异步更新）
          updateCommentStatus($item, itemData).then(() => {
            // console.log(`[热更新] 作品 #${workNumber} 的评论状态已更新`);
          });

          // 【修复】等待评分数据更新后再更新显示，确保使用最新数据
          if (!isAuthorComment) {
            updateItemEvaluationDisplay($item, itemData).then(() => {
              // console.log(`[热更新] 作品 #${workNumber} 的评分显示已更新`);
            });
          }
        }
      });

      if (needUpdateRepeater2) {
        // console.log(`[热更新] Repeater2中作品 #${workNumber} 已热更新`);
      }
    } catch (error) {
      console.error("[热更新] 更新Repeater2失败:", error);
    }

    const endTime = Date.now();
    // console.log(`[热更新] 增量更新完成，耗时: ${endTime - startTime}ms`);

    return { success: true };
  } catch (error) {
    console.error("[热更新] 增量更新失败:", error);
    return { success: false, error };
  }
}

// 【优化】统一刷新两个repeater（完全刷新，用于删除评论等需要完全同步的场景）
async function refreshRepeaters() {
  try {
    // console.log("[性能优化] 开始完全刷新Repeaters...");
    const startTime = Date.now();

    // 清理缓存以确保数据同步
    clearCaches();

    // 重新批量加载所有数据
    await loadBatchData();

    // 【优化】重新加载任务数据缓存
    if (currentUserId && isUserVerified) {
      try {
        userTaskDataCache = await getUserTaskData(currentUserId);
        // console.log("[性能优化] 任务数据缓存已重新加载");
        // 【新增】如果返回错误状态（如未提交作品），也要正确缓存
        if (userTaskDataCache && userTaskDataCache.error) {
          console.log(
            "[性能优化] 任务数据异常:",
            userTaskDataCache.message || "未知错误"
          );
        }
      } catch (error) {
        console.error("[性能优化] 任务数据重新加载失败:", error);
        userTaskDataCache = {
          error: true,
          hasCompletedTarget: false,
          taskList: [],
        };
      }
    }

    const currentPage = $w("#paginator").currentPage || 1;
    const searchValue = $w("#input1").value;
    const dropdownValue = $w("#dropdown1").value;
    await updateRepeaterData(currentPage, searchValue, dropdownValue);

    // 重新加载用户评分缓存
    if (currentUserId && isUserVerified) {
      await batchLoadUserFormalRatings();
    }

    // 重新加载排名数据
    await calculateAllWorksRanking();

    // 【修复】通知新评论系统HTML元件刷新评论列表（保持当前筛选状态）
    if ($w("#commentSystemPanel")) {
      try {
        await sendCommentsData({
          workFilter: currentCommentSystemState.workFilter,
          filterMode: currentCommentSystemState.filterMode,
          currentPage: currentCommentSystemState.currentPage,
        });
        console.log("[评论系统] 已刷新评论列表（保持筛选状态）");
      } catch (error) {
        console.error("[评论系统] 刷新评论列表失败:", error);
      }
    }

    const endTime = Date.now();
    // console.log(`[性能优化] 完全刷新完成，耗时: ${endTime - startTime}ms`);
  } catch (error) {
    console.error("刷新Repeaters时发生错误:", error);
  }
}

// 解析maidata文件中的难度等级
async function parseDifficultyLevels($item, maidataUrl) {
  try {
    const { downloadUrl, fileContent } = await getFileDownloadUrlAndContent(
      maidataUrl
    );

    const lv4Pattern = /&lv_4=([\d+]+)/;
    const lv5Pattern = /&lv_5=([\d+]+)/;
    const lv6Pattern = /&lv_6=([\d+]+)/;

    const lv4Match = fileContent.match(lv4Pattern);
    const lv5Match = fileContent.match(lv5Pattern);
    const lv6Match = fileContent.match(lv6Pattern);

    $item("#LevelExpert").text = lv4Match ? lv4Match[1] : "";
    $item("#LevelMaster").text = lv5Match ? lv5Match[1] : "";
    $item("#LevelRe").text = lv6Match ? lv6Match[1] : "";
  } catch (error) {
    console.error("Error fetching file content:", error);
  }
}

// 【优化】显示作者信息和样式
// 优化：使用批量缓存，只在必要时查询作品名称
async function displayAuthorInfo($item, itemData) {
  try {
    let contestItem = null;

    // 【优化】作品所有者信息已在批量缓存中，无需重复获取
    // 只需要获取作品名称用于显示
    const results = await wixData
      .query("enterContest034")
      .eq("sequenceId", itemData.workNumber)
      .find();

    if (results.items.length > 0) {
      contestItem = results.items[0];
    }

    // 设置text15显示作品标题
    if (contestItem && contestItem.firstName) {
      $item("#text15").text = contestItem.firstName;
    } else {
      $item("#text15").text = "未知作品";
    }
  } catch (error) {
    console.error("显示作者信息失败:", error);
    $item("#text15").text = "Unknown";
  }
}

// 批量加载回复数量
async function batchLoadReplyCounts(commentIds) {
  const uncachedIds = commentIds.filter((id) => !(id in replyCountsCache));

  if (uncachedIds.length === 0) {
    return;
  }

  try {
    // console.log(`批量加载${uncachedIds.length}个评论的回复数量...`);

    // 批量查询所有回复
    const allReplies = await wixData
      .query("BOFcomment")
      .hasSome("replyTo", uncachedIds)
      .find();

    // 统计每个评论的回复数量
    const counts = {};
    allReplies.items.forEach((reply) => {
      const parentId = reply.replyTo;
      counts[parentId] = (counts[parentId] || 0) + 1;
    });

    // 更新缓存
    uncachedIds.forEach((id) => {
      replyCountsCache[id] = counts[id] || 0;
    });

    // console.log(`回复数量加载完成，共${Object.keys(counts).length}个评论有回复`);
  } catch (err) {
    console.error("批量加载回复数量失败", err);
    // 为未能加载的ID设置默认值
    uncachedIds.forEach((id) => {
      replyCountsCache[id] = 0;
    });
  }
}

// 显示回复数量（使用缓存）
async function displayReplyCount($item, commentId) {
  try {
    if (!(commentId in replyCountsCache)) {
      await batchLoadReplyCounts([commentId]);
    }

    const replyCount = replyCountsCache[commentId] || 0;

    if (replyCount > 0) {
      $item("#replyCountText").text = `${replyCount}条回复`;
      $item("#replyCountText").show();
    } else {
      $item("#replyCountText").text = "";
      $item("#replyCountText").hide();
    }
  } catch (err) {
    console.error("显示回复数量失败", err);
    $item("#replyCountText").text = "";
    $item("#replyCountText").hide();
  }
}

// 设置作品项目的事件监听器
function setupItemEventListeners($item, itemData, downloadUrl) {
  $item("#button3").onClick(() => {
    $w("#htmlDownloadHelper").postMessage({
      action: "download",
      downloadUrl,
      titleValue,
    });
  });

  $item("#checkText").onClick(() => {
    const descriptionText = $item("#descriptionBox").value;
    showTextPopup(descriptionText);
  });

  $item("#vectorImage2").onClick(async () => {
    // 【优化】通知新评论系统筛选该作品的评论
    if ($w("#commentSystemPanel")) {
      try {
        await sendCommentsData({
          workFilter: itemData.sequenceId.toString(),
          filterMode: "default",
          currentPage: 1,
        });
        // console.log(`[评论系统] 已切换到作品 #${itemData.sequenceId} 的评论`);
      } catch (error) {
        console.error("[评论系统] 切换评论筛选失败:", error);
      }
    }
  });
}

// 日期格式化工具
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

// 数据处理与分页
async function updateRepeaterData(pageNumber, searchValue, dropdownValue) {
  $w("#loadingSpinner").show();

  let query = wixData.query("enterContest034");

  if (searchValue) {
    query = query
      .contains("firstName", searchValue)
      .or(query.eq("sequenceId", Number(searchValue)));
  }

  let results = await query.limit(1000).find();

  // 更新下拉菜单选项（排除淘汰作品）
  const filteredItems = results.items.filter((item) => item.isDq !== true);
  const options = [{ label: "Please Choose ID", value: "" }].concat(
    filteredItems.map((item) => {
      return {
        label: item.sequenceId + " - " + item.firstName,
        value: item.sequenceId.toString(),
      };
    })
  );

  $w("#inputNumber").options = options;
  $w("#dropdownFilter").options = options;

  let items = results.items;

  if (dropdownValue === "rating") {
    items = await sortByRating(items);
  } else if (dropdownValue === "task") {
    items = await sortByTask(items);
  }

  // 分页处理
  const totalPages = Math.ceil(items.length / itemsPerPage);
  $w("#paginator").totalPages = totalPages;
  $w("#paginator").currentPage = pageNumber;
  $w("#paginator2").totalPages = totalPages;
  $w("#paginator2").currentPage = pageNumber;

  const startIndex = (pageNumber - 1) * itemsPerPage;
  const pagedItems = items.slice(startIndex, startIndex + itemsPerPage);

  $w("#repeater2").data = pagedItems;

  $w("#repeater2").forEachItem(async ($item, itemData, index) => {
    const commentCount = commentsCountByWorkNumber[itemData.sequenceId] || 0;
    $item("#Commments").text = `${commentCount}`;

    if (index === pagedItems.length - 1) {
      $w("#loadingSpinner").hide();
    }
  });

  if (pagedItems.length === 0) {
    $w("#loadingSpinner").hide();
  }
}

// 更新下载按钮状态
async function updateButtonStatus($item, sheetId) {
  $item("#button3").enable();
  $item("#button3").show();
  $item("#downloadAble").show();
}

// 【优化】获取评分数据（排除作者自评，使用加权平均分）
// 优先使用批量缓存，大幅减少API调用
async function getRatingData(workNumber) {
  try {
    // 优先从批量缓存中获取
    if (
      batchDataCache &&
      batchDataCache.workRatings &&
      batchDataCache.workRatings[workNumber]
    ) {
      const cachedData = batchDataCache.workRatings[workNumber];
      return {
        numRatings: cachedData.numRatings,
        averageScore: cachedData.weightedAverage,
        originalAverage: cachedData.originalAverage,
        highWeightCount: cachedData.highWeightCount,
        lowWeightCount: cachedData.lowWeightCount,
        ratio: cachedData.ratio,
      };
    }

    // 缓存未命中时才调用后端（降级方案）
    console.warn(`[性能提示] 作品 ${workNumber} 未在缓存中，降级查询`);
    const weightedData = await getWorkWeightedRatingData(workNumber);

    return {
      numRatings: weightedData.numRatings,
      averageScore: weightedData.weightedAverage,
      originalAverage: weightedData.originalAverage,
      highWeightCount: weightedData.highWeightCount,
      lowWeightCount: weightedData.lowWeightCount,
      ratio: weightedData.ratio,
    };
  } catch (error) {
    console.error("获取评分数据失败:", error);
    return {
      numRatings: 0,
      averageScore: 0,
      originalAverage: 0,
      highWeightCount: 0,
      lowWeightCount: 0,
      ratio: 0,
    };
  }
}

// 【已废弃】统计所有作品的评论数量（仅主评论）
// 改用批量数据中的 commentCountMap，无需单独查询
// 保留此函数作为降级方案
async function getAllCommentsCount() {
  // 优先从批量缓存获取
  if (batchDataCache && batchDataCache.commentCountMap) {
    return batchDataCache.commentCountMap;
  }

  // 降级方案：直接查询（性能较低，仅作为备用）
  console.warn("[性能提示] 批量缓存未加载，使用降级查询评论计数");
  let commentsCountByWorkNumber = {};

  try {
    // 一次性查询所有主评论
    const allComments = await wixData
      .query("BOFcomment")
      .isEmpty("replyTo")
      .limit(1000)
      .find();

    allComments.items.forEach((item) => {
      if (commentsCountByWorkNumber[item.workNumber]) {
        commentsCountByWorkNumber[item.workNumber] += 1;
      } else {
        commentsCountByWorkNumber[item.workNumber] = 1;
      }
    });
  } catch (err) {
    console.error("获取评论计数失败:", err);
  }

  return commentsCountByWorkNumber;
}

/* 【已移除 - 旧系统】setDropdownValue() 已废弃，功能已迁移到HTML元件
async function setDropdownValue(sequenceId, pageNumber = 1) {
  // ... 约80行设置下拉筛选的代码（已废弃）...
}
*/

// 更新作品评分显示（基于排名百分位的等级系统，排除淘汰作品）
async function updateItemEvaluationDisplay($item, itemData) {
  try {
    const workNumber = itemData.sequenceId;

    // 淘汰作品不显示评分
    if (itemData.isDq === true) {
      $item("#totalscore").text = "";
      $item("#box1").style.backgroundColor = "transparent";
      return;
    }

    const userHasFormalRating = await checkUserHasFormalRating(workNumber);

    if (!userHasFormalRating) {
      $item("#totalscore").text = "";
      $item("#box1").style.backgroundColor = "transparent";
      return;
    }

    const ratingData = await getRatingData(workNumber);
    const evaluationCount = ratingData.numRatings;
    const averageScore = ratingData.averageScore;

    if (evaluationCount > 0) {
      if (evaluationCount >= RATING_CONFIG.MIN_RATINGS_FOR_RANKING) {
        // 获取排名信息
        const rankingData = await calculateAllWorksRanking();
        const workRanking = rankingData.rankingMap[workNumber];

        if (workRanking) {
          const tier = getTierFromPercentile(workRanking.percentile);
          $item("#totalscore").text = `${tier} (${evaluationCount}人评分)`;

          // 根据等级设置背景色
          if (tier === "T0") {
            $item("#box1").style.backgroundColor = "rgba(255, 215, 0, 0.6)"; // 金色
          } else if (tier === "T1") {
            $item("#box1").style.backgroundColor = "rgba(135, 206, 235, 0.5)"; // 天蓝色
          } else if (tier === "T2") {
            $item("#box1").style.backgroundColor = "rgba(144, 238, 144, 0.4)"; // 浅绿色
          } else if (tier === "T3") {
            $item("#box1").style.backgroundColor = "rgba(255, 255, 224, 0.4)"; // 浅黄色
          } else {
            $item("#box1").style.backgroundColor = "rgba(211, 211, 211, 0.3)"; // 浅灰色
          }
        } else {
          // 有评分但未进入排名（可能被淘汰或其他原因）
          $item("#totalscore").text = "";
          $item("#box1").style.backgroundColor = "transparent";
        }
      } else {
        $item("#totalscore").text = `评分量不足(${evaluationCount}人评分)`;
        $item("#box1").style.backgroundColor = "rgba(255, 255, 0, 0.3)";
      }
    } else {
      $item("#totalscore").text = "暂无评分";
      $item("#box1").style.backgroundColor = "transparent";
    }
  } catch (error) {
    console.error("更新评分显示时出错:", error);
    $item("#totalscore").text = "评分加载失败";
  }
}

// 基于任务排序作品（任务作品优先，淘汰作品后置）
async function sortByTask(items) {
  try {
    // 如果用户未登录或未验证，按默认顺序返回
    if (!currentUserId || !isUserVerified) {
      return items;
    }

    const itemsWithTaskStatus = await Promise.all(
      items.map(async (item) => {
        const taskCheck = await checkIfWorkInTaskList(
          currentUserId,
          item.sequenceId
        );
        const isTask = taskCheck.inTaskList && !taskCheck.alreadyCompleted;
        const isTaskCompleted = taskCheck.alreadyCompleted;
        const isDQ = item.isDq === true;

        return {
          ...item,
          isTask: isTask, // 未完成的任务
          isTaskCompleted: isTaskCompleted, // 已完成的任务
          isDQ: isDQ, // 淘汰作品
        };
      })
    );

    // 四级分类：未完成的任务 > 已完成的任务 > 其他作品 > 淘汰作品
    const uncompletedTaskItems = itemsWithTaskStatus.filter(
      (item) => item.isTask && !item.isDQ
    );
    const completedTaskItems = itemsWithTaskStatus.filter(
      (item) => item.isTaskCompleted && !item.isDQ && !item.isTask
    );
    const otherItems = itemsWithTaskStatus.filter(
      (item) => !item.isTask && !item.isTaskCompleted && !item.isDQ
    );
    const disqualifiedItems = itemsWithTaskStatus.filter((item) => item.isDQ);

    // 各分类内部按sequenceId排序
    uncompletedTaskItems.sort((a, b) => a.sequenceId - b.sequenceId);
    completedTaskItems.sort((a, b) => a.sequenceId - b.sequenceId);
    otherItems.sort((a, b) => a.sequenceId - b.sequenceId);
    disqualifiedItems.sort((a, b) => a.sequenceId - b.sequenceId);

    // 排序优先级：未完成任务 > 已完成任务 > 其他作品 > 淘汰作品
    return [
      ...uncompletedTaskItems,
      ...completedTaskItems,
      ...otherItems,
      ...disqualifiedItems,
    ];
  } catch (error) {
    console.error("按任务排序时出错:", error);
    return items;
  }
}

// 基于评分排序作品（排除作者自评，考虑用户评分权限，淘汰作品后置）
// 【修改】按tier分类排序，同tier内部按作品ID排序，隐藏精确排名
async function sortByRating(items) {
  try {
    // 获取排名数据用于计算tier
    const rankingData = await calculateAllWorksRanking();
    
    const itemsWithRating = await Promise.all(
      items.map(async (item) => {
        const ratingData = await getRatingData(item.sequenceId);
        const userHasFormalRating = await checkUserHasFormalRating(
          item.sequenceId
        );

        // 只有用户对该作品有正式评分时，才能看到并参与排序
        const canSeeRating =
          userHasFormalRating &&
          ratingData.numRatings >= RATING_CONFIG.MIN_RATINGS_FOR_RANKING;
        
        // 获取tier信息
        let tier = null;
        let tierOrder = 999; // 默认排序值（用于没有tier的作品）
        
        if (canSeeRating && rankingData.rankingMap[item.sequenceId]) {
          const workRanking = rankingData.rankingMap[item.sequenceId];
          tier = getTierFromPercentile(workRanking.percentile);
          
          // 定义tier的排序优先级（数字越小越靠前）
          const tierOrderMap = {
            'T0': 0,
            'T1': 1,
            'T2': 2,
            'T3': 3,
            'T4': 4
          };
          tierOrder = tierOrderMap[tier] !== undefined ? tierOrderMap[tier] : 999;
        }

        return {
          ...item,
          rating: ratingData.averageScore,
          numRatings: ratingData.numRatings,
          canSeeRating: canSeeRating, // 标记用户是否能看到评分
          isDQ: item.isDq === true, // 标记是否淘汰
          tier: tier, // tier等级
          tierOrder: tierOrder, // tier排序优先级
        };
      })
    );

    // 三级分类：能看到评分的非淘汰作品、不能看到评分的非淘汰作品、淘汰作品
    const visibleRatingItems = itemsWithRating.filter(
      (item) => item.canSeeRating && !item.isDQ
    );
    const hiddenRatingItems = itemsWithRating.filter(
      (item) => !item.canSeeRating && !item.isDQ
    );
    const disqualifiedItems = itemsWithRating.filter((item) => item.isDQ);

    // 【关键修改】能看到评分的作品按tier分类排序，同tier内按作品ID排序
    visibleRatingItems.sort((a, b) => {
      // 先按tier排序（T0 > T1 > T2...）
      if (a.tierOrder !== b.tierOrder) {
        return a.tierOrder - b.tierOrder;
      }
      // 同tier内按作品ID排序（隐藏精确排名）
      return a.sequenceId - b.sequenceId;
    });

    // 不能看到评分的作品按sequenceId排序
    hiddenRatingItems.sort((a, b) => a.sequenceId - b.sequenceId);

    // 淘汰作品按sequenceId排序
    disqualifiedItems.sort((a, b) => a.sequenceId - b.sequenceId);

    // 排序优先级：有评分可见 > 评分不可见 > 淘汰作品
    return [...visibleRatingItems, ...hiddenRatingItems, ...disqualifiedItems];
  } catch (error) {
    console.error("排序时出错:", error);
    return items;
  }
}

// 【保留 - Repeater2作品列表】搜索和分页事件监听器
// ⚠️ 此函数用于作品列表（repeater2），不是评论系统
function setupSearchAndPaginationEvents() {
  $w("#input1").onInput(async () => {
    const searchValue = $w("#input1").value;
    const dropdownValue = $w("#dropdown1").value;
    await updateRepeaterData(1, searchValue, dropdownValue);
  });

  $w("#paginator, #paginator2").onClick(async (event) => {
    const pageNumber = event.target.currentPage;
    const searchValue = $w("#input1").value;
    const dropdownValue = $w("#dropdown1").value;
    await updateRepeaterData(pageNumber, searchValue, dropdownValue);
  });

  $w("#dropdown1").onChange(async () => {
    const searchValue = $w("#input1").value;
    const pageNumber = 1;
    const dropdownValue = $w("#dropdown1").value;
    await updateRepeaterData(pageNumber, searchValue, dropdownValue);
  });
}


// 初始化评论系统HTML元件
function initCommentSystemPanel() {
  try {
    // 确保HTML元件存在
    if (!$w("#commentSystemPanel")) {
      console.error("[评论系统] HTML元件未找到");
      return;
    }

    // console.log("[评论系统] 开始初始化...");

    // 监听来自HTML元件的消息
    $w("#commentSystemPanel").onMessage(async (event) => {
      const { type, data } = event.data;
      // console.log(`[评论系统] 收到消息: ${type}`, data);

      switch (type) {
        case "COMMENT_SYSTEM_READY":
          await handleCommentSystemReady();
          break;
        case "REQUEST_WORK_OPTIONS":
          await sendWorkOptions();
          break;
        case "REQUEST_COMMENTS":
          await sendCommentsData(data);
          break;
        case "SUBMIT_COMMENT":
          await handleCommentSubmit(data);
          break;
        case "WORK_NUMBER_CHANGED":
          await handleWorkNumberChange(data.workNumber);
          break;
        case "GOTO_WORK":
          await handleGotoWork(data.workNumber);
          break;
        case "VIEW_REPLIES":
          await handleViewReplies(data);
          break;
        case "DELETE_COMMENT":
          await handleDeleteComment(data, data.isSelfScComment);
          break;
        default:
        // console.log('[评论系统] 未知消息类型:', type);
      }
    });

    // console.log("[评论系统] 初始化完成");
  } catch (error) {
    console.error("[评论系统] 初始化失败:", error);
  }
}

// HTML元件准备就绪
async function handleCommentSystemReady() {
  // console.log("[评论系统] HTML元件已准备就绪");

  // 发送初始化数据
  $w("#commentSystemPanel").postMessage({
    type: "INIT_COMMENT_SYSTEM",
    data: {
      currentUserId: currentUserId,
      isUserVerified: isUserVerified,
    },
  });
}

// 发送作品选项
async function sendWorkOptions() {
  try {
    // 查询所有作品（排除淘汰作品）
    const results = await wixData.query("enterContest034").limit(1000).find();
    const filteredItems = results.items.filter((item) => item.isDq !== true);

    // 【优化】同时缓存所有作品标题，避免后续查询
    results.items.forEach((item) => {
      workTitlesCache[item.sequenceId] = item.firstName;
    });
    // console.log(`[评论系统] 已缓存 ${Object.keys(workTitlesCache).length} 个作品标题`);

    const options = filteredItems.map((item) => ({
      label: `${item.sequenceId} - ${item.firstName}`,
      value: item.sequenceId.toString(),
    }));

    $w("#commentSystemPanel").postMessage({
      type: "WORK_OPTIONS",
      data: { options },
    });

    console.log(`[评论系统] 已发送 ${options.length} 个作品选项`);
  } catch (error) {
    console.error("[评论系统] 发送作品选项失败:", error);
  }
}

// ==================== 评论分页辅助函数 ====================
function normalizeWorkFilter(workFilter) {
  if (workFilter === undefined || workFilter === null || workFilter === "") {
    return null;
  }
  const numeric = parseInt(workFilter, 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function getCommentCacheKey(workFilter, filterMode) {
  const normalized = normalizeWorkFilter(workFilter);
  const modeKey = filterMode || "default";
  const ownerKey = modeKey === "YourComment" ? currentUserId || "guest" : "all";
  return `${normalized !== null ? normalized : "all"}|${modeKey}|${ownerKey}`;
}

function updateCommentPaginationTotals(state, pageLength) {
  if (!state) {
    return;
  }
  const computedCount = (state.pages.size - 1) * state.pageSize + pageLength;
  if (computedCount > state.totalCount) {
    state.totalCount = computedCount;
    state.totalPages = Math.max(
      1,
      Math.ceil(state.totalCount / state.pageSize)
    );
  }
}

function resetCommentDataCache() {
  commentDataCache.clear();
  selfScCommentIdCache = null;
}

async function loadSelfScCommentIdSet() {
  if (selfScCommentIdCache) {
    return selfScCommentIdCache;
  }

  if (isLoadingSelfScComments) {
    let waitCount = 0;
    while (isLoadingSelfScComments && waitCount < 200) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waitCount++;
    }
    return selfScCommentIdCache || new Set();
  }

  isLoadingSelfScComments = true;

  try {
    await loadBatchData();

    const ownerMap = workOwnersCache || {};
    const ownerIds = Array.from(
      new Set(Object.values(ownerMap).filter(Boolean))
    );

    if (ownerIds.length === 0) {
      selfScCommentIdCache = new Set();
      return selfScCommentIdCache;
    }

    const scCommentIds = new Set();
    const chunkSize = 50;

    for (let i = 0; i < ownerIds.length; i += chunkSize) {
      const chunk = ownerIds.slice(i, i + chunkSize);
      let query = wixData
        .query("BOFcomment")
        .isEmpty("replyTo")
        .hasSome("_owner", chunk)
        .limit(1000);

      let result = await query.find();

      while (result) {
        result.items.forEach((item) => {
          if (
            ownerMap[item.workNumber] &&
            ownerMap[item.workNumber] === item._owner
          ) {
            scCommentIds.add(item._id);
          }
        });

        if (result.hasNext()) {
          result = await result.next();
        } else {
          break;
        }
      }
    }

    selfScCommentIdCache = scCommentIds;
    return selfScCommentIdCache;
  } catch (error) {
    console.error("[评论系统] 加载作者自评评论ID失败:", error);
    selfScCommentIdCache = new Set();
    return selfScCommentIdCache;
  } finally {
    isLoadingSelfScComments = false;
  }
}

async function initializeCommentPaginationState(
  workFilter,
  filterMode = "default"
) {
  const normalizedWorkFilter = normalizeWorkFilter(workFilter);
  const effectiveFilterMode = filterMode || "default";
  const pageSize = commentsPerPage;

  const createQuery = () => {
    let query = wixData.query("BOFcomment");

    if (normalizedWorkFilter !== null) {
      return query
        .eq("workNumber", normalizedWorkFilter)
        .descending("_createdDate");
    }

    if (effectiveFilterMode === "YourComment") {
      if (!currentUserId) {
        return query.eq("_id", "__empty__");
      }
      return query.eq("_owner", currentUserId).descending("_createdDate");
    }

    return query.isEmpty("replyTo").descending("_createdDate");
  };

  let totalCount = 0;
  let selfScCommentIds = new Set();
  const isScoreOnly =
    normalizedWorkFilter === null && effectiveFilterMode === "ScoreOnly";

  if (effectiveFilterMode === "YourComment" && !currentUserId) {
    totalCount = 0;
  } else if (normalizedWorkFilter !== null) {
    totalCount = await wixData
      .query("BOFcomment")
      .eq("workNumber", normalizedWorkFilter)
      .count();
  } else if (effectiveFilterMode === "YourComment") {
    totalCount = await wixData
      .query("BOFcomment")
      .eq("_owner", currentUserId)
      .count();
  } else {
    totalCount = await wixData.query("BOFcomment").isEmpty("replyTo").count();
  }

  if (isScoreOnly) {
    selfScCommentIds = await loadSelfScCommentIdSet();
    if (totalCount > 0) {
      totalCount = Math.max(0, totalCount - selfScCommentIds.size);
    }
  }

  const initialTotalPages =
    totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1;

  const state = {
    workFilter: normalizedWorkFilter,
    rawWorkFilter: workFilter,
    filterMode: effectiveFilterMode,
    pageSize,
    totalCount,
    totalPages: initialTotalPages,
    createQuery,
    lastResult: null,
    fetchLimit: isScoreOnly ? pageSize * 3 : pageSize,
    pages: new Map(),
    buffer: [],
    noMoreData: totalCount === 0,
    isScoreOnly,
    selfScCommentIds,
    loadingPromise: null,
  };

  if (state.noMoreData) {
    state.pages.set(1, []);
  }

  return state;
}

async function fetchMoreComments(state) {
  if (!state || state.noMoreData) {
    return;
  }

  try {
    let result;

    if (!state.lastResult) {
      result = await state.createQuery().limit(state.fetchLimit).find();
    } else if (state.lastResult.hasNext()) {
      result = await state.lastResult.next();
    } else {
      state.noMoreData = true;
      if (state.isScoreOnly && state.buffer.length > 0) {
        const pageNumber = state.pages.size + 1;
        const formatted = await Promise.all(
          state.buffer.splice(0).map((item) => formatCommentForHTML(item))
        );
        state.pages.set(pageNumber, formatted);
        updateCommentPaginationTotals(state, formatted.length);
      }
      return;
    }

    state.lastResult = result;

    if (state.isScoreOnly) {
      const filteredItems = result.items.filter(
        (item) => !state.selfScCommentIds.has(item._id)
      );
      state.buffer.push(...filteredItems);

      while (state.buffer.length >= state.pageSize) {
        const pageNumber = state.pages.size + 1;
        const rawItems = state.buffer.splice(0, state.pageSize);
        const formatted = await Promise.all(
          rawItems.map((item) => formatCommentForHTML(item))
        );
        state.pages.set(pageNumber, formatted);
        updateCommentPaginationTotals(state, formatted.length);
      }

      if (!result.hasNext()) {
        state.noMoreData = true;
        if (state.buffer.length > 0) {
          const pageNumber = state.pages.size + 1;
          const rawItems = state.buffer.splice(0);
          const formatted = await Promise.all(
            rawItems.map((item) => formatCommentForHTML(item))
          );
          state.pages.set(pageNumber, formatted);
          updateCommentPaginationTotals(state, formatted.length);
        }
      }
    } else {
      const pageNumber = state.pages.size + 1;
      const formatted = await Promise.all(
        result.items.map((item) => formatCommentForHTML(item))
      );
      state.pages.set(pageNumber, formatted);
      updateCommentPaginationTotals(state, formatted.length);

      if (!result.hasNext()) {
        state.noMoreData = true;
      }
    }
  } catch (error) {
    state.noMoreData = true;
    console.error("[评论系统] 分页加载评论失败:", error);
    throw error;
  }
}

async function ensureCommentPage(state, requestedPage) {
  if (!state) {
    return 1;
  }

  const maxPage = Math.max(1, state.totalPages);
  const targetPage = Math.max(1, Math.min(requestedPage, maxPage));

  while (!state.pages.has(targetPage) && !state.noMoreData) {
    if (state.loadingPromise) {
      await state.loadingPromise;
    } else {
      state.loadingPromise = fetchMoreComments(state)
        .catch((error) => {
          console.error("[评论系统] 加载评论页面数据失败:", error);
        })
        .finally(() => {
          state.loadingPromise = null;
        });
      await state.loadingPromise;
    }
  }

  if (!state.pages.has(targetPage)) {
    state.pages.set(targetPage, []);
  }

  return targetPage;
}

// 【新增】防止并发请求的锁
let isSendingComments = false;
let pendingSendRequest = null;

// 发送评论数据
async function sendCommentsData(requestData) {
  // 【修复】如果正在发送评论数据，延迟当前请求
  if (isSendingComments) {
    console.log("[评论系统] 已有发送请求进行中，延迟当前请求...");
    
    // 清除之前的待处理请求
    if (pendingSendRequest) {
      clearTimeout(pendingSendRequest);
    }
    
    // 设置新的待处理请求（300ms后执行，使用最新的请求数据）
    pendingSendRequest = setTimeout(() => {
      pendingSendRequest = null;
      sendCommentsData(requestData);
    }, 300);
    return;
  }
  
  isSendingComments = true;
  
  try {
    const {
      workFilter = "",
      filterMode = "default",
      currentPage = 1,
    } = requestData || {};
    console.log(`[评论系统] 请求评论数据: workFilter=${workFilter}, filterMode=${filterMode}, page=${currentPage}`);

    // 【新增】保存当前的筛选状态，用于面板切换后恢复
    currentCommentSystemState = {
      workFilter: workFilter,
      filterMode: filterMode,
      currentPage: currentPage
    };

    const cacheKey = getCommentCacheKey(workFilter, filterMode);
    let state = commentDataCache.get(cacheKey);

    if (!state) {
      state = await initializeCommentPaginationState(workFilter, filterMode);
      commentDataCache.set(cacheKey, state);
    }

    const targetPage = await ensureCommentPage(
      state,
      parseInt(currentPage, 10) || 1
    );
    const comments = state.pages.get(targetPage) || [];

    // 【修复】返回当前实际使用的筛选状态，确保客户端同步
    $w("#commentSystemPanel").postMessage({
      type: "UPDATE_COMMENTS",
      data: {
        comments,
        workFilter: workFilter || "", // 返回实际使用的workFilter
        filterMode: filterMode || "default", // 返回实际使用的filterMode
        currentPage: targetPage,
        totalPages: Math.max(1, state.totalPages),
        totalCount: state.totalCount,
      },
    });

    console.log(
      `[评论系统] 已发送 ${comments.length} 条评论数据 (page ${targetPage}/${state.totalPages}, total=${state.totalCount})`
    );
  } catch (error) {
    console.error("[评论系统] 发送评论数据失败:", error);
    $w("#commentSystemPanel").postMessage({
      type: "UPDATE_COMMENTS_ERROR",
      data: {
        message: error.message || "加载评论数据失败，请稍后重试",
      },
    });
  } finally {
    // 【修复】无论成功或失败，都要解锁
    isSendingComments = false;
  }
}

// 格式化评论数据供HTML使用
// 【优化】优先使用批量缓存，减少数据库查询，避免504超时
async function formatCommentForHTML(comment) {
  try {
    let formattedComment = {
      commentId: comment._id,
      workNumber: comment.workNumber,
      score: comment.score,
      commentText: comment.comment,
      _owner: comment._owner,
      isReply: !!comment.replyTo,
      replyTo: comment.replyTo,
      showScore: false,
      isAuthorComment: false,
      canDelete: false,
      ratingInfo: "",
      workTitle: "",
      replyCount: 0,
      isSelfScComment: false,
      createdDate: comment._createdDate, // 添加创建时间
    };

    // 【优化】优先从批量缓存获取作品信息，避免逐个查询
    let workOwnerId = null;
    let isWorkDQ = false;
    let workTitle = "";

    if (batchDataCache && batchDataCache.workOwnerMap) {
      workOwnerId = batchDataCache.workOwnerMap[comment.workNumber];
      isWorkDQ = batchDataCache.workDQMap
        ? batchDataCache.workDQMap[comment.workNumber] === true
        : false;
      workTitle = workTitlesCache[comment.workNumber] || "";
    }

    // 如果缓存中没有作品标题，尝试从已加载的作品选项中获取
    if (!workTitle && workOwnerId) {
      // 避免查询数据库，只使用缓存数据
      workTitle = workTitlesCache[comment.workNumber] || "";
    }

    // 设置作品标题（优先使用缓存，避免504超时）
    formattedComment.workTitle = workTitle
      ? `#${comment.workNumber} - ${workTitle}`
      : `#${comment.workNumber}`;

    // 判断是否为作者自评
    if (workOwnerId) {
      formattedComment.isAuthorComment = comment._owner === workOwnerId;
      formattedComment.isSelfScComment = formattedComment.isAuthorComment;
    }

    // 判断是否淘汰
    if (isWorkDQ) {
      formattedComment.commentText =
        "*该作品已淘汰*" + formattedComment.commentText;
    }

    // 判断是否显示评分
    if (!comment.replyTo) {
      const userHasFormalRating = await checkUserHasFormalRating(
        comment.workNumber
      );
      formattedComment.showScore =
        userHasFormalRating && !formattedComment.isAuthorComment;

      // 获取评分信息
      if (userHasFormalRating && !formattedComment.isAuthorComment) {
        const ratingData = await getRatingData(comment.workNumber);
        if (ratingData.numRatings >= RATING_CONFIG.MIN_RATINGS_FOR_RANKING) {
          const rankingData = await calculateAllWorksRanking();
          const workRanking = rankingData.rankingMap[comment.workNumber];
          if (workRanking) {
            const tier = getTierFromPercentile(workRanking.percentile);
            formattedComment.ratingInfo = `${tier} (${ratingData.numRatings}人评分)`;
          }
        } else if (ratingData.numRatings > 0) {
          formattedComment.ratingInfo = `评分量不足(${ratingData.numRatings}人评分)`;
        }
      }

      // 获取回复数量
      if (!(comment._id in replyCountsCache)) {
        await batchLoadReplyCounts([comment._id]);
      }
      formattedComment.replyCount = replyCountsCache[comment._id] || 0;
    }

    // 判断删除权限
    if (currentUserId && !comment.replyTo) {
      if (formattedComment.isAuthorComment) {
        // Sc评论：只有作者自己能删除
        formattedComment.canDelete = currentUserId === comment._owner;
      } else {
        // 普通评论：海选组成员可以删除
        try {
          const isSeaSelectionMember = await checkIsSeaSelectionMember();
          formattedComment.canDelete = isSeaSelectionMember;
        } catch (error) {
          console.error("检查海选组成员身份失败:", error);
          formattedComment.canDelete = false;
        }
      }
    }

    return formattedComment;
  } catch (error) {
    console.error("格式化评论数据失败:", error);
    return {
      commentId: comment._id,
      workNumber: comment.workNumber,
      score: comment.score,
      commentText: comment.comment,
      showScore: false,
      isAuthorComment: false,
      canDelete: false,
      ratingInfo: "",
      workTitle: `#${comment.workNumber}`,
      replyCount: 0,
    };
  }
}

// 处理评论提交 - 添加详细的进度反馈
async function handleCommentSubmit(data) {
  try {
    const { workNumber, score, comment } = data;
    // console.log(`[评论系统] 提交评论: 作品#${workNumber}, 评分${score}`);

    // 步骤1: 验证用户登录和报名状态
    sendSubmitProgress("验证用户身份...", "validating");

    if (!currentUserId) {
      sendSubmitResult(false, "❌ 用户未登录");
      return;
    }

    if (!isUserVerified) {
      sendSubmitResult(false, "❌ 用户未报名");
      return;
    }

    // 步骤2: 验证输入
    sendSubmitProgress("验证输入数据...", "validating");

    if (!workNumber || !score || !comment) {
      sendSubmitResult(false, "❌ 请填写完整信息");
      return;
    }

    if (score < 100 || score > 1000) {
      sendSubmitResult(false, "❌ 评分必须在100-1000之间");
      return;
    }

    // 步骤3: 检查作品状态
    sendSubmitProgress("检查作品状态...", "validating");

    const workResults = await wixData
      .query("enterContest034")
      .eq("sequenceId", workNumber)
      .find();

    if (workResults.items.length === 0) {
      sendSubmitResult(false, "❌ 作品不存在");
      return;
    }

    const workItem = workResults.items[0];
    const isAuthor = currentUserId === workItem._owner;
    const isWorkDQ = workItem.isDq === true;

    if (isWorkDQ) {
      sendSubmitResult(false, "❌ 作品已淘汰，无法评论");
      return;
    }

    // 步骤4: 非作者检查是否已评论
    if (!isAuthor) {
      sendSubmitProgress("检查评论记录...", "validating");

      const existingComment = await wixData
        .query("BOFcomment")
        .eq("workNumber", workNumber)
        .eq("_owner", currentUserId)
        .isEmpty("replyTo")
        .find();

      if (existingComment.items.length > 0) {
        sendSubmitResult(false, "❌ 已评论过此作品");
        return;
      }
    }

    // 步骤5: 插入评论
    sendSubmitProgress("正在保存评论...", "saving");

    let toInsert = {
      workNumber: workNumber,
      score: score,
      comment: comment,
    };

    const insertedComment = await wixData.insert("BOFcomment", toInsert);

    // 步骤6: 更新积分
    sendSubmitProgress("更新积分...", "updating");

    try {
      await updateUserPoints(currentUserId, 1, false, false);
    } catch (error) {
      console.error("更新积分失败:", error);
    }

    // 步骤7: 检查并标记任务完成
    sendSubmitProgress("检查任务状态...", "updating");

    let taskStatusMessage = "";
    try {
      const result = await markTaskCompleted(currentUserId, workNumber);

      if (result.taskCompleted) {
        taskStatusMessage = `\n\n任务完成！进度: ${result.completedCount}/10`;

        // 更新任务数据缓存
        if (userTaskDataCache) {
          userTaskDataCache.hasCompletedTarget =
            result.hasCompletedTarget || false;
        }
      } else if (result.alreadyCompleted) {
        taskStatusMessage = "\n\n此任务已完成过";
      } else if (result.isColdWork) {
        taskStatusMessage = "\n\n冷门作品已评分（已完成任务目标）";
      } else if (!result.isInTaskList) {
        taskStatusMessage = "\n\n非任务作品（不计入进度）";
      }
    } catch (error) {
      console.error("标记任务完成失败:", error);
    }

    // 步骤8: 增量热更新
    sendSubmitProgress("更新页面数据...", "updating");
    await incrementalUpdateAfterComment(workNumber, score, comment, isAuthor);

    // 步骤9: 发送成功结果并立即刷新评论列表
    const successMessage = isAuthor
      ? `✅ 自评提交成功！\n\n自评不计入评分统计${taskStatusMessage}`
      : `✅ 评论提交成功！\n\n评分: ${score}${taskStatusMessage}`;

    sendSubmitResult(true, successMessage);

    // 【修复】刷新评论列表时，保持当前筛选状态（而非重置为默认）
    // 清空缓存以确保获取最新数据
    resetCommentDataCache();
    
    // 延迟刷新，确保数据库已完成写入
    setTimeout(() => {
      // 刷新到刚提交的作品评论页面，便于用户查看新评论
      sendCommentsData({
        workFilter: workNumber.toString(),
        filterMode: "default",
        currentPage: 1,
      });
      
      console.log(`[评论系统] 评论提交成功，已刷新到作品 #${workNumber} 的评论列表`);
    }, 500);

    // console.log(`[评论系统] 评论提交成功`);
  } catch (error) {
    console.error("[评论系统] 评论提交失败:", error);
    sendSubmitResult(
      false,
      "❌ 提交失败，请重试\n\n" + (error.message || "未知错误")
    );
  }
}

// 发送提交结果
function sendSubmitResult(success, message) {
  $w("#commentSystemPanel").postMessage({
    type: "SUBMIT_RESULT",
    data: {
      success: success,
      message: message,
    },
  });
}

// 处理作品编号变化 - 显示详细的作品状态并发送完整的UI状态
async function handleWorkNumberChange(workNumber) {
  // console.log(`[评论系统] 作品编号变化: ${workNumber}`);

  try {
    // 获取作品信息
    const workResults = await wixData
      .query("enterContest034")
      .eq("sequenceId", workNumber)
      .find();

    if (workResults.items.length === 0) {
      sendWorkStatusUpdate("", "");
      sendWorkSelectionState({
        isWorkDQ: false,
        isAuthor: false,
        isAlreadyCommented: false,
        existingComment: null,
      });
      return;
    }

    const workItem = workResults.items[0];
    const isAuthor = currentUserId === workItem._owner;
    const isWorkDQ = workItem.isDq === true;

    // 优先级1: 淘汰作品
    if (isWorkDQ) {
      sendWorkStatusUpdate("该作品已淘汰，无法评论", "dq");
      sendWorkSelectionState({
        isWorkDQ: true,
        isAuthor: false,
        isAlreadyCommented: false,
        existingComment: null,
      });
      return;
    }

    // 优先级2: 作者自评
    if (isAuthor) {
      sendWorkStatusUpdate(
        "这是您的作品，可以进行自评（Sc评论）\n自评不计入评分统计，可多次提交",
        "author"
      );
      sendWorkSelectionState({
        isWorkDQ: false,
        isAuthor: true,
        isAlreadyCommented: false,
        existingComment: null,
      });
      return;
    }

    // 优先级3: 检查是否已评论
    const existingCommentResults = await wixData
      .query("BOFcomment")
      .eq("workNumber", workNumber)
      .eq("_owner", currentUserId)
      .isEmpty("replyTo")
      .find();

    if (existingCommentResults.items.length > 0) {
      const existingComment = existingCommentResults.items[0];
      sendWorkStatusUpdate("您已评论过此作品", "completed");
      sendWorkSelectionState({
        isWorkDQ: false,
        isAuthor: false,
        isAlreadyCommented: true,
        existingComment: {
          comment: existingComment.comment,
          score: existingComment.score,
        },
      });
      return;
    }

    // 优先级4: 未评论，检查任务状态
    // 【新增】只有在用户任务数据有效时才显示任务提示
    if (
      currentUserId &&
      isUserVerified &&
      userTaskDataCache &&
      !userTaskDataCache.error
    ) {
      try {
        const taskCheck = await checkIfWorkInTaskList(
          currentUserId,
          workNumber
        );
        const hasCompletedTarget =
          userTaskDataCache.hasCompletedTarget || false;

        if (taskCheck.inTaskList && !taskCheck.alreadyCompleted) {
          if (hasCompletedTarget) {
            // 已完成目标，显示为冷门作品
            sendWorkStatusUpdate(
              "这是一个冷门作品\n您已完成任务目标，评论此作品不计入任务进度",
              "coldWork"
            );
          } else {
            // 未完成目标，显示为任务作品
            sendWorkStatusUpdate(
              "这是您的任务作品！\n完成此评论将计入任务进度",
              "task"
            );
          }
        } else if (taskCheck.alreadyCompleted) {
          sendWorkStatusUpdate("此任务已完成", "completedTask");
        } else {
          sendWorkStatusUpdate("", "");
        }
      } catch (error) {
        console.error("检查任务状态失败:", error);
        sendWorkStatusUpdate("", "");
      }
    } else if (
      currentUserId &&
      isUserVerified &&
      userTaskDataCache &&
      userTaskDataCache.error
    ) {
      // 【新增】如果用户未提交作品，显示相应提示
      if (userTaskDataCache.notSubmitted) {
        sendWorkStatusUpdate("", ""); // 不显示任务提示（因为用户无法接收任务）
      }
    }

    // 正常未评论状态
    sendWorkSelectionState({
      isWorkDQ: false,
      isAuthor: false,
      isAlreadyCommented: false,
      existingComment: null,
    });
  } catch (error) {
    console.error("[评论系统] 获取作品状态失败:", error);
    sendWorkStatusUpdate("", "");
    sendWorkSelectionState({
      isWorkDQ: false,
      isAuthor: false,
      isAlreadyCommented: false,
      existingComment: null,
    });
  }
}

// 发送作品状态更新到HTML元件
function sendWorkStatusUpdate(message, statusType) {
  $w("#commentSystemPanel").postMessage({
    type: "WORK_STATUS_UPDATE",
    data: {
      message: message,
      statusType: statusType,
    },
  });
}

// 发送提交进度到HTML元件
function sendSubmitProgress(message, stage) {
  $w("#commentSystemPanel").postMessage({
    type: "SUBMIT_PROGRESS",
    data: {
      message: message,
      stage: stage,
    },
  });
}

// 发送作品选择状态到HTML元件（控制输入框状态）
function sendWorkSelectionState(state) {
  try {
    $w("#commentSystemPanel").postMessage({
      type: "WORK_SELECTION_STATE",
      data: state,
    });
  } catch (error) {
    console.error("[评论系统] 发送作品选择状态失败:", error);
  }
}

// 处理查看回复请求 - 支持主评论和楼中楼回复
async function handleViewReplies(data) {
  try {
    const { commentId, workNumber, originalComment, isReply, replyTo } = data;

    // 如果是楼中楼回复，需要先查询父评论数据
    if (isReply && replyTo) {
      // console.log(`[评论系统] 楼中楼回复，查询父评论: ${replyTo}`);

      const parentCommentResult = await wixData
        .query("BOFcomment")
        .eq("_id", replyTo)
        .find();

      if (parentCommentResult.items.length > 0) {
        const parentComment = parentCommentResult.items[0];
        await showCommentReplies(
          parentComment._id,
          parentComment.workNumber,
          parentComment.comment
        );
      } else {
        console.error("[评论系统] 未找到父评论");
      }
    } else {
      // 主评论：直接显示回复
      await showCommentReplies(commentId, workNumber, originalComment);
    }
  } catch (error) {
    console.error("[评论系统] 查看回复失败:", error);
  }
}

// 处理跳转到作品 - 设置作品搜索框、刷新作品列表并滚动到anchor2位置
async function handleGotoWork(workNumber) {
  try {
    console.log(`[评论系统] 跳转到作品 #${workNumber}`);

    // 获取作品标题
    const workResults = await wixData
      .query("enterContest034")
      .eq("sequenceId", workNumber)
      .find();

    if (workResults.items.length > 0) {
      const workTitle = workResults.items[0].firstName;

      // 【新增】同时设置评论系统的筛选器到该作品
      if ($w("#commentSystemPanel")) {
        try {
          // 通知评论系统切换筛选器到该作品
          $w("#commentSystemPanel").postMessage({
            type: "SET_WORK_FILTER",
            data: { workNumber: workNumber.toString() }
          });
          console.log(`[评论系统] 已设置筛选器到作品 #${workNumber}`);
        } catch (filterError) {
          console.error("[评论系统] 设置筛选器失败:", filterError);
        }
      }

      // 更新作品搜索框（input1）的值为作品名称
      // 这会触发作品列表的搜索和刷新
      if ($w("#input1")) {
        $w("#input1").value = workTitle;

        // 刷新作品列表（repeater2）
        await refreshRepeaters();

        // 滚动到 anchor2 位置
        try {
          if ($w("#anchor2")) {
            await $w("#anchor2").scrollTo();
            console.log(`[评论系统] 已滚动到 #anchor2`);
          }
        } catch (scrollError) {
          console.error("[评论系统] 滚动到anchor2失败:", scrollError);
        }

        console.log(`[评论系统] 已跳转到作品: #${workNumber} - ${workTitle}`);
      }
    }
  } catch (error) {
    console.error("[评论系统] 跳转到作品失败:", error);
  }
}
