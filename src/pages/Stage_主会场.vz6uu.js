// 导入依赖模块
import wixUsers from 'wix-users';
import wixData from 'wix-data';
import wixWindow from 'wix-window';
import { getMediaDownloadUrls, getFileDownloadUrlAndContent, getBatchDownloadUrls } from 'backend/mediaManagement.jsw';
import { updateUserPoints } from 'backend/forumPoints.jsw';
import { deleteComment, checkIsSeaSelectionMember } from 'backend/auditorManagement.jsw';
import { QUERY_LIMITS } from 'public/constants.js';

// ================================
// 全局变量定义
// ================================
let commentsCountByWorkNumber = {};
const itemsPerPage = QUERY_LIMITS.ITEMS_PER_PAGE;
let titleValue;
const currentUserId = wixUsers.currentUser.id;
let isUserVerified = false; // 用户验证状态
let chartReady = false; // 图表是否就绪
let chartDataBuffer = null; // 暂存图表数据

// ================================
// 用户验证函数
// ================================

/**
 * 检查用户是否已验证（填写了谱面网站）
 */
async function checkUserVerification() {
    if (!currentUserId) {
        isUserVerified = false;
        return false;
    }
    
    try {
        const results = await wixData.query("Members/PublicData")
            .eq("_id", currentUserId)
            .find();
        
        if (results.items.length > 0) {
            const member = results.items[0];
            isUserVerified = !!(member["custom_pu-mian-fa-bu-wang-zhi"]);
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

/**
 * 更新评论控件的验证状态
 */
function updateCommentControlsVerificationStatus() {
    if (!currentUserId) {
        // 未登录用户
        $w("#submit").disable();
        $w("#submit").label = "未登录";
        $w("#Comment").disable();
        $w("#inputScore").disable();
        return;
    }
    
    if (!isUserVerified) {
        // 未验证用户
        $w("#submit").disable();
        $w("#submit").label = "未验证";
        $w("#Comment").disable();
        $w("#inputScore").disable();
    } else {
        // 已验证用户，恢复正常功能
        const workNumber = parseInt($w("#inputNumber").value);
        if (workNumber) {
            // 如果已选择作品，重新检查该作品的评论状态
            $w("#inputNumber").fireEvent("change");
        } else {
            $w("#submit").enable();
            $w("#submit").label = "提交评论";
            $w("#Comment").enable();
            $w("#inputScore").enable();
        }
    }
}



// ================================
// 页面初始化
// ================================
$w.onReady(async function () {
    // 检查用户验证状态
    await checkUserVerification();
    updateCommentControlsVerificationStatus();
    
    // 监听来自html2图表的消息
    if (typeof window !== 'undefined') {
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'chart-ready') {
                console.log('收到图表就绪消息');
                chartReady = true;
                // 如果有缓存的数据，立即发送
                if (chartDataBuffer) {
                    console.log('发送缓存的图表数据');
                    sendChartData(chartDataBuffer);
                    chartDataBuffer = null;
                }
            }
        });
    }
    
    // 初始化评论数据和重复器
    commentsCountByWorkNumber = await getAllCommentsCount();

    // 设置重复器2的onItemReady事件（作品显示）
    $w('#repeater2').onItemReady(async ($item, itemData, index) => {
        // 获取文件URL
        const maidataUrl = itemData.inVideo的複本;
        const trackUrl = itemData.maidata的複本;
        const bgUrl = itemData.track的複本;
        const bgVideoUrl = itemData.上傳檔案欄;
        const submitTime = itemData.submissionTime;
        const formattedSubmitTime = formatDate(submitTime);
        const checkboxChecked = itemData.核取方塊欄;

        // 获取下载URL
        const downloadUrl = await getMediaDownloadUrls(maidataUrl, trackUrl, bgUrl, bgVideoUrl);

        // 设置基础显示
        $item("#button3").label = "Download";

        // 控制视频显示
        if (bgVideoUrl) {
            $item('#movie').show();
        } else {
            $item('#movie').hide();
        }

        // 评审功能已移除，使用主会场的评论功能进行评分

        // 显示提交时间
        $item('#submitTime').text = formattedSubmitTime;

        // 解析并显示难度等级
        await parseDifficultyLevels($item, maidataUrl);

        // 更新评分显示
        await updateItemEvaluationDisplay($item, itemData);
        
        // 更新按钮状态
        await updateButtonStatus($item, itemData._id, checkboxChecked);
        
        // 检查并显示是否已评论
        await updateCommentStatus($item, itemData);
        
        // 设置事件监听器
        setupItemEventListeners($item, itemData, downloadUrl);
    });

    // 设置重复器1的onItemReady事件（评论显示）
    $w("#repeater1").onItemReady(async ($item, itemData, index) => {
        // 检查是否为楼中楼回复
        if (itemData.replyTo) {
            // 楼中楼回复显示
            $item("#showScore").text = "Re";
            $item("#showBackground").style.backgroundColor = "#1E3A8A"; // 深蓝色
            
            // 确保楼中楼回复隐藏所有不需要的功能
            $item("#deleteComment").hide();
            $item("#viewRepliesButton").hide();
            if ($item("#replyCountText")) {
                $item("#replyCountText").hide();
            }
        } else {
            // 普通评论，先检查是否为作者自评
            let isAuthorComment = false;
            try {
                const workResults = await wixData.query("enterContest034")
                    .eq("sequenceId", itemData.workNumber)
                    .find();
                
                if (workResults.items.length > 0) {
                    const workOwner = workResults.items[0]._owner;
                    isAuthorComment = (itemData._owner === workOwner);
                }
            } catch (error) {
                console.error("检查作者身份失败", error);
            }
            
            if (isAuthorComment) {
                // 作者自评显示"Sc"
                $item("#showScore").text = "Sc";
                $item("#showBackground").style.backgroundColor = "#8A2BE2"; // 紫色背景
            } else {
                // 普通评论：检查当前用户是否对该作品有正式评分
                const userHasFormalRating = await checkUserHasFormalRating(itemData.workNumber);
                
                if (userHasFormalRating) {
                    // 用户已有正式评分，显示评分背景颜色和分数
                    const score = parseInt(itemData.score);
                    const redAmount = Math.floor(score / 1000 * 255);
                    $item("#showBackground").style.backgroundColor = `rgb(${redAmount}, 0, 0)`;
                    $item("#showScore").text = score.toString(); // 显示实际分数
                } else {
                    // 用户未有正式评分，隐藏分数显示
                    $item("#showBackground").style.backgroundColor = "#A9A9A9"; // 灰色背景
                    $item("#showScore").text = "?"; // 显示问号而不是分数
                }
            }
            
            // 确保普通评论的元素显示正常
            if ($item("#replyCountText")) {
                $item("#replyCountText").show();
            }
            $item("#viewRepliesButton").show();
        }

        // 获取并显示评分数据（楼中楼回复不显示评分信息）
        if (!itemData.replyTo) {
            // 检查当前用户是否对该作品有正式评分
            const userHasFormalRating = await checkUserHasFormalRating(itemData.workNumber);
            
            if (userHasFormalRating) {
                // 用户已有正式评分，显示评分信息
                const ratingData = await getRatingData(itemData.workNumber);
                var averageScore = ratingData.averageScore;
                var newRating = (averageScore - 0) / (1000 - 0) * (5.0 - 1.0) + 1.0;

                if (ratingData.numRatings >= 5) {
                    // 达到5人评分门槛，显示真实分数
                    $item("#ratingsDisplay").text = `${newRating.toFixed(1)}★ (${ratingData.numRatings}人评分)`;
                } else if (ratingData.numRatings > 0) {
                    // 未达到5人评分门槛，隐藏分数
                    $item("#ratingsDisplay").text = `评分量不足(${ratingData.numRatings}人评分)`;
                } else {
                    // 没有评分
                    $item("#ratingsDisplay").text = "暂无评分";
                }
            } else {
                // 用户未有正式评分，隐藏分数显示
                $item("#ratingsDisplay").text = "提交您的评分以查看评分";
            }
        } else {
            // 楼中楼回复不显示评分信息
            $item("#ratingsDisplay").text = "";
        }

        // 获取并显示作者信息
        await displayAuthorInfo($item, itemData);
        
        // 获取并显示回复数量（只对主评论显示）
        if (!itemData.replyTo) {
            await displayReplyCount($item, itemData._id);
        }
        
        // 设置删除评论按钮权限（楼中楼回复不显示删除按钮）
        if (currentUserId && !itemData.replyTo) {
            try {
                // 使用后端API检查用户是否为海选组成员
                const isSeaSelectionMember = await checkIsSeaSelectionMember();
                if (isSeaSelectionMember) {
                    // 海选组成员显示并启用删除按钮
                    $item("#deleteComment").show();
                    $item("#deleteComment").enable();
                
                    // 设置删除按钮事件
                    $item("#deleteComment").onClick(async () => {
                        await handleDeleteComment(itemData);
                    });
                } else {
                    // 非海选组成员隐藏并禁用删除按钮
                    $item("#deleteComment").hide();
                    $item("#deleteComment").disable();
                }
            } catch (error) {
                // 角色获取失败，隐藏删除按钮
                $item("#deleteComment").hide();
                $item("#deleteComment").disable();
            }
        } else if (!itemData.replyTo) {
            // 未登录用户隐藏并禁用删除按钮（只对主评论）
            $item("#deleteComment").hide();
            $item("#deleteComment").disable();
        }
        
        // 设置评论查看事件
        $item('#checkText2').onClick(() => {
            const descriptionText = $item('#CommentBox').value;
            showTextPopup(descriptionText);
        });

        // 设置搜索作者事件
        $item("#goUp").onClick(async () => {
            const textValue = $item("#text15").text;
            $w("#input1").value = textValue;

            // 统一刷新两个repeater
            await refreshRepeaters();
        });
        
        // 设置查看回复按钮事件（只对主评论）
        if (!itemData.replyTo) {
            $item("#viewRepliesButton").onClick(async () => {
                await showCommentReplies(itemData._id, itemData.workNumber, itemData.comment);
            });
        }
    });
    
    // 初始化数据
    await updateRepeaterData(1, "", "");
    
    // 初始化评论显示（显示所有评论）
    await loadAllFormalComments();
    
    // 设置搜索和分页事件
    setupSearchAndPaginationEvents();
    
    // 设置提交按钮事件
    setupSubmitButtonEvent();
    
    // 设置下拉筛选器事件
    setupDropdownFilterEvent();
    
    // 设置评分勾选框事件
    setupScoreCheckboxEvent();
    
    // 设置作品选择事件
    setupWorkSelectionEvent();
    
    // 加载数据
    await loadData();
});

