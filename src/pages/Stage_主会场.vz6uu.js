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
import { markTaskCompleted, checkIfWorkInTaskList, getUserTaskData, getWorkWeightedRatingData, getAllWorksWeightedRatingData } from "backend/ratingTaskManager.jsw";
import { sendReplyNotification } from "backend/emailNotifications.jsw";
import { QUERY_LIMITS } from "public/constants.js";

// 全局状态管理
let commentsCountByWorkNumber = {};
const itemsPerPage = QUERY_LIMITS.ITEMS_PER_PAGE;
const commentsPerPage = 20; // 评论列表每页显示数量
let titleValue;
const currentUserId = wixUsers.currentUser.id;
let isUserVerified = false;
let allCommentsData = []; // 存储所有评论数据用于分页

// 缓存数据以减少API调用（性能优化）
let userFormalRatingsCache = null; // 缓存用户正式评分状态
let replyCountsCache = {}; // 缓存回复数量
let workOwnersCache = {}; // 缓存作品所有者信息
let allWorksRankingCache = null; // 缓存所有作品的排名信息

// 【新增】批量数据缓存 - 一次性加载所有作品评分数据
let batchDataCache = null; // { workRatings, userQualityMap, workOwnerMap, workDQMap, commentCountMap }

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

// 【新增】批量加载所有数据（性能优化核心函数）
async function loadBatchData() {
  try {
    console.log("[性能优化] 开始批量加载所有作品数据...");
    const startTime = Date.now();
    
    batchDataCache = await getAllWorksWeightedRatingData();
    
    // 从批量数据中提取评论计数
    commentsCountByWorkNumber = batchDataCache.commentCountMap || {};
    
    // 从批量数据中提取作品所有者信息
    workOwnersCache = batchDataCache.workOwnerMap || {};
    
    const endTime = Date.now();
    console.log(`[性能优化] 批量数据加载完成，耗时: ${endTime - startTime}ms`);
    console.log(`[性能优化] 加载了 ${Object.keys(batchDataCache.workRatings || {}).length} 个作品的评分数据`);
    console.log(`[性能优化] 加载了 ${Object.keys(commentsCountByWorkNumber).length} 个作品的评论计数`);
    
    return batchDataCache;
  } catch (error) {
    console.error("[性能优化] 批量数据加载失败:", error);
    batchDataCache = {
      workRatings: {},
      userQualityMap: {},
      workOwnerMap: {},
      workDQMap: {},
      commentCountMap: {}
    };
    return batchDataCache;
  }
}

