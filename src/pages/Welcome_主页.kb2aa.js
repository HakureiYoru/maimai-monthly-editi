import wixData from "wix-data";
import wixUsers from "wix-users";
import { getOngakiImageUrls } from "backend/mediaManagement.jsw";
import { getApplicationStats, getLeaderboardData, getSelfLeaderboardEntry } from "backend/pageUtils.jsw";

$w.onReady(async function () {
  // 并行加载数据
  await Promise.all([loadApplicationStats()]);

  // 积分榜：等 HTML 组件就绪后再发数据
  $w("#htmlLeaderboard").onMessage((msg) => {
    if (msg.data && msg.data.type === "ready") {
      sendLeaderboardData();
    }
  });
  // 同时主动发送一次，兼容组件比页面代码更早就绪的情况
  sendLeaderboardData();

  // 首页随机区块 HTML 组件
  $w("#htmlHomeSection").onMessage((msg) => {
    if (!msg.data) return;
    if (msg.data.type === "readyHomeSection") {
      sendOngakiImage();
      sendMemberData();
    }
    if (msg.data.type === "refreshOngaki") sendOngakiImage();
    if (msg.data.type === "refreshMember") sendMemberData();
  });
  sendOngakiImage();
  sendMemberData();
});

async function sendLeaderboardData() {
  try {
    const currentUserId = wixUsers.currentUser.loggedIn ? wixUsers.currentUser.id : null;
    const [users, selfUser] = await Promise.all([
      getLeaderboardData(100),
      currentUserId ? getSelfLeaderboardEntry(currentUserId) : Promise.resolve(null),
    ]);
    $w("#htmlLeaderboard").postMessage({ type: "leaderboard", users, selfUser });
  } catch (err) {
    console.error("积分榜数据加载失败:", err);
  }
}

async function loadApplicationStats() {
  try {
    const applicationCount = await getApplicationStats();
    $w("#applyNumber").text = `${applicationCount}`;
  } catch (error) {
    console.error("加载申请统计时出错:", error);
    $w("#applyNumber").text = "0";
  }
}

async function sendMemberData() {
  try {
    const totalCount = await wixData.query("Members/PublicData").count();
    if (totalCount === 0) return;

    const randomSkip = Math.floor(Math.random() * Math.max(0, totalCount - 10));
    const results = await wixData
      .query("Members/PublicData")
      .skip(randomSkip)
      .limit(100)
      .find();

    if (!results) return;

    const membersWithCustomField = results.items.filter(
      (member) => member["custom_pu-mian-fa-bu-wang-zhi"],
    );

    if (membersWithCustomField.length > 0) {
      const randomIndex = Math.floor(Math.random() * membersWithCustomField.length);
      const member = membersWithCustomField[randomIndex];
      const payload = await buildMemberPayload(member);
      $w("#htmlHomeSection").postMessage({ type: "memberData", data: payload });
    } else {
      $w("#htmlHomeSection").postMessage({ type: "memberData", data: null });
    }
  } catch (err) {
    console.error("加载用户数据时出错：", err);
  }
}

async function buildMemberPayload(member) {
  const memberLink = `https://mmfc.majdata.net/profile/${member.slug}/profile`;
  const rank = await getMemberRank(memberLink, member._id);
  return {
    photo: convertWixImageUrl(member.profilePhoto),
    name: member.nickname,
    rank: rank || null,
    link: member["custom_pu-mian-fa-bu-wang-zhi"] || null,
  };
}

async function getMemberRank(memberLink, userId) {
  try {
    // 首先，检查用户的链接是否存在于Team数据集中
    const linkResult = await wixData
      .query("Team")
      .eq("website", memberLink)
      .limit(100)
      .find();

    if (linkResult.items.length > 0) {
      // 获取所有团队成员，按totalPp降序排列
      const allMembers = await wixData
        .query("Team")
        .descending("totalPp")
        .find();

      // 找出特定用户在排序后的列表中的位置
      const userIndex = allMembers.items.findIndex(
        (item) => item.website === memberLink,
      );

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

async function sendOngakiImage() {
  try {
    const imageUrls = await getOngakiImageUrls();
    if (imageUrls.length > 0) {
      const randomIndex = Math.floor(Math.random() * imageUrls.length);
      const url = convertWixImageUrl(imageUrls[randomIndex]);
      $w("#htmlHomeSection").postMessage({ type: "ongakiImage", url });
    }
  } catch (err) {
    console.error("Error loading ongeki image:", err);
  }
}

// 将 wix:image://v1/{fileId}/... 转换为可直接访问的静态 URL
function convertWixImageUrl(url) {
  if (!url || !url.startsWith("wix:image://")) return url;
  const match = url.match(/wix:image:\/\/v1\/([^/]+)\//);
  if (match) return `https://static.wixstatic.com/media/${match[1]}`;
  return url;
}
