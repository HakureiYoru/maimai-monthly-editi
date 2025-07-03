import wixUsers from 'wix-users';
import wixData from 'wix-data';
import { updateUserPoints } from 'backend/forumPoints.jsw';
import { getUserPointsRanking } from 'backend/forumPoints.jsw';
import { currentMember } from 'wix-members';
import { getUserPoints } from 'backend/forumPoints.jsw';
import { getPointsForBadgeLevel, getBadgeLevelByPoints } from 'backend/forumPoints.jsw';
import { generateEmbedCode } from 'backend/embedBilibili.jsw';
import { getUserPublicInfo } from 'backend/getUserPublicInfo';

const DAILY_POINTS_LIMIT = 30;
// 当页面加载时，显示当前用户的积分
$w.onReady(async function () {
    const currentUser = wixUsers.currentUser;
    if (currentUser.loggedIn) {

        await displayCurrentUserRanking();
        await displayUserPointsAndRemaining();
        await displayLastSignedIn();
        setInterval(() => {
            displayUserPointsAndRemaining();
            displayLastSignedIn();
        }, 5000);
        const userId = currentUser.id;
        const results = await wixData.query('UserPoints').eq('userId', userId).find();
        if (results.items.length > 0) {
            $w('#userTotalPoints').text = `积分: ${results.items[0].points}`;

            // 检查用户今天是否已签到
            const today = new Date();
            const lastSignedInDate = new Date(results.items[0].lastSignedIn);
            if (
                lastSignedInDate.getDate() === today.getDate() &&
                lastSignedInDate.getMonth() === today.getMonth() &&
                lastSignedInDate.getFullYear() === today.getFullYear()
            ) {
                // 如果用户今天已签到，禁用签到按钮

            }

        } else {
            $w('#userTotalPoints').text = '积分: 0';

        }
    } else {
        $w('#userTotalPoints').text = '请登录查看积分';
    }

    await displayTopUsers();
    await displayAllUsersInTable();
    displayTimeRemaining();
    setInterval(displayTimeRemaining, 1000);

    setInterval(displayTopUsers, 60000);
    //setInterval(displayTimeRemaining, 1000); // 每隔1000毫秒（1秒）更新一次剩余时间

    /*
    const topUser = await getTopUser(); // 这个函数应该返回积分最高的用户的 userId
      const userInfo = await getUserPublicInfo(topUser.userId);
      $w('#userNameText').text = userInfo.name;
      $w('#userImage').src = userInfo.profileImageUrl;
    */

    $w("#generateButton").onClick(async () => {
        try {
            // 获取用户输入的Bilibili链接
            const url = $w("#urlInput").value;
            console.log("User input URL:", url); // 打印用户输入的URL

            // 调用后端函数生成嵌入代码
            const embedCode = await generateEmbedCode(url);
            console.log("Generated embed code:", embedCode); // 打印生成的嵌入代码

            // 将嵌入代码显示在文本框中
            $w("#embedCodeOutput").value = embedCode;
        } catch (error) {
            // 如果出错，打印错误消息到控制台
            console.error("Error:", error.message); // 打印错误消息
        }
    });

});

async function getTopUser() {
    return wixData.query('UserPoints').descending('points').limit(3)
        .find()
        .then((results) => {
            if (results.items.length > 0) {
                const topUsers = results.items.map((user) => {
                    return {
                        userId: user.userId,
                        points: user.points,
                    };
                });

                const topUserIds = topUsers.map((user) => user.userId);

                return Promise.all([
                        getUserPublicInfo(topUserIds[0]),
                        getUserPublicInfo(topUserIds[1]),
                        getUserPublicInfo(topUserIds[2])
                    ])
                    .then(([firstUser, secondUser, thirdUser]) => {
                            return [firstUser, secondUser, thirdUser];
                        }

                    );
            } else {
                return null;
            }
        })
        .catch((error) => {
            console.error(error);
            return null;
        });
}

async function displayTopUsers() {
    const topUsers = await getTopUser();

    topUsers.forEach((user, index) => {
        const userInfo = {
            name: user.name,
            profileImageUrl: user.profileImageUrl,
            slug: user.userslug
        };

        if (index === 0) {
            //$w('#firstPlaceUser').text = userInfo.name;
            $w('#firstPlaceImage').src = userInfo.profileImageUrl;
            $w('#firstPlaceImage').link = `https://www.maimaimfc.ink/profile/${userInfo.slug}/profile`;
        } else if (index === 1) {
            //$w('#secondPlaceUser').text = userInfo.name;
            $w('#secondPlaceImage').src = userInfo.profileImageUrl;
            $w('#secondPlaceImage').link = `https://www.maimaimfc.ink/profile/${userInfo.slug}/profile`;
        } else if (index === 2) {
            //$w('#thirdPlaceUser').text = userInfo.name;
            $w('#thirdPlaceImage').src = userInfo.profileImageUrl;
            $w('#thirdPlaceImage').link = `https://www.maimaimfc.ink/profile/${userInfo.slug}/profile`;
        }
    });
}

