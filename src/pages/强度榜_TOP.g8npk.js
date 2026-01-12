import wixUsers from "wix-users";
import {
  getStrengthVoteStatus,
  requestStrengthComparison,
  submitStrengthVote,
  getStrengthLeaderboard,
  getStrengthLeaderboardForUser,
  getStrengthUserPersonalRanking,
  getUserVoteCount,
} from "backend/strengthVote.jsw";
import { getCurrentMemberRoles } from "backend/auditorManagement.jsw";

const HTML_ID = "#strengthVoteHtml";
let htmlComponent = null;
let currentUserId = null;
let isAdmin = false;
let userVoteCount = 0;

$w.onReady(function () {
  currentUserId = wixUsers.currentUser.id || null;
  initAdminStatus();
  setupHtmlBridge();

  wixUsers.onLogin((user) => {
    currentUserId = user.id;
    initAdminStatus();
    pushStatus();
    pushVoteCount();
  });
});

async function initAdminStatus() {
  try {
    const roles = await getCurrentMemberRoles();
    isAdmin = Array.isArray(roles) && roles.some((role) => role.title === "Admin");
  } catch (error) {
    isAdmin = false;
  }
}

function setupHtmlBridge() {
  try {
    htmlComponent = $w(HTML_ID);
  } catch (error) {
    console.error(
      "[强度榜] 未找到 HTML 元件，请在页面中添加 id 为 strengthVoteHtml 的自定义元素",
      error
    );
    return;
  }

  if (!htmlComponent || !htmlComponent.onMessage) {
    console.error("[强度榜] HTML 元件不可用");
    return;
  }

  htmlComponent.onMessage(async (event) => {
    const { type, data } = event.data || {};

    switch (type) {
      case "STRENGTH_VOTE_READY":
        await pushStatus();
        await pushLeaderboard();
        break;
      case "REQUEST_STATUS":
        await pushStatus();
        break;
      case "REQUEST_LOGIN":
        await handleLoginRequest();
        break;
      case "REQUEST_NEW_COMPARE":
        await handleNewCompareRequest();
        break;
      case "SUBMIT_VOTE":
        await handleSubmitVote(data);
        break;
      case "REQUEST_LEADERBOARD":
        await pushLeaderboard();
        break;
      default:
        break;
    }
  });

  pushStatus();
  pushLeaderboard();
}

function postToHtml(type, data) {
  try {
    if (htmlComponent) {
      htmlComponent.postMessage({ type, data });
    }
  } catch (error) {
    console.error("[强度榜] 发送消息失败", type, error);
  }
}

async function pushStatus() {
  if (!htmlComponent) {
    return;
  }

  if (!wixUsers.currentUser.loggedIn) {
    postToHtml("STATUS", {
      eligible: false,
      reason: "notLoggedIn",
      totalCompleted: 0,
      targetCompletion: 10,
    });
    return;
  }

  try {
    const status = await getStrengthVoteStatus(currentUserId);
    postToHtml("STATUS", status);
    await pushVoteCount(); // 获取服务器侧的已投票次数
  } catch (error) {
    console.error("[强度榜] 获取资格状态失败", error);
    postToHtml("STATUS", {
      eligible: false,
      reason: "serverError",
      message: "获取资格状态失败",
      totalCompleted: 0,
      targetCompletion: 10,
    });
  }
}

async function handleLoginRequest() {
  try {
    await wixUsers.promptLogin({ mode: "login" });
    currentUserId = wixUsers.currentUser.id || null;
    await pushStatus();
  } catch (error) {
    postToHtml("ERROR", { message: "已取消登录" });
  }
}

function ensureLoggedIn() {
  if (!wixUsers.currentUser.loggedIn) {
    postToHtml("ERROR", { message: "请先登录后再参与投票" });
    return false;
  }
  return true;
}

async function handleNewCompareRequest() {
  if (!ensureLoggedIn()) {
    return;
  }

  try {
    const result = await requestStrengthComparison(currentUserId);
    postToHtml("NEW_COMPARE", result);
  } catch (error) {
    console.error("[强度榜] 获取对决失败", error);
    postToHtml("ERROR", { message: "获取对决失败，请稍后重试" });
  }
}

async function handleSubmitVote(data) {
  if (!ensureLoggedIn()) {
    return;
  }

  const { sessionId, winnerWorkNumber } = data || {};
  if (
    !sessionId ||
    winnerWorkNumber === undefined ||
    winnerWorkNumber === null
  ) {
    postToHtml("ERROR", { message: "票据或作品编号缺失" });
    return;
  }

  const winnerNumber = Number(winnerWorkNumber);
  if (Number.isNaN(winnerNumber)) {
    postToHtml("ERROR", { message: "作品编号格式错误" });
    return;
  }

  try {
    const result = await submitStrengthVote(
      currentUserId,
      sessionId,
      winnerNumber
    );

    postToHtml("VOTE_RESULT", result);

    if (result?.success) {
      await pushLeaderboard();
    }
  } catch (error) {
    console.error("[强度榜] 提交投票失败", error);
    postToHtml("ERROR", { message: "提交投票失败，请稍后重试" });
  }
}

async function pushLeaderboard() {
  if (!htmlComponent) {
    return;
  }

  try {
    // 个人偏好榜（用户自己的投票选择次数）
    const personalItems = currentUserId
      ? await getStrengthUserPersonalRanking(currentUserId, 10)
      : [];
    postToHtml("LEADERBOARD_PERSONAL", { items: personalItems });

    // 全站榜单（仅管理员可见）
    if (isAdmin) {
      const items = await getStrengthLeaderboard(50);
      postToHtml("LEADERBOARD_GLOBAL", { items, isAdmin: true });
    } else {
      postToHtml("LEADERBOARD_GLOBAL", { items: [], isAdmin: false });
    }
  } catch (error) {
    console.error("[强度榜] 获取榜单失败", error);
    postToHtml("ERROR", { message: "获取榜单失败" });
  }
}

async function pushVoteCount() {
  if (!htmlComponent || !currentUserId) {
    postToHtml("VOTE_COUNT", { count: 0 });
    return;
  }

  try {
    userVoteCount = await getUserVoteCount(currentUserId);
    postToHtml("VOTE_COUNT", { count: userVoteCount });
  } catch (error) {
    console.error("[强度榜] 获取用户投票次数失败", error);
    postToHtml("VOTE_COUNT", { count: 0 });
  }
}