// ================================
// 初始化函数
// ================================

/**
 * 检查并显示是否已评论
 */
async function updateCommentStatus($item, itemData) {
    if (!currentUserId) {
        $item("#ifComment").text = "未登录";
        $item("#ifComment").style.color = "#A9A9A9"; // 灰色字体
        return;
    }
    
    if (!isUserVerified) {
        $item("#ifComment").text = "未验证";
        $item("#ifComment").style.color = "#FF0000"; // 红色字体
        return;
    }
    
    try {
        const results = await wixData.query("BOFcomment")
            .eq("workNumber", itemData.sequenceId)
            .eq("_owner", currentUserId)
            .isEmpty("replyTo")  // 只检查主评论
            .find();
        
        if (results.items.length > 0) {
            // 用户已评论这个作品
            $item("#ifComment").text = "已评论";
            $item("#ifComment").style.color = "#228B22"; // 绿色字体
        } else {
            // 用户未评论这个作品
            $item("#ifComment").text = "未评论";
            $item("#ifComment").style.color = "#FF4500"; // 橙色字体
        }
    } catch (err) {
        console.error("检查评论状态失败", err);
        $item("#ifComment").text = "检查失败";
        $item("#ifComment").style.color = "#A9A9A9"; // 灰色字体
    }
}
/**
 * 设置作品选择事件
 */
