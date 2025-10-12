import wixWindow from 'wix-window';
import wixData from 'wix-data';
import wixUsers from 'wix-users';
import { sendReplyNotification } from 'backend/emailNotifications.jsw';

let commentData = {};
let currentUserId = null;

$w.onReady(function () {
    // 获取传入的数据
    commentData = wixWindow.lightbox.getContext();
    currentUserId = wixUsers.currentUser.id;
    
    // console.log("Lightbox已准备就绪，接收到的数据:", commentData);
    
    // 显示原评论信息
    displayOriginalComment();
    
    // 设置事件监听器
    setupEventListeners();
    
    // 延迟加载回复，确保页面完全准备好
    setTimeout(() => {
        loadReplies();
    }, 100);
});

/**
 * 显示原评论信息
 */
function displayOriginalComment() {
    $w("#originalComment").value = commentData.originalComment || "原评论内容";
    $w("#workNumber").text = `作品编号: ${commentData.workNumber}`;
}

/**
 * 加载并显示回复
 */
async function loadReplies() {
    try {
        let replies = commentData.replies || [];
        
        // console.log("初始回复数据，数量:", replies.length);
        
        // 如果没有回复数据，尝试重新查询
        if (replies.length === 0 && commentData.commentId) {
            // console.log("没有传入回复数据，重新查询...");
            
            const queryResult = await wixData.query("BOFcomment")
                .eq("replyTo", commentData.commentId)
                .ascending("_createdDate")
                .find();
            
            replies = queryResult.items;
            commentData.replies = replies; // 更新本地数据
            
            // console.log("重新查询到的回复数据，数量:", replies.length);
        }
        
        // 显示回复数量
        $w("#replyCount").text = `${replies.length} 条回复`;
        
        // 先配置onItemReady处理器
        $w("#repliesRepeater").onItemReady(($item, itemData) => {
            // console.log("设置回复项目:", itemData);
            
            try {
                // 显示回复内容（textbox元件使用value，注意不带#号）
                $item("#replyText").value = itemData.comment || "无内容";
                //console.log("设置回复内容:", itemData.comment);
                
                // 显示回复时间（注意不带#号）
                const replyTime = formatDate(itemData._createdDate || itemData.submissionTime);
                $item("#replyTime").text = replyTime;
                //console.log("设置回复时间:", replyTime);
                
                //console.log("回复项目设置完成");
            } catch (itemError) {
                console.error("设置回复项目失败:", itemError);
            }
        });
        
        // 设置数据到repeater
        if (replies.length > 0) {
            // 确保repeater可见
            $w("#repliesRepeater").show();
            $w("#repliesRepeater").data = replies;
            //console.log("设置", replies.length, "条回复到repeater，repeater已显示");
            
            // 添加延迟检查以确保数据设置成功
            setTimeout(() => {
                //console.log("延迟检查：repeater数据长度", $w("#repliesRepeater").data.length);
                //console.log("延迟检查：repeater是否可见", $w("#repliesRepeater").isVisible);
            }, 200);
        } else {
            console.log("没有回复数据可显示");
            $w("#repliesRepeater").hide();
        }
        
    } catch (error) {
        console.error("加载回复失败:", error);
    }
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
    // 提交回复按钮
    $w("#submitReply").onClick(async () => {
        await submitReply();
    });
    
    // 关闭按钮
    $w("#closeButton").onClick(() => {
        wixWindow.lightbox.close();
    });
    
    // 回复输入框变化事件
    $w("#replyInput").onInput(() => {
        const hasContent = $w("#replyInput").value.trim().length > 0;
        if (hasContent) {
            $w("#submitReply").enable();
        } else {
            $w("#submitReply").disable();
        }
    });
}

/**
 * 提交回复
 */
async function submitReply() {
    try {
        const replyContent = $w("#replyInput").value.trim();
        
        if (!replyContent) {
            return;
        }
        
        if (!currentUserId) {
            return;
        }
        
        // 创建回复数据
        const replyData = {
            workNumber: commentData.workNumber,
            comment: replyContent,
            score: 0, // 回复不计分
            replyTo: commentData.commentId,
            submissionTime: new Date().toISOString()
        };
        
        // 提交到数据库
        const insertedReply = await wixData.insert("BOFcomment", replyData);
        
        // 发送邮件通知（异步执行，不阻塞用户体验）
        try {
            const notificationResult = await sendReplyNotification(
                commentData.commentId,
                replyContent,
                commentData.workNumber,
                currentUserId
            );
            //console.log("邮件通知结果:", notificationResult);
        } catch (emailError) {
            console.error("发送邮件通知失败（不影响回复提交）:", emailError);
        }
        
        // 显示成功消息
        $w("#successMessage").text = "回复提交成功！";
        $w("#successMessage").show();
        
        // 清空输入框
        $w("#replyInput").value = "";
        $w("#submitReply").disable();
        
        // 1秒后刷新回复列表
        setTimeout(async () => {
            $w("#successMessage").hide();
            await refreshReplies();
        }, 1000);
        
    } catch (error) {
        console.error("提交回复失败:", error);
        $w("#successMessage").text = "提交回复失败，请重试";
        $w("#successMessage").show();
    }
}

/**
 * 刷新回复列表
 */
async function refreshReplies() {
    try {
        // 重新查询回复
        const results = await wixData.query("BOFcomment")
            .eq("replyTo", commentData.commentId)
            .ascending("_createdDate")
            .find();
        
        // 更新数据
        commentData.replies = results.items;
        
        // 重新加载显示
        await loadReplies();
        
    } catch (error) {
        console.error("刷新回复失败:", error);
    }
}

/**
 * 格式化日期
 */
function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hour}:${minute}`;
}

/**
 * 关闭lightbox并返回刷新标识
 */
function closeLightboxWithRefresh() {
    // 通知父页面需要刷新
    wixWindow.lightbox.close({ refresh: true });
} 