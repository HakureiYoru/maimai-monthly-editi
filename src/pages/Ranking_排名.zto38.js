import { getUserInfoBySlug } from 'backend/getUserPublicInfo.jsw';
import wixData from 'wix-data';
$w.onReady(async function () {
    await loadTeamMembersAndUpdateTable();
});

async function loadTeamMembersAndUpdateTable() {
    // Query the "Team" dataset, sorted by totalPp in descending order, and limit to top 100
    const results = await wixData.query("Team")
        .descending('totalPp')
        .limit(100)
        .find();

    const teamMembers = results.items; // Now you have the top 100 members sorted by totalPp

    // Define the default photo URL
    const defaultPhotoUrl = "https://static.wixstatic.com/media/daf9ba_fb0143f9208d4e059c81d6f4e7855256~mv2.jpg";

    let tableData = await Promise.all(teamMembers.map(async (member, index) => {
        let photoUrl = member.photo || defaultPhotoUrl; // Use the existing photo or default if not present
        if (member.website) {
            const userSlug = extractSlugFromURL(member.website);
            if (userSlug) {
                try {
                    const userInfo = await getUserInfoBySlug(userSlug);
                    // Use the user's profile photo if available; otherwise, retain the existing or default photo URL
                    photoUrl = userInfo && userInfo.profilePhoto ? userInfo.profilePhoto : photoUrl;
                } catch (error) {
                    console.error(`Error fetching user info by slug for user ${member._id}:`, error);
                    // If an error occurs, ensure the photoUrl is set to either the existing photo or the default
                    photoUrl = photoUrl || defaultPhotoUrl;
                }
            }
        }

        // Return the updated object for the row data, including the potentially updated photo URL
        return {
            title: member.title, // Assuming there is a title/name field
            totalPp: member.totalPp, // TotalPp field for sorting
            photo: photoUrl, // The final photo URL, after all checks and updates
            rank: index + 1 // Assign the rank based on index, considering the list is already sorted
        };
    }));

    // Assuming '#table1' is the ID of your table; replace it with the actual ID if different
    $w('#table1').rows = tableData;
}

function extractSlugFromURL(url) {
    //console.log("URL to extract slug from:", url); // 显示原始 URL

    const parts = url.split('/profile/');
    if (parts.length === 2) {
        // 进一步分割第二部分以提取 slug
        const slugParts = parts[1].split('/');
        if (slugParts.length >= 1) {
            const extractedSlug = slugParts[0];
            // console.log("Extracted Slug:", extractedSlug); // 显示提取出的 slug
            return extractedSlug; // 返回 slug 部分
        }
    }

    console.log("No valid slug found, returning null");
    return null; // 如果 URL 格式不正确，返回 null
}