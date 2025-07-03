import wixData from 'wix-data';
import { getOngakiImageUrls } from 'backend/media.jsw';

$w.onReady(function () {
    loadMemberData();
    displayRandomOngakiImage();
    wixData.query('jobApplication089')
        .limit(1000) // 增加限制以尽可能查询更多数据
        .find() // 获取数据集中的数据
        .then(results => {
            // 从结果中提取 _owner 字段的值，并存入一个新数组
            const owners = results.items.map(item => item._owner);
            // 使用 Set 来过滤数组中的重复项，获取唯一的 _owner
            const uniqueOwners = new Set(owners);
            // 获取唯一 _owner 的数量
            let uniqueOwnersCount = uniqueOwners.size;
            // 更新文本元件内容显示不同用户的数量
            $w("#applyNumber").text = `${uniqueOwnersCount}`;
        })
        .catch(err => {
            console.error('查询失败', err);
        });

});

function loadMemberData() {
    wixData.query("Members/PublicData")
        .count() // First count all members
        .then(totalCount => {
            if (totalCount === 0) {
                console.log("没有找到任何用户。");
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
                } else {
                    console.log("在随机选择的范围内没有找到符合条件的用户。");
                }
            }
        })
        .catch(err => {
            console.log("加载用户数据时出错：", err);
        });
}

async function updateMemberUI(member) {
    $w('#button8').enable;
    $w("#image1").src = member.profilePhoto; // 更新图像组件
    $w("#text15").text = "Name: " + member.nickname; // 设置昵称文本
    $w("#button8").link = member["custom_pu-mian-fa-bu-wang-zhi"];

    // 构建用户的个人链接
    const memberLink = `https://www.maimaimfc.ink/profile/${member.slug}/profile`;

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
            } else {
                console.log("No images found in ongeki folder.");
            }
        })
        .catch(err => {
            console.error('Error loading ongeki image:', err);
        });
}