import wixForum from "wix-forum-backend";
import wixData from "wix-data";
import { getUserPublicInfo } from "backend/getUserPublicInfo.jsw";
import { updateUserPoints } from "backend/forumPoints.jsw";
import { POINTS_CONFIG, EVENT_TYPES, COLLECTIONS } from "backend/constants.js";
import { logError } from "backend/errorHandler.js";

export function wixForum_onPostCreated(event) {
  const postId = event.postId;
  const postOwnerId = event.post._ownerId;
  const postTitle = event.post.title; // 获取帖子的标题
  const postPageUrl = event.post.pageUrl; // 获取帖子的页面URL

  console.log("Post created:", postId);

  // 调用 logPostCreatedEvent 记录事件日志到 PostLogs 集合
  logPostCreatedEvent(postId, postTitle, postOwnerId, postPageUrl).catch(
    (error) => {
      console.error("Error logging post created event:", error);
    }
  );

  // 发帖奖励积分
  if (postOwnerId) {
    updateUserPoints(postOwnerId, POINTS_CONFIG.POST_CREATE, false, true).catch(
      (error) => {
        logError("wixForum_onPostCreated - updateUserPoints", error, {
          postId,
          postOwnerId,
        });
      }
    );
  }
}

/**
 * 当新评论创建时触发
 */
export function wixForum_onCommentCreated(event) {
  const commentId = event.commentId;
  const commentOwnerId = event.comment._ownerId;
  console.log("Comment created:", commentId);

  if (commentOwnerId) {
    updateUserPoints(
      commentOwnerId,
      POINTS_CONFIG.COMMENT_CREATE,
      false,
      true
    ).catch((error) => {
      logError("wixForum_onCommentCreated - updateUserPoints", error, {
        commentId,
        commentOwnerId,
      });
    });
  }
}

/**
 * 当评论被标记为最佳答案时触发
 */
export async function wixForum_onCommentMarkedAsBest(event) {
  const bestCommentId = event.commentId;
  console.log("Comment marked as best:", bestCommentId);

  try {
    const commentResult = await wixData
      .query(COLLECTIONS.FORUM_COMMENTS)
      .eq("_id", bestCommentId)
      .find();
    if (commentResult.items.length > 0) {
      const bestAnswerOwnerId = commentResult.items[0]._ownerId;
      logEvent(
        EVENT_TYPES.COMMENT_MARKED_AS_BEST,
        { bestCommentId },
        bestAnswerOwnerId
      );

      updateUserPoints(
        bestAnswerOwnerId,
        POINTS_CONFIG.BEST_ANSWER,
        false,
        false
      ).catch((error) => {
        logError("wixForum_onCommentMarkedAsBest - updateUserPoints", error, {
          bestCommentId,
          bestAnswerOwnerId,
        });
      });
    } else {
      console.error("Comment not found:", bestCommentId);
    }
  } catch (error) {
    logError("wixForum_onCommentMarkedAsBest", error, { bestCommentId });
  }
}

/**
 * 当评论被取消最佳答案标记时触发
 */
export async function wixForum_onCommentUnmarkedAsBest(event) {
  const bestCommentId = event.commentId;
  console.log("Comment unmarked as best:", bestCommentId);

  try {
    const commentResult = await wixData
      .query(COLLECTIONS.FORUM_COMMENTS)
      .eq("_id", bestCommentId)
      .find();
    if (commentResult.items.length > 0) {
      const bestAnswerOwnerId = commentResult.items[0]._ownerId;
      logEvent(
        EVENT_TYPES.COMMENT_UNMARKED_AS_BEST,
        { bestCommentId },
        bestAnswerOwnerId
      );

      updateUserPoints(
        bestAnswerOwnerId,
        POINTS_CONFIG.BEST_ANSWER_REMOVE,
        false,
        false
      ).catch((error) => {
        logError("wixForum_onCommentUnmarkedAsBest - updateUserPoints", error, {
          bestCommentId,
          bestAnswerOwnerId,
        });
      });
    } else {
      console.error("Comment not found:", bestCommentId);
    }
  } catch (error) {
    logError("wixForum_onCommentUnmarkedAsBest", error, { bestCommentId });
  }
}

/**
 * 点赞和取消点赞相关事件处理
 */

/**
 * 当评论被点赞时触发
 */
export async function wixForum_onCommentLiked(event) {
  const likedCommentId = event.commentId;
  try {
    const comment = await wixData
      .query(COLLECTIONS.FORUM_COMMENTS)
      .eq("_id", likedCommentId)
      .find();
    if (comment.items.length > 0) {
      const authorId = comment.items[0]._ownerId;
      logEvent(EVENT_TYPES.COMMENT_LIKED, { likedCommentId }, authorId);
      await updateUserPoints(authorId, POINTS_CONFIG.LIKE_GIVE, false, false);
    }
  } catch (error) {
    logError("wixForum_onCommentLiked", error, { likedCommentId });
  }
}

/**
 * 当评论被取消点赞时触发
 */
export async function wixForum_onCommentUnliked(event) {
  const unlikedCommentId = event.commentId;
  try {
    const comment = await wixData
      .query(COLLECTIONS.FORUM_COMMENTS)
      .eq("_id", unlikedCommentId)
      .find();
    if (comment.items.length > 0) {
      const authorId = comment.items[0]._ownerId;
      logEvent(EVENT_TYPES.COMMENT_UNLIKED, { unlikedCommentId }, authorId);
      await updateUserPoints(authorId, POINTS_CONFIG.LIKE_REMOVE, false, false);
    }
  } catch (error) {
    logError("wixForum_onCommentUnliked", error, { unlikedCommentId });
  }
}

