// @ts-ignore
import { getEnterContest034Data } from "backend/contestManagement.jsw";
import wixData from "wix-data";
// @ts-ignore
import { getFileDownloadUrlAndContent } from "backend/mediaManagement.jsw";
import { mediaManager } from "wix-media-backend";
import {
  createOptionsResponse,
  createSuccessResponse,
  createErrorResponse,
  asyncErrorHandler,
  validateNumberParam,
  logError,
} from "backend/errorHandler";
import {
  loadAllData,
  calculateViewedVotes,
  isWorkApproved,
  safeJsonParse,
  groupByField,
} from "backend/utils";
import { fetchAllRegistrations } from "backend/ratingTaskManager.jsw";
import {
  FILE_TYPES,
  APPROVAL_CONFIG,
  COLLECTIONS,
  CRYPTO_CONFIG,
  BOT_QUEUE_SECRET,
} from "backend/constants";

/**
 * 处理比赛列表的CORS预检请求
 */
export function options_contestList(request) {
  return createOptionsResponse();
}

/**
 * 处理比赛条目的CORS预检请求
 */
export function options_contestEntry(request) {
  return createOptionsResponse();
}

/**
 * 根据序列ID获取比赛数据
 * @param {number} sequenceId - 序列ID
 * @returns {Promise<Object|null>} 比赛数据或null
 */
export async function getEnterContest034DataBySequenceId(sequenceId) {
  try {
    const results = await wixData
      .query(COLLECTIONS.ENTER_CONTEST_034)
      .eq("sequenceId", sequenceId)
      .find();

    if (results.items.length > 0) {
      const item = results.items[0];
      const approvedList = safeJsonParse(item.approvedByString, []);
      const viewedList = safeJsonParse(item.viewedBy, []);

      const files = {
        txtFileUrl: item.inVideo的複本,
        mp3FileUrl: item.maidata的複本,
        bgFileUrl: item.track的複本,
        bgVideoUrl: item.上傳檔案欄,
        approvedBy: approvedList.length,
        viewedBy: viewedList.length,
      };
      return { ...item, ...files };
    }

    return null;
  } catch (error) {
    logError("getEnterContest034DataBySequenceId", error, { sequenceId });
    return null;
  }
}

/**
 * 获取比赛列表
 * @param {Object} request - 请求对象
 * @returns {Promise<Object>} HTTP响应
 */
export const get_contestList = asyncErrorHandler(async (request) => {
  console.log("Request headers: ", request.headers);

  const data = await getEnterContest034Data();
  if (!data) {
    return createErrorResponse("Data not found", "notFound");
  }

  const filteredData = data.map((item) => {
    // 安全解析 JSON 数据
    const approvedList = safeJsonParse(item.approvedByString, []);
    const viewedList = safeJsonParse(item.viewedBy, []);

    const approvedCount = approvedList.length;
    const viewedCount = viewedList.length;

    // 计算查看数对应的投票数
    const viewedVotes = calculateViewedVotes(viewedCount);

    // 判断是否过审
    const isApproved = isWorkApproved(approvedCount, viewedCount);

    return {
      Title: item.firstName,
      sequenceId: item.sequenceId,
      Description: item.較長答案欄,
      AllowDownload: true,
      approvedBy: approvedCount,
      viewedBy: viewedCount,
      IsApproved: isApproved,
      submissionTime: item.submissionTime,
      isDQ: item.isDq === true,
    };
  });

  return createSuccessResponse(filteredData);
});

/**
 * 获取比赛条目文件
 * @param {Object} request - 请求对象
 * @returns {Promise<Object>} HTTP响应
 */
export const get_contestEntry = asyncErrorHandler(async (request) => {
  const sequenceId = validateNumberParam(request.path[0], "sequenceId");
  const fileType = validateNumberParam(request.path[1], "fileType");

  const data = await getEnterContest034DataBySequenceId(sequenceId);
  if (!data) {
    return createErrorResponse(
      `Data not found for sequenceId: ${sequenceId}`,
      "notFound"
    );
  }

  let responseContentType = "json";
  let responseBody;

  switch (fileType) {
    case FILE_TYPES.TXT: {
      const { fileContent: txtFile } = await getFileDownloadUrlAndContent(
        data.txtFileUrl
      );
      responseContentType = "text";
      responseBody = txtFile;
      // 注释掉的加密逻辑保留以备将来使用
      // const encryptedTxtFile = CryptoJS.AES.encrypt(txtFile, CRYPTO_CONFIG.SECRET_KEY).toString();
      // responseBody = encryptedTxtFile;
      break;
    }
    case FILE_TYPES.MP3: {
      responseBody = {
        downloadUrl: await mediaManager.getDownloadUrl(data.mp3FileUrl),
      };
      break;
    }
    case FILE_TYPES.BG: {
      responseBody = {
        downloadUrl: await mediaManager.getDownloadUrl(data.bgFileUrl),
      };
      break;
    }
    case FILE_TYPES.VIDEO: {
      responseBody = {
        downloadUrl: await mediaManager.getDownloadUrl(data.bgVideoUrl),
      };
      break;
    }
    default:
      return createErrorResponse(
        `Invalid file type parameter: ${fileType}`,
        "badRequest"
      );
  }

  return createSuccessResponse(responseBody, responseContentType);
});

