import wixData from 'wix-data';
import { getOngakiImageUrls } from 'backend/mediaManagement.jsw';
import { getApplicationStats } from 'backend/pageUtils.jsw';

$w.onReady(async function () {
    // 并行加载数据
    await Promise.all([
        loadMemberData(),
        displayRandomOngakiImage(),
        loadApplicationStats()
    ]);
});

async function loadApplicationStats() {
    try {
        const applicationCount = await getApplicationStats();
        $w("#applyNumber").text = `${applicationCount}`;
    } catch (error) {
        console.error('加载申请统计时出错:', error);
        $w("#applyNumber").text = '0';
    }
}

function loadMemberData() {
    wixData.query("Members/PublicData")
        .count() // First count all members
        .then(totalCount => {
            if (totalCount === 0) {
                return;
            }
            // Calculate a random start within the total count
            const randomSkip = Math.floor(Math.random() * Math.max(0, totalCount - 10));
            return wixData.query("Members/PublicData")
                .skip(randomSkip)
                .limit(100) // Adjust the number as necessary
                .find();
        })
        .then(results => {
            if (results) {
                const membersWithCustomField = results.items.filter(member => member["custom_pu-mian-fa-bu-wang-zhi"]);

                if (membersWithCustomField.length > 0) {
                    const randomIndex = Math.floor(Math.random() * membersWithCustomField.length);
                    const member = membersWithCustomField[randomIndex];
                    updateMemberUI(member);
                }
            }
        })
        .catch(err => {
            console.error("加载用户数据时出错：", err);
        });
}

async function updateMemberUI(member) {
    $w('#button8').enable;
    $w("#image1").src = member.profilePhoto; // 更新图像组件
    $w("#text15").text = "Name: " + member.nickname; // 设置昵称文本
    $w("#button8").link = member["custom_pu-mian-fa-bu-wang-zhi"];

    // 构建用户的个人链接
    const memberLink = `https://mmfc.majdata.net/profile/${member.slug}/profile`;

    // 检查链接是否存在于Team数据集中，并获取排名
    const rank = await getMemberRank(memberLink, member._id);

    // 如果用户有排名，更新排名信息到text15
    if (rank) {
        $w("#text15").text += `\nRank: ${rank}`;
    }

}

async function getMemberRank(memberLink, userId) {
    try {
        // 首先，检查用户的链接是否存在于Team数据集中
        const linkResult = await wixData.query("Team")
            .eq("website", memberLink).limit(100)
            .find();

        if (linkResult.items.length > 0) {
            // 获取所有团队成员，按totalPp降序排列
            const allMembers = await wixData.query("Team")
                .descending("totalPp")
                .find();

            // 找出特定用户在排序后的列表中的位置
            const userIndex = allMembers.items.findIndex(item => item.website === memberLink);

            // 返回排名（索引 + 1）
            return userIndex + 1;
        } else {
            //console.log("用户链接不在Team数据集中。");
            return null; // 链接不存在时返回null
        }
    } catch (err) {
        //console.log("查询成员排名时出错：", err);
        return null; // 出现错误时返回null
    }
}

export function button10_click(event) {

    displayRandomOngakiImage();

}

export function button11_click(event) {

    loadMemberData();
}

function displayRandomOngakiImage() {
    getOngakiImageUrls()
        .then(imageUrls => {
            const totalImages = imageUrls.length; // Assuming this correctly returns 44
            if (totalImages > 0) {
                const randomIndex = Math.floor(Math.random() * totalImages);
                $w("#image2").src = imageUrls[randomIndex]; // Set the image source directly
            }
        })
        .catch(err => {
            console.error('Error loading ongeki image:', err);
        });
}