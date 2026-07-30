import wixData from 'wix-data';
import wixUsers from 'wix-users';
import { getUsersPublicInfo } from 'backend/getUserPublicInfo.jsw';

const DEFAULT_PHOTO = "https://static.wixstatic.com/media/daf9ba_fb0143f9208d4e059c81d6f4e7855256~mv2.jpg";
const QUALIFIED_PP_THRESHOLD = 100;

$w.onReady(async function () {
    checkIfUserRegistered();

    // 检查用户是否为Qualified选手
    await checkQualifiedStatus();

    // 底部选手状态卡片（自定义 HTML）
    await loadApplyPlayerStatus();

    // 监听报名提交成功事件
    if ($w("#dataset2")) {
        $w("#dataset2").onAfterSave(async () => {
            // 更新按钮状态
            checkIfUserRegistered();

            // 重新检查Qualified状态（报名后可能会被自动标记）
            await checkQualifiedStatus();

            // 刷新底部状态卡片
            await loadApplyPlayerStatus();
        });
    }
});

function checkIfUserRegistered() {
    // 首先查询当前用户是否已经报名
    wixData.query('jobApplication089')
        .eq("_owner", wixUsers.currentUser.id)
        .limit(500)
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
            if (count >= 800) {
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
 * 根据用户在Team天梯的 totalPp 是否大于 100 显示相应提示
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

        // 查询Team数据集：realId 匹配且 totalPp > 100
        const teamResults = await wixData
            .query('Team')
            .eq('realId', currentUserId)
            .gt('totalPp', QUALIFIED_PP_THRESHOLD)
            .find();

        const isQualified = teamResults.items.length > 0;

        if (isQualified) {
            $w("#isQ").text = "✓ 您已被标记为 Qualified 选手（天梯总积分 > 100）";

        } else {
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

function postApplyStatus(message) {
    const html = $w("#htmlApplyStatus");
    if (!html || !html.postMessage) {
        console.warn("[报名页] 未找到 #htmlApplyStatus，请在编辑器添加自定义 HTML 元件");
        return;
    }
    html.postMessage(message);
}

/**
 * 加载全部报名选手，并附加会员头像、往届排名与 Q 状态
 */
async function loadApplyPlayerStatus() {
    try {
        postApplyStatus({ type: 'APPLY_STATUS_LOADING' });

        const [registrationResults, teamAllResults] = await Promise.all([
            wixData.query('jobApplication089')
                .ascending('_createdDate')
                .limit(1000)
                .find(),
            wixData.query('Team')
                .descending('totalPp')
                .limit(1000)
                .find(),
        ]);

        const registrations = registrationResults.items || [];
        if (registrations.length === 0) {
            postApplyStatus({
                type: 'APPLY_STATUS_MESSAGE',
                message: '暂无报名记录',
            });
            return;
        }

        const memberMap = await getUsersPublicInfo(
            registrations.map((registration) => registration._owner)
        ).catch(() => ({}));

        // 与 Ranking 页一致：仅统计 totalPp > 0 的选手，并列同分跳名次
        const scoredMembers = (teamAllResults.items || []).filter(
            (m) => (m.totalPp || 0) > 0
        );

        let currentRank = 0;
        const rankedMembers = scoredMembers.map((member, index) => {
            if (index === 0 || member.totalPp !== scoredMembers[index - 1].totalPp) {
                currentRank = index + 1;
            }
            return { ...member, rank: currentRank };
        });

        const teamMap = new Map(
            rankedMembers.map((member) => [member.realId, member])
        );

        const players = registrations.map((registration) => {
            const userId = registration._owner;
            const publicInfo = memberMap[userId] || null;
            const teamMember = teamMap.get(userId) || null;
            const totalPp = teamMember ? (teamMember.totalPp || 0) : 0;

            return {
                displayName:
                    (publicInfo && publicInfo.name) ||
                    (teamMember && teamMember.title) ||
                    '未知用户',
                registrationId: registration.firstName || '未填写',
                photo:
                    (publicInfo && publicInfo.profileImageUrl) ||
                    (teamMember && teamMember.photo) ||
                    DEFAULT_PHOTO,
                rank: teamMember ? teamMember.rank : null,
                totalPp,
                isQualified:
                    registration.isHighQuality === true ||
                    totalPp > QUALIFIED_PP_THRESHOLD,
            };
        });

        postApplyStatus({
            type: 'APPLY_STATUS_DATA',
            players,
        });
    } catch (error) {
        console.error("[报名页] 加载选手状态失败:", error);
        postApplyStatus({
            type: 'APPLY_STATUS_MESSAGE',
            message: '状态加载失败，请刷新重试',
        });
    }
}
