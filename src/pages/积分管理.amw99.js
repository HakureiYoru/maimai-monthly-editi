import { checkIsSeaSelectionMember } from "backend/auditorManagement.jsw";
import {
  getHornUsageLeaderboard,
  getPointsManagementUsers,
  searchPointsManagementUser,
  updateUserPointsAdmin,
} from "backend/pageUtils.jsw";

let latestUsers = [];
let selectedUserId = "";

$w.onReady(async function () {
  setupPointsAdminMessages();
  setupHornUsageMessages();

  const hasPermission = await checkIsSeaSelectionMember();
  if (!hasPermission) {
    postToPointsAdmin({
      type: "POINTS_ADMIN_ERROR",
      message: "您没有权限访问积分管理页",
    });
    return;
  }

  await loadPointsUsers();
  await loadHornUsageLeaderboard();
});

function setupPointsAdminMessages() {
  const panel = getPointsAdminPanel();
  if (!panel) {
    return;
  }

  panel.onMessage(async (event) => {
    const data = parseMessage(event.data);
    if (!data) {
      return;
    }

    switch (data.action) {
      case "ready":
        await loadPointsUsers();
        break;
      case "selectUser":
        selectedUserId = data.userId || "";
        break;
      case "searchUser":
        await handleSearchUser(data.searchTerm);
        break;
      case "adjustPoints":
        await handleAdjustPoints(data);
        break;
      case "refresh":
        await loadPointsUsers();
        await loadHornUsageLeaderboard();
        break;
      case "hornLeaderboardReady":
        await loadHornUsageLeaderboard();
        break;
      case "refreshHornLeaderboard":
        await loadHornUsageLeaderboard();
        break;
      default:
        break;
    }
  });
}

function setupHornUsageMessages() {
  const panel = getHornUsagePanel();
  if (!panel) {
    return;
  }

  panel.onMessage(async (event) => {
    const data = parseMessage(event.data);
    if (!data) {
      return;
    }

    if (
      data.action === "ready" ||
      data.action === "hornLeaderboardReady" ||
      data.action === "refreshHornLeaderboard"
    ) {
      await loadHornUsageLeaderboard();
    }
  });
}

async function loadPointsUsers() {
  postToPointsAdmin({ type: "POINTS_ADMIN_LOADING", message: "正在加载积分清单..." });

  const result = await getPointsManagementUsers(1000);
  if (!result.success) {
    postToPointsAdmin({
      type: "POINTS_ADMIN_ERROR",
      message: result.message || "积分清单加载失败",
    });
    return;
  }

  latestUsers = result.users || [];
  postToPointsAdmin({
    type: "POINTS_ADMIN_DATA",
    users: latestUsers,
    selectedUserId,
  });
}

async function loadHornUsageLeaderboard() {
  postToHornUsageLeaderboard({
    type: "HORN_USAGE_LOADING",
    message: "正在加载大喇叭使用榜...",
  });

  const result = await getHornUsageLeaderboard(100);
  if (!result.success) {
    postToHornUsageLeaderboard({
      type: "HORN_USAGE_ERROR",
      message: result.message || "大喇叭使用榜加载失败",
    });
    return;
  }

  postToHornUsageLeaderboard({
    type: "HORN_USAGE_DATA",
    users: result.users || [],
    totalUsers: result.totalUsers || 0,
    totalUsage: result.totalUsage || 0,
  });
}

async function handleSearchUser(searchTerm) {
  const normalizedSearchTerm = (searchTerm || "").trim();
  if (!normalizedSearchTerm) {
    postToPointsAdmin({
      type: "POINTS_ADMIN_NOTICE",
      success: false,
      message: "请输入用户昵称或 ID",
    });
    return;
  }

  postToPointsAdmin({ type: "POINTS_ADMIN_SEARCHING" });

  const result = await searchPointsManagementUser(normalizedSearchTerm);
  if (!result.success) {
    postToPointsAdmin({
      type: "POINTS_ADMIN_SEARCH_RESULTS",
      users: [],
      selectedUserId,
      searchCount: 0,
      searchTerm: normalizedSearchTerm,
      message: result.message || "未找到该用户",
    });
    return;
  }

  const matchedUsers = result.users || (result.user ? [result.user] : []);
  matchedUsers.forEach((user) => upsertUser(user));
  postToPointsAdmin({
    type: "POINTS_ADMIN_SEARCH_RESULTS",
    users: matchedUsers,
    selectedUserId,
    searchCount: matchedUsers.length,
    searchTerm: normalizedSearchTerm,
  });
}

async function handleAdjustPoints(data) {
  const userId = (data.userId || selectedUserId || "").trim();
  const delta = Number(data.delta);

  if (!userId || !Number.isFinite(delta) || delta === 0) {
    postToPointsAdmin({
      type: "POINTS_ADMIN_OPERATION_RESULT",
      success: false,
      message: "请选择用户并输入非 0 积分",
    });
    return;
  }

  postToPointsAdmin({
    type: "POINTS_ADMIN_OPERATION_PENDING",
    userId,
  });

  const result = await updateUserPointsAdmin(userId, delta);
  if (!result.success) {
    postToPointsAdmin({
      type: "POINTS_ADMIN_OPERATION_RESULT",
      success: false,
      message: result.message || "积分更新失败",
    });
    return;
  }

  selectedUserId = userId;

  const searchResult = await searchPointsManagementUser(userId);
  if (searchResult.success) {
    upsertUser(searchResult.user);
  } else {
    updateCachedUserPoints(userId, result.newPoints);
  }

  postToPointsAdmin({
    type: "POINTS_ADMIN_OPERATION_RESULT",
    success: true,
    message: result.message,
    userId,
    delta: result.delta,
    newPoints: result.newPoints,
    users: latestUsers,
    selectedUserId,
  });

  await loadPointsUsers();
}

function upsertUser(user) {
  const index = latestUsers.findIndex((item) => item.userId === user.userId);
  if (index >= 0) {
    latestUsers[index] = { ...latestUsers[index], ...user };
  } else {
    latestUsers.unshift(user);
  }
}

function updateCachedUserPoints(userId, points) {
  latestUsers = latestUsers.map((user) =>
    user.userId === userId ? { ...user, points } : user
  );
}

function parseMessage(rawData) {
  if (typeof rawData !== "string") {
    return rawData;
  }

  try {
    return JSON.parse(rawData);
  } catch (error) {
    return null;
  }
}

function getPointsAdminPanel() {
  try {
    // @ts-ignore - 自定义HTML元件ID
    return $w("#htmlPointsAdmin");
  } catch (error) {
    console.warn("[积分管理] 未找到 HTML 元件 #htmlPointsAdmin");
    return null;
  }
}

function getHornUsagePanel() {
  try {
    // @ts-ignore - 自定义HTML元件ID
    return $w("#htmlHornUsageLeaderboard");
  } catch (error) {
    console.warn("[积分管理] 未找到 HTML 元件 #htmlHornUsageLeaderboard");
    return null;
  }
}

function postToPointsAdmin(payload) {
  const panel = getPointsAdminPanel();
  if (panel) {
    panel.postMessage(payload);
  }
}

function postToHornUsageLeaderboard(payload) {
  const panel = getHornUsagePanel();
  if (panel) {
    panel.postMessage(payload);
  }
}