// 页面初始化
$w.onReady(async function () {
  // 初始化删除提示文字元件（隐藏）
  try {
    $w("#textDelete").hide();
  } catch (error) {
    console.log("textDelete 元件未找到，跳过初始化");
  }

  await checkUserVerification();
  updateCommentControlsVerificationStatus();

  // 【优化】首先批量加载所有数据（一次API调用替代数百次）
  await loadBatchData();

  // 检查并刷新任务（如果超过刷新时间间隔）
  if (currentUserId && isUserVerified) {
    try {
      await getUserTaskData(currentUserId);
      // console.log("[主会场] 任务同步检查完成");
    } catch (error) {
      console.error("[主会场] 任务同步检查失败:", error);
    }
  }

  // 初始化自定义HTML楼中楼回复面板
  initCommentRepliesPanel();

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

  // Repeater1: 评论显示【优化：减少异步查询，使用批量缓存】
  $w("#repeater1").onItemReady(async ($item, itemData, index) => {
    let commentText = itemData.comment;
    let isWorkDQ = false; // 标记作品是否被淘汰
    
    // 【优化】从批量缓存中获取作品淘汰状态，避免查询数据库
    if (batchDataCache && batchDataCache.workDQMap) {
      isWorkDQ = batchDataCache.workDQMap[itemData.workNumber] === true;
      if (isWorkDQ) {
        commentText = "*该作品已淘汰*" + commentText;
      }
    } else {
      // 降级方案：查询数据库
      try {
        const workResults = await wixData
          .query("enterContest034")
          .eq("sequenceId", itemData.workNumber)
          .find();

        if (workResults.items.length > 0 && workResults.items[0].isDq === true) {
          commentText = "*该作品已淘汰*" + commentText;
          isWorkDQ = true;
        }
      } catch (error) {
        console.error("检查作品淘汰状态失败", error);
      }
    }

    $item("#CommentBox").value = commentText;

    // 评论类型处理
    if (itemData.replyTo) {
      // 楼中楼回复
      $item("#showScore").text = "Re";
      $item("#showBackground").style.backgroundColor = "#1E3A8A";
      $item("#deleteComment").hide();
      //$item("#viewRepliesButton").hide();
      if ($item("#replyCountText")) {
        $item("#replyCountText").hide();
      }
    } else {
      // 主评论：检查作者身份【优化：使用批量缓存，无需查询】
      let isAuthorComment = false;
      let workOwnerId = null;
      
      // 【优化】直接从批量缓存获取作品所有者信息
      if (batchDataCache && batchDataCache.workOwnerMap) {
        workOwnerId = batchDataCache.workOwnerMap[itemData.workNumber];
        isAuthorComment = itemData._owner === workOwnerId;
      } else if (workOwnersCache[itemData.workNumber]) {
        // 次优：从旧缓存获取
        workOwnerId = workOwnersCache[itemData.workNumber];
        isAuthorComment = itemData._owner === workOwnerId;
      } else {
        // 降级方案：查询数据库
        try {
          const workResults = await wixData
            .query("enterContest034")
            .eq("sequenceId", itemData.workNumber)
            .find();

          if (workResults.items.length > 0) {
            workOwnerId = workResults.items[0]._owner;
            workOwnersCache[itemData.workNumber] = workOwnerId; // 缓存结果
            isAuthorComment = itemData._owner === workOwnerId;
          }
        } catch (error) {
          console.error("检查作者身份失败", error);
        }
      }

      if (isAuthorComment) {
        // 作者自评
        $item("#showScore").text = "Sc";
        $item("#showBackground").style.backgroundColor = "#8A2BE2";
      } else {
        // 普通评论：根据用户评分权限显示
        const userHasFormalRating = await checkUserHasFormalRating(
          itemData.workNumber
        );

        if (userHasFormalRating) {
          const score = parseInt(itemData.score);
          const redAmount = Math.floor((score / 1000) * 255);
          $item(
            "#showBackground"
          ).style.backgroundColor = `rgb(${redAmount}, 0, 0)`;
          $item("#showScore").text = score.toString();
        } else {
          $item("#showBackground").style.backgroundColor = "#A9A9A9";
          $item("#showScore").text = "?";
        }
      }

      if ($item("#replyCountText")) {
        $item("#replyCountText").show();
      }
      $item("#viewRepliesButton").show();
    }

    // 评分数据显示（仅主评论）- 使用等级系统，排除淘汰作品
    if (!itemData.replyTo) {
      // 淘汰作品不显示评分等级
      if (isWorkDQ) {
        $item("#totalscoreComment").text = "";
      } else {
        const userHasFormalRating = await checkUserHasFormalRating(
          itemData.workNumber
        );

        if (userHasFormalRating) {
          const ratingData = await getRatingData(itemData.workNumber);

          if (ratingData.numRatings >= 5) {
            // 获取排名信息并显示等级
            const rankingData = await calculateAllWorksRanking();
            const workRanking = rankingData.rankingMap[itemData.workNumber];
            
            if (workRanking) {
              const tier = getTierFromPercentile(workRanking.percentile);
              $item("#totalscoreComment").text = `${tier} (${ratingData.numRatings}人评分)`;
            } else {
              // 有评分但未进入排名（可能被淘汰或其他原因）
              $item("#totalscoreComment").text = "";
            }
          } else if (ratingData.numRatings > 0) {
            $item(
              "#totalscoreComment"
            ).text = `评分量不足(${ratingData.numRatings}人评分)`;
          } else {
            $item("#totalscoreComment").text = "暂无评分";
          }
        } else {
          $item("#totalscoreComment").text = "提交您的评分以查看评分";
        }
      }
    } else {
      $item("#totalscoreComment").text = "";
    }

    await displayAuthorInfo($item, itemData);

    if (!itemData.replyTo) {
      await displayReplyCount($item, itemData._id);
    }

    // 删除按钮权限设置（仅主评论）【优化：使用批量缓存】
    if (currentUserId && !itemData.replyTo) {
      try {
        // 判断是否为作者自评（Sc评论）
        let isAuthorComment = false;
        let workOwnerId = null;
        
        // 【优化】直接从批量缓存获取作品所有者信息
        if (batchDataCache && batchDataCache.workOwnerMap) {
          workOwnerId = batchDataCache.workOwnerMap[itemData.workNumber];
          isAuthorComment = itemData._owner === workOwnerId;
        } else if (workOwnersCache[itemData.workNumber]) {
          // 次优：从旧缓存获取
          workOwnerId = workOwnersCache[itemData.workNumber];
          isAuthorComment = itemData._owner === workOwnerId;
        } else {
          // 降级方案：查询数据库
          const workResults = await wixData
            .query("enterContest034")
            .eq("sequenceId", itemData.workNumber)
            .find();

          if (workResults.items.length > 0) {
            workOwnerId = workResults.items[0]._owner;
            workOwnersCache[itemData.workNumber] = workOwnerId;
            isAuthorComment = itemData._owner === workOwnerId;
          }
        }

        if (isAuthorComment) {
          // Sc评论：只有作者自己能删除
          if (currentUserId === itemData._owner) {
            $item("#deleteComment").show();
            $item("#deleteComment").enable();
            $item("#deleteComment").onClick(async () => {
              await handleDeleteComment(itemData, true); // 传递 isSelfScComment = true
            });
          } else {
            // 海选组成员也不能删除Sc评论
            $item("#deleteComment").hide();
            $item("#deleteComment").disable();
          }
        } else {
          // 普通评论：海选组成员可以删除
          const isSeaSelectionMember = await checkIsSeaSelectionMember();
          if (isSeaSelectionMember) {
            $item("#deleteComment").show();
            $item("#deleteComment").enable();
            $item("#deleteComment").onClick(async () => {
              await handleDeleteComment(itemData, false); // 传递 isSelfScComment = false
            });
          } else {
            $item("#deleteComment").hide();
            $item("#deleteComment").disable();
          }
        }
      } catch (error) {
        $item("#deleteComment").hide();
        $item("#deleteComment").disable();
      }
    } else if (!itemData.replyTo) {
      $item("#deleteComment").hide();
      $item("#deleteComment").disable();
    }

    // 事件监听器设置
    $item("#checkText2").onClick(() => {
      const descriptionText = $item("#CommentBox").value;
      showTextPopup(descriptionText);
    });

    $item("#goUp").onClick(async () => {
      const textValue = $item("#text15").text;
      $w("#input1").value = textValue;
      await refreshRepeaters();
    });

    if (!itemData.replyTo) {
      // 主评论：显示自己的回复
      $item("#viewRepliesButton").onClick(async () => {
        await showCommentReplies(
          itemData._id,
          itemData.workNumber,
          itemData.comment
        );
      });
    } else {
      // 楼中楼回复：跳转到所回复的主评论的lightbox
      $item("#viewRepliesButton").onClick(async () => {
        try {
          // 查询所回复的主评论数据
          const parentCommentResult = await wixData
            .query("BOFcomment")
            .eq("_id", itemData.replyTo)
            .find();
          
          if (parentCommentResult.items.length > 0) {
            const parentComment = parentCommentResult.items[0];
            await showCommentReplies(
              parentComment._id,
              parentComment.workNumber,
              parentComment.comment
            );
          } else {
            console.error("未找到父评论");
          }
        } catch (error) {
          console.error("跳转到父评论失败:", error);
        }
      });
    }
  });

  // 数据初始化
  await updateRepeaterData(1, "", "");
  
  // 【优化】预加载用户评分状态（使用批量数据）
  if (currentUserId && isUserVerified) {
    await batchLoadUserFormalRatings();
  }
  
  // 【优化】预加载作品排名数据（使用批量数据）
  await calculateAllWorksRanking();
  
  await loadAllFormalComments();
  
  // 预加载当前显示评论的回复数量
  try {
    const data = $w("#repeater1").data;
    if (data && Array.isArray(data)) {
      const commentIds = data.map(item => item._id).filter(id => id);
      if (commentIds.length > 0) {
        batchLoadReplyCounts(commentIds);
      }
    }
  } catch (error) {
    console.error("预加载回复数量失败:", error);
  }

  // 事件监听器设置
  setupSearchAndPaginationEvents();
  setupCommentsPaginationEvents();
  setupSubmitButtonEvent();
  setupDropdownFilterEvent();
  setupScoreCheckboxEvent();
  setupWorkSelectionEvent();
});

