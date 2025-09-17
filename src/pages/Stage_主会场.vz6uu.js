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
import { QUERY_LIMITS } from "public/constants.js";

// 全局状态管理
let commentsCountByWorkNumber = {};
const itemsPerPage = QUERY_LIMITS.ITEMS_PER_PAGE;
let titleValue;
const currentUserId = wixUsers.currentUser.id;
let isUserVerified = false;

// 缓存数据以减少API调用
let userFormalRatingsCache = null; // 缓存用户正式评分状态
let replyCountsCache = {}; // 缓存回复数量
let workOwnersCache = {}; // 缓存作品所有者信息

// 用户验证功能
async function checkUserVerification() {
  if (!currentUserId) {
    isUserVerified = false;
    return false;
  }

  try {
    const results = await wixData
      .query("Members/PublicData")
      .eq("_id", currentUserId)
      .find();

    if (results.items.length > 0) {
      const member = results.items[0];
      isUserVerified = !!member["custom_pu-mian-fa-bu-wang-zhi"];
      return isUserVerified;
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
    $w("#submit").label = "未验证";
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

// 页面初始化
$w.onReady(async function () {
  await checkUserVerification();
  updateCommentControlsVerificationStatus();


  commentsCountByWorkNumber = await getAllCommentsCount();

  // Repeater2: 作品显示
  $w("#repeater2").onItemReady(async ($item, itemData, index) => {
    const maidataUrl = itemData.inVideo的複本;
    const trackUrl = itemData.maidata的複本;
    const bgUrl = itemData.track的複本;
    const bgVideoUrl = itemData.上傳檔案欄;
    const submitTime = itemData.submissionTime;
    const formattedSubmitTime = formatDate(submitTime);
    const checkboxChecked = itemData.核取方塊欄;

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
    await updateButtonStatus($item, itemData._id, checkboxChecked);
    await updateCommentStatus($item, itemData);

    // 淘汰作品视觉效果
    if (itemData.isDq === true) {
      $item("#container2").style.opacity = "0.5";
      $item("#container2").style.filter = "grayscale(100%)";
      $item("#container2").style.backgroundColor = "rgba(128, 128, 128, 0.2)";
    }

    setupItemEventListeners($item, itemData, downloadUrl);
  });

  // Repeater1: 评论显示
  $w("#repeater1").onItemReady(async ($item, itemData, index) => {
    let commentText = itemData.comment;
    try {
      const workResults = await wixData
        .query("enterContest034")
        .eq("sequenceId", itemData.workNumber)
        .find();

      if (workResults.items.length > 0 && workResults.items[0].isDq === true) {
        commentText = "*该作品已淘汰*" + commentText;
      }
    } catch (error) {
      console.error("检查作品淘汰状态失败", error);
    }

    $item("#CommentBox").value = commentText;

    // 评论类型处理
    if (itemData.replyTo) {
      // 楼中楼回复
      $item("#showScore").text = "Re";
      $item("#showBackground").style.backgroundColor = "#1E3A8A";
      $item("#deleteComment").hide();
      $item("#viewRepliesButton").hide();
      if ($item("#replyCountText")) {
        $item("#replyCountText").hide();
      }
    } else {
      // 主评论：检查作者身份（优化：使用缓存避免重复查询）
      let isAuthorComment = false;
      let workOwnerId = null;
      
      try {
        // 优先使用缓存的作品所有者信息
        if (workOwnersCache[itemData.workNumber]) {
          workOwnerId = workOwnersCache[itemData.workNumber];
          isAuthorComment = itemData._owner === workOwnerId;
        } else {
          // 缓存中没有时才查询数据库
          const workResults = await wixData
            .query("enterContest034")
            .eq("sequenceId", itemData.workNumber)
            .find();

          if (workResults.items.length > 0) {
            workOwnerId = workResults.items[0]._owner;
            workOwnersCache[itemData.workNumber] = workOwnerId; // 缓存结果
            isAuthorComment = itemData._owner === workOwnerId;
          }
        }
      } catch (error) {
        console.error("检查作者身份失败", error);
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

    // 评分数据显示（仅主评论）
    if (!itemData.replyTo) {
      const userHasFormalRating = await checkUserHasFormalRating(
        itemData.workNumber
      );

      if (userHasFormalRating) {
        const ratingData = await getRatingData(itemData.workNumber);
        var averageScore = ratingData.averageScore;
        var newRating = ((averageScore - 0) / (1000 - 0)) * (5.0 - 1.0) + 1.0;

        if (ratingData.numRatings >= 5) {
          $item("#ratingsDisplay").text = `${newRating.toFixed(1)}★ (${
            ratingData.numRatings
          }人评分)`;
        } else if (ratingData.numRatings > 0) {
          $item(
            "#ratingsDisplay"
          ).text = `评分量不足(${ratingData.numRatings}人评分)`;
        } else {
          $item("#ratingsDisplay").text = "暂无评分";
        }
      } else {
        $item("#ratingsDisplay").text = "提交您的评分以查看评分";
      }
    } else {
      $item("#ratingsDisplay").text = "";
    }

    await displayAuthorInfo($item, itemData);

    if (!itemData.replyTo) {
      await displayReplyCount($item, itemData._id);
    }

    // 删除按钮权限设置（仅主评论）
    if (currentUserId && !itemData.replyTo) {
      try {
        const isSeaSelectionMember = await checkIsSeaSelectionMember();
        if (isSeaSelectionMember) {
          $item("#deleteComment").show();
          $item("#deleteComment").enable();
          $item("#deleteComment").onClick(async () => {
            await handleDeleteComment(itemData);
          });
        } else {
          $item("#deleteComment").hide();
          $item("#deleteComment").disable();
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
      $item("#viewRepliesButton").onClick(async () => {
        await showCommentReplies(
          itemData._id,
          itemData.workNumber,
          itemData.comment
        );
      });
    }
  });

  // 数据初始化
  await updateRepeaterData(1, "", "");
  
  // 预加载缓存数据以减少API调用
  if (currentUserId && isUserVerified) {
    await batchLoadUserFormalRatings();
  }
  
  await loadAllFormalComments();
  
  // 预加载当前显示评论的回复数量
  $w("#repeater1").onReady(() => {
    const commentIds = $w("#repeater1").data.map(item => item._id).filter(id => id);
    if (commentIds.length > 0) {
      batchLoadReplyCounts(commentIds);
    }
  });

  // 事件监听器设置
  setupSearchAndPaginationEvents();
  setupSubmitButtonEvent();
  setupDropdownFilterEvent();
  setupScoreCheckboxEvent();
  setupWorkSelectionEvent();
});

// 核心功能函数

// 评论状态检查 - 优先级：淘汰 > 未登录 > 未验证 > 评论状态
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
    $item("#ifComment").text = "未验证";
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

    if (results.items.length > 0) {
      $item("#ifComment").text = "已评论";
      $item("#ifComment").style.color = "#228B22";
    } else {
      $item("#ifComment").text = "未评论";
      $item("#ifComment").style.color = "#FF4500";
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
          $w("#submit").label = "未验证";
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

      if (!currentUserId) {
        $w("#submit").disable();
        $w("#submit").label = "未登录";
        $w("#Comment").disable();
        $w("#inputScore").disable();
      } else if (!isUserVerified) {
        $w("#submit").disable();
        $w("#submit").label = "未验证";
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

async function handleDeleteComment(itemData) {
  try {
    const result = await wixWindow.openLightbox("DeleteConfirmation", {
      commentId: itemData._id,
      workNumber: itemData.workNumber,
      score: itemData.score,
      comment: itemData.comment,
    });

    let shouldDelete = false;
    let deleteReason = "";

    if (typeof result === "string" && result === "confirm") {
      shouldDelete = true;
      deleteReason = "未填写删除理由";
    } else if (
      result &&
      typeof result === "object" &&
      result.action === "confirm"
    ) {
      shouldDelete = true;
      deleteReason = result.reason || "未填写删除理由";
    }

    if (shouldDelete) {
      try {
        const deleteResult = await deleteComment(
          itemData._id,
          currentUserId,
          deleteReason
        );
        if (deleteResult.success) {
          await refreshRepeaters();
        } else {
          console.error("删除评论失败:", deleteResult.message);
        }
      } catch (error) {
        console.error("删除评论时发生错误:", error);
      }
    }
  } catch (error) {
    console.error("处理删除评论时发生错误:", error);
  }
}

async function showCommentReplies(commentId, workNumber, originalComment) {
  try {
   // console.log("准备显示回复，评论ID:", commentId);

    const replies = await wixData
      .query("BOFcomment")
      .eq("replyTo", commentId)
      .ascending("_createdDate")
      .find();

   // console.log("查询到的回复数据:", replies.items.length, "条");

    const result = await wixWindow.openLightbox("CommentReplies", {
      commentId: commentId,
      workNumber: workNumber,
      originalComment: originalComment,
      replies: replies.items,
    });

    if (result && result.refresh) {
      await refreshRepeaters();
    }
  } catch (err) {
    console.error("显示评论回复失败", err);
  }
}

// 辅助工具函数

// 批量获取用户正式评分状态（优化版）
async function batchLoadUserFormalRatings() {
  if (!currentUserId || !isUserVerified || userFormalRatingsCache) {
    return userFormalRatingsCache || {};
  }

  try {
   // console.log("批量加载用户评分状态...");
    
    // 获取所有作品信息
    const allWorks = await wixData.query("enterContest034").find();
    const workOwnerMap = {};
    allWorks.items.forEach((work) => {
      workOwnerMap[work.sequenceId] = work._owner;
      workOwnersCache[work.sequenceId] = work._owner;
    });

    // 获取用户所有评论
    const userComments = await wixData
      .query("BOFcomment")
      .eq("_owner", currentUserId)
      .isEmpty("replyTo")
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
   // console.log(`用户评分状态加载完成，共${Object.keys(formalRatings).length}个作品有正式评分`);
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

// 清理缓存数据
function clearCaches() {
  userFormalRatingsCache = null;
  replyCountsCache = {};
  workOwnersCache = {};
  console.log("缓存数据已清理");
}

// 统一刷新两个repeater
async function refreshRepeaters() {
  try {
    // 清理缓存以确保数据同步
    clearCaches();
    
    const currentPage = $w("#paginator").currentPage || 1;
    const searchValue = $w("#input1").value;
    const dropdownValue = $w("#dropdown1").value;
    await updateRepeaterData(currentPage, searchValue, dropdownValue);

    // 重新加载缓存数据
    if (currentUserId && isUserVerified) {
      await batchLoadUserFormalRatings();
    }

    const dropdownFilterValue = $w("#dropdownFilter").value;
    if (dropdownFilterValue && dropdownFilterValue !== "114514") {
      await setDropdownValue(parseInt(dropdownFilterValue));
    } else if (dropdownFilterValue === "114514") {
      await loadUserComments();
    } else {
      await loadAllFormalComments();
    }

    commentsCountByWorkNumber = await getAllCommentsCount();

    console.log("Repeaters刷新完成");
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

// 显示作者信息和样式（优化：使用缓存，统一作者身份检查）
async function displayAuthorInfo($item, itemData) {
  try {
    let contestItem = null;
    let contestOwnerId = null;

    // 优先使用缓存的作品所有者信息
    if (workOwnersCache[itemData.workNumber]) {
      contestOwnerId = workOwnersCache[itemData.workNumber];
      // 获取作品名称（如果需要）
      const results = await wixData
        .query("enterContest034")
        .eq("sequenceId", itemData.workNumber)
        .find();
      
      if (results.items.length > 0) {
        contestItem = results.items[0];
      }
    } else {
      // 缓存中没有时才查询数据库
      const results = await wixData
        .query("enterContest034")
        .eq("sequenceId", itemData.workNumber)
        .find();

      if (results.items.length > 0) {
        contestItem = results.items[0];
        contestOwnerId = contestItem._owner;
        workOwnersCache[itemData.workNumber] = contestOwnerId; // 缓存结果
      }
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
async function updateButtonStatus($item, sheetId, checkboxChecked) {
  $item("#button3").enable();
  $item("#button3").show();
  $item("#downloadAble").show();
}

// 获取评分数据（排除作者自评）
async function getRatingData(workNumber) {
  const results = await wixData
    .query("BOFcomment")
    .eq("workNumber", workNumber)
    .isEmpty("replyTo")
    .find();

  const workResults = await wixData
    .query("enterContest034")
    .eq("sequenceId", workNumber)
    .find();

  let workOwnerId = null;
  if (workResults.items.length > 0) {
    workOwnerId = workResults.items[0]._owner;
  }

  const validRatings = results.items.filter(
    (item) => item._owner !== workOwnerId
  );

  const numRatings = validRatings.length;
  const totalScore = validRatings.reduce(
    (total, item) => total + item.score,
    0
  );
  const averageScore = numRatings > 0 ? totalScore / numRatings : 0;

  return {
    numRatings,
    averageScore,
  };
}


// 统计所有作品的评论数量（仅主评论）
async function getAllCommentsCount() {
  let commentsCountByWorkNumber = {};
  let hasMore = true;
  let skipCount = 0;

  while (hasMore) {
    try {
      const res = await wixData
        .query("BOFcomment")
        .isEmpty("replyTo")
        .skip(skipCount)
        .find();

      res.items.forEach((item) => {
        if (commentsCountByWorkNumber[item.workNumber]) {
          commentsCountByWorkNumber[item.workNumber] += 1;
        } else {
          commentsCountByWorkNumber[item.workNumber] = 1;
        }
      });
      skipCount += res.items.length;
      hasMore = res.items.length > 0;
    } catch (err) {
      console.error("Error fetching data:", err);
      hasMore = false;
    }
  }

  return commentsCountByWorkNumber;
}

// 设置作品筛选并显示对应评论
async function setDropdownValue(sequenceId) {
  $w("#dropdownFilter").value = sequenceId.toString();

  try {
    const results = await wixData
      .query("BOFcomment")
      .eq("workNumber", sequenceId)
      .ascending("_createdDate")
      .find();

    let commentsToShow = results.items;

    if (isScoreFilterEnabled()) {
      const workResults = await wixData
        .query("enterContest034")
        .eq("sequenceId", sequenceId)
        .find();

      let workOwnerId = null;
      if (workResults.items.length > 0) {
        workOwnerId = workResults.items[0]._owner;
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
    }

    $w("#repeater1").data = commentsToShow;
    $w("#repeater1").forEachItem(($item, itemData, index) => {
      // 更新重复项元素
    });
  } catch (err) {
    console.error("查询失败", err);
  }
}

// 更新作品评分显示（排除作者自评）
async function updateItemEvaluationDisplay($item, itemData) {
  try {
    const workNumber = itemData.sequenceId;

    const userHasFormalRating = await checkUserHasFormalRating(workNumber);

    if (!userHasFormalRating) {
      $item("#approvalCountText").text = "";
      $item("#box1").style.backgroundColor = "transparent";
      return;
    }

    const ratingData = await getRatingData(workNumber);
    const evaluationCount = ratingData.numRatings;
    const averageScore = ratingData.averageScore;

    if (evaluationCount > 0) {
      const displayRating = Math.round(((averageScore - 100) / 900) * 4) + 1;

      if (evaluationCount >= 5) {
        $item("#approvalCountText").text = `${displayRating.toFixed(
          1
        )}★ (${evaluationCount}人评分)`;

        if (displayRating >= 4) {
          $item("#box1").style.backgroundColor = "rgba(135, 206, 235, 0.5)";
        } else if (displayRating >= 3) {
          $item("#box1").style.backgroundColor = "rgba(144, 238, 144, 0.3)";
        } else {
          $item("#box1").style.backgroundColor = "rgba(255, 182, 193, 0.3)";
        }
      } else {
        $item(
          "#approvalCountText"
        ).text = `评分量不足(${evaluationCount}人评分)`;
        $item("#box1").style.backgroundColor = "rgba(255, 255, 0, 0.3)";
      }
    } else {
      $item("#approvalCountText").text = "暂无评分";
      $item("#box1").style.backgroundColor = "transparent";
    }
  } catch (error) {
    console.error("更新评分显示时出错:", error);
    $item("#approvalCountText").text = "评分加载失败";
  }
}

// 基于评分排序作品（排除作者自评）
async function sortByRating(items) {
  try {
    const itemsWithRating = await Promise.all(
      items.map(async (item) => {
        const ratingData = await getRatingData(item.sequenceId);
        const averageScore =
          ratingData.numRatings >= 5 ? ratingData.averageScore : 0;

        return {
          ...item,
          rating: averageScore,
          numRatings: ratingData.numRatings,
        };
      })
    );

    return itemsWithRating.sort((a, b) => {
      if (a.rating === b.rating) {
        return b.numRatings - a.numRatings;
      }
      return b.rating - a.rating;
    });
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

// 评论提交事件处理
function setupSubmitButtonEvent() {
  $w("#submit").onClick(async () => {
    try {
      if (!currentUserId) {
        console.log("用户未登录");
        return;
      }

      if (!isUserVerified) {
        console.log("用户未验证，无法提交评论");
        return;
      }

      const workNumber = parseInt($w("#inputNumber").value);
      const score = parseInt($w("#inputScore").value);
      const comment = $w("#Comment").value;

      const isWorkNumberValid = $w("#inputNumber").valid;
      const isScoreValid = $w("#inputScore").valid;
      const isWorkNumberInRange = workNumber >= 1 && workNumber <= 500;
      const isScoreInRange = score >= 100 && score <= 1000;

      // 检查作品状态和用户权限
      if (currentUserId) {
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
          console.log("作品已淘汰，阻止提交评论");
          return;
        }

        if (!isAuthor) {
          const existingComment = await wixData
            .query("BOFcomment")
            .eq("workNumber", workNumber)
            .eq("_owner", currentUserId)
            .isEmpty("replyTo")
            .find();

          if (existingComment.items.length > 0) {
            console.log("用户已经评论过这个作品，阻止重复提交");
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
        let toInsert = {
          workNumber: workNumber,
          score: score,
          comment: comment,
        };

        await wixData.insert("BOFcomment", toInsert);

        if (currentUserId) {
          try {
            await updateUserPoints(currentUserId, 1, false, false);
          } catch (error) {
            console.error("Error updating user points:", error);
          }
        }

        // 清空输入并重置状态
        $w("#inputNumber").value = "";
        $w("#inputScore").value = "";
        $w("#Comment").value = "";
        $w("#submit").enable();
        $w("#submit").label = "提交评论";
        $w("#Comment").enable();
        $w("#inputScore").enable();

        $w("#dataset1").refresh();
        await refreshRepeaters();
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// 获取评分筛选状态
function isScoreFilterEnabled() {
  try {
    return $w("#scoreCheckbox").checked;
  } catch (error) {
    console.error("获取勾选框状态失败:", error);
    return false;
  }
}

// 评分筛选勾选框事件
function setupScoreCheckboxEvent() {
  $w("#scoreCheckbox").onChange(async (event) => {
    try {
      const isChecked = event.target.checked;
      console.log(`正式评论筛选已${isChecked ? "启用" : "禁用"}`);

      const dropdownFilterValue = $w("#dropdownFilter").value;

      if (dropdownFilterValue && dropdownFilterValue !== "114514") {
        await setDropdownValue(parseInt(dropdownFilterValue));
      } else if (dropdownFilterValue === "114514") {
        await loadUserComments();
      } else {
        await loadAllFormalComments();
      }
    } catch (error) {
      console.error("处理勾选框状态变化时出错:", error);
    }
  });
}

// 加载所有作品的评论（支持正式评论筛选）
async function loadAllFormalComments() {
  try {
    const results = await wixData
      .query("BOFcomment")
      .isEmpty("replyTo")
      .descending("_createdDate")
      .limit(500)
      .find();

    let commentsToShow = results.items;

    if (isScoreFilterEnabled()) {
      const allWorks = await wixData.query("enterContest034").find();
      const workOwnerMap = {};
      allWorks.items.forEach((work) => {
        workOwnerMap[work.sequenceId] = work._owner;
      });

      commentsToShow = results.items.filter((comment) => {
        const workOwnerId = workOwnerMap[comment.workNumber];
        return comment._owner !== workOwnerId;
      });
    }

    $w("#repeater1").data = commentsToShow;
    $w("#repeater1").forEachItem(($item, itemData, index) => {
      // 更新重复项元素
    });

    console.log(
      `已加载${commentsToShow.length}条${
        isScoreFilterEnabled() ? "正式" : ""
      }评论`
    );
  } catch (err) {
    console.error("加载所有评论失败", err);
  }
}

// 加载用户评论（支持筛选）
async function loadUserComments() {
  if (!currentUserId) {
    console.log("用户未登录，无法查看个人评论");
    $w("#repeater1").data = [];
    return;
  }

  if (!isUserVerified) {
    console.log("用户未验证，无法查看个人评论");
    $w("#repeater1").data = [];
    return;
  }

  try {
    const results = await wixData
      .query("BOFcomment")
      .eq("_owner", currentUserId)
      .ascending("_createdDate")
      .find();

    let commentsToShow = results.items;

    if (isScoreFilterEnabled()) {
      const allWorks = await wixData.query("enterContest034").find();
      const workOwnerMap = {};
      allWorks.items.forEach((work) => {
        workOwnerMap[work.sequenceId] = work._owner;
      });

      commentsToShow = results.items.filter((comment) => {
        if (comment.replyTo) {
          return false;
        }

        const workOwnerId = workOwnerMap[comment.workNumber];
        if (comment._owner === workOwnerId) {
          return false;
        }

        return true;
      });
    }

    $w("#repeater1").data = commentsToShow;
    $w("#repeater1").forEachItem(($item, itemData, index) => {
      // 更新重复项元素
    });
  } catch (err) {
    console.error("查询评论失败", err);
  }
}

// 下拉筛选器事件处理
function setupDropdownFilterEvent() {
  $w("#dropdownFilter").onChange(async () => {
    let selectedValue = $w("#dropdownFilter").value;

    if (selectedValue === "114514") {
      await loadUserComments();
    } else if (selectedValue && selectedValue !== "") {
      await setDropdownValue(parseInt(selectedValue));
    } else {
      await loadAllFormalComments();
    }
  });
}
