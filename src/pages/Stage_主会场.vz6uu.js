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

// ================================
// 页面初始化
// ================================
$w.onReady(async function () {
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
        
        // 设置事件监听器
        setupItemEventListeners($item, itemData, downloadUrl);
    });

    // 设置重复器1的onItemReady事件（评论显示）
    $w("#repeater1").onItemReady(async ($item, itemData, index) => {
        // 设置评分背景颜色
        const score = parseInt(itemData.score);
        const redAmount = Math.floor(score / 1000 * 255);
        $item("#showBackground").style.backgroundColor = `rgb(${redAmount}, 0, 0)`;

        // 获取并显示评分数据
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

        // 获取并显示作者信息
        await displayAuthorInfo($item, itemData);
        
        // 设置删除评论按钮权限
        if (currentUserId) {
            try {
                // 使用后端API检查用户是否为海选组成员
                const isSeaSelectionMember = await checkIsSeaSelectionMember();
                if (isSeaSelectionMember) {
                    // 海选组成员显示并启用删除按钮
                    $item("#deleteComment").show();
                    $item("#deleteComment").enable();
                
                    // 设置删除按钮事件
                    $item("#deleteComment").onClick(async () => {
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
                                    const dropdownValue = $w("#dropdownFilter").value;
                                    if (dropdownValue && dropdownValue !== "114514") {
                                        await setDropdownValue(parseInt(dropdownValue));
                                    }
                                    
                                    // 更新评论计数和数据
                                    commentsCountByWorkNumber = await getAllCommentsCount();
                                    await loadData();
                                    
                                                    // 刷新repeater2显示
                const currentPage = $w('#paginator').currentPage || 1;
                const searchValue = $w("#input1").value;
                const mainDropdownValue = $w("#dropdown1").value;
                await updateRepeaterData(currentPage, searchValue, mainDropdownValue);
                                } else {
                                    console.error('删除评论失败:', deleteResult.message);
                                }
                            } catch (error) {
                                console.error('删除评论时发生错误:', error);
                            }
                        }
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
        } else {
            // 未登录用户隐藏并禁用删除按钮
            $item("#deleteComment").hide();
            $item("#deleteComment").disable();
        }
        
        // 设置评论查看事件
        $item('#checkText2').onClick(() => {
            const descriptionText = $item('#CommentBox').value;
            wixWindow.openLightbox("TextPopup", { content: descriptionText });
        });

        // 设置搜索作者事件
        $item("#goUp").onClick(async () => {
            const textValue = $item("#text15").text;
            $w("#input1").value = textValue;

            const searchValue = $w("#input1").value;
            const dropdownValue = $w("#dropdown1").value;
            let sortByApproval = false;

            if (dropdownValue === "vote") {
                sortByApproval = true;
            }
            await updateRepeaterData(1, searchValue, sortByApproval, dropdownValue);
        });
    });
    
    // 初始化数据
    await updateRepeaterData(1, "", "");
    
    // 设置搜索和分页事件
    setupSearchAndPaginationEvents();
    
    // 设置提交按钮事件
    setupSubmitButtonEvent();
    
    // 设置下拉筛选器事件
    setupDropdownFilterEvent();
    
    // 加载数据
    await loadData();
});

// ================================
// 初始化函数
// ================================



// ================================
// 重复器设置函数
// ================================



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
        let sortByApproval = false;

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
            // 获取用户输入的数据
            const workNumber = parseInt($w("#inputNumber").value);
            const score = parseInt($w("#inputScore").value);
            const comment = $w("#Comment").value;

            // 验证输入
            const isWorkNumberValid = $w("#inputNumber").valid;
            const isScoreValid = $w("#inputScore").valid;
            const isWorkNumberInRange = workNumber >= 1 && workNumber <= 500;
            const isScoreInRange = score >= 100 && score <= 1000;

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

                // 刷新数据和显示
                $w('#dataset1').refresh();
                await loadData();
                
                // 更新评论计数
                commentsCountByWorkNumber = await getAllCommentsCount();
                
                // 刷新repeater2显示以更新评分信息
                const currentPage = $w('#paginator').currentPage || 1;
                const searchValue = $w("#input1").value;
                const dropdownValue = $w("#dropdown1").value;
                await updateRepeaterData(currentPage, searchValue, dropdownValue);
            }
        } catch (err) {
            console.error(err);
        }
    });
}

/**
 * 设置下拉筛选器事件
 */
function setupDropdownFilterEvent() {
    $w("#dropdownFilter").onChange(async () => {
        let selectedValue = $w("#dropdownFilter").value;

        if (selectedValue === "114514") {
            try {
                // 查询当前用户的评论
                const results = await wixData.query("BOFcomment")
                    .eq("_owner", currentUserId)
                    .find();
                
                $w("#repeater1").data = results.items;
                $w("#repeater1").forEachItem(($item, itemData, index) => {
                    // 这里可以根据需要更新每个重复项内的元素
                });
            } catch (err) {
                console.error("查询评论失败", err);
            }
        } else {
            // 待定
        }
    });
}

// ================================
// 辅助函数
// ================================

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
        wixWindow.openLightbox("TextPopup", { content: descriptionText });
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
 * 获取评分数据
 */
async function getRatingData(workNumber) {
    const results = await wixData.query("BOFcomment")
        .eq("workNumber", workNumber)
        .find();

    const numRatings = results.items.length;
    const totalScore = results.items.reduce((total, item) => total + item.score, 0);
    const averageScore = totalScore / numRatings;

    return {
        numRatings,
        averageScore
    };
}

/**
 * 加载数据到HTML表格
 */
async function loadData() {
    const commentsCountByWorkNumber = await getAllCommentsCount();

    let totalItems = [];
    let hasMore = true;
    let skipCount = 0;

    // 收集所有评论来计算平均分数
    while (hasMore) {
        try {
            const res = await wixData.query('BOFcomment')
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

    // 计算每个作品的平均分
    const scoresSum = totalItems.reduce((acc, item) => {
        if (!acc[item.workNumber]) acc[item.workNumber] = { totalScore: 0, count: 0 };
        acc[item.workNumber].totalScore += item.score;
        acc[item.workNumber].count += 1;
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

    const workNumbers = uniqueItems.map(item => item.workNumber);
    const scores = uniqueItems.map(item => item.score);
    const commentsCounts = uniqueItems.map(item => item.commentCount);

    $w('#html2').postMessage({
        workNumbers: workNumbers,
        scores: scores,
        commentsCounts: commentsCounts
    });
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
        const results = await wixData.query("BOFcomment")
            .eq("workNumber", sequenceId)
            .find();
        
        $w("#repeater1").data = results.items;
        $w("#repeater1").forEachItem(($item, itemData, index) => {
            // 这里可以根据需要更新每个重复项内的元素
        });
    } catch (err) {
        console.error("查询失败", err);
    }
}





/**
 * 更新作品评分显示
 */
async function updateItemEvaluationDisplay($item, itemData) {
    try {
        const workNumber = itemData.sequenceId;
        
        // 查询该作品的所有评分
        const results = await wixData.query("BOFcomment")
            .eq("workNumber", workNumber)
            .find();
        
        const evaluations = results.items;
        const evaluationCount = evaluations.length;
        
        if (evaluationCount > 0) {
            // 计算平均分
            const totalScore = evaluations.reduce((sum, item) => sum + item.score, 0);
            const averageScore = totalScore / evaluationCount;
            
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
 * 基于评分对作品进行排序
 * @param {Array} items - 作品列表
 * @returns {Promise<Array>} 排序后的作品列表
 */
async function sortByRating(items) {
    try {
        // 为每个作品获取评分数据
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