// 核心功能函数

// 评论状态检查 - 优先级：淘汰 > 未登录 > 未验证 > 评论状态（任务/冷门高亮提示）
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

    // 检查是否为任务作品或冷门作品
    const taskCheck = await checkIfWorkInTaskList(currentUserId, itemData.sequenceId);
    const userData = await getUserTaskData(currentUserId);
    const hasCompletedTarget = userData.hasCompletedTarget || false;
    
    const isTask = taskCheck.inTaskList && !taskCheck.alreadyCompleted && !hasCompletedTarget;
    const isColdWork = taskCheck.inTaskList && !taskCheck.alreadyCompleted && hasCompletedTarget;

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
// 作品选择事件处理
function setupWorkSelectionEvent() {
  $w("#inputNumber").onChange(async () => {
    const workNumber = parseInt($w("#inputNumber").value);

    if (workNumber) {
      try {
        const workResults = await wixData
          .query("enterContest034")
          .eq("sequenceId", workNumber)
          .find();

        let isAuthor = false;
        let isWorkDQ = false;
        if (workResults.items.length > 0) {
          const workOwner = workResults.items[0]._owner;
          isAuthor = currentUserId === workOwner;
          isWorkDQ = workResults.items[0].isDq === true;
        }

        // 检查是否为任务作品或冷门作品（在其他检查之前）
        let taskStatusText = "";
        if (currentUserId && isUserVerified) {
          try {
            const taskCheck = await checkIfWorkInTaskList(currentUserId, workNumber);
            const userData = await getUserTaskData(currentUserId);
            const hasCompletedTarget = userData.hasCompletedTarget || false;
            
            if (taskCheck.inTaskList && !taskCheck.alreadyCompleted) {
              if (hasCompletedTarget) {
                // 已完成目标，显示为冷门作品
                taskStatusText = "这是一个冷门作品";
                $w("#submitprocess").text = taskStatusText;
                $w("#submitprocess").style.color = "#FFA500"; // 橙色
                $w("#submitprocess").style.fontWeight = "bold";
                $w("#submitprocess").show();
              } else {
                // 未完成目标，显示为任务作品
                taskStatusText = "这是您的任务作品！";
                $w("#submitprocess").text = taskStatusText;
                $w("#submitprocess").style.color = "#0066FF"; // 蓝色
                $w("#submitprocess").style.fontWeight = "bold";
                $w("#submitprocess").show();
              }
            } else if (taskCheck.alreadyCompleted) {
              taskStatusText = "此任务已完成";
              $w("#submitprocess").text = taskStatusText;
              $w("#submitprocess").style.color = "#228B22"; // 绿色
              $w("#submitprocess").style.fontWeight = "normal";
              $w("#submitprocess").show();
            } else {
              $w("#submitprocess").hide();
            }
          } catch (error) {
            console.error("检查任务状态失败:", error);
          }
        }

        // 优先级检查：淘汰 > 未登录 > 未验证 > 评论状态
        if (isWorkDQ) {
          $w("#Comment").value = "";
          $w("#inputScore").value = "";
          $w("#submit").disable();
          $w("#submit").label = "作品已淘汰";
          $w("#Comment").disable();
          $w("#inputScore").disable();
          return;
        }

        if (!currentUserId) {
          $w("#Comment").value = "";
          $w("#inputScore").value = "";
          $w("#submit").disable();
          $w("#submit").label = "未登录";
          $w("#Comment").disable();
          $w("#inputScore").disable();
          return;
        }

        if (!isUserVerified) {
          $w("#Comment").value = "";
          $w("#inputScore").value = "";
          $w("#submit").disable();
          $w("#submit").label = "未报名";
          $w("#Comment").disable();
          $w("#inputScore").disable();
          return;
        }

        if (isAuthor) {
          // 作者自评 允许无限次
          $w("#Comment").value = "";
          $w("#inputScore").value = "";
          $w("#submit").enable();
          $w("#submit").label = "自评";
          $w("#Comment").enable();
          $w("#inputScore").enable();
        } else {
          // 非作者：检查已有评论
          const results = await wixData
            .query("BOFcomment")
            .eq("workNumber", workNumber)
            .eq("_owner", currentUserId)
            .isEmpty("replyTo")
            .find();

          if (results.items.length > 0) {
            $w("#Comment").value = results.items[0].comment;
            $w("#inputScore").value = results.items[0].score;
            $w("#submit").disable();
            $w("#submit").label = "已评论";
            $w("#Comment").disable();
            $w("#inputScore").disable();
          } else {
            $w("#Comment").value = "";
            $w("#inputScore").value = "";
            $w("#submit").enable();
            $w("#submit").label = "提交评论";
            $w("#Comment").enable();
            $w("#inputScore").enable();
          }
        }

        $w("#dropdownFilter").value = workNumber.toString();
        await setDropdownValue(workNumber);
      } catch (err) {
        console.error("查询评论失败", err);
      }
    } else {
      // 未选择作品的状态处理
      $w("#Comment").value = "";
      $w("#inputScore").value = "";
      $w("#submitprocess").hide(); // 隐藏任务提示

      if (!currentUserId) {
        $w("#submit").disable();
        $w("#submit").label = "未登录";
        $w("#Comment").disable();
        $w("#inputScore").disable();
      } else if (!isUserVerified) {
        $w("#submit").disable();
        $w("#submit").label = "未报名";
        $w("#Comment").disable();
        $w("#inputScore").disable();
      } else {
        $w("#submit").enable();
        $w("#submit").label = "提交评论";
        $w("#Comment").enable();
        $w("#inputScore").enable();
      }
    }
  });
}