function setupWorkSelectionEvent() {
    $w("#inputNumber").onChange(async () => {
        const workNumber = parseInt($w("#inputNumber").value);
        
        // 首先检查用户验证状态
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
        
        if (workNumber && currentUserId && isUserVerified) {
            try {
                // 先检查是否为作者自己的作品
                const workResults = await wixData.query("enterContest034")
                    .eq("sequenceId", workNumber)
                    .find();
                
                let isAuthor = false;
                if (workResults.items.length > 0) {
                    const workOwner = workResults.items[0]._owner;
                    isAuthor = (currentUserId === workOwner);
                }
                
                if (isAuthor) {
                    // 如果是作者自己的作品，允许无限次评论
                    $w("#Comment").value = "";
                    $w("#inputScore").value = "";
                    $w("#submit").enable();
                    $w("#submit").label = "自评";
                    $w("#Comment").enable();
                    $w("#inputScore").enable();
                } else {
                    // 非作者，检查是否已经评论过
                    const results = await wixData.query("BOFcomment")
                        .eq("workNumber", workNumber)
                        .eq("_owner", currentUserId)
                        .isEmpty("replyTo")  // 只检查主评论
                        .find();
                    
                    if (results.items.length > 0) {
                        // 用户已经评论过这个作品
                        $w("#Comment").value = results.items[0].comment;
                        $w("#inputScore").value = results.items[0].score;
                        $w("#submit").disable();
                        $w("#submit").label = "已评论";
                        $w("#Comment").disable();
                        $w("#inputScore").disable();
                    } else {
                        // 用户未评论过这个作品
                        $w("#Comment").value = "";
                        $w("#inputScore").value = "";
                        $w("#submit").enable();
                        $w("#submit").label = "提交评论";
                        $w("#Comment").enable();
                        $w("#inputScore").enable();
                    }
                }
                
                // 设置dropdownFilter的值并更新repeater1显示该作品的评论
                $w("#dropdownFilter").value = workNumber.toString();
                await setDropdownValue(workNumber);
            } catch (err) {
                console.error("查询评论失败", err);
            }
        } else if (!workNumber) {
            // 如果没有选择作品，重置所有控件
            $w("#Comment").value = "";
            $w("#inputScore").value = "";
            $w("#submit").enable();
            $w("#submit").label = "提交评论";
            $w("#Comment").enable();
            $w("#inputScore").enable();
        }
    });
}

// ================================
// Lightbox 弹窗管理函数
// ================================

/**
 * 显示文本弹窗的通用函数
 */
function showTextPopup(content) {
    wixWindow.openLightbox("TextPopup", { content: content });
}

/**
 * 处理删除评论的通用函数
 */
async function handleDeleteComment(itemData) {
    try {
        // 弹出确认对话框
        const result = await wixWindow.openLightbox("DeleteConfirmation", {
            commentId: itemData._id,
            workNumber: itemData.workNumber,
            score: itemData.score,
            comment: itemData.comment
        });
        
        // 检查结果格式，支持新旧两种格式
        let shouldDelete = false;
        let deleteReason = '';
        
        if (typeof result === 'string' && result === 'confirm') {
            // 旧格式：直接返回字符串
            shouldDelete = true;
            deleteReason = '未填写删除理由';
        } else if (result && typeof result === 'object' && result.action === 'confirm') {
            // 新格式：返回对象
            shouldDelete = true;
            deleteReason = result.reason || '未填写删除理由';
        }
        
        if (shouldDelete) {
            try {
                // 删除评论，传递删除理由
                const deleteResult = await deleteComment(itemData._id, currentUserId, deleteReason);
                if (deleteResult.success) {
                    // 刷新评论显示
                    await refreshRepeaters();
                } else {
                    console.error('删除评论失败:', deleteResult.message);
                }
            } catch (error) {
                console.error('删除评论时发生错误:', error);
            }
        }
    } catch (error) {
        console.error('处理删除评论时发生错误:', error);
    }
}

/**
 * 显示评论回复的通用函数
 */
async function showCommentReplies(commentId, workNumber, originalComment) {
    try {
        console.log("准备显示回复，评论ID:", commentId);
        
        // 获取该评论的所有回复
        const replies = await wixData.query("BOFcomment")
            .eq("replyTo", commentId)
            .ascending("_createdDate")
            .find();
        
        console.log("查询到的回复数据:", replies.items.length, "条");
        
        // 打开回复弹窗，传递原评论和回复数据
        const result = await wixWindow.openLightbox("CommentReplies", {
            commentId: commentId,
            workNumber: workNumber,
            originalComment: originalComment,
            replies: replies.items
        });
        
        // 如果用户在弹窗中添加了新回复，刷新显示
        if (result && result.refresh) {
            await refreshRepeaters();
        }
    } catch (err) {
        console.error("显示评论回复失败", err);
    }
}

// ================================
// 辅助函数
// ================================

/**
 * 检查当前用户是否对某个作品有正式评分评价
 * @param {number} workNumber - 作品编号
 * @returns {Promise<boolean>} 是否有正式评分
 */
