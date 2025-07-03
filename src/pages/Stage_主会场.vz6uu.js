import wixUsers from 'wix-users';
import wixData from 'wix-data';
import wixWindow from 'wix-window';
import { getMediaDownloadUrls, getFileDownloadUrlAndContent, getBatchDownloadUrls } from 'backend/getMediaDownloadUrls.jsw';
import { getCurrentMemberRoles } from 'backend/auditorRole';
import { getSheetDetails } from 'backend/auditorApproval';
import { updateUserPoints } from 'backend/forumPoints.jsw';

// 假设在页面全局范围内已经获取了评论计数
let commentsCountByWorkNumber = {};
const itemsPerPage = 20;
const maxApprovalCount = 5;
let titleValue;
// 获取当前用户ID
const currentUserId = wixUsers.currentUser.id;

$w.onReady(async function () {

    calculateProgress().then(progressValue => {
        // 发送数据给HTML组件
        $w('#progressbar2').postMessage(progressValue);

        // 根据进度值设置不同的提示信息
        let rewardMessage = "";
        if (progressValue >= 90) {
            rewardMessage = "您已经评论了绝大部分作品，小小蓝白会给予您800积分奖励~";
        } else if (progressValue >= 60) {
            rewardMessage = "您的评论已过大半，小小蓝白会给予您600积分奖励~";
        } else if (progressValue >= 40) {
            rewardMessage = "继续保持，现在可以结算200积分！";
        } else if (progressValue >= 20) {
            rewardMessage = "为了您的努力，现在可以结算100积分！";
        } else {
            rewardMessage = "评论更多作品可以获得积分奖励哦~最高可达800积分！";
        }

        // 更新文本组件显示进度和奖励信息
        $w('#text14').text = `您已经评论了${progressValue.toFixed(2)}%的作品。${rewardMessage}`;
    }).catch(error => {
        console.error('Error calculating progress:', error);
        // Handle any errors that occurred during calculateProgress
    });

    commentsCountByWorkNumber = await getAllCommentsCount();
    await updateRepeaterData(1);
    const currentUserIsAuditor = await isAuditor();

    $w('#repeater2').onItemReady(async ($item, itemData, index) => {
        const maidataUrl = itemData.inVideo的複本;
        const trackUrl = itemData.maidata的複本;
        const bgUrl = itemData.track的複本;
        const bgVideoUrl = itemData.上傳檔案欄; // 获取 "maidata的複本" 栏位的值
        const submitTime = itemData.submissionTime;
        const formattedSubmitTime = formatDate(submitTime);
        const checkboxChecked = itemData.核取方塊欄; // 获取 "核取方塊欄" 栏位的值

        // 获取下载 URL
        const downloadUrl = await getMediaDownloadUrls(maidataUrl, trackUrl, bgUrl, bgVideoUrl);

        $item("#button3").label = "Download";

        if (bgVideoUrl) {
            $item('#movie').show();
        } else {
            $item('#movie').hide();
        }

        if (currentUserIsAuditor || checkboxChecked) {
            $item('#button3').show(); // 显示
            $item('#button3').enable(); // 启用
            $item('#downloadAble').show();

        } else {
            $item('#button3').hide(); // 隐藏
            $item('#button3').disable(); // 禁用
        }

        // 处理 nomButton 的显示和隐藏
        if (currentUserIsAuditor) {
            $item('#nomButton').show();
            $item('#disButton').show();
        } else {
            $item('#nomButton').hide();
            $item('#disButton').hide();
        }

        $item('#submitTime').text = formattedSubmitTime;

        try {
            const { downloadUrl, fileContent } = await getFileDownloadUrlAndContent(maidataUrl);
            // const titlePattern = /&title=([^&]+)/;
            // const titleMatch = fileContent.match(titlePattern);

            // 解析文件内容，提取 lv_4, lv_5 和 lv_6 的值
            const lv4Pattern = /&lv_4=([\d+]+)/;
            const lv5Pattern = /&lv_5=([\d+]+)/;
            const lv6Pattern = /&lv_6=([\d+]+)/;
            const lv4Match = fileContent.match(lv4Pattern);
            const lv5Match = fileContent.match(lv5Pattern);
            const lv6Match = fileContent.match(lv6Pattern);

            if (lv4Match) {
                const lv4Value = lv4Match[1];
                $item('#LevelExpert').text = lv4Value;
            } else {
                $item('#LevelExpert').text = "";
            }

            if (lv5Match) {
                const lv5Value = lv5Match[1];
                $item('#LevelMaster').text = lv5Value;
            } else {
                $item('#LevelMaster').text = "";
            }

            // 新增：检查 lv_6 的匹配结果
            if (lv6Match) {
                const lv6Value = lv6Match[1];
                $item('#LevelRe').text = lv6Value;
            } else {
                $item('#LevelRe').text = "";
            }
        } catch (error) {
            console.error('Error fetching file content:', error);
        }
        $item("#progressBar").value = itemData.approvedBy.length / maxApprovalCount;

        const voteCount = adjustViewedCount(itemData.viewedCount);

        const realCount = voteCount + itemData.approvedBy.length;

        // 根据条件检查approvedBy的长度
        if (realCount >= maxApprovalCount) {
            // 如果approvedBy的长度大于等于最大批准数，显示“过了”
            $item("#approvalCountText").text = "Accepted";
        } else {
            // 否则，显示当前批准数和最大批准数
            $item("#approvalCountText").text = `${realCount} / ${maxApprovalCount}`;
        }

        $item('#button3').onClick(() => {
            $w('#htmlDownloadHelper').postMessage({ action: 'download', downloadUrl, titleValue });
            //console.log(downloadUrl);
        });

        $item('#checkText').onClick(() => {
            const descriptionText = $item('#descriptionBox').value; // 获取文本框的内容
            wixWindow.openLightbox("TextPopup", { content: descriptionText }); // 打开 Lightbox 并传递数据
        });

        // 更新审核按钮的状态
        await updateNomButtonStatus($item, itemData._id, checkboxChecked);
        // 检查进度条是否满格，如果是，则设置 item 容器的背景颜色为浅蓝色
        if (realCount >= maxApprovalCount) {
            $item("#box1").style.backgroundColor = 'rgba(135, 206, 235, 0.5)'; // 浅蓝色，透明度为 50%
        }

        const disCount = itemData.disBy.length;
        // 根据条件检查approvedBy的长度
        if (disCount >= 3 && currentUserIsAuditor) {
            // 如果approvedBy的长度大于等于最大批准数，显示“过了”
            $item("#approvalCountText").text = "寺了";
            $item('#nomButton').disable();
            $item('#disButton').disable();
        }

        $item('#nomButton').onClick(async () => {
            wixWindow.openLightbox('DeleteConfirmation').then(async (result) => {
                if (result === 'confirm') {

                    //这部分是把当前的审核ID推送进ApproveBy栏位
                    await approveSheet(itemData._id, currentUserId);
                    itemData.approvedBy.push(currentUserId);

                    //这部分是在推送ID之后，在前端页面上调节显示的数量
                    const voteCount = adjustViewedCount(itemData.viewedCount); //这句是大众点票显示 与审核无关
                    const realCount = voteCount + itemData.approvedBy.length;
                    const progressBarValue = realCount / maxApprovalCount;
                    $item("#progressBar").value = progressBarValue;
                    // 根据条件检查approvedBy的长度
                    if (realCount >= maxApprovalCount) {
                        // 如果approvedBy的长度大于等于最大批准数，显示“过了”
                        $item("#approvalCountText").text = "Accepted";
                    } else {
                        // 否则，显示当前批准数和最大批准数
                        $item("#approvalCountText").text = `${realCount} / ${maxApprovalCount}`;
                    }
                    $item('#nomButton').disable();

                    // 检查进度条是否满格，如果是，则设置 item 容器的背景颜色为浅蓝色
                    if (realCount >= maxApprovalCount) {
                        $item("#box1").style.backgroundColor = 'rgba(135, 206, 235, 0.5)'; // 浅蓝色，透明度为 50%
                    }

                }
            });
        });

        $item('#disButton').onClick(async () => {

            wixWindow.openLightbox('DeleteConfirmation').then(async (result) => {
                if (result === 'confirm') {

                    //这部分是把当前的审核ID推送进ApproveBy栏位
                    await disSheet(itemData._id, currentUserId);
                    itemData.disBy.push(currentUserId);
                    const disCount = itemData.disBy.length;
                    // 根据条件检查approvedBy的长度
                    if (disCount >= 3) {
                        // 如果approvedBy的长度大于等于最大批准数，显示“过了”
                        $item("#approvalCountText").text = "寺了";
                    }
                    else{
                        $item("#approvalCountText").text = "dis过了";
                    }
                    $item('#disButton').disable();
                    $item('#nomButton').disable();

                }
            });

        });

        $item('#buttonViewed').onClick(async () => {
            wixWindow.openLightbox('DeleteConfirmation').then(async (result) => {
                if (result === 'confirm') {
                    const viewedCount = await markSheetAsViewed(itemData._id, currentUserId);

                    if (viewedCount !== null) {
                        // 更新进度条显示的查看人数
                        $item("#progressBar1").value = viewedCount; // 确保你已经将progressBar添加到页面，并设置其id为progressBar

                        // 更新按钮状态和样式
                        $item("#buttonViewed").disable();
                        $item("#buttonViewed").label = "已查看";
                        $item("#buttonViewed").style.backgroundColor = "#D3D3D3";

                        // 如果需要，可以同时更新文字说明，显示查看人数
                        $item("#viewedNumber").text = viewedCount.toString() + " 人已顶";
                    }
                }
            });
        });

        $item("#vectorImage2").onClick(() => {
            // 这里获取当前项的sequenceId，并设置到下拉菜单中
            setDropdownValue(itemData.sequenceId);
        });

    });

    // // 切换器状态改变事件处理
    // $w("#approvalToggle").onChange(() => {
    //     const searchValue = $w("#input1").value; // 获取搜索框的当前值
    //     const currentPage = 1; // 当切换器状态改变时，重置为第一页
    //     updateRepeaterData(currentPage, searchValue, $w("#approvalToggle").checked); // 更新数据，包括排序状态
    // });

    // 搜索框输入事件处理
    $w("#input1").onInput(() => {
        const searchValue = $w("#input1").value; // 获取搜索框的当前值
        //const sortByApproval = $w("#approvalToggle").checked; // 获取切换器的当前状态
        const dropdownValue = $w("#dropdown1").value; // Get the dropdown's current value
        let sortByApproval = false;

        if (dropdownValue === "vote") {
            sortByApproval = true;
        }
        updateRepeaterData(1, searchValue, sortByApproval, dropdownValue); // 更新数据，包括排序状态
    });

    // 分页器点击事件处理
    $w("#paginator, #paginator2").onClick(async (event) => {
        const pageNumber = event.target.currentPage; // 获取当前选中的页码
        const searchValue = $w("#input1").value; // 获取搜索框的当前值
        //const sortByApproval = $w("#approvalToggle").checked; // 获取切换器的当前状态
        const dropdownValue = $w("#dropdown1").value; // Get the dropdown's current value
        let sortByApproval = false;

        if (dropdownValue === "vote") {
            sortByApproval = true;
        }
        await updateRepeaterData(pageNumber, searchValue, sortByApproval, dropdownValue); // 更新数据，包括排序状态
    });

    try {
        // 对于repeater的每一个item，更新背景和获取作者名
        $w("#repeater1").onItemReady(async ($item, itemData, index) => {
            const score = parseInt(itemData.score);
            const redAmount = Math.floor(score / 1000 * 255);
            $item("#showBackground").style.backgroundColor = `rgb(${redAmount}, 0, 0)`;

            const ratingData = await getRatingData(itemData.workNumber);
            var averageScore = ratingData.averageScore;
            var newRating = (averageScore - 0) / (1000 - 0) * (5.0 - 1.0) + 1.0;

            $item("#ratingsDisplay").rating = newRating;
            $item("#ratingsDisplay").numRatings = ratingData.numRatings;

            const results = await wixData.query("enterContest034")
                .eq("sequenceId", itemData.workNumber)
                .find();

            if (results.items.length > 0) {
                const contestItem = results.items[0];
                const contestOwnerId = contestItem._owner;
                $item("#text15").text = contestItem.firstName; // Set the firstName in the text element

                if (itemData._owner === contestOwnerId) {
                    // 更改为作者评论的浅蓝色背景图片
                    $item("#container3").background.src = "https://static.wixstatic.com/media/daf9ba_082e7daf94dc49d3bcdb3ba491854fd5~mv2.jpg";
                }
            } else {
                $item("#text15").text = "Unknown"; // Default text if there's no match
            }

            $item('#checkText2').onClick(() => {
                const descriptionText = $item('#CommentBox').value; // 获取文本框的内容
                // console.log(descriptionText);
                wixWindow.openLightbox("TextPopup", { content: descriptionText }); // 打开 Lightbox 并传递数据
            });

            $item("#goUp").onClick(() => {
                // 获取当前项目中text15元素的文本
                const textValue = $item("#text15").text;
                // 将获取的文本值设置到搜索栏中
                $w("#input1").value = textValue;

                // 获取搜索栏的当前值
                const searchValue = $w("#input1").value;
                // 获取切换器的当前状态
                //const sortByApproval = $w("#approvalToggle").checked;
                // 基于当前的搜索值和切换器状态更新repeater数据

                const dropdownValue = $w("#dropdown1").value; // Get the dropdown's current value
                let sortByApproval = false;

                if (dropdownValue === "vote") {
                    sortByApproval = true;
                }
                updateRepeaterData(1, searchValue, sortByApproval, dropdownValue);
            });
        });
    } catch (err) {
        console.error(err);
    }

    // 点击提交按钮
    $w("#submit").onClick(async () => {
        try {
            // 获取用户输入的作品编号、评分和评论
            const workNumber = parseInt($w("#inputNumber").value);
            const score = parseInt($w("#inputScore").value);
            const comment = $w("#Comment").value;

            // 检查输入值的状态是否为“错误”
            const isWorkNumberValid = $w("#inputNumber").valid;
            const isScoreValid = $w("#inputScore").valid;

            // 检查输入值的范围是否合法
            const isWorkNumberInRange = workNumber >= 1 && workNumber <= 500; // 根据实际范围调整
            const isScoreInRange = score >= 100 && score <= 1000; // 根据实际范围调整

            // 确保用户输入了所有需要的数据，并且输入值状态为“有效”，并且范围合法
            if (workNumber && score && comment && isWorkNumberValid && isScoreValid && isWorkNumberInRange && isScoreInRange) {
                // 创建一个新的数据对象
                let toInsert = {
                    "workNumber": workNumber,
                    "score": score,
                    "comment": comment
                };

                // 插入新数据到数据集中
                await wixData.insert("BOFcomment", toInsert);

                if (currentUserId) {
                    updateUserPoints(currentUserId, 1, false, false) // 假设发评论奖励10分
                        .catch((error) => {
                            console.error('Error updating user points:', error);
                        });
                }

                // 清空输入框
                $w("#inputNumber").value = "";
                $w("#inputScore").value = "";
                $w("#Comment").value = "";

                // 刷新数据集及其关联的 repeater
                $w('#dataset1').refresh();
                await loadData();
            } else {
                console.log("Please fill in all the fields correctly and ensure the values are within the allowed range.");
            }
        } catch (err) {
            console.error(err);
        }
    });

    // 获取已过审的谱面
    const approvedSheets = await getApprovedSheets();

    // 设置已过审的谱面的数量
    $w('#approvedSheetsCount').text = `已过审的谱面数量：${approvedSheets.length}`;

    // 设置下拉菜单的选项
    const dropdownOptions = approvedSheets.map(sheet => {
        return { label: sheet.sequenceId + ' ' + sheet.firstName, value: sheet.workNumber }; // 假设谱面有 title 和 id 属性
    });
    $w('#approvedSheetsDropdown').options = dropdownOptions;

    await loadData();

    $w("#dropdownFilter").onChange(() => {
        let selectedValue = $w("#dropdownFilter").value;

        if (selectedValue === "114514") {
            //console.log("查询当前用户的评论"); // 调试消息
            // 查询BOFcomment数据集，找出当前用户的评论
            wixData.query("BOFcomment")
                .eq("_owner", currentUserId)
                .find()
                .then((results) => {
                    // 确保查询结果以正确的形式传递给Repeater
                    $w("#repeater1").data = results.items;
                    // 强制Repeater刷新以显示新数据
                    $w("#repeater1").forEachItem(($item, itemData, index) => {
                        // 这里可以根据需要更新每个重复项内的元素
                        // 例如，如果有一个文本元素显示评论内容，可以如下设置它的文本：
                        // $item("#textElementId").text = itemData.commentField;
                    });
                })
                .catch((err) => {
                    console.error("查询评论失败", err);
                });

        } else {
            //待定
        }
    });

    $w("#dropdown1").onChange(() => {
        const searchValue = $w("#input1").value;
        const pageNumber = 1; // Reset to the first page
        const dropdownValue = $w("#dropdown1").value; // Get the dropdown's current value
        let sortByApproval = false;

        if (dropdownValue === "vote") {
            sortByApproval = true;
        }

        // Call the function with the dropdown value
        updateRepeaterData(pageNumber, searchValue, sortByApproval, dropdownValue);
    });

});