// Lightbox弹窗管理
function showTextPopup(content) {
  wixWindow.openLightbox("TextPopup", { content: content });
}

async function handleDeleteComment(itemData, isSelfScComment = false) {
  try {
    const result = await wixWindow.openLightbox("DeleteConfirmation", {
      commentId: itemData._id,
      workNumber: itemData.workNumber,
      score: itemData.score,
      comment: itemData.comment,
      isSelfScComment: isSelfScComment, // 传递标记给 lightbox
    });

    let shouldDelete = false;
    let deleteReason = "";

    if (typeof result === "string" && result === "confirm") {
      shouldDelete = true;
      deleteReason = isSelfScComment ? "自主评论删除" : "未填写删除理由";
    } else if (
      result &&
      typeof result === "object" &&
      result.action === "confirm"
    ) {
      shouldDelete = true;
      deleteReason = result.reason || (isSelfScComment ? "自主评论删除" : "未填写删除理由");
    }

    if (shouldDelete) {
      try {
        // 显示删除开始提示
        const commentPreview = itemData.comment.length > 30 
          ? itemData.comment.substring(0, 30) + "..." 
          : itemData.comment;
        
        $w("#textDelete").text = `🔄 正在删除评论...\n作品: #${itemData.workNumber}\n评分: ${itemData.score}\n评论: ${commentPreview}`;
        $w("#textDelete").style.color = "#0066FF";
        $w("#textDelete").show();
        
        // 执行删除操作
        const deleteResult = await deleteComment(
          itemData._id,
          currentUserId,
          deleteReason,
          isSelfScComment // 传递标记给后端，决定是否保存到 deleteInfor
        );
        
        if (deleteResult.success) {
          // 显示删除成功信息
          let successMessage = `✅ 评论删除成功！\n作品: #${itemData.workNumber}\n`;
          
          if (isSelfScComment) {
            successMessage += "类型: 自主评论删除\n不记录删除信息，不影响任务状态";
          } else {
            successMessage += `删除理由: ${deleteReason}\n已记录删除信息`;
            
            // 检查是否为作者自评
            let isAuthorComment = false;
            if (batchDataCache && batchDataCache.workOwnerMap) {
              const workOwner = batchDataCache.workOwnerMap[itemData.workNumber];
              isAuthorComment = itemData._owner === workOwner;
            }
            
            if (isAuthorComment) {
              successMessage += "\n类型: 作者自评，不影响任务状态";
            } else {
              successMessage += "\n类型: 正式评论，已同步任务状态";
            }
          }
          
          $w("#textDelete").text = successMessage;
          $w("#textDelete").style.color = "#228B22";
          
          // 刷新页面数据
          await refreshRepeaters();
          
          // 3秒后隐藏提示
          setTimeout(() => {
            $w("#textDelete").hide();
          }, 3000);
          
        } else {
          // 显示删除失败信息
          $w("#textDelete").text = `❌ 删除评论失败\n作品: #${itemData.workNumber}\n错误: ${deleteResult.message}`;
          $w("#textDelete").style.color = "#FF0000";
          
          console.error("删除评论失败:", deleteResult.message);
          
          // 5秒后隐藏提示
          setTimeout(() => {
            $w("#textDelete").hide();
          }, 5000);
        }
        
      } catch (error) {
        // 显示异常错误信息
        $w("#textDelete").text = `❌ 删除评论时发生异常\n作品: #${itemData.workNumber}\n错误: ${error.message || "未知错误"}`;
        $w("#textDelete").style.color = "#FF0000";
        $w("#textDelete").show();
        
        console.error("删除评论时发生错误:", error);
        
        // 5秒后隐藏提示
        setTimeout(() => {
          $w("#textDelete").hide();
        }, 5000);
      }
    } else {
      // 用户取消删除
      $w("#textDelete").text = "ℹ️ 已取消删除操作";
      $w("#textDelete").style.color = "#A9A9A9";
      $w("#textDelete").show();
      
      // 2秒后隐藏提示
      setTimeout(() => {
        $w("#textDelete").hide();
      }, 2000);
    }
  } catch (error) {
    console.error("处理删除评论时发生错误:", error);
    
    // 显示异常信息
    $w("#textDelete").text = `❌ 处理删除请求时发生异常\n错误: ${error.message || "未知错误"}`;
    $w("#textDelete").style.color = "#FF0000";
    $w("#textDelete").show();
    
    // 5秒后隐藏提示
    setTimeout(() => {
      $w("#textDelete").hide();
    }, 5000);
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
      
      if (action === 'getReplies') {
        // 获取回复数据
        await handleGetReplies(event.data.commentId);
      } else if (action === 'submitReply') {
        // 提交回复
        await handleSubmitReply(event.data);
      } else if (action === 'closeReplies') {
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
      action: 'init',
      commentData: {
        commentId: commentId,
        workNumber: workNumber,
        originalComment: originalComment,
        replies: replies.items
      },
      currentUserId: currentUserId
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
      action: 'repliesData',
      replies: replies.items
    });
  } catch (error) {
    console.error("获取回复数据失败:", error);
    $w("#commentRepliesPanel").postMessage({
      action: 'repliesData',
      replies: []
    });
  }
}

// 处理提交回复请求
async function handleSubmitReply(data) {
  try {
    const { commentId, workNumber, replyContent } = data;
    
    if (!currentUserId) {
      $w("#commentRepliesPanel").postMessage({
        action: 'submitReplyResult',
        success: false,
        error: '用户未登录'
      });
      return;
    }
    
    // 创建回复数据
    const replyData = {
      workNumber: workNumber,
      comment: replyContent,
      score: 0, // 回复不计分
      replyTo: commentId,
      submissionTime: new Date().toISOString()
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
      action: 'submitReplyResult',
      success: true
    });
    
  } catch (error) {
    console.error("提交回复失败:", error);
    $w("#commentRepliesPanel").postMessage({
      action: 'submitReplyResult',
      success: false,
      error: error.message || '提交失败'
    });
  }
}