/**
 * 获取按作品编号分组的评论
 * @param {Object} request - 请求对象
 * @returns {Promise<Object>} HTTP响应
 */
export const get_comments = asyncErrorHandler(async (request) => {
  const query = wixData.query(COLLECTIONS.BOF_COMMENT).ascending("workNumber");
  const allItems = await loadAllData(query);

  if (allItems.length === 0) {
    return createErrorResponse("No data found", "notFound");
  }

  // 使用工具函数按 workNumber 进行分组，只提取 comment 字段
  const groupedByWorkNumber = groupByField(allItems, "workNumber", "comment");

  return createSuccessResponse(groupedByWorkNumber);
});

/**
 * Get comments for a single work number.
 * Returns only comment text, score, and comment type flags.
 * @param {Object} request - HTTP request
 * @returns {Promise<Object>} HTTP response
 */
export const get_comment = asyncErrorHandler(async (request) => {
  const workNumber = validateNumberParam(request.path[0], "workNumber");

  const query = wixData
    .query(COLLECTIONS.BOF_COMMENT)
    .eq("workNumber", workNumber)
    .ascending("_createdDate");
  const comments = await loadAllData(query);

  if (comments.length === 0) {
    return createSuccessResponse([]);
  }

  let workOwnerId = null;
  try {
    const workResult = await wixData
      .query(COLLECTIONS.ENTER_CONTEST_034)
      .eq("sequenceId", workNumber)
      .limit(1)
      .find();
    if (workResult.items.length > 0) {
      workOwnerId = workResult.items[0]._owner;
    }
  } catch (error) {
    logError("get_comment", error, { workNumber });
  }

  const ownerIdSet = new Set(
    comments.map((comment) => comment._owner).filter(Boolean)
  );
  const highQualityMap = {};

  if (ownerIdSet.size > 0) {
    try {
      const registrations = await fetchAllRegistrations();
      registrations.forEach((reg) => {
        if (ownerIdSet.has(reg._owner)) {
          highQualityMap[reg._owner] = reg.isHighQuality === true;
        }
      });
    } catch (error) {
      logError("get_comment registrations", error, { workNumber });
    }
  }

  const responseItems = comments.map((comment) => {
    const isReply = Boolean(comment.replyTo);
    const isSelfScComment =
      !isReply && Boolean(workOwnerId) && comment._owner === workOwnerId;
    const isHighQuality = highQualityMap[comment._owner] === true;

    return {
      comment: comment.comment,
      score: comment.score,
      isReply: isReply,
      isSelfScComment: isSelfScComment,
      isHighQuality: isHighQuality,
    };
  });

  return createSuccessResponse(responseItems);
});

/**
 * 积分排行榜数据（供 HTML 嵌入组件直接 fetch）
 * 注意：直接在函数体内查询，避免通过 jsw 调用产生权限上下文问题
 */
export function options_leaderboard(request) {
  return createOptionsResponse();
}

export const get_leaderboard = asyncErrorHandler(async (request) => {
  const AUTH_OPTS = { suppressAuth: true };
  const LIMIT = 50;

  const pointsResult = await wixData
    .query(COLLECTIONS.USER_POINTS)
    .descending("points")
    .limit(LIMIT)
    .find(AUTH_OPTS);

  const items = pointsResult.items;
  if (!items.length) return createSuccessResponse([]);

  const userIds = items.map((i) => i.userId).filter(Boolean);

  const memberResult = await wixData
    .query("Members/PublicData")
    .hasSome("_id", userIds)
    .limit(LIMIT)
    .find(AUTH_OPTS);

  const memberMap = {};
  memberResult.items.forEach((m) => { memberMap[m._id] = m; });

  const users = items.map((item, i) => {
    const m = memberMap[item.userId] || null;
    return {
      rank: i + 1,
      name: (m && m.nickname) ? m.nickname : "—",
      points: item.points != null ? item.points : 0,
      profilePhoto: (m && m.profilePhoto) ? m.profilePhoto : "",
      slug: (m && m.slug) ? m.slug : "",
    };
  });

  return createSuccessResponse(users);
});

