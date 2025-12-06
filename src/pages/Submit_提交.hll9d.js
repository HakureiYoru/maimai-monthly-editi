import wixData from 'wix-data';
import wixUsers from 'wix-users';
import { getCurrentMemberRoles } from 'backend/auditorManagement.jsw';
import { getUserInfoBySlug, getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';
import { getFileDownloadUrlAndContent } from 'backend/mediaManagement.jsw'; // 确保导入函数
import { fetch } from 'wix-fetch';

const MAX_UPLOAD_SIZE_MB = 20;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

async function isAdmin() {
    if (wixUsers.currentUser.loggedIn) {
        const userRoles = await getCurrentMemberRoles();
        return userRoles.some(role => role.title === 'Admin');
    }
    return false;
}

// 初始化提交须知通知面板
function initSubmitNotification() {
    try {
        // 初始时隐藏面板
        $w("#notification").hide();
        
        // 监听来自HTML元件的消息
        $w("#notification").onMessage((event) => {
            const action = event.data.action;
            
            if (action === 'closeNotification') {
                // 关闭通知面板
                closeSubmitNotification();
            }
        });
    } catch (error) {
        console.error("初始化提交须知面板失败:", error);
    }
}

// 显示提交须知面板
function showSubmitNotification() {
    try {
        $w("#notification").show();
    } catch (error) {
        console.error("显示提交须知面板失败:", error);
    }
}

// 关闭提交须知面板
function closeSubmitNotification() {
    try {
        $w("#notification").hide();
    } catch (error) {
        console.error("关闭提交须知面板失败:", error);
    }
}

// 限制上传文件体积，超出后重置选择
function initUploadButtonSizeGuard() {
    try {
        const uploadButton = $w("#uploadButton1");
        const defaultLabel = uploadButton.buttonLabel;

        uploadButton.onChange(() => {
            const files = uploadButton.value || [];
            const oversizedFile = files.find(file => (file?.size || 0) > MAX_UPLOAD_SIZE_BYTES);

            if (oversizedFile) {
                const sizeInMB = (oversizedFile.size / (1024 * 1024)).toFixed(1);
                uploadButton.reset(); // 清除超限文件，阻止上传
                uploadButton.buttonLabel = `文件需小于${MAX_UPLOAD_SIZE_MB}MB`;
                console.warn(`文件过大已阻止上传: ${oversizedFile.name || oversizedFile.fileName || "unknown"} (${sizeInMB}MB)`);

                setTimeout(() => {
                    uploadButton.buttonLabel = defaultLabel;
                }, 3000);
            } else {
                uploadButton.buttonLabel = defaultLabel;
            }
        });
    } catch (error) {
        console.warn("未找到 #uploadButton1，跳过文件大小限制", error);
    }
}

$w.onReady(async function () {
    const isUserAdmin = await isAdmin(); 
    const currentUserId = wixUsers.currentUser.id;
    
    // 初始化提交须知通知面板
    initSubmitNotification();

    // 限制 #uploadButton1 上传文件体积
    initUploadButtonSizeGuard();
    
    // 页面加载时自动显示通知
    setTimeout(() => {
        showSubmitNotification();
    }, 500);
    
    // 设置重新打开通知按钮的点击事件
    try {
        $w("#openNotification").onClick(() => {
            showSubmitNotification();
        });
    } catch (error) {
        console.log("openNotification 按钮未找到或未配置");
    }
    
    // 逻辑流程：管理员 → 是否报名 → 是否重复提交
    if (isUserAdmin) {
        // 1. 管理员：直接启用提交
        $w("#button1").enable();
        $w("#button1").label = "提交（管理员）";
    } else {
        // 2. 普通用户：先检查是否报名
        try {
            const registrationResults = await wixData.query('jobApplication089')
                .eq("_owner", currentUserId)
                .find();
            
            if (registrationResults.items.length === 0) {
                // 2.1 未报名：禁用按钮
                $w("#button1").disable();
                $w("#button1").label = "未报名";
                return; // 提前返回，不再检查重复提交
            }
            
            // 2.2 已报名：继续检查是否重复提交
            const submissionResults = await wixData.query("enterContest034")
                .eq("_owner", currentUserId)
                .limit(300)
                .find();
            
            if (submissionResults.items.length > 0) {
                // 2.2.1 已提交过：禁用按钮
                $w("#button1").disable();
                $w("#button1").label = "禁止重复提交";
            } else {
                // 2.2.2 未提交过：启用按钮
                $w("#button1").enable();
                $w("#button1").label = "提交作品";
            }
            
        } catch (err) {
            console.error("检查用户状态失败：", err);
            $w("#button1").disable();
            $w("#button1").label = "检查失败";
        }
    }

    $w("#uploadButton2").onChange(async () => {
        // 检查是否已提交过作品（非管理员需要检测）
        if (!isUserAdmin) {
            try {
                const submissionResults = await wixData.query("enterContest034")
                    .eq("_owner", currentUserId)
                    .limit(1)
                    .find();
                
                if (submissionResults.items.length > 0) {
                    // 已提交过，阻止上传
                    $w("#uploadButton2").reset();
                    console.warn("检测到重复提交，已阻止上传");
                    
                    // 显示提示信息
                    $w("#button1").disable();
                    $w("#button1").label = "禁止重复提交";
                    
                    return; // 终止上传流程
                }
            } catch (err) {
                console.error("检查提交状态失败：", err);
            }
        }
        
        // 继续正常的上传流程
        $w("#uploadButton2").uploadFiles()
            .then((uploadedFiles) => {
                if (uploadedFiles.length > 0) {
                    const uploadedFile = uploadedFiles[0];
                    const fileUrl = uploadedFile.fileUrl;  // 获取文件的 URL

                    // 调用后端函数获取文件内容
                    getFileDownloadUrlAndContent(fileUrl)
                        .then(({ downloadUrl, fileContent }) => {
                            const descriptionMatch = fileContent.match(/&des=([^&\n\r]+)/);
                            let formattedText;
                            if (descriptionMatch && descriptionMatch[1]) {
                                const description = descriptionMatch[1];
                                formattedText = `<span style="font-weight:bold; color:red; font-size:31px; text-align:center;">作者信息：${description}</span><br><span style="font-weight:bold; color:red; font-size:31px; text-align:center;">请确认这不是一个真实ID</span>`;
                            } else {
                                formattedText = `<span style="font-size:31px; text-align:center;">留空</span>`;
                            }
                            $w("#text14").html = formattedText; // 使用 .html 来设置富文本
                        })
                        .catch(error => console.log("读取文件内容失败", error));
                }
            })
            .catch(error => console.log("文件上传失败", error));
    });

});



// 个人战限定逻辑已整合到 onReady 函数中
// 必须在 jobApplication089 中有报名记录才能提交作品
// 且不能重复提交到 enterContest034




// 以下是小队战限定
// async function checkIfUserRegistered() {
//     const userLink = await loadCurrentUserLink();
//     if (!userLink) {
//         console.log("无法获取用户链接，可能用户未注册");
//         $w("#button1").disable();
//         $w("#button1").label = "未找到用户";
//         return;
//     }

//     // 并发执行针对每个成员字段的查询
//     const memberQueries = [
//         wixData.query('TeamMMFC').eq("member1", userLink),
//         wixData.query('TeamMMFC').eq("member2", userLink),
//         wixData.query('TeamMMFC').eq("Member3", userLink)  
//     ];

//     Promise.all(memberQueries.map(query => query.find()))
//         .then(resultsArray => {
//             const found = resultsArray.some(results => results.items.length > 0);
//             if (found) {
//                 $w("#button1").enable();
//                 $w("#button1").label = "提交作品";

//                 // 设置表单中的团队名
//                 for (let results of resultsArray) {
//                     if (results.items.length > 0) {
//                         console.log(results.items[0].teamname);
//                         $w("#team").value = results.items[0].teamname;
//                         break;  // 找到就填写并停止循环
//                     }
//                 }
//             } else {
//                 $w("#button1").disable();
//                 $w("#button1").label = "未查询到队伍";
//             }
//         })
//         .catch(err => {
//             console.error("检查用户是否报名时出错:", err);
//         });
// }





// 新函数用于获取当前用户的链接
async function loadCurrentUserLink() {
    const user = await getUserPublicInfo(wixUsers.currentUser.id);
    if (user && user.userslug) {
        return `https://www.maimaimfc.ink/profile/${user.userslug}/profile`;
    } else {
        // 处理没有找到用户slug的情况
        console.error("未找到用户的slug");
        return null;
    }
}

/**
 * 提交按钮点击事件 - 保存作品到数据集
 * 数据保存后会自动触发 afterInsert 钩子上传到 Majnet
 */
export function button1_click(event) {
    // 禁用按钮防止重复提交
    $w("#button1").disable();
    $w("#button1").label = "提交中...";
    
    // 保存数据集
    $w("#dataset1").save()
        .then((saveResult) => {
            console.log("数据保存成功，作品将自动上传到Majnet");
            
            // 禁用按钮并更新标签为"已上传"
            $w("#button1").disable();
            $w("#button1").label = "已上传";
            
            // 可选：2秒后跳转到其他页面
            setTimeout(() => {
                // wixLocation.to('/stage');  // 取消注释以启用跳转
            }, 2000);
        })
        .catch((error) => {
            console.error("数据保存失败:", error);
            
            // 重新启用按钮并显示错误
            $w("#button1").enable();
            $w("#button1").label = "提交失败，请重试";
        });
}