// 辅助工具函数

// 【优化】获取所有作品的评分并计算排名百分位（排除淘汰作品）
// 使用批量缓存数据，避免逐个查询作品评分
async function calculateAllWorksRanking() {
  if (allWorksRankingCache) {
    return allWorksRankingCache;
  }

  try {
    console.log("[性能优化] 开始计算所有作品排名...");
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
        numRatings: ratingData.numRatings
      });
    }

    // 只考虑有足够评分的作品（>=5人评分）
    const validWorks = worksWithScores.filter(w => w.numRatings >= 5);
    
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
        rank: index + 1
      };
    });

    allWorksRankingCache = {
      rankingMap: rankingMap,
      totalValidWorks: validWorks.length
    };

    const endTime = Date.now();
    console.log(`[性能优化] 作品排名计算完成，共${validWorks.length}个有效作品，耗时: ${endTime - startTime}ms`);
    return allWorksRankingCache;
  } catch (error) {
    console.error("计算作品排名失败:", error);
    return { rankingMap: {}, totalValidWorks: 0 };
  }
}

// 根据百分位获取等级
function getTierFromPercentile(percentile) {
  if (percentile <= 0.05) return "T0";
  if (percentile <= 0.20) return "T1";
  if (percentile <= 0.40) return "T2";
  if (percentile <= 0.60) return "T3";
  return "T4";
}

// 【优化】批量获取用户正式评分状态
// 使用批量缓存中的作品所有者信息，减少查询
async function batchLoadUserFormalRatings() {
  if (!currentUserId || !isUserVerified || userFormalRatingsCache) {
    return userFormalRatingsCache || {};
  }

  try {
    console.log("[性能优化] 批量加载用户评分状态...");
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
    console.log(`[性能优化] 用户评分状态加载完成，共${Object.keys(formalRatings).length}个作品有正式评分，耗时: ${endTime - startTime}ms`);
    return formalRatings;
  } catch (error) {
    console.error("批量加载用户正式评分状态失败:", error);
    return {};
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
  allWorksRankingCache = null;
  batchDataCache = null; // 清理批量数据缓存
  console.log("[性能优化] 缓存数据已清理");
}

// 【新增】增量热更新 - 评论提交后快速更新状态（无需完全刷新）
async function incrementalUpdateAfterComment(workNumber, score, comment, isAuthorComment = false) {
  try {
    console.log(`[热更新] 开始增量更新作品 #${workNumber} 的状态...`);
    const startTime = Date.now();
    
    // 1. 更新评论计数缓存
    if (batchDataCache && batchDataCache.commentCountMap) {
      const currentCount = batchDataCache.commentCountMap[workNumber] || 0;
      batchDataCache.commentCountMap[workNumber] = currentCount + 1;
      commentsCountByWorkNumber[workNumber] = currentCount + 1;
      console.log(`[热更新] 评论计数更新: ${currentCount} -> ${currentCount + 1}`);
    }
    
    // 2. 如果不是作者自评，更新用户正式评分缓存和作品评分数据
    if (!isAuthorComment) {
      // 更新用户正式评分状态
      if (userFormalRatingsCache) {
        userFormalRatingsCache[workNumber] = true;
        console.log(`[热更新] 用户评分状态已更新`);
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
              isDQ: oldRating.isDQ
            };
            updatedRatingData = newRating;
            console.log(`[热更新] 评分数据已更新: 作品 #${workNumber} 现有 ${newRating.numRatings}人评分`);
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
            console.log(`[热更新] 作品 #${workNumber} 的评论状态已更新`);
          });
          
          // 【修复】等待评分数据更新后再更新显示，确保使用最新数据
          if (!isAuthorComment) {
            updateItemEvaluationDisplay($item, itemData).then(() => {
              console.log(`[热更新] 作品 #${workNumber} 的评分显示已更新`);
            });
          }
        }
      });
      
      if (needUpdateRepeater2) {
        console.log(`[热更新] Repeater2中作品 #${workNumber} 已热更新`);
      }
    } catch (error) {
      console.error("[热更新] 更新Repeater2失败:", error);
    }
    
    // 4. 如果当前正在查看该作品的评论列表，刷新评论列表
    const dropdownFilterValue = $w("#dropdownFilter").value;
    if (dropdownFilterValue && parseInt(dropdownFilterValue) === workNumber) {
      console.log(`[热更新] 刷新作品 #${workNumber} 的评论列表`);
      await setDropdownValue(workNumber, 1); // 跳转到第一页显示新评论
    }
    
    const endTime = Date.now();
    console.log(`[热更新] 增量更新完成，耗时: ${endTime - startTime}ms`);
    
    return { success: true };
  } catch (error) {
    console.error("[热更新] 增量更新失败:", error);
    return { success: false, error };
  }
}

