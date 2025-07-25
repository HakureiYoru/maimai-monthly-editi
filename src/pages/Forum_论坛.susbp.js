import wixUsers from 'wix-users';
import wixData from 'wix-data';
import { generateEmbedCode } from 'backend/mediaManagement.jsw';
import { 
    getUserDetailedPointsInfo, 
    checkUserSignInStatus, 
    getTopUsers, 
    getFullUserRanking, 
    getUserRanking 
} from 'backend/pageUtils.jsw';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';
import { TIME_CONFIG, QUERY_LIMITS } from 'public/constants.js';
// 当页面加载时，显示当前用户的积分
$w.onReady(async function () {
    const currentUser = wixUsers.currentUser;
    
    if (currentUser.loggedIn) {
        // 初始化用户信息显示
        await Promise.all([
            displayCurrentUserRanking(),
            displayUserPointsAndRemaining(),
            displayLastSignedIn()
        ]);

        // 设置定时器更新用户信息
        setInterval(async () => {
            await Promise.all([
                displayUserPointsAndRemaining(),
                displayLastSignedIn()
            ]);
        }, TIME_CONFIG.USER_INFO_UPDATE_INTERVAL);
    } else {
        $w('#userTotalPoints').text = '请登录查看积分';
        $w('#userRemainingDailyPoints').text = '';
        $w('#pointsNeededForNextLevel').text = '';
        $w('#userPointsRanking').text = '请先登录以查看您的积分排名。';
    }

    // 初始化排行榜和时间显示
    await Promise.all([
        displayTopUsers(),
        displayAllUsersInTable()
    ]);
    
    displayTimeRemaining();
    setInterval(displayTimeRemaining, TIME_CONFIG.TIMER_UPDATE_INTERVAL);
    setInterval(displayTopUsers, TIME_CONFIG.RANKING_UPDATE_INTERVAL);
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
    if (!currentUser.loggedIn) {
        $w('#userTotalPoints').text = '请登录查看积分';
        $w('#userRemainingDailyPoints').text = '';
        $w('#pointsNeededForNextLevel').text = '';
        return;
    }

    try {
        const userInfo = await getUserDetailedPointsInfo(currentUser.id);
        
        // 更新进度条
        $w('#progressBar').value = userInfo.progress;
        
        // 更新文本显示
        $w('#userTotalPoints').text = `您的积分: ${userInfo.points}`;
        $w('#userRemainingDailyPoints').text = `距离每日积分上限还剩: ${userInfo.remainingDailyPoints}分`;
        $w('#pointsNeededForNextLevel').text = `您现在的等级是${userInfo.badgeLevel},距离下一个等级还差: ${userInfo.pointsNeededForNextLevel}分`;
    } catch (error) {
        console.error('显示用户积分信息时出错:', error);
        $w('#userTotalPoints').text = '积分信息加载失败';
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
    if (!currentUser.loggedIn) {
        $w('#userPointsRanking').text = '请先登录以查看您的积分排名。';
        return;
    }

    try {
        const ranking = await getUserRanking(currentUser.id);
        if (ranking > 0) {
            $w('#userPointsRanking').text = `您当前的积分排名：${ranking}`;
        } else {
            $w('#userPointsRanking').text = '您还没有积分记录。';
        }
    } catch (error) {
        console.error('获取用户排名时出错:', error);
        $w('#userPointsRanking').text = '排名信息加载失败。';
    }
}

// 使用新的通用函数来填充表格
async function displayAllUsersInTable() {
    try {
        const users = await getFullUserRanking(QUERY_LIMITS.FORUM_RANKING_LIMIT);
        // 过滤掉没有头像的用户
        const validUsers = users.filter(user => user.profileImageUrl);
        
        const tableData = validUsers.map(user => ({
            name: user.name,
            points: user.points
        }));

        $w('#userTable').rows = tableData;
    } catch (error) {
        console.error("显示用户表格时出错:", error);
        $w('#userTable').rows = [];
    }
}