async function checkUserHasFormalRating(workNumber) {
    // 如果用户未登录或未验证，返回false
    if (!currentUserId || !isUserVerified) {
        return false;
    }
    
    try {
        // 获取作品的所有者信息
        const workResults = await wixData.query("enterContest034")
            .eq("sequenceId", workNumber)
            .find();
        
        let workOwnerId = null;
        if (workResults.items.length > 0) {
            workOwnerId = workResults.items[0]._owner;
        }
        
        // 查询当前用户对该作品的主评论
        const userComments = await wixData.query("BOFcomment")
            .eq("workNumber", workNumber)
            .eq("_owner", currentUserId)
            .isEmpty("replyTo")  // 只查主评论
            .find();
        
        // 检查是否有正式评分（非自评的主评论）
        const hasFormalRating = userComments.items.some(comment => {
            return comment._owner !== workOwnerId; // 不是自评
        });
        
        return hasFormalRating;
    } catch (error) {
        console.error("检查用户正式评分状态失败:", error);
        return false;
    }
}

/**
 * 统一刷新两个repeater的函数
 */
async function refreshRepeaters() {
    try {
        // 刷新repeater2显示
        const currentPage = $w('#paginator').currentPage || 1;
        const searchValue = $w("#input1").value;
        const dropdownValue = $w("#dropdown1").value;
        await updateRepeaterData(currentPage, searchValue, dropdownValue);
        
        // 刷新repeater1显示（评论列表）
        const dropdownFilterValue = $w("#dropdownFilter").value;
        if (dropdownFilterValue && dropdownFilterValue !== "114514") {
            await setDropdownValue(parseInt(dropdownFilterValue));
        } else if (dropdownFilterValue === "114514") {
            // 刷新当前用户的评论（考虑筛选状态）
            await loadUserComments();
        } else {
            // 刷新所有作品的评论（考虑筛选状态）
            await loadAllFormalComments();
        }
        
        // 更新评论计数
        commentsCountByWorkNumber = await getAllCommentsCount();
        
        // 重新加载数据
        await loadData();
        
        console.log("Repeaters刷新完成");
    } catch (error) {
        console.error("刷新Repeaters时发生错误:", error);
    }
}

/**
 * 解析并显示难度等级
 */
async function parseDifficultyLevels($item, maidataUrl) {
    try {
        const { downloadUrl, fileContent } = await getFileDownloadUrlAndContent(maidataUrl);
        
        // 解析文件内容，提取难度等级
        const lv4Pattern = /&lv_4=([\d+]+)/;
        const lv5Pattern = /&lv_5=([\d+]+)/;
        const lv6Pattern = /&lv_6=([\d+]+)/;
        
        const lv4Match = fileContent.match(lv4Pattern);
        const lv5Match = fileContent.match(lv5Pattern);
        const lv6Match = fileContent.match(lv6Pattern);

        $item('#LevelExpert').text = lv4Match ? lv4Match[1] : "";
        $item('#LevelMaster').text = lv5Match ? lv5Match[1] : "";
        $item('#LevelRe').text = lv6Match ? lv6Match[1] : "";
    } catch (error) {
        console.error('Error fetching file content:', error);
    }
}

/**
 * 显示作者信息
 */
async function displayAuthorInfo($item, itemData) {
    const results = await wixData.query("enterContest034")
        .eq("sequenceId", itemData.workNumber)
        .find();

    if (results.items.length > 0) {
        const contestItem = results.items[0];
        const contestOwnerId = contestItem._owner;
        $item("#text15").text = contestItem.firstName;

        if (itemData._owner === contestOwnerId) {
            // 更改为作者评论的浅蓝色背景图片
            $item("#container3").background.src = "https://static.wixstatic.com/media/daf9ba_082e7daf94dc49d3bcdb3ba491854fd5~mv2.jpg";
        }
    } else {
        $item("#text15").text = "Unknown";
    }
}

/**
 * 显示回复数量
 */
async function displayReplyCount($item, commentId) {
    try {
        const replies = await wixData.query("BOFcomment")
            .eq("replyTo", commentId)
            .find();
        const replyCount = replies.items.length;
        
        // 假设在repeater1的设计中有一个显示回复数量的文本元素
        if (replyCount > 0) {
            $item("#replyCountText").text = `${replyCount}条回复`;
            $item("#replyCountText").show();
        } else {
            $item("#replyCountText").text = "";
            $item("#replyCountText").hide();
        }
    } catch (err) {
        console.error("获取回复数量失败", err);
        $item("#replyCountText").text = "";
        $item("#replyCountText").hide();
    }
}

/**
 * 设置项目事件监听器
 */
function setupItemEventListeners($item, itemData, downloadUrl) {
    // 下载按钮事件
    $item('#button3').onClick(() => {
        $w('#htmlDownloadHelper').postMessage({ action: 'download', downloadUrl, titleValue });
    });

    // 查看描述事件
    $item('#checkText').onClick(() => {
        const descriptionText = $item('#descriptionBox').value;
        showTextPopup(descriptionText);
    });

    // 评审功能已移除，用户可通过主会场下方的评论区进行评分

    // 设置跳转到作品事件
    $item("#vectorImage2").onClick(async () => {
        await setDropdownValue(itemData.sequenceId);
    });
}

/**
 * 格式化日期
 */
function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
}

/**
 * 创建下载HTML（暂未使用）
 */