// 【优化】统一刷新两个repeater（完全刷新，用于删除评论等需要完全同步的场景）
async function refreshRepeaters() {
  try {
    console.log("[性能优化] 开始完全刷新Repeaters...");
    const startTime = Date.now();
    
    // 清理缓存以确保数据同步
    clearCaches();
    
    // 重新批量加载所有数据
    await loadBatchData();
    
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

    const dropdownFilterValue = $w("#dropdownFilter").value;
    if (dropdownFilterValue && dropdownFilterValue !== "") {
      await setDropdownValue(parseInt(dropdownFilterValue));
    } else {
      await loadAllFormalComments();
    }

    const endTime = Date.now();
    console.log(`[性能优化] 完全刷新完成，耗时: ${endTime - startTime}ms`);
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
  const uncachedIds = commentIds.filter(id => !(id in replyCountsCache));
  
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
    allReplies.items.forEach(reply => {
      const parentId = reply.replyTo;
      counts[parentId] = (counts[parentId] || 0) + 1;
    });

    // 更新缓存
    uncachedIds.forEach(id => {
      replyCountsCache[id] = counts[id] || 0;
    });

   // console.log(`回复数量加载完成，共${Object.keys(counts).length}个评论有回复`);
  } catch (err) {
    console.error("批量加载回复数量失败", err);
    // 为未能加载的ID设置默认值
    uncachedIds.forEach(id => {
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
    await setDropdownValue(itemData.sequenceId);
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

// 标记谱面查看状态
async function markSheetAsViewed(sheetId, userId) {
  try {
    const currentItemResult = await wixData
      .query("enterContest034")
      .eq("_id", sheetId)
      .find();
    let currentItem = currentItemResult.items[0];
    let viewedBy = currentItem.viewedBy ? JSON.parse(currentItem.viewedBy) : [];
    let viewedCount = viewedBy.length;

    if (!viewedBy.includes(userId)) {
      viewedBy.push(userId);
      currentItem.viewedBy = JSON.stringify(viewedBy);
      await wixData.update("enterContest034", currentItem);
      viewedCount = viewedBy.length;
    }

    return viewedCount;
  } catch (error) {
    console.error("Error marking sheet as viewed:", error);
    return null;
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
    if (batchDataCache && batchDataCache.workRatings && batchDataCache.workRatings[workNumber]) {
      const cachedData = batchDataCache.workRatings[workNumber];
      return {
        numRatings: cachedData.numRatings,
        averageScore: cachedData.weightedAverage,
        originalAverage: cachedData.originalAverage,
        highWeightCount: cachedData.highWeightCount,
        lowWeightCount: cachedData.lowWeightCount,
        ratio: cachedData.ratio
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
      ratio: weightedData.ratio
    };
  } catch (error) {
    console.error("获取评分数据失败:", error);
    return {
      numRatings: 0,
      averageScore: 0,
      originalAverage: 0,
      highWeightCount: 0,
      lowWeightCount: 0,
      ratio: 0
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

// 【优化】设置作品筛选并显示对应评论（支持分页）
async function setDropdownValue(sequenceId, pageNumber = 1) {
  $w("#dropdownFilter").value = sequenceId.toString();

  try {
    const results = await wixData
      .query("BOFcomment")
      .eq("workNumber", sequenceId)
      .ascending("_createdDate")
      .limit(1000)
      .find();

    let commentsToShow = results.items;
    const filterMode = getCommentFilterMode();

    if (filterMode === "ScoreOnly") {
      // 仅评分：排除楼中楼和作者自评
      // 【优化】从批量缓存获取作品所有者，避免查询数据库
      let workOwnerId = null;
      if (batchDataCache && batchDataCache.workOwnerMap) {
        workOwnerId = batchDataCache.workOwnerMap[sequenceId];
      } else {
        // 降级方案：查询数据库
        const workResults = await wixData
          .query("enterContest034")
          .eq("sequenceId", sequenceId)
          .find();

        if (workResults.items.length > 0) {
          workOwnerId = workResults.items[0]._owner;
        }
      }

      commentsToShow = results.items.filter((comment) => {
        if (comment.replyTo) {
          return false;
        }

        if (comment._owner === workOwnerId) {
          return false;
        }

        return true;
      });
    } else if (filterMode === "YourComment") {
      // 仅你的评论
      if (!currentUserId) {
        commentsToShow = [];
      } else {
        commentsToShow = results.items.filter((comment) => {
          return comment._owner === currentUserId;
        });
      }
    }
    // filterMode === "default": 显示所有评论

    // 保存所有评论数据
    allCommentsData = commentsToShow;

    // 分页处理（pagination1 和 pagination2 完全同步）
    const totalPages = Math.ceil(allCommentsData.length / commentsPerPage);
    $w("#pagination1").totalPages = totalPages > 0 ? totalPages : 1;
    $w("#pagination1").currentPage = pageNumber;
    $w("#pagination2").totalPages = totalPages > 0 ? totalPages : 1;
    $w("#pagination2").currentPage = pageNumber;

    // 获取当前页的数据
    const startIndex = (pageNumber - 1) * commentsPerPage;
    const pagedComments = allCommentsData.slice(startIndex, startIndex + commentsPerPage);

    $w("#repeater1").data = pagedComments;
    $w("#repeater1").forEachItem(($item, itemData, index) => {
      // 更新重复项元素
    });
  } catch (err) {
    console.error("查询失败", err);
  }
}

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
      if (evaluationCount >= 5) {
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
        $item(
          "#totalscore"
        ).text = `评分量不足(${evaluationCount}人评分)`;
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
        const taskCheck = await checkIfWorkInTaskList(currentUserId, item.sequenceId);
        const isTask = taskCheck.inTaskList && !taskCheck.alreadyCompleted;
        const isTaskCompleted = taskCheck.alreadyCompleted;
        const isDQ = item.isDq === true;

        return {
          ...item,
          isTask: isTask, // 未完成的任务
          isTaskCompleted: isTaskCompleted, // 已完成的任务
          isDQ: isDQ // 淘汰作品
        };
      })
    );

    // 四级分类：未完成的任务 > 已完成的任务 > 其他作品 > 淘汰作品
    const uncompletedTaskItems = itemsWithTaskStatus.filter(item => item.isTask && !item.isDQ);
    const completedTaskItems = itemsWithTaskStatus.filter(item => item.isTaskCompleted && !item.isDQ && !item.isTask);
    const otherItems = itemsWithTaskStatus.filter(item => !item.isTask && !item.isTaskCompleted && !item.isDQ);
    const disqualifiedItems = itemsWithTaskStatus.filter(item => item.isDQ);

    // 各分类内部按sequenceId排序
    uncompletedTaskItems.sort((a, b) => a.sequenceId - b.sequenceId);
    completedTaskItems.sort((a, b) => a.sequenceId - b.sequenceId);
    otherItems.sort((a, b) => a.sequenceId - b.sequenceId);
    disqualifiedItems.sort((a, b) => a.sequenceId - b.sequenceId);

    // 排序优先级：未完成任务 > 已完成任务 > 其他作品 > 淘汰作品
    return [...uncompletedTaskItems, ...completedTaskItems, ...otherItems, ...disqualifiedItems];
  } catch (error) {
    console.error("按任务排序时出错:", error);
    return items;
  }
}

// 基于评分排序作品（排除作者自评，考虑用户评分权限，淘汰作品后置）
async function sortByRating(items) {
  try {
    const itemsWithRating = await Promise.all(
      items.map(async (item) => {
        const ratingData = await getRatingData(item.sequenceId);
        const userHasFormalRating = await checkUserHasFormalRating(item.sequenceId);
        
        // 只有用户对该作品有正式评分时，才能看到并参与排序
        const canSeeRating = userHasFormalRating && ratingData.numRatings >= 5;
        const averageScore = canSeeRating ? ratingData.averageScore : 0;

        return {
          ...item,
          rating: averageScore,
          numRatings: ratingData.numRatings,
          canSeeRating: canSeeRating, // 标记用户是否能看到评分
          isDQ: item.isDq === true, // 标记是否淘汰
        };
      })
    );

    // 三级分类：能看到评分的非淘汰作品、不能看到评分的非淘汰作品、淘汰作品
    const visibleRatingItems = itemsWithRating.filter(item => item.canSeeRating && !item.isDQ);
    const hiddenRatingItems = itemsWithRating.filter(item => !item.canSeeRating && !item.isDQ);
    const disqualifiedItems = itemsWithRating.filter(item => item.isDQ);

    // 能看到评分的作品按评分排序
    visibleRatingItems.sort((a, b) => {
      if (a.rating === b.rating) {
        return b.numRatings - a.numRatings;
      }
      return b.rating - a.rating;
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

// 事件监听器设置
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

// 评论列表分页事件设置
function setupCommentsPaginationEvents() {
  // pagination1 和 pagination2 完全平行处理评论分页
  $w("#pagination1, #pagination2").onClick(async (event) => {
    const pageNumber = event.target.currentPage;
    const dropdownFilterValue = $w("#dropdownFilter").value;
    
    if (dropdownFilterValue && dropdownFilterValue !== "") {
      await setDropdownValue(parseInt(dropdownFilterValue), pageNumber);
    } else {
      await loadAllFormalComments(pageNumber);
    }
  });
}

// 评论提交事件处理
function setupSubmitButtonEvent() {
  $w("#submit").onClick(async () => {
    try {
      // 显示进度提示
      $w("#submitprocess").text = "准备提交...";
      $w("#submitprocess").show();
      
      if (!currentUserId) {
        // console.log("用户未登录");
        $w("#submitprocess").text = "❌ 用户未登录";
        setTimeout(() => $w("#submitprocess").hide(), 2000);
        return;
      }

      if (!isUserVerified) {
        // console.log("用户未报名，无法提交评论");
        $w("#submitprocess").text = "❌ 用户未报名";
        setTimeout(() => $w("#submitprocess").hide(), 2000);
        return;
      }

      const workNumber = parseInt($w("#inputNumber").value);
      const score = parseInt($w("#inputScore").value);
      const comment = $w("#Comment").value;

      const isWorkNumberValid = $w("#inputNumber").valid;
      const isScoreValid = $w("#inputScore").valid;
      const isWorkNumberInRange = workNumber >= 1 && workNumber <= 500;
      const isScoreInRange = score >= 100 && score <= 1000;
      
      // 验证输入
      $w("#submitprocess").text = "验证输入数据...";

      // 检查作品状态和用户权限
      if (currentUserId) {
        $w("#submitprocess").text = "检查作品状态...";
        
        const workResults = await wixData
          .query("enterContest034")
          .eq("sequenceId", workNumber)
          .find();

        let isAuthor = false;
        let isWorkDQ = false;
        if (workResults.items.length > 0) {
          const workOwner = workResults.items[0]._owner;
          isAuthor = currentUserId === workOwner;
          isWorkDQ = workResults.items[0].isDq === true;
        }

        if (isWorkDQ) {
          // console.log("作品已淘汰，阻止提交评论");
          $w("#submitprocess").text = "❌ 作品已淘汰";
          setTimeout(() => $w("#submitprocess").hide(), 2000);
          return;
        }

        if (!isAuthor) {
          $w("#submitprocess").text = "检查评论记录...";
          
          const existingComment = await wixData
            .query("BOFcomment")
            .eq("workNumber", workNumber)
            .eq("_owner", currentUserId)
            .isEmpty("replyTo")
            .find();

          if (existingComment.items.length > 0) {
            // console.log("用户已经评论过这个作品，阻止重复提交");
            $w("#submitprocess").text = "❌ 已评论过此作品";
            setTimeout(() => $w("#submitprocess").hide(), 2000);
            return;
          }
        }
      }

      if (
        workNumber &&
        score &&
        comment &&
        isWorkNumberValid &&
        isScoreValid &&
        isWorkNumberInRange &&
        isScoreInRange
      ) {
        let taskStatusMessage = ""; // 在外层定义，确保作用域正确
        
        // 1. 插入评论数据
        $w("#submitprocess").text = "正在保存评论...";
        
        let toInsert = {
          workNumber: workNumber,
          score: score,
          comment: comment,
        };

        const insertedComment = await wixData.insert("BOFcomment", toInsert);
        $w("#submitprocess").text = "✓ 评论已保存";
        
        // 判断是否为作者自评
        let isAuthorComment = false;
        if (batchDataCache && batchDataCache.workOwnerMap) {
          const workOwner = batchDataCache.workOwnerMap[workNumber];
          isAuthorComment = currentUserId === workOwner;
        }

        if (currentUserId) {
          // 2. 更新用户积分
          try {
            $w("#submitprocess").text = "更新积分...";
            await updateUserPoints(currentUserId, 1, false, false);
            $w("#submitprocess").text = "✓ 积分已更新";
          } catch (error) {
            console.error("Error updating user points:", error);
            $w("#submitprocess").text = "⚠ 积分更新失败";
          }
          
          // 3. 检查并标记任务完成（严格验证）
          try {
            $w("#submitprocess").text = "检查任务状态...";
            const result = await markTaskCompleted(currentUserId, workNumber);
            
            if (result.taskCompleted) {
              // 这是任务列表中的作品，且首次完成
              // console.log(`✓ 任务已完成: 作品 #${workNumber} (进度: ${result.completedCount}/10)`);
              taskStatusMessage = ` | ✓ 任务完成！进度: ${result.completedCount}/10`;
            } else if (result.alreadyCompleted) {
              // 这是任务列表中的作品，但之前已完成过
              // console.log(`作品 #${workNumber} 在任务列表中但已完成过`);
              taskStatusMessage = " | 此任务已完成过";
            } else if (result.isColdWork) {
              // 用户已完成目标，这是冷门作品（不计入进度）
              // console.log(`作品 #${workNumber} 是冷门作品（用户已完成目标）`);
              taskStatusMessage = " | ✓ 冷门作品已评分（已完成任务目标）";
            } else if (!result.isInTaskList) {
              // 不在任务列表中，不计入进度
              // console.log(`作品 #${workNumber} 不在任务列表中，不计入任务完成`);
              taskStatusMessage = " | 非任务作品（不计入进度）";
            }
          } catch (error) {
            console.error("Error marking task completed:", error);
            taskStatusMessage = " | 任务状态更新失败";
          }
        }

        // 4. 【优化】使用增量热更新，避免完全刷新页面
        $w("#submitprocess").text = "更新页面状态...";
        
        // 清空输入并重置状态
        $w("#inputNumber").value = "";
        $w("#inputScore").value = "";
        $w("#Comment").value = "";
        $w("#submit").enable();
        $w("#submit").label = "提交评论";
        $w("#Comment").enable();
        $w("#inputScore").enable();

        // 增量热更新（快速，无需重新加载所有数据）
        await incrementalUpdateAfterComment(workNumber, score, comment, isAuthorComment);
        
        // 5. 完成 - 合并显示提交成功和任务状态
        $w("#submitprocess").text = `✅ 提交成功！${taskStatusMessage}`;
        setTimeout(() => $w("#submitprocess").hide(), 3000);
        
      } else {
        // 输入验证失败
        $w("#submitprocess").text = "❌ 请检查输入是否完整且有效";
        setTimeout(() => $w("#submitprocess").hide(), 2000);
      }
    } catch (err) {
      console.error(err);
      $w("#submitprocess").text = "❌ 提交失败，请重试";
      setTimeout(() => $w("#submitprocess").hide(), 3000);
    }
  });
}

// 获取评论筛选模式
function getCommentFilterMode() {
  try {
    const value = $w("#radioGroupComment").value;
    return value || "default"; // 默认返回"default"
  } catch (error) {
    console.error("获取筛选模式失败:", error);
    return "default";
  }
}

// 评分筛选单选按钮组事件
function setupScoreCheckboxEvent() {
  $w("#radioGroupComment").onChange(async (event) => {
    try {
      const selectedValue = event.target.value;
      // console.log(`评论筛选模式已切换为: ${selectedValue}`);

      const dropdownFilterValue = $w("#dropdownFilter").value;

      if (dropdownFilterValue && dropdownFilterValue !== "") {
        await setDropdownValue(parseInt(dropdownFilterValue));
      } else {
        await loadAllFormalComments();
      }
    } catch (error) {
      console.error("处理筛选模式变化时出错:", error);
    }
  });
}

// 【优化】加载所有作品的评论（支持正式评论筛选和分页）
async function loadAllFormalComments(pageNumber = 1) {
  try {
    const filterMode = getCommentFilterMode();
    let commentsToShow = [];

    if (filterMode === "YourComment") {
      // 仅你的评论：查询当前用户的所有评论
      if (!currentUserId) {
        commentsToShow = [];
      } else {
        const results = await wixData
          .query("BOFcomment")
          .eq("_owner", currentUserId)
          .descending("_createdDate")
          .limit(1000)
          .find();
        commentsToShow = results.items;
      }
    } else {
      // default 或 ScoreOnly：查询所有主评论
      const results = await wixData
        .query("BOFcomment")
        .isEmpty("replyTo")
        .descending("_createdDate")
        .limit(1000)
        .find();

      commentsToShow = results.items;

      if (filterMode === "ScoreOnly") {
        // 仅评分：排除作者自评
        // 【优化】从批量缓存获取作品所有者映射，避免查询数据库
        let workOwnerMap = {};
        if (batchDataCache && batchDataCache.workOwnerMap) {
          workOwnerMap = batchDataCache.workOwnerMap;
        } else {
          // 降级方案：查询数据库
          const allWorks = await wixData.query("enterContest034").limit(1000).find();
          allWorks.items.forEach((work) => {
            workOwnerMap[work.sequenceId] = work._owner;
          });
        }

        commentsToShow = results.items.filter((comment) => {
          const workOwnerId = workOwnerMap[comment.workNumber];
          return comment._owner !== workOwnerId;
        });
      }
    }

    // 保存所有评论数据
    allCommentsData = commentsToShow;

    // 分页处理（pagination1 和 pagination2 完全同步）
    const totalPages = Math.ceil(allCommentsData.length / commentsPerPage);
    $w("#pagination1").totalPages = totalPages > 0 ? totalPages : 1;
    $w("#pagination1").currentPage = pageNumber;
    $w("#pagination2").totalPages = totalPages > 0 ? totalPages : 1;
    $w("#pagination2").currentPage = pageNumber;

    // 获取当前页的数据
    const startIndex = (pageNumber - 1) * commentsPerPage;
    const pagedComments = allCommentsData.slice(startIndex, startIndex + commentsPerPage);

    $w("#repeater1").data = pagedComments;
    $w("#repeater1").forEachItem(($item, itemData, index) => {
      // 更新重复项元素
    });
  } catch (err) {
    console.error("加载所有评论失败", err);
  }
}


// 下拉筛选器事件处理
function setupDropdownFilterEvent() {
  $w("#dropdownFilter").onChange(async () => {
    let selectedValue = $w("#dropdownFilter").value;

    if (selectedValue && selectedValue !== "") {
      await setDropdownValue(parseInt(selectedValue));
    } else {
      await loadAllFormalComments();
    }
  });
}