async function displayTimeRemaining() {
    const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
    const data = await response.json();
    const currentTime = new Date(data.datetime.replace(/\+.*/, ''));

    const tomorrow = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + 1);
    const timeRemaining = tomorrow.getTime() - currentTime.getTime();

    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    const secondsRemaining = Math.floor((timeRemaining % (1000 * 60)) / 1000);

    const formattedTimeRemaining = `${hoursRemaining}:${minutesRemaining.toString().padStart(2, '0')}:${secondsRemaining.toString().padStart(2, '0')}`;

    $w('#currentTime').text = formattedTimeRemaining;
}

// 在页面加载时启动计时器

async function displayUserPointsAndRemaining() {
    const currentUser = wixUsers.currentUser;
    if (currentUser.loggedIn) {
        const userId = currentUser.id;
        const userPoints = await getUserPoints(userId);

        if (userPoints) {
            // 计算用户的徽章等级和距离下一个等级所需的积分
            const badgeLevel = await getBadgeLevelByPoints(userPoints.points);
            const nextBadgeLevel = badgeLevel + 1;
            const pointsForNextLevel = await getPointsForBadgeLevel(nextBadgeLevel);
            const oldLevel = await getPointsForBadgeLevel(badgeLevel);
            const pointsNeededForNextLevel = pointsForNextLevel - userPoints.points;

            // 更新进度条的值
            const progress = 100 * (userPoints.points - oldLevel) / (pointsForNextLevel - oldLevel);
            $w('#progressBar').value = progress;

            const remainingDailyPoints = Math.max(DAILY_POINTS_LIMIT - userPoints.dailyPoints, 0);
            $w('#userTotalPoints').text = `您的积分: ${userPoints.points}`;
            $w('#userRemainingDailyPoints').text = `距离每日积分上限还剩: ${remainingDailyPoints}分`;
            $w('#pointsNeededForNextLevel').text = `您现在的等级是${badgeLevel},距离下一个等级还差: ${pointsNeededForNextLevel}分`;
        } else {
            $w('#progressBar').value = 0;
            $w('#userTotalPoints').text = '您的积分: 0';
            $w('#userRemainingDailyPoints').text = `距离每日积分上限还剩: ${DAILY_POINTS_LIMIT}分`;
            $w('#pointsNeededForNextLevel').text = `距离下一个等级还差: 30分`;
        }
    } else {
        $w('#userTotalPoints').text = '请登录查看积分';
        $w('#userRemainingDailyPoints').text = '';
        $w('#pointsNeededForNextLevel').text = '';
    }
}

async function displayLastSignedIn() {
    const currentUser = wixUsers.currentUser;
    if (currentUser.loggedIn) {
        const userId = currentUser.id;
        const results = await wixData.query('UserPoints').eq('userId', userId).find();

        if (results.items.length > 0) {
            const lastSignedIn = new Date(results.items[0].lastSignedIn);

            // 格式化日期以便显示
            const lastSignedInString = `${lastSignedIn.getFullYear()}-${lastSignedIn.getMonth() + 1}-${lastSignedIn.getDate()} ${lastSignedIn.getHours()}:${lastSignedIn.getMinutes()}:${lastSignedIn.getSeconds()}`;

            // 在显示当前时间的文本前面添加上次活跃时间
            $w('#LastComment').text = `上次活跃时间：${lastSignedInString}`;
        }
    }
}

async function displayCurrentUserRanking() {
    const currentUser = wixUsers.currentUser;
    if (currentUser.loggedIn) {
        const userId = currentUser.id;
        console.log('Current user ID:', userId); // 添加调试信息

        // 查询 UserPoints 数据集并按 points 降序排列
        const results = await wixData.query('UserPoints').descending('points').find();

        if (results.items.length > 0) {
            // 使用 findIndex() 方法查找当前用户在用户列表中的位置
            const userRankingIndex = results.items.findIndex(user => user.userId === userId);
            console.log('User ranking index:', userRankingIndex); // 添加调试信息

            if (userRankingIndex !== -1) {
                const userRanking = userRankingIndex + 1; // 将索引转换为排名
                $w('#userPointsRanking').text = `您当前的积分排名：${userRanking}`;
            } else {
                $w('#userPointsRanking').text = '您还没有积分记录。';
            }
        } else {
            $w('#userPointsRanking').text = '当前没有用户积分记录。';
        }
    } else {
        $w('#userPointsRanking').text = '请先登录以查看您的积分排名。';
    }
}

async function getAllUsers() {
    try {
        const results = await wixData.query('UserPoints').descending('points').limit(50).find();

        if (results.items.length > 0) {
            const users = results.items.map(user => ({
                userId: user.userId,
                points: user.points,
            }));

            const userInfos = await Promise.all(users.map(user => getUserPublicInfo(user.userId)));

            // 过滤掉没有头像的用户
            return userInfos.filter(userInfo => userInfo !== null).map((userInfo, index) => ({
                ...userInfo,
                points: users[index].points
            }));
        } else {
            return [];
        }
    } catch (error) {
        console.error(error);
        return [];
    }
}

// 使用从getAllUsers函数获取的数据来填充表格
async function displayAllUsersInTable() {
    try {
        const users = await getAllUsers();

        const tableData = users.map(user => ({
            name: user.name,
            points: user.points
        }));

        $w('#userTable').rows = tableData;
    } catch (error) {
        console.error("Error displaying users in table:", error);
    }
}