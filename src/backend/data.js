import { updateUserPoints } from 'backend/forumPoints.jsw';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';
import wixData from 'wix-data';
import { getUserInfoBySlug } from 'backend/getUserPublicInfo';


export function Team_beforeInsert(item, context) {
    // Recalculate totalPp as the sum of performance1, performance2, and performance3
    item.totalPp = item.order + item.performance2 + item.performance3;

    return item;
}

export async function Team_beforeUpdate(item, context) {
    // 重新计算 totalPp 作为 performance1, performance2, 和 performance3 的总和
    item.totalPp = item.order + item.performance2 + item.performance3;

    // 检查是否有网址，并从中提取用户 slug
    if (item.website && item.totalPp === 0) {
        const userSlug = extractSlugFromURL(item.website);
        if (userSlug) {
            try {
                const userInfo = await getUserInfoBySlug(userSlug);
                if (userInfo) {
                    // 更新团队成员信息
                    item.title = userInfo.nickname;  // 更新昵称
                    item.photo = userInfo.profilePhoto;  // 更新头像
                    item.realId = userInfo.realId;  // 更新 realId
                }
            } catch (error) {
                console.error("Error fetching user info:", error);
                // 在此处处理错误，例如你可以决定不更新项目或做其他操作
            }
        }
    }

    return item;
}


// export async function Team_afterUpdate(item, context) {
//     if (item.totalPp && item.totalPp != 0) {
//         const userSlug = extractSlugFromURL(item.website);

//         if (userSlug) {
//             try {
//                 const userInfo = await getUserInfoBySlug(userSlug);

//                 if (userInfo) {
//                     // 获取完整的当前条目数据
//                     const currentItem = await wixData.get("Team", item._id);
//                     if (currentItem) {
//                         // 重新计算 totalPp
//                         const totalPp = currentItem.order + currentItem.performance2 + currentItem.performance3;

//                         // 检查是否需要更新（比较昵称、头像和 realId）
//                         if (currentItem.title !== userInfo.nickname || currentItem.photo !== userInfo.profilePhoto || currentItem.realId !== userInfo.realId) {
//                             // 更新条目
//                             const updatedItem = await wixData.update("Team", {
//                                 ...currentItem,
//                                 title: userInfo.nickname, // 更新昵称
//                                 //photo: userInfo.profilePhoto, // 更新头像
//                                 realId: userInfo.realId, // 更新 realId
//                                 totalPp: totalPp // 更新 totalPp 字段
//                             });
//                             console.log("Team item updated successfully:", updatedItem);
//                         } else {
//                             console.log("No changes required for the item.");
//                         }
//                     }
//                 }
//             } catch (error) {
//                 console.error("Error in Team_afterUpdate function:", error);
//             }
//         }
//     }
// }
export async function enterContest034_beforeInsert(item, context) {
    // 获取上传者的名字并将其添加到 uploaderName 字段
    // const userInfo = await getUserPublicInfo(item._owner);
    // item.uploaderName = userInfo.name;

    // 为新上传的谱面分配一个顺序 ID
    return wixData.query('enterContest034')
        .descending('sequenceId')
        .limit(1)
        .find()
        .then(results => {
            const maxSequenceId = results.items.length > 0 ? results.items[0].sequenceId : 0;
            item.sequenceId = maxSequenceId + 1;
            return item;
        })
        .catch(error => {
            console.error('Error fetching max sequence ID:', error);
            return item;
        });
}

function extractSlugFromURL(url) {
    console.log("URL to extract slug from:", url); // 显示原始 URL

    const parts = url.split('/profile/');
    if (parts.length === 2) {
        // 进一步分割第二部分以提取 slug
        const slugParts = parts[1].split('/');
        if (slugParts.length >= 1) {
            const extractedSlug = slugParts[0];
            console.log("Extracted Slug:", extractedSlug); // 显示提取出的 slug
            return extractedSlug; // 返回 slug 部分
        }
    }

    console.log("No valid slug found, returning null");
    return null; // 如果 URL 格式不正确，返回 null
}




