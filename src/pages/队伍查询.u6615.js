import wixData from "wix-data";
import { extractSlugFromURL, getUserInfoBySlug } from 'backend/getUserPublicInfo.jsw';
import { QUERY_LIMITS } from 'public/constants.js';

/**
 * 前端安全执行函数 - 简化版本
 * @param {Function} func - 要执行的异步函数
 * @param {string} operationName - 操作名称
 * @param {*} defaultValue - 默认返回值
 * @returns {*} 函数执行结果或默认值
 */
async function safeExecute(func, operationName, defaultValue = null) {
    try {
        return await func();
    } catch (error) {
        console.error(`Error in ${operationName}:`, error);
        return defaultValue;
    }
}

$w.onReady(async function () {
    await loadTeamData();
});

/**
 * 获取成员信息的通用函数
 * @param {string} memberUrl - 成员URL
 * @param {number} memberIndex - 成员索引
 * @returns {Promise<Object>} 成员信息对象
 */
async function getMemberInfo(memberUrl, memberIndex) {
    return safeExecute(async () => {
        if (!memberUrl) {
            return { nickname: "", profilePhoto: { url: "" } };
        }

        const slug = await extractSlugFromURL(memberUrl);
        if (slug) {
            const userInfo = await getUserInfoBySlug(slug);
            return userInfo || { nickname: "", profilePhoto: { url: "" } };
        }
        
        return { nickname: "", profilePhoto: { url: "" } };
    }, `getMemberInfo-${memberIndex}`, { nickname: "", profilePhoto: { url: "" } });
}

/**
 * 加载团队数据
 */
async function loadTeamData() {
    return safeExecute(async () => {
        const results = await wixData.query("TeamMMFC")
            .limit(QUERY_LIMITS.TEAM_QUERY_LIMIT)
            .find();

        if (results.items.length === 0) {
            console.log("没有找到任何团队数据");
            return;
        }

        // 并行处理所有团队数据
        const teamsData = await Promise.all(
            results.items.map(async (item) => {
                // 获取三个成员的URL
                const memberUrls = [
                    item.member1,
                    item.member2,
                    item.Member3  // 注意第三个成员的字段名
                ];

                // 并行获取所有成员信息
                const [member1Info, member2Info, member3Info] = await Promise.all(
                    memberUrls.map((url, index) => getMemberInfo(url, index + 1))
                );

                return {
                    member1Info,
                    member2Info,
                    member3Info
                };
            })
        );

        // 设置 Repeater 数据
        $w("#repeater1").data = teamsData;

        // 设置 Repeater 项目渲染逻辑
        $w("#repeater1").onItemReady(($item, itemData, index) => {
            setMemberDisplay($item, itemData, index);
        });

    }, 'loadTeamData');
}

/**
 * 设置成员显示信息
 * @param {Object} $item - Repeater项目
 * @param {Object} itemData - 项目数据
 * @param {number} index - 项目索引
 */
function setMemberDisplay($item, itemData, index) {
    const members = ['member1Info', 'member2Info', 'member3Info'];
    const avatars = ['#ava1', '#ava2', '#ava3'];
    const names = ['#member1', '#member2', '#member3'];

    members.forEach((memberKey, memberIndex) => {
        const memberInfo = itemData[memberKey];
        
        if (memberInfo) {
            // 设置头像
            if (memberInfo.profilePhoto && memberInfo.profilePhoto.url) {
                $item(avatars[memberIndex]).src = memberInfo.profilePhoto.url;
            }
            
            // 设置姓名
            $item(names[memberIndex]).text = memberInfo.nickname || "";
        }
    });
}