/**
 * 获取按帖子ID分组的帖子日志
 * @param {Object} request - 请求对象
 * @returns {Promise<Object>} HTTP响应
 */
export const get_postLogs = asyncErrorHandler(async (request) => {
  const query = wixData.query(COLLECTIONS.POST_LOGS).ascending("timestamp");
  const allItems = await loadAllData(query);

  if (allItems.length === 0) {
    return createErrorResponse("No data found", "notFound");
  }

  // 使用工具函数按 postId 进行分组
  const groupedByPostId = groupByField(allItems, "postId");

  return createSuccessResponse(groupedByPostId);
});

// ===================== Bot 消息队列接口 =====================

export function options_botQueue(request) {
  return createOptionsResponse();
}

export function options_botQueueAck(request) {
  return createOptionsResponse();
}

export function options_botQueueHistory(request) {
  return createOptionsResponse();
}

/**
 * Bot 轮询接口：获取所有 pending 状态的消息任务
 * 需要在 query string 中携带 secret=BOT_QUEUE_SECRET
 */
export const get_botQueue = asyncErrorHandler(async (request) => {
  const secret = request.query && request.query.secret;
  if (secret !== BOT_QUEUE_SECRET) {
    return createErrorResponse("Unauthorized", "forbidden");
  }

  const result = await wixData
    .query(COLLECTIONS.BOT_QUEUE)
    .eq("status", "pending")
    .ascending("_createdDate")
    .limit(50)
    .find({ suppressAuth: true });

  const items = result.items.map((item) => ({
    _id: item._id,
    itemId: item.itemId,
    itemName: item.itemName,
    message: item.message,
    groupId: item.groupId,
  }));

  return createSuccessResponse(items);
});

/**
 * 今日大喇叭历史查询：返回今天内 status=done 的记录
 * 需要 ?secret=BOT_QUEUE_SECRET
 */
export const get_botQueueHistory = asyncErrorHandler(async (request) => {
  const secret = request.query && request.query.secret;
  if (secret !== BOT_QUEUE_SECRET) {
    return createErrorResponse("Unauthorized", "forbidden");
  }

  // 取今天 CST 00:00:00（UTC+8）对应的 UTC 时间戳
  const nowUtc = new Date();
  const cstOffset = 8 * 60 * 60 * 1000;
  const cstMidnight = new Date(
    Math.floor((nowUtc.getTime() + cstOffset) / 86400000) * 86400000 - cstOffset
  );

  const result = await wixData
    .query(COLLECTIONS.BOT_QUEUE)
    .eq("status", "done")
    .ge("_createdDate", cstMidnight)
    .ascending("_createdDate")
    .limit(100)
    .find({ suppressAuth: true });

  const items = result.items.map((item) => ({
    message: item.message,
    createdDate: item._createdDate,
  }));

  return createSuccessResponse(items);
});

/**
 * Bot 确认接口：将已处理的任务标记为 done
 * Body: { secret: string, id: string }
 */
/**
 * 推荐榜公开展示接口：无需鉴权，供前端轮播直接调用
 */
export function options_recommendBoard(request) {
  return createOptionsResponse();
}

export const get_recommendBoard = asyncErrorHandler(async (request) => {
  const result = await wixData
    .query(COLLECTIONS.RECOMMENDED_WORKS)
    .eq("status", "active")
    .descending("_createdDate")
    .limit(50)
    .find({ suppressAuth: true });

  const items = result.items.map((item) => ({
    sequenceId: item.sequenceId,
    workTitle: item.workTitle,
    comment: item.comment,
    createdDate: item._createdDate,
  }));

  return createSuccessResponse(items);
});

/**
 * 推荐榜接口：获取所有 active 状态的推荐条目（供 Bot 拉取渲染）
 * 需要在 query string 中携带 secret=BOT_QUEUE_SECRET
 */
export function options_recommendedWorks(request) {
  return createOptionsResponse();
}

export const get_recommendedWorks = asyncErrorHandler(async (request) => {
  const secret = request.query && request.query.secret;
  if (secret !== BOT_QUEUE_SECRET) {
    return createErrorResponse("Unauthorized", "forbidden");
  }

  const result = await wixData
    .query(COLLECTIONS.RECOMMENDED_WORKS)
    .eq("status", "active")
    .descending("_createdDate")
    .limit(50)
    .find({ suppressAuth: true });

  const items = result.items.map((item) => ({
    _id: item._id,
    sequenceId: item.sequenceId,
    workTitle: item.workTitle,
    comment: item.comment,
    createdDate: item._createdDate,
  }));

  return createSuccessResponse(items);
});