async function updateRepeaterData(pageNumber, searchValue, sortByApproval = false, dropdownValue) {
    $w('#loadingSpinner').show();

    let query = wixData.query('enterContest034');

    if (searchValue) {
        query = query.contains('firstName', searchValue).or(query.eq('sequenceId', Number(searchValue)));
    }

    let results;
    results = await query.limit(1000).find();

    const options = [
        { "label": "Please Choose ID", "value": "" } // 添加默认选项
    ].concat(results.items.map(item => {
        return { "label": item.sequenceId + " - " + item.firstName, "value": item.sequenceId.toString() };
    }));

    // 将数据填充到下拉菜单
    $w("#inputNumber").options = options;
    $w("#dropdownFilter").options = options;

    let items = results.items.map(item => {
        const approvedBy = item.approvedByString ? JSON.parse(item.approvedByString) : [];
        const viewedBy = item.viewedBy ? JSON.parse(item.viewedBy) : []; // 获取查看过该项目的用户ID列表
        const disBy = item.disByString ? JSON.parse(item.disByString) : []; // 获取执行 'dis' 操作的用户ID列表

        return {
            ...item,
            approvedBy: approvedBy,
            approvalCount: approvedBy.length,
            disBy: disBy,
            viewedCount: viewedBy.length // 添加查看人数字段
        };

    });

    // 应用团队排序
    if (dropdownValue === "team") {
        items.sort((a, b) => (a.簡短答案欄2 || "").localeCompare(b.簡短答案欄2 || ""));
    }

    if (sortByApproval) {
        items.sort((a, b) => {
            // 使用辅助函数获取调整后的viewedCount值
            const adjustedViewedCountA = adjustViewedCount(a.viewedCount);
            const adjustedViewedCountB = adjustViewedCount(b.viewedCount);

            // 计算总数
            const totalA = a.approvalCount + adjustedViewedCountA;
            const totalB = b.approvalCount + adjustedViewedCountB;

            // 首先根据总数进行降序排序
            if (totalB !== totalA) {
                return totalB - totalA;
            }

            // 如果总数相同，次要排序基于调整后的viewedCount（降序）
            return b.viewedCount - a.viewedCount;
        });
    }

    const totalPages = Math.ceil(items.length / itemsPerPage);
    $w('#paginator').totalPages = totalPages;
    $w('#paginator').currentPage = pageNumber;
    $w('#paginator2').totalPages = totalPages;
    $w('#paginator2').currentPage = pageNumber;

    // 应用分页
    const startIndex = (pageNumber - 1) * itemsPerPage;
    const pagedItems = items.slice(startIndex, startIndex + itemsPerPage);

    $w('#repeater2').data = pagedItems;
    $w('#loadingSpinner').hide();

    // 更新重复器中的元素以显示查看人数
    $w('#repeater2').forEachItem(($item, itemData, index) => {
        // 获取当前项目的评论计数
        const commentCount = commentsCountByWorkNumber[itemData.sequenceId] || 0;
        // 更新元素以显示评论计数
        $item('#Commments').text = `${commentCount}`;
        // 更新元素以显示查看人数
        $item('#viewedNumber').text = `${itemData.viewedCount} 人已顶`;
        // 更新进度条显示查看人数
        $item("#progressBar1").value = itemData.viewedCount;

        // 根据'簡短答案欄2'的值设置Box组件的背景颜色
        const teamMarkColor = getTeamMarkColor(itemData['簡短答案欄2']); // 假设已定义函数getTeamMarkColor
        $item('#teamMark').style.backgroundColor = teamMarkColor; // 确保Box组件的ID是正确的，这里用'teamMark'

    });

}

