import wixData from 'wix-data';
import wixUsers from 'wix-users';

$w.onReady(async function () {
    checkIfUserRegistered();
    
    // 检查用户是否为Qualified选手
    await checkQualifiedStatus();
    
    // 监听报名提交成功事件
    if ($w("#dataset2")) {
        $w("#dataset2").onAfterSave(async () => {
            // 刷新table1显示的数据集
            $w("#dataset2").refresh();
            
            // 更新按钮状态
            checkIfUserRegistered();
            
            // 重新检查Qualified状态（报名后可能会被自动标记）
            await checkQualifiedStatus();
        });
    }
});

function checkIfUserRegistered() {
    // 首先查询当前用户是否已经报名
    wixData.query('jobApplication089')
        .eq("_owner", wixUsers.currentUser.id)
        .find()
        .then(results => {
            if (results.items.length > 0) {
                // 用户已经报名
                $w("#button3").label = "报过了";
                $w("#button3").disable();
            } else {
                // 用户没有报名, 检查总报名人数是否已达到上限
                checkTotalRegistrations();
            }
        })
        .catch(err => {
            console.error("检查用户是否报名时出错:", err);
        });
}

function checkTotalRegistrations() {
    // 查询总报名人数
    wixData.query('jobApplication089')
        .count()
        .then(count => {
            if (count >= 250) {
                // 报名人数已达到上限
                $w("#button3").label = "报名已满";
                $w("#button3").disable();
            } else {
                // 报名人数未达到上限
                $w("#button3").enable();
            }
        })
        .catch(err => {
            console.error("检查总报名人数时出错:", err);
        });
}

$w('#input9').onChange((event) => {
    checkIfUserRegistered();
})

$w('#input7').onChange((event) => {
    checkIfUserRegistered();
})

$w('#radioGroup1').onChange((event) => {
    checkIfUserRegistered();
})

/**
 * 检查用户是否为Qualified选手
 * 根据用户是否在Team天梯中显示相应提示
 */
async function checkQualifiedStatus() {
    try {
        // 检查用户是否登录
        if (!wixUsers.currentUser.loggedIn) {
            $w("#isQ").text = "请先登录以查看您的选手状态";
            $w("#isQ").show();
            return;
        }
        
        const currentUserId = wixUsers.currentUser.id;
        
        // 查询Team数据集，检查用户是否在天梯中
        // 只通过realId字段匹配
        const teamResults = await wixData
            .query('Team')
            .eq('realId', currentUserId)
            .find();
        
        const isInTeamLadder = teamResults.items.length > 0;
        
        if (isInTeamLadder) {
            // 用户在天梯中
            $w("#isQ").text = "✓ 您已被标记为 Qualified 选手（基于以往天梯表现）";
            
        } else {
            // 用户不在天梯中
            $w("#isQ").text = "您目前是普通选手。如需申请 Qualified 资格，请向 Staff 提交相关比赛经历";
            
        }
        
        $w("#isQ").show();
        
    } catch (error) {
        console.error("检查Qualified状态时出错:", error);
        $w("#isQ").text = "状态检查失败，请刷新页面重试";
        $w("#isQ").style.color = "#FF0000"; // 红色
        $w("#isQ").show();
    }
}