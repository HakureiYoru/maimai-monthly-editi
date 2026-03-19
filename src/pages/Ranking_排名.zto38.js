import { getUserInfoBySlug } from 'backend/getUserPublicInfo.jsw';
import wixData from 'wix-data';

$w.onReady(async function () {
    $w('#htmlRanking').postMessage({ type: 'RANKING_LOADING' });
    await loadRankingData();
});

async function loadRankingData() {
    const results = await wixData.query("Team")
        .descending('totalPp')
        .limit(100)
        .find();

    const teamMembers = results.items;
    const defaultPhotoUrl = "https://static.wixstatic.com/media/daf9ba_fb0143f9208d4e059c81d6f4e7855256~mv2.jpg";

    const scoredMembers = teamMembers.filter(m => (m.totalPp || 0) > 0);

    const membersWithPhotos = await Promise.all(scoredMembers.map(async (member) => {
        let photoUrl = member.photo || defaultPhotoUrl;

        if (member.website) {
            const userSlug = extractSlugFromURL(member.website);
            if (userSlug) {
                try {
                    const userInfo = await getUserInfoBySlug(userSlug);
                    photoUrl = userInfo && userInfo.profilePhoto ? userInfo.profilePhoto : photoUrl;
                } catch (error) {
                    console.error(`Error fetching user info for ${member._id}:`, error);
                }
            }
        }

        return {
            title: member.title,
            totalPp: member.totalPp,
            photo: photoUrl,
            website: member.website || null,
        };
    }));

    // 并列分数使用相同名次，下一个不同分数跳过对应名次
    let currentRank = 0;
    const members = membersWithPhotos.map((member, index) => {
        if (index === 0 || member.totalPp !== membersWithPhotos[index - 1].totalPp) {
            currentRank = index + 1;
        }
        return { ...member, rank: currentRank };
    });

    $w('#htmlRanking').postMessage({ type: 'RANKING_DATA', members });
}

function extractSlugFromURL(url) {
    const parts = url.split('/profile/');
    if (parts.length === 2) {
        const slug = parts[1].split('/')[0];
        return slug || null;
    }
    return null;
}