function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
}

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

async function isAuditor() {
    if (wixUsers.currentUser.loggedIn) {
        const userRoles = await getCurrentMemberRoles();
        return userRoles.some(role => role.title === '海选组');
    }
    return false;
}

async function approveSheet(sheetId, auditorId) {
    try {
        // 获取当前项的数据
        const currentItemResult = await wixData.query('enterContest034').eq('_id', sheetId).find();
        let currentItem = currentItemResult.items[0];

        let approvedBy = currentItem.approvedByString ? JSON.parse(currentItem.approvedByString) : [];

        if (!approvedBy.includes(auditorId)) {
            approvedBy.push(auditorId);
        }
        currentItem.approvedByString = JSON.stringify(approvedBy);

        // 使用 wixData.update 更新整个项目
        await wixData.update('enterContest034', currentItem);

    } catch (error) {
        console.error(error);
    }
}

async function disSheet(sheetId, disId) {
    try {
        // 获取当前项的数据
        const currentItemResult = await wixData.query('enterContest034').eq('_id', sheetId).find();
        let currentItem = currentItemResult.items[0];

        // 获取现有的 disByString 字段数据，并解析为数组
        let disBy = currentItem.disByString ? JSON.parse(currentItem.disByString) : [];

        // 如果 disId 不在 disBy 数组中，表示该用户尚未进行过 'dis' 操作
        if (!disBy.includes(disId)) {
            disBy.push(disId); // 将 disId 添加到 disBy 数组中
        }

        currentItem.disByString = JSON.stringify(disBy);

        await wixData.update('enterContest034', currentItem);

    } catch (error) {
        console.error(error); // 如果出现错误，输出错误信息
    }
}