/**
 * 当帖子被点赞时触发
 */
export async function wixForum_onPostLiked(event) {
  const likedPostId = event.postId;
  try {
    const post = await wixData
      .query(COLLECTIONS.FORUM_POSTS)
      .eq("_id", likedPostId)
      .find();
    if (post.items.length > 0) {
      const authorId = post.items[0]._ownerId;
      logEvent(EVENT_TYPES.POST_LIKED, { likedPostId }, authorId);
      await updateUserPoints(authorId, POINTS_CONFIG.LIKE_GIVE, false, false);
    }
  } catch (error) {
    logError("wixForum_onPostLiked", error, { likedPostId });
  }
}

/**
 * 当帖子被取消点赞时触发
 */
export async function wixForum_onPostUnliked(event) {
  const unlikedPostId = event.postId;
  try {
    const post = await wixData
      .query(COLLECTIONS.FORUM_POSTS)
      .eq("_id", unlikedPostId)
      .find();
    if (post.items.length > 0) {
      const authorId = post.items[0]._ownerId;
      logEvent(EVENT_TYPES.POST_UNLIKED, { unlikedPostId }, authorId);
      await updateUserPoints(authorId, POINTS_CONFIG.LIKE_REMOVE, false, false);
    }
  } catch (error) {
    logError("wixForum_onPostUnliked", error, { unlikedPostId });
  }
}

/**
 * 当评论被顶时触发
 */
export async function wixForum_onCommentUpvoted(event) {
  const upvotedCommentId = event.commentId;
  try {
    const comment = await wixData
      .query(COLLECTIONS.FORUM_COMMENTS)
      .eq("_id", upvotedCommentId)
      .find();
    if (comment.items.length > 0) {
      const authorId = comment.items[0]._ownerId;
      logEvent(EVENT_TYPES.COMMENT_UPVOTED, { upvotedCommentId }, authorId);
      await updateUserPoints(authorId, POINTS_CONFIG.UPVOTE_GIVE, false, false);
    }
  } catch (error) {
    logError("wixForum_onCommentUpvoted", error, { upvotedCommentId });
  }
}

/**
 * 当评论被取消顶时触发
 */
export async function wixForum_onCommentUnvoted(event) {
  const unvotedCommentId = event.commentId;
  try {
    const comment = await wixData
      .query(COLLECTIONS.FORUM_COMMENTS)
      .eq("_id", unvotedCommentId)
      .find();
    if (comment.items.length > 0) {
      const authorId = comment.items[0]._ownerId;
      logEvent(EVENT_TYPES.COMMENT_UNVOTED, { unvotedCommentId }, authorId);
      await updateUserPoints(
        authorId,
        POINTS_CONFIG.UPVOTE_REMOVE,
        false,
        false
      );
    }
  } catch (error) {
    logError("wixForum_onCommentUnvoted", error, { unvotedCommentId });
  }
}

/**
 * 当评论被删除时触发
 */
export async function wixForum_onCommentDeleted(event) {
  const deletedCommentId = event.commentId;
  logEvent(EVENT_TYPES.COMMENT_DELETED, { deletedCommentId }, null);

  try {
    const commentQuery = wixData
      .query(COLLECTIONS.FORUM_COMMENTS)
      .eq("_id", deletedCommentId);
    const results = await commentQuery.find();

    if (results.items.length > 0) {
      const comment = results.items[0];
      const authorId = comment._ownerId;
      await updateUserPoints(
        authorId,
        POINTS_CONFIG.COMMENT_DELETE,
        false,
        false
      );
    }
  } catch (error) {
    logError("wixForum_onCommentDeleted", error, { deletedCommentId });
  }
}

async function logEvent(eventType, eventDetails, userId) {
  const userInfo = await getUserPublicInfo(userId);
  if (!userInfo) {
    console.error("Error fetching user info for logging event:", eventType);
    return;
  }

  const logData = {
    eventType: eventType,
    eventDetails: JSON.stringify(eventDetails),
    timestamp: new Date(),
    userId: userId,
    userSlug: userInfo.name, // 添加用户的昵称（slug）
  };

  wixData.insert(COLLECTIONS.EVENT_LOGS, logData).catch((error) => {
    logError("logEvent", error, { eventType, userId });
  });
}

async function logPostCreatedEvent(
  postId,
  postTitle,
  postOwnerId,
  postPageUrl
) {
  // 获取用户的公共信息
  const userInfo = await getUserPublicInfo(postOwnerId);
  if (!userInfo) {
    console.error("Error fetching user info for logging PostCreated event");
    return;
  }

  // 构造日志数据
  const logData = {
    eventType: "PostCreated", // 事件类型
    eventDetails: JSON.stringify({ postId, postTitle, postPageUrl }), // 事件的详细信息，包含页面链接
    timestamp: new Date(), // 事件时间戳
    userId: postOwnerId, // 发帖用户ID
    userSlug: userInfo.name, // 发帖用户昵称
    postId: postId, // 帖子ID
    postTitle: postTitle, // 帖子标题
    postOwnerId: postOwnerId, // 发帖用户ID
    postOwnerName: userInfo.name, // 发帖用户昵称
    postPageUrl: postPageUrl, // 帖子的页面URL
  };

  // 将日志数据插入到 PostLogs CMS 集合
  wixData.insert(COLLECTIONS.POST_LOGS, logData).catch((error) => {
    logError("logPostCreatedEvent", error, { postId, postOwnerId });
  });
}