function createDownloadHtml(downloadUrl, titleValue) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <script>
        window.addEventListener('message', (event) => {
          if (event.data === 'download') {
            const link = document.createElement('a');
            link.href = '${downloadUrl}';
            link.download = '${titleValue}.ksh';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        });
      </script>
    </head>
    <body></body>
    </html>
  `;
}

// ================================
// 图表数据发送函数
// ================================

/**
 * 发送数据到图表
 */
function sendChartData(data) {
    try {
        // 检查html2元件是否存在
        if (!$w('#html2')) {
            console.error('html2元件不存在');
            return false;
        }
        
        console.log('准备发送图表数据:', { 
            作品数量: data.workNumbers.length, 
            最高评分: data.scores.length > 0 ? Math.max(...data.scores.filter(s => s > 0)) : 0,
            最多评论: data.commentsCounts.length > 0 ? Math.max(...data.commentsCounts) : 0,
            用户已评分作品数: data.userRatings ? data.userRatings.filter(r => r).length : 0
        });
        
        const chartPayload = {
            workNumbers: data.workNumbers,
            scores: data.scores,
            commentsCounts: data.commentsCounts,
            userRatings: data.userRatings
        };
        
        let success = false;
        
        // 方式1: 标准postMessage
        try {
            $w('#html2').postMessage(chartPayload);
            console.log('方式1: postMessage发送成功');
            success = true;
        } catch (error) {
            console.error('方式1: postMessage发送失败:', error);
        }
        
        // 方式2: 通过全局变量（备用方案）
        try {
            // 尝试获取iframe的window对象
            const iframe = document.querySelector('#html2 iframe') || 
                         document.querySelector('iframe[id*="html2"]') ||
                         document.querySelector('iframe');
            
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.chartData = chartPayload;
                iframe.contentWindow.chartDataProcessed = false;
                console.log('方式2: 全局变量设置成功');
                success = true;
            }
        } catch (error) {
            console.error('方式2: 全局变量设置失败:', error);
        }
        
        // 方式3: 直接调用函数（如果可以访问）
        try {
            setTimeout(() => {
                const iframe = document.querySelector('#html2 iframe') || 
                             document.querySelector('iframe[id*="html2"]') ||
                             document.querySelector('iframe');
                
                if (iframe && iframe.contentWindow && iframe.contentWindow.receiveChartData) {
                    iframe.contentWindow.receiveChartData(chartPayload);
                    console.log('方式3: 直接函数调用成功');
                    success = true;
                }
            }, 100);
        } catch (error) {
            console.error('方式3: 直接函数调用失败:', error);
        }
        
        if (success) {
            console.log('图表数据发送完成');
        } else {
            console.error('所有发送方式都失败了');
        }
        
        return success;
    } catch (error) {
        console.error('发送图表数据时发生错误:', error);
        return false;
    }
}

// ================================
// 数据处理函数
// ================================

/**
 * 更新重复器数据
 */
async function updateRepeaterData(pageNumber, searchValue, dropdownValue) {
    $w('#loadingSpinner').show();

    let query = wixData.query('enterContest034');

    if (searchValue) {
        query = query.contains('firstName', searchValue).or(query.eq('sequenceId', Number(searchValue)));
    }

    let results = await query.limit(1000).find();

    // 更新下拉菜单选项
    const options = [
        { "label": "Please Choose ID", "value": "" }
    ].concat(results.items.map(item => {
        return { "label": item.sequenceId + " - " + item.firstName, "value": item.sequenceId.toString() };
    }));

    $w("#inputNumber").options = options;
    $w("#dropdownFilter").options = options;

    let items = results.items;

    // 应用排序
    if (dropdownValue === "rating") {
        // 基于评分排序
        items = await sortByRating(items);
    }

    // 分页处理
    const totalPages = Math.ceil(items.length / itemsPerPage);
    $w('#paginator').totalPages = totalPages;
    $w('#paginator').currentPage = pageNumber;
    $w('#paginator2').totalPages = totalPages;
    $w('#paginator2').currentPage = pageNumber;

    const startIndex = (pageNumber - 1) * itemsPerPage;
    const pagedItems = items.slice(startIndex, startIndex + itemsPerPage);

    // 设置数据到repeater2
    $w('#repeater2').data = pagedItems;

    // 使用forEachItem来等待所有项目处理完成后再隐藏loading
    $w('#repeater2').forEachItem(async ($item, itemData, index) => {
        // 获取并显示评论计数
        const commentCount = commentsCountByWorkNumber[itemData.sequenceId] || 0;
        $item('#Commments').text = `${commentCount}`;
        
        // 如果这是最后一个项目，隐藏loading spinner
        if (index === pagedItems.length - 1) {
            $w('#loadingSpinner').hide();
        }
    });
    
    // 如果没有数据，直接隐藏loading spinner
    if (pagedItems.length === 0) {
        $w('#loadingSpinner').hide();
    }
}

/**
 * 标记谱面为已查看
 */
async function markSheetAsViewed(sheetId, userId) {
    try {
        const currentItemResult = await wixData.query('enterContest034').eq('_id', sheetId).find();
        let currentItem = currentItemResult.items[0];
        let viewedBy = currentItem.viewedBy ? JSON.parse(currentItem.viewedBy) : [];
        let viewedCount = viewedBy.length;

        if (!viewedBy.includes(userId)) {
            viewedBy.push(userId);
            currentItem.viewedBy = JSON.stringify(viewedBy);
            await wixData.update('enterContest034', currentItem);
            viewedCount = viewedBy.length;
        }

        return viewedCount;
    } catch (error) {
        console.error('Error marking sheet as viewed:', error);
        return null;
    }
}

/**
 * 更新按钮状态（简化版本，仅处理下载相关逻辑）
 */
async function updateButtonStatus($item, sheetId, checkboxChecked) {
    // 下载权限：所有用户都可以下载
    $item('#button3').enable();
    $item('#button3').show();
    $item('#downloadAble').show();
}

/**
 * 获取评分数据（排除作者自评）
 */
async function getRatingData(workNumber) {
    const results = await wixData.query("BOFcomment")
        .eq("workNumber", workNumber)
        .isEmpty("replyTo")  // 只计算主评论的评分
        .find();

    // 获取作品的所有者ID
    const workResults = await wixData.query("enterContest034")
        .eq("sequenceId", workNumber)
        .find();
    
    let workOwnerId = null;
    if (workResults.items.length > 0) {
        workOwnerId = workResults.items[0]._owner;
    }

    // 过滤掉作者自己的评分
    const validRatings = results.items.filter(item => item._owner !== workOwnerId);
    
    const numRatings = validRatings.length;
    const totalScore = validRatings.reduce((total, item) => total + item.score, 0);
    const averageScore = numRatings > 0 ? totalScore / numRatings : 0;

    return {
        numRatings,
        averageScore
    };
}

/**
 * 加载数据到HTML表格（排除作者自评）
 */
async function loadData() {
    const commentsCountByWorkNumber = await getAllCommentsCount();

    let totalItems = [];
    let hasMore = true;
    let skipCount = 0;

    // 收集所有主评论来计算平均分数
    while (hasMore) {
        try {
            const res = await wixData.query('BOFcomment')
                .isEmpty("replyTo")  // 只收集主评论数据
                .skip(skipCount)
                .find();
            
            totalItems = totalItems.concat(res.items);
            skipCount += res.items.length;
            hasMore = res.items.length > 0;
        } catch (err) {
            console.error('Error fetching data:', err);
            hasMore = false;
        }
    }

    // 获取所有作品的所有者信息
    const allWorks = await wixData.query("enterContest034").find();
    const workOwnerMap = {};
    allWorks.items.forEach(work => {
        workOwnerMap[work.sequenceId] = work._owner;
    });

    // 计算每个作品的平均分（排除作者自评）
    const scoresSum = totalItems.reduce((acc, item) => {
        const workOwnerId = workOwnerMap[item.workNumber];
        // 只统计非作者的评分
        if (item._owner !== workOwnerId) {
            if (!acc[item.workNumber]) acc[item.workNumber] = { totalScore: 0, count: 0 };
            acc[item.workNumber].totalScore += item.score;
            acc[item.workNumber].count += 1;
        }
        return acc;
    }, {});

    const uniqueItems = Object.keys(commentsCountByWorkNumber).map(workNumber => {
        const averageScore = scoresSum[workNumber] ? scoresSum[workNumber].totalScore / scoresSum[workNumber].count : 0;
        return {
            workNumber: workNumber,
            score: averageScore,
            commentCount: commentsCountByWorkNumber[workNumber]
        };
    });

    // 检查当前用户对每个作品的评分状态
    const userRatings = await Promise.all(uniqueItems.map(async (item) => {
        return await checkUserHasFormalRating(parseInt(item.workNumber));
    }));

    const workNumbers = uniqueItems.map(item => item.workNumber);
    const scores = uniqueItems.map(item => item.score);
    const commentsCounts = uniqueItems.map(item => item.commentCount);

    // 准备图表数据
    const chartData = {
        workNumbers: workNumbers,
        scores: scores,
        commentsCounts: commentsCounts,
        userRatings: userRatings
    };
    
    // 如果图表已就绪，直接发送数据
    if (chartReady) {
        console.log('图表已就绪，立即发送数据');
        sendChartData(chartData);
    } else {
        // 图表未就绪，缓存数据
        console.log('图表未就绪，缓存数据等待发送');
        chartDataBuffer = chartData;
        
        // 备用方案：延迟3秒强制发送（以防消息机制失效）
        setTimeout(() => {
            if (chartDataBuffer) {
                console.log('强制发送缓存的图表数据');
                sendChartData(chartDataBuffer);
                chartDataBuffer = null;
                chartReady = true; // 标记为已发送
            }
        }, 3000);
    }
}

/**
 * 获取所有评论数量
 */
async function getAllCommentsCount() {
    let commentsCountByWorkNumber = {};
    let hasMore = true;
    let skipCount = 0;

    while (hasMore) {
        try {
            const res = await wixData.query('BOFcomment')
                .isEmpty("replyTo")  // 只统计主评论数量
                .skip(skipCount)
                .find();
            
            res.items.forEach(item => {
                if (commentsCountByWorkNumber[item.workNumber]) {
                    commentsCountByWorkNumber[item.workNumber] += 1;
                } else {
                    commentsCountByWorkNumber[item.workNumber] = 1;
                }
            });
            skipCount += res.items.length;
            hasMore = res.items.length > 0;
        } catch (err) {
            console.error('Error fetching data:', err);
            hasMore = false;
        }
    }

    return commentsCountByWorkNumber;
}

/**
 * 设置下拉菜单值并查询评论
 */
async function setDropdownValue(sequenceId) {
    $w("#dropdownFilter").value = sequenceId.toString();

    try {
        // 查询主评论和楼中楼回复
        const results = await wixData.query("BOFcomment")
            .eq("workNumber", sequenceId)
            .ascending("_createdDate")  // 按时间顺序显示
            .find();
        
        let commentsToShow = results.items;
        
        // 如果勾选了正式评论筛选
        if (isScoreFilterEnabled()) {
            // 获取该作品的所有者信息
            const workResults = await wixData.query("enterContest034")
                .eq("sequenceId", sequenceId)
                .find();
            
            let workOwnerId = null;
            if (workResults.items.length > 0) {
                workOwnerId = workResults.items[0]._owner;
            }
            
            // 过滤掉自评和楼中楼
            commentsToShow = results.items.filter(comment => {
                // 排除楼中楼回复
                if (comment.replyTo) {
                    return false;
                }
                
                // 排除自评（评论者是作品所有者）
                if (comment._owner === workOwnerId) {
                    return false;
                }
                
                return true;
            });
        }
        
        $w("#repeater1").data = commentsToShow;
        $w("#repeater1").forEachItem(($item, itemData, index) => {
            // 这里可以根据需要更新每个重复项内的元素
        });
    } catch (err) {
        console.error("查询失败", err);
    }
}





/**
 * 更新作品评分显示（排除作者自评）
 */
async function updateItemEvaluationDisplay($item, itemData) {
    try {
        const workNumber = itemData.sequenceId;
        
        // 检查当前用户是否对该作品有正式评分
        const userHasFormalRating = await checkUserHasFormalRating(workNumber);
        
        if (!userHasFormalRating) {
            // 用户未有正式评分，隐藏评分信息
            $item("#approvalCountText").text = "";
            $item("#box1").style.backgroundColor = 'transparent';
            return;
        }
        
        // 使用getRatingData函数获取评分数据（已排除作者自评）
        const ratingData = await getRatingData(workNumber);
        const evaluationCount = ratingData.numRatings;
        const averageScore = ratingData.averageScore;
        
        if (evaluationCount > 0) {
            // 将100-1000分转换为1-5分显示
            const displayRating = Math.round(((averageScore - 100) / 900) * 4) + 1;
            
            // 检查评分人数是否达到5人门槛
            if (evaluationCount >= 5) {
                // 达到5人评分门槛，显示真实分数
                $item("#approvalCountText").text = `${displayRating.toFixed(1)}★ (${evaluationCount}人评分)`;
                
                // 根据平均分设置背景颜色
                if (displayRating >= 4) {
                    $item("#box1").style.backgroundColor = 'rgba(135, 206, 235, 0.5)'; // 浅蓝色：高分
                } else if (displayRating >= 3) {
                    $item("#box1").style.backgroundColor = 'rgba(144, 238, 144, 0.3)'; // 浅绿色：中等分
                } else {
                    $item("#box1").style.backgroundColor = 'rgba(255, 182, 193, 0.3)'; // 浅红色：低分
                }
            } else {
                // 未达到5人评分门槛，隐藏分数
                $item("#approvalCountText").text = `评分量不足(${evaluationCount}人评分)`;
                $item("#box1").style.backgroundColor = 'rgba(255, 255, 0, 0.3)'; // 浅黄色：待定
            }
        } else {
            // 没有评分时的显示
            $item("#approvalCountText").text = "暂无评分";
            $item("#box1").style.backgroundColor = 'transparent';
        }
        
        // 评分显示功能保留，评分按钮功能已移除
        // 用户可通过主会场下方的评论区进行评分和评论
        
    } catch (error) {
        console.error('更新评分显示时出错:', error);
        $item("#approvalCountText").text = "评分加载失败";
    }
}

/**
 * 基于评分对作品进行排序（排除作者自评）
 * @param {Array} items - 作品列表
 * @returns {Promise<Array>} 排序后的作品列表
 */
async function sortByRating(items) {
    try {
        // 为每个作品获取评分数据（getRatingData函数已经排除了作者自评）
        const itemsWithRating = await Promise.all(items.map(async (item) => {
            const ratingData = await getRatingData(item.sequenceId);
            const averageScore = ratingData.numRatings >= 5 ? ratingData.averageScore : 0;
            
            return {
                ...item,
                rating: averageScore,
                numRatings: ratingData.numRatings
            };
        }));

        // 按评分降序排序（高分在前）
        return itemsWithRating.sort((a, b) => {
            // 如果评分相同，按评分人数降序排序
            if (a.rating === b.rating) {
                return b.numRatings - a.numRatings;
            }
            return b.rating - a.rating;
        });
    } catch (error) {
        console.error('排序时出错:', error);
        return items; // 出错时返回原列表
    }
}

// ================================
// 事件设置函数
// ================================

/**
 * 设置搜索和分页事件
 */
function setupSearchAndPaginationEvents() {
    // 搜索框输入事件处理
    $w("#input1").onInput(async () => {
        const searchValue = $w("#input1").value;
        const dropdownValue = $w("#dropdown1").value;

        await updateRepeaterData(1, searchValue, dropdownValue);
    });

    // 分页器点击事件处理
    $w("#paginator, #paginator2").onClick(async (event) => {
        const pageNumber = event.target.currentPage;
        const searchValue = $w("#input1").value;
        const dropdownValue = $w("#dropdown1").value;
        await updateRepeaterData(pageNumber, searchValue, dropdownValue);
    });

    // 下拉菜单改变事件
    $w("#dropdown1").onChange(async () => {
        const searchValue = $w("#input1").value;
        const pageNumber = 1;
        const dropdownValue = $w("#dropdown1").value;
        await updateRepeaterData(pageNumber, searchValue, dropdownValue);
    });
}

/**
 * 设置提交按钮事件
 */
function setupSubmitButtonEvent() {
    $w("#submit").onClick(async () => {
        try {
            // 首先验证用户状态
            if (!currentUserId) {
                console.log('用户未登录');
                return;
            }
            
            if (!isUserVerified) {
                console.log('用户未验证，无法提交评论');
                return;
            }
            
            // 获取用户输入的数据
            const workNumber = parseInt($w("#inputNumber").value);
            const score = parseInt($w("#inputScore").value);
            const comment = $w("#Comment").value;

            // 验证输入
            const isWorkNumberValid = $w("#inputNumber").valid;
            const isScoreValid = $w("#inputScore").valid;
            const isWorkNumberInRange = workNumber >= 1 && workNumber <= 500;
            const isScoreInRange = score >= 100 && score <= 1000;

            // 额外检查：确保用户没有重复评论主评论（除非是作者自己）
            if (currentUserId) {
                // 先检查是否为作者自己的作品
                const workResults = await wixData.query("enterContest034")
                    .eq("sequenceId", workNumber)
                    .find();
                
                let isAuthor = false;
                if (workResults.items.length > 0) {
                    const workOwner = workResults.items[0]._owner;
                    isAuthor = (currentUserId === workOwner);
                }
                
                if (!isAuthor) {
                    // 如果不是作者，检查是否已经评论过
                    const existingComment = await wixData.query("BOFcomment")
                        .eq("workNumber", workNumber)
                        .eq("_owner", currentUserId)
                        .isEmpty("replyTo")  // 只检查主评论
                        .find();
                    
                    if (existingComment.items.length > 0) {
                        console.log('用户已经评论过这个作品，阻止重复提交');
                        return; // 阻止重复提交
                    }
                }
                // 如果是作者，允许多次评论，不进行重复检查
            }

            if (workNumber && score && comment && isWorkNumberValid && isScoreValid && isWorkNumberInRange && isScoreInRange) {
                // 创建新的数据对象
                let toInsert = {
                    "workNumber": workNumber,
                    "score": score,
                    "comment": comment
                };

                // 插入数据
                await wixData.insert("BOFcomment", toInsert);

                // 更新用户积分
                if (currentUserId) {
                    try {
                        await updateUserPoints(currentUserId, 1, false, false);
                    } catch (error) {
                        console.error('Error updating user points:', error);
                    }
                }

                // 清空输入框
                $w("#inputNumber").value = "";
                $w("#inputScore").value = "";
                $w("#Comment").value = "";

                // 重置提交按钮状态
                $w("#submit").enable();
                $w("#submit").label = "提交评论";
                $w("#Comment").enable();
                $w("#inputScore").enable();

                // 刷新数据和显示
                $w('#dataset1').refresh();
                
                // 统一刷新两个repeater
                await refreshRepeaters();
            }
        } catch (err) {
            console.error(err);
        }
    });
}

/**
 * 获取评分筛选勾选框状态
 */
function isScoreFilterEnabled() {
    try {
        return $w("#scoreCheckbox").checked;
    } catch (error) {
        console.error("获取勾选框状态失败:", error);
        return false;
    }
}

/**
 * 设置评分勾选框事件
 */
function setupScoreCheckboxEvent() {
    $w("#scoreCheckbox").onChange(async (event) => {
        try {
            // 获取勾选框的当前状态
            const isChecked = event.target.checked;
            console.log(`正式评论筛选已${isChecked ? '启用' : '禁用'}`);
            
            // 当勾选框状态改变时，重新加载当前显示的评论
            const dropdownFilterValue = $w("#dropdownFilter").value;
            
            if (dropdownFilterValue && dropdownFilterValue !== "114514") {
                // 如果选择了特定作品，重新加载该作品的评论
                await setDropdownValue(parseInt(dropdownFilterValue));
            } else if (dropdownFilterValue === "114514") {
                // 如果选择的是"我的评论"，重新加载用户评论
                await loadUserComments();
            } else {
                // 如果没有选择特定作品，显示所有作品的评论（支持正式评论筛选）
                await loadAllFormalComments();
            }
        } catch (error) {
            console.error("处理勾选框状态变化时出错:", error);
        }
    });
}

/**
 * 加载所有作品的正式评论
 */
async function loadAllFormalComments() {
    try {
        // 查询所有主评论（限制数量以提升性能）
        const results = await wixData.query("BOFcomment")
            .isEmpty("replyTo")  // 只获取主评论
            .descending("_createdDate")  // 按时间倒序，最新的在前
            .limit(500)  // 限制最多500条评论
            .find();
        
        let commentsToShow = results.items;
        
        // 如果勾选了正式评论筛选
        if (isScoreFilterEnabled()) {
            // 获取所有作品的所有者信息
            const allWorks = await wixData.query("enterContest034").find();
            const workOwnerMap = {};
            allWorks.items.forEach(work => {
                workOwnerMap[work.sequenceId] = work._owner;
            });
            
            // 过滤掉自评
            commentsToShow = results.items.filter(comment => {
                // 排除自评（评论者是作品所有者）
                const workOwnerId = workOwnerMap[comment.workNumber];
                return comment._owner !== workOwnerId;
            });
        }
        
        $w("#repeater1").data = commentsToShow;
        $w("#repeater1").forEachItem(($item, itemData, index) => {
            // 这里可以根据需要更新每个重复项内的元素
        });
        
        console.log(`已加载${commentsToShow.length}条${isScoreFilterEnabled() ? '正式' : ''}评论`);
    } catch (err) {
        console.error("加载所有评论失败", err);
    }
}

/**
 * 加载用户评论（考虑筛选状态）
 */
async function loadUserComments() {
    // 检查用户验证状态
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
        // 查询当前用户的所有评论
        const results = await wixData.query("BOFcomment")
            .eq("_owner", currentUserId)
            .ascending("_createdDate")
            .find();
        
        let commentsToShow = results.items;
        
        // 如果勾选了正式评论筛选
        if (isScoreFilterEnabled()) {
            // 获取所有作品的所有者信息
            const allWorks = await wixData.query("enterContest034").find();
            const workOwnerMap = {};
            allWorks.items.forEach(work => {
                workOwnerMap[work.sequenceId] = work._owner;
            });
            
            // 过滤掉自评和楼中楼
            commentsToShow = results.items.filter(comment => {
                // 排除楼中楼回复
                if (comment.replyTo) {
                    return false;
                }
                
                // 排除自评（评论者是作品所有者）
                const workOwnerId = workOwnerMap[comment.workNumber];
                if (comment._owner === workOwnerId) {
                    return false;
                }
                
                return true;
            });
        }
        
        $w("#repeater1").data = commentsToShow;
        $w("#repeater1").forEachItem(($item, itemData, index) => {
            // 这里可以根据需要更新每个重复项内的元素
        });
    } catch (err) {
        console.error("查询评论失败", err);
    }
}

/**
 * 设置下拉筛选器事件
 */
function setupDropdownFilterEvent() {
    $w("#dropdownFilter").onChange(async () => {
        let selectedValue = $w("#dropdownFilter").value;

        if (selectedValue === "114514") {
            // 加载用户评论（考虑筛选状态）
            await loadUserComments();
        } else if (selectedValue && selectedValue !== "") {
            // 选择了特定作品
            await setDropdownValue(parseInt(selectedValue));
        } else {
            // 没有选择或选择了空值，显示所有评论
            await loadAllFormalComments();
        }
    });
}