async function markSheetAsViewed(sheetId, userId) {
    try {
        const currentItemResult = await wixData.query('enterContest034').eq('_id', sheetId).find();
        let currentItem = currentItemResult.items[0];
        let viewedBy = currentItem.viewedBy ? JSON.parse(currentItem.viewedBy) : [];
        let viewedCount = viewedBy.length; // 获取当前的查看人数

        if (!viewedBy.includes(userId)) {
            viewedBy.push(userId);
            currentItem.viewedBy = JSON.stringify(viewedBy);
            await wixData.update('enterContest034', currentItem);
            viewedCount = viewedBy.length; // 更新查看人数
        }

        return viewedCount; // 返回更新后的查看人数
    } catch (error) {
        console.error('Error marking sheet as viewed:', error);
        return null; // 发生错误时返回null
    }
}

async function updateNomButtonStatus($item, sheetId, checkboxChecked) {
    const sheetDetails = await getSheetDetails(sheetId); // 使用itemData来获取sheetId
    const hasViewed = sheetDetails.viewedBy.includes(currentUserId);

    // 根据用户是否已查看来更新#buttonViewed状态
    if (hasViewed) {
        $item('#buttonViewed').disable();
    } else {
        $item('#buttonViewed').enable();
    }
    $item('#buttonViewed').show();
    $item('#viewedNumber').show();

    if (await isAuditor()) {
        // 获取已审核过及已查看过此谱面的列表
        const hasApproved = sheetDetails.approvedBy.includes(currentUserId);
        const hasDis = sheetDetails.disBy.includes(currentUserId);

        // 如果已经点过或者dis过，则禁用两个按钮
        if (hasApproved || hasDis) {
            $item('#nomButton').disable();
            $item('#disButton').disable();

            // 显示已经执行的操作
            if (hasApproved) {
                $item("#approvalCountText").text = "你点过";
            } else if (hasDis) {
                $item("#approvalCountText").text = "你dis过";
            }
        } else {
            // 如果都没有做过任何操作，则启用两个按钮
            $item('#nomButton').enable();
            $item('#disButton').enable();
        }

        // 显示按钮
        $item('#nomButton').show();
        $item('#disButton').show();
    } else {
        // 如果当前用户不是审核员，则隐藏这些按钮
        $item('#nomButton').hide();
        $item('#disButton').hide();
    }




    if (await isAuditor() || checkboxChecked) {
        $item('#button3').enable();
        $item('#button3').show();
        // 如果有相关联的元素需要显示

    } else {
        $item('#button3').disable();
        $item('#button3').hide();
        // 如果需要，隐藏相关联的元素

    }

    if (checkboxChecked) {

        $item('#downloadAble').show(); // 假设有一个与下载相关的元素需要在这种情况下显示
    } else {
        $item('#downloadAble').hide(); // 假设需要在按钮隐藏时同样隐藏这个元素
    }
}

