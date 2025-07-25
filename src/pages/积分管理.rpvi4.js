import wixWindow from 'wix-window';
import { 
    getFullUserRanking, 
    getUserCommentStats,
    updateUserPointsAdmin
} from 'backend/pageUtils.jsw';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';

$w.onReady(async function () {
    await displayAllUsersInTable();
    await loadCommentCounts(); // 确保调用这个函数来加载数据

    $w("#userTable").onRowSelect(async (event) => {
        const rowData = event.rowData; // 获取选中行的数据
        const userId = rowData.userId; // 从行数据中获取userId
        const points = rowData.points; // 从行数据中获取points

        // 调用getUserPublicInfo函数来获取用户的slug和name
        try {
            const userInfo = await getUserPublicInfo(userId);
            if (userInfo) {
                // 更新文本和输入框的内容
                $w("#text10").text = `选中的用户积分为: ${points}，查询的这个用户是${userInfo.name}，slug为：${userInfo.userslug}`; // 显示积分信息和用户信息
                $w("#inputId").value = userId; // 填入userId
            } else {
                $w("#text10").text = `找不到用户ID为: ${userId} 的用户信息`; // 用户信息未找到的情况
            }
        } catch (error) {
            console.error("获取用户公开信息时发生错误", error);
            $w("#text10").text = `获取用户信息时出错`; // 发生错误时的情况
        }
    });

    // 假设commentTable中的行数据包含userId字段和uniqueWorkCount字段
    $w("#commentTable").onRowSelect(async (event) => {
        const rowData = event.rowData; // 获取选中行的数据
        const userId = rowData.userId; // 从行数据中获取userId
        const uniqueWorkCount = rowData.uniqueWorkCount; // 获取用户评论的作品数量

        // 调用getUserPublicInfo函数来获取用户的slug和name
        try {
            const userInfo = await getUserPublicInfo(userId);
            if (userInfo) {
                // 更新文本和输入框的内容
                $w("#text10").text = `选中用户一共评论了${uniqueWorkCount}个作品，查询的用户是${userInfo.name}，slug是${userInfo.userslug}`; // 显示评论数量和用户信息
                $w("#inputId").value = userId; // 填入userId
            } else {
                $w("#text10").text = `找不到用户ID为: ${userId} 的用户信息`; // 用户信息未找到的情况
            }
        } catch (error) {
            console.error("获取用户公开信息时发生错误", error);
            $w("#text10").text = `获取用户信息时出错`; // 发生错误时的情况
        }
    });

    $w("#button1").onClick(() => {
        updatePoints(); // 调用更新积分的函数
    });
});

async function getAllUsers() {
    try {
        return await getFullUserRanking(100);
    } catch (error) {
        console.error("获取所有用户信息时发生错误", error);
        return [];
    }
}

async function displayAllUsersInTable() {
    try {
        const users = await getAllUsers();
        const tableData = users.map(user => ({
            userId: user.userId, // 用户系统ID
            name: user.name, // 用户昵称
            points: user.points, // 用户积分
            photo: user.profileImageUrl // 用户头像URL
        }));
        $w('#userTable').rows = tableData;
    } catch (error) {
        console.error("展示用户信息在表格时发生错误", error);
    }
}

// 更新积分的函数，但只打开Lightbox进行确认
async function updatePoints() {
    let userId = $w("#inputId").value; // 从输入框获取userId
    let pointsToAddStr = $w("#inputPoints").value; // 从输入框获取points
    let pointsToAdd = Number(pointsToAddStr); // 将字符串转换为数字

    if (!userId || isNaN(pointsToAdd)) {
        // 输入数据无效
        $w("#text10").text = "请输入有效的用户ID和积分数值";
        return;
    }

    // 打开Lightbox，并传递userId和pointsToAdd
    wixWindow.openLightbox("PointsConfirmation", { userId, pointsToAdd }).then((data) => {
        // 根据Lightbox关闭时返回的数据处理结果
        if (data === "confirm") {
            // 如果用户确认了操作，则继续执行积分更新
            performUpdate(userId, pointsToAdd);
        } else {
            // 如果用户取消了操作，则仅显示消息
            $w("#text10").text = "操作已取消";
        }
    });
}

// 执行积分更新的函数
async function performUpdate(userId, pointsToAdd) {
    try {
        const result = await updateUserPointsAdmin(userId, pointsToAdd);
        
        if (result.success) {
            $w("#text10").text = result.message;
            refreshTableData(); // 刷新表格数据
        } else {
            $w("#text10").text = result.message;
        }
    } catch (error) {
        console.error("更新积分时出错:", error);
        $w("#text10").text = "积分更新失败";
    }
}

// A new function to refresh the table data
async function refreshTableData() {
    // Call getAllUsers to refetch the data
    const allUsers = await getAllUsers();

    // Update the table with the new data
    const tableData = allUsers.map(user => ({
        userId: user.userId, // 用户系统ID
        name: user.name, // 用户昵称
        points: user.points, // 用户积分
        photo: user.profileImageUrl // 用户头像URL
    }));

    $w('#userTable').rows = tableData;
}

async function loadCommentCounts() {
    try {
        const commentStats = await getUserCommentStats();
        
        // 设置表格数据
        $w('#commentTable').rows = commentStats;
    } catch (error) {
        console.error('加载评论统计时出错:', error);
        $w('#commentTable').rows = [];
    }
}