// ===================== 手元视频同步接口 =====================

export function options_shouyuanSync(request) {
  return createOptionsResponse();
}

export function options_shouyuan(request) {
  return createOptionsResponse();
}

/**
 * Bot 推送手元数据批量同步
 * Body: { secret, entries: { "sequenceId": { title, videos: [{url, cover, videoTitle, bvid}] } } }
 */
export const post_shouyuanSync = asyncErrorHandler(async (request) => {
  const body = await request.body.json();
  if (!body || body.secret !== BOT_QUEUE_SECRET) {
    return createErrorResponse("Unauthorized", "forbidden");
  }

  const entries = body.entries;
  if (!entries || typeof entries !== "object") {
    return createErrorResponse("Missing entries", "badRequest");
  }

  const entryKeys = Object.keys(entries);
  const sequenceIds = entryKeys
    .map((k) => parseInt(k, 10))
    .filter((n) => !isNaN(n));

  if (sequenceIds.length === 0) {
    return createSuccessResponse({ upserted: 0 });
  }

  // 一次性查出这批已存在的记录
  const existingResult = await wixData
    .query(COLLECTIONS.MMFC_SHOUYUAN)
    .hasSome("sequenceId", sequenceIds)
    .limit(sequenceIds.length + 10)
    .find({ suppressAuth: true });

  const existingMap = {};
  existingResult.items.forEach((item) => {
    existingMap[item.sequenceId] = item;
  });

  const toUpdate = [];
  const toInsert = [];

  for (const sequenceId of sequenceIds) {
    const entry = entries[String(sequenceId)];
    if (!entry) continue;

    const title = entry.title || "";
    const videos = entry.videos || [];
    const videosJson = JSON.stringify(Array.isArray(videos) ? videos : []);
    const videoCount = Array.isArray(videos) ? videos.length : 0;

    if (existingMap[sequenceId]) {
      const item = existingMap[sequenceId];
      item.title = title;
      item.videosJson = videosJson;
      item.videoCount = videoCount;
      toUpdate.push(item);
    } else {
      toInsert.push({ sequenceId, title, videosJson, videoCount });
    }
  }

  // 并发执行批量插入和批量更新
  const ops = [];
  if (toInsert.length > 0) {
    ops.push(
      wixData.bulkInsert(COLLECTIONS.MMFC_SHOUYUAN, toInsert, {
        suppressAuth: true,
      })
    );
  }
  if (toUpdate.length > 0) {
    ops.push(
      wixData.bulkUpdate(COLLECTIONS.MMFC_SHOUYUAN, toUpdate, {
        suppressAuth: true,
      })
    );
  }

  await Promise.all(ops);

  return createSuccessResponse({ upserted: sequenceIds.length });
});

/**
 * 获取指定作品的手元视频列表
 * GET /shouyuan/{sequenceId}
 */
export const get_shouyuan = asyncErrorHandler(async (request) => {
  const sequenceId = validateNumberParam(request.path[0], "sequenceId");

  const result = await wixData
    .query(COLLECTIONS.MMFC_SHOUYUAN)
    .eq("sequenceId", sequenceId)
    .limit(1)
    .find({ suppressAuth: true });

  if (result.items.length === 0) {
    return createSuccessResponse({ sequenceId, title: "", videos: [] });
  }

  const item = result.items[0];
  let videos = [];
  try {
    videos = JSON.parse(item.videosJson || "[]");
  } catch (_e) {
    videos = [];
  }

  return createSuccessResponse({
    sequenceId: item.sequenceId,
    title: item.title || "",
    videos,
  });
});

// ===================== Bot 消息队列接口（续） =====================

export const post_botQueueAck = asyncErrorHandler(async (request) => {
  const body = await request.body.json();
  if (!body || body.secret !== BOT_QUEUE_SECRET) {
    return createErrorResponse("Unauthorized", "forbidden");
  }

  const { id } = body;
  if (!id) {
    return createErrorResponse("Missing id", "badRequest");
  }

  const existing = await wixData.get(COLLECTIONS.BOT_QUEUE, id, {
    suppressAuth: true,
  });
  if (!existing) {
    return createErrorResponse("Item not found", "notFound");
  }

  await wixData.update(
    COLLECTIONS.BOT_QUEUE,
    { ...existing, status: "done" },
    { suppressAuth: true }
  );

  return createSuccessResponse({ acknowledged: true });
});