async function getRatingData(workNumber) {
    // 查询指定作品编号的所有评分
    const results = await wixData.query("BOFcomment")
        .eq("workNumber", workNumber)
        .find();

    // 计算评分数量
    const numRatings = results.items.length;

    // 计算平均评分
    const totalScore = results.items.reduce((total, item) => total + item.score, 0);
    const averageScore = totalScore / numRatings;

    return {
        numRatings,
        averageScore
    };
}

//这个只是用于获取过审谱面，只与大众点票+审核有关
async function getApprovedSheets() {
    const maxApprovalCount = 5; // 设置需要的最小审批数量为 5
    const pageSize = 500; // 设置每页返回的最大项目数

    let approvedSheets = [];

    // 只查询第一页
    const results = await wixData.query('enterContest034')
        .limit(pageSize)
        .find();

    approvedSheets = results.items.filter(item => {
        // 尝试将 approvedByString 从字符串转换为数组
        let approvedByArray;
        try {
            approvedByArray = JSON.parse(item.approvedByString);
        } catch (error) {
            return false;
        }

        // 尝试将 viewedBy 从字符串转换为数组，并处理它的长度
        let viewedByArray;
        try {
            viewedByArray = JSON.parse(item.viewedBy);
        } catch (error) {
            return false;
        }

        // 处理viewedBy数组的长度
        let adjustedViewedCount;
        try {
            if (Array.isArray(viewedByArray)) {
                adjustedViewedCount = adjustViewedCount(viewedByArray.length);
            } else {
                return false;
            }
        } catch (error) {
            return false;
        }

        // 计算转换后的approvedBy长度与adjustedViewedCount的和是否满足条件
        return (approvedByArray.length + adjustedViewedCount) >= maxApprovalCount;
    });

    return approvedSheets;
}

