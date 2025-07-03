import wixData from 'wix-data';
import wixLocation from 'wix-location';

// 根据 slug 获取用户 ID
async function getUserIdBySlug(slug) {
    const result = await wixData.query('Members/PublicData')
        .eq('slug', slug)
        .find();

    if (result.items.length > 0) {
        return result.items[0]._id;
    }

    return null;
}

// 根据用户 ID 获取排名
async function getUserRank(userId) {
    try {
        // 首先，获取所有团队成员，按 totalPp 降序排列
        const allMembers = await wixData.query("Team")
            .descending("totalPp")
            .limit(100)
            .find();
        
        // 找出特定用户在排序后的列表中的位置，即为其排名
        const userIndex = allMembers.items.findIndex(member => member.realId === userId);
        
        // 索引 + 1（因为排名是从1开始的，而不是从0）
        return userIndex + 1;
    } catch (error) {
        console.error("Error querying Team dataset:", error);
        return null;
    }
}

// 页面准备就绪
$w.onReady(async function () {
    // 获取 URL 中的用户 slug
    const userSlug = wixLocation.path[0];

    // 根据 slug 获取用户 ID
    const userId = await getUserIdBySlug(userSlug);

    if (userId) {
        // 根据用户 ID 获取排名
        const rank = await getUserRank(userId);

        if (rank > 0) { // 确保返回的是有效排名
            $w("#ranking").text = `User Rank: ${rank}`; // 显示排名
        } else {
            $w("#ranking").text = "Rank not found"; // 排名未找到
        }
    } else {
        $w("#ranking").text = "User not found"; // 用户未找到
    }
});