//HTML表格部分分数显示
async function loadData() {
    const commentsCountByWorkNumber = await getAllCommentsCount();

    let totalItems = [];
    let hasMore = true;
    let skipCount = 0;

    // 仍然需要收集所有评论来计算平均分数
    while (hasMore) {
        await wixData.query('BOFcomment')
            .skip(skipCount)
            .find()
            .then(res => {
                totalItems = totalItems.concat(res.items);
                skipCount += res.items.length;
                hasMore = res.items.length > 0;
            })
            .catch(err => {
                console.error('Error fetching data:', err);
                hasMore = false;
            });
    }

    // 累计每个作品的所有分数，并计算平均分
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
            score: averageScore, // 使用计算出的平均分
            commentCount: commentsCountByWorkNumber[workNumber] // 直接使用已获取的评论数
        };
    });

    const workNumbers = uniqueItems.map(item => item.workNumber);
    const scores = uniqueItems.map(item => item.score); // 现在是平均分数
    const commentsCounts = uniqueItems.map(item => item.commentCount);

    $w('#html2').postMessage({
        workNumbers: workNumbers,
        scores: scores,
        commentsCounts: commentsCounts
    });
}

async function getAllCommentsCount() {
    let commentsCountByWorkNumber = {};
    let hasMore = true;
    let skipCount = 0;

    while (hasMore) {
        await wixData.query('BOFcomment')
            .skip(skipCount)
            .find()
            .then(res => {
                res.items.forEach(item => {
                    if (commentsCountByWorkNumber[item.workNumber]) {
                        commentsCountByWorkNumber[item.workNumber] += 1;
                    } else {
                        commentsCountByWorkNumber[item.workNumber] = 1;
                    }
                });
                skipCount += res.items.length;
                hasMore = res.items.length > 0;
            })
            .catch(err => {
                console.error('Error fetching data:', err);
                hasMore = false;
            });
    }

    return commentsCountByWorkNumber;
}

async function getUserCommentsCount(userId, maxSequenceId) {
    if (!userId) {
        console.error('No user ID provided');
        return 0;
    }

    let hasMore = true;
    let skipCount = 0;
    const limit = 50;
    const commentedWorkNumbers = new Set();

    while (hasMore) {
        const userCommentsResults = await wixData.query('BOFcomment')
            .eq('_owner', userId)
            .limit(limit)
            .skip(skipCount)
            .find();

        userCommentsResults.items.forEach(item => {
            if (item.workNumber <= maxSequenceId) {
                commentedWorkNumbers.add(item.workNumber);
            }
        });

        if (userCommentsResults.items.length < limit) {
            hasMore = false;
        } else {
            skipCount += limit;
        }
    }

    return commentedWorkNumbers.size;
}

function setDropdownValue(sequenceId) {
    // 假设#dropdownFilter的选项值与sequenceId相匹配
    $w("#dropdownFilter").value = sequenceId.toString();

    wixData.query("BOFcomment")
        .eq("workNumber", sequenceId) // 假设你想根据workNumber字段查询
        .find()
        .then((results) => {
            // 查询成功，使用查询结果更新Repeater
            $w("#repeater1").data = results.items;
            // 以下代码为可选，仅在需要根据查询结果更新每个项内部元素时使用
            $w("#repeater1").forEachItem(($item, itemData, index) => {
                // 这里可以根据需要更新每个重复项内的元素
                // 例如，如果有一个文本元素显示评论内容，可以如下设置它的文本：
                // $item("#textElementId").text = itemData.commentField;
            });
        })
        .catch((err) => {
            console.error("查询失败", err);
        });
}

async function calculateProgress() {
    try {
        // 首先获取sequenceId的最大值
        const maxWorksResult = await wixData.query('enterContest034')
            .descending("sequenceId")
            .limit(1)
            .find();

        let maxSequenceId = 0;
        if (maxWorksResult.items.length > 0) {
            maxSequenceId = maxWorksResult.items[0].sequenceId;
        }
        // 获取用户评论的作品数量（基于maxSequenceId过滤）
        const userCommentsCount = await getUserCommentsCount(currentUserId, maxSequenceId);

        // 获取总作品数量
        const totalWorksCount = await wixData.query('enterContest034').count();

        // 计算进度百分比
        const progressValue = (userCommentsCount / totalWorksCount) * 100;

        //console.log(`User Comments Progress: ${progressValue}%`);

        // 如果需要，可以在这里返回进度值或进行其他操作
        return progressValue;
    } catch (err) {
        console.error(err);
        // 处理错误情况或返回错误指示
    }
}

function getTeamMarkColor(teamName) {
    let hash = 0;
    for (let i = 0; i < teamName.length; i++) {
        hash = teamName.charCodeAt(i) + ((hash << 5) - hash); // 简单的哈希函数
        hash = hash & hash; // Convert to 32bit integer
    }
    hash = Math.abs(hash); // 确保哈希值是正数
    // 生成颜色代码，格式为 '#xxxxxx'
    return '#' + (hash % 0xFFFFFF).toString(16).padStart(6, '0');
}

// 辅助函数，用来根据viewedCount的值返回调整后的计数
function adjustViewedCount(viewedCount) {
    if (viewedCount >= 20) {
        return 2;
    } else if (viewedCount >= 10) {
        return 1;
    } else {
        return 0;
    }
}

/***
 * Code added by AI Assistant
 * Prompt: Clicking on it will pop up a bubble to view the full contents of the textbox #descriptionBox
 ***/