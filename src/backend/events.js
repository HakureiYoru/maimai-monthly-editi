import wixForum from 'wix-forum-backend';
import wixData from 'wix-data';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';
import { updateUserPoints } from 'backend/forumPoints.jsw';

export function wixForum_onPostCreated(event) {
    const postId = event.postId;
    const postOwnerId = event.post._ownerId;
    const postTitle = event.post.title;  // 获取帖子的标题
    const postPageUrl = event.post.pageUrl; // 获取帖子的页面URL

    console.log('Post created:', postId);

    // 调用 logPostCreatedEvent 记录事件日志到 PostLogs 集合
    logPostCreatedEvent(postId, postTitle, postOwnerId, postPageUrl)
        .catch((error) => {
            console.error('Error logging post created event:', error);
        });

    // 发帖奖励积分
    if (postOwnerId) {
        updateUserPoints(postOwnerId, 10, false, true) // 发帖奖励10分
            .catch((error) => {
                console.error('Error updating user points:', error);
            });
    }
}


// 当新评论创建时触发
export function wixForum_onCommentCreated(event) {
    const commentId = event.commentId;
    const commentOwnerId = event.comment._ownerId;
    console.log('comment');
    //logEvent('CommentCreated', { commentId: commentId }, commentOwnerId);
    if (commentOwnerId) {
        updateUserPoints(commentOwnerId, 5, false, true) // 评论奖励5分，可自定义
            .catch((error) => {
                console.error('Error updating user points:', error);
            });
    }
}

export async function wixForum_onCommentMarkedAsBest(event) {
    const bestCommentId = event.commentId;
    console.log("Comment marked as best");

    try {
        const commentResult = await wixData.query('Forum/Comments').eq('_id', bestCommentId).find();
        if (commentResult.items.length > 0) {
            const bestAnswerOwnerId = commentResult.items[0]._ownerId;
            logEvent('CommentMarkedAsBest', { bestCommentId: bestCommentId }, bestAnswerOwnerId);
            // 在这里调用 updateUserPoints 函数，为最佳答案的作者增加积分
            updateUserPoints(bestAnswerOwnerId, 40, false, false)
                .catch((error) => {
                    console.error('Error updating user points for best answer:', error);
                });

        } else {
            console.error('Comment not found:', bestCommentId);
        }
    } catch (error) {
        console.error('Error querying comment:', error);
    }
}

export async function wixForum_onCommentUnmarkedAsBest(event) {
    const bestCommentId = event.commentId;
    console.log("Comment unmarked as best");

    try {
        const commentResult = await wixData.query('Forum/Comments').eq('_id', bestCommentId).find();
        if (commentResult.items.length > 0) {
            const bestAnswerOwnerId = commentResult.items[0]._ownerId;
            logEvent('CommentUnmarkedAsBest', { bestCommentId: bestCommentId }, bestAnswerOwnerId);
            // 在这里调用 updateUserPoints 函数，将最佳答案的作者积分减少 10 分
            updateUserPoints(bestAnswerOwnerId, -40, false, false)
                .catch((error) => {
                    console.error('Error updating user points for unmarked best answer:', error);
                });

        } else {
            console.error('Comment not found:', bestCommentId);
        }
    } catch (error) {
        console.error('Error querying comment:', error);
    }
}

//下面是给帖子点赞、评论点赞、取消点赞

export async function wixForum_onCommentLiked(event) {
    const likedCommentId = event.commentId;
    const comment = await wixData.query('Forum/Comments').eq('_id', likedCommentId).find();
    const authorId = comment.items[0]._ownerId;
    logEvent('CommentLiked', { likedCommentId: likedCommentId }, authorId);

    await updateUserPoints(authorId, 2, false, false);
}

export async function wixForum_onCommentUnliked(event) {
    const unlikedCommentId = event.commentId;
    const comment = await wixData.query('Forum/Comments').eq('_id', unlikedCommentId).find();
    const authorId = comment.items[0]._ownerId;
    logEvent('CommentUnliked', { unlikedCommentId: unlikedCommentId }, authorId);

    await updateUserPoints(authorId, -2, false, false);
}

export async function wixForum_onPostLiked(event) {
    const likedPostId = event.postId;
    const post = await wixData.query('Forum/Posts').eq('_id', likedPostId).find();
    const authorId = post.items[0]._ownerId;
    logEvent('PostLiked', { likedPostId: likedPostId }, authorId);

    await updateUserPoints(authorId, 2, false, false);
}

export async function wixForum_onPostUnliked(event) {
    const unlikedPostId = event.postId;
    const post = await wixData.query('Forum/Posts').eq('_id', unlikedPostId).find();
    const authorId = post.items[0]._ownerId;
    logEvent('PostUnliked', { unlikedPostId: unlikedPostId }, authorId);

    await updateUserPoints(authorId, -2, false, false);
}

export async function wixForum_onCommentUpvoted(event) {
    const upvotedCommentId = event.commentId;
    const comment = await wixData.query('Forum/Comments').eq('_id', upvotedCommentId).find();
    const authorId = comment.items[0]._ownerId;
    logEvent('CommentUpvoted', { upvotedCommentId: upvotedCommentId }, authorId);

    await updateUserPoints(authorId, 2, false, false);
}

export async function wixForum_onCommentUnvoted(event) {
    const unvotedCommentId = event.commentId;
    const comment = await wixData.query('Forum/Comments').eq('_id', unvotedCommentId).find();
    const authorId = comment.items[0]._ownerId;
    logEvent('CommentUnvoted', { unvotedCommentId: unvotedCommentId }, authorId);

    await updateUserPoints(authorId, -2, false, false);
}

export function wixForum_onCommentDeleted(event) {
    const deletedCommentId = event.commentId;
    const commentQuery = wixData.query('Forum/Comments').eq('_id', deletedCommentId);
    logEvent('CommentDeleted', { deletedCommentId: deletedCommentId }, null);

    commentQuery.find().then(async (results) => {
        const comment = results.items[0];
        const authorId = comment._ownerId;
        await updateUserPoints(authorId, -15, false, false);
    }).catch((error) => {
        console.error(error);
    });
}

async function logEvent(eventType, eventDetails, userId) {
    const userInfo = await getUserPublicInfo(userId);
    if (!userInfo) {
        console.error('Error fetching user info for logging event:', eventType);
        return;
    }

    const logData = {
        eventType: eventType,
        eventDetails: JSON.stringify(eventDetails),
        timestamp: new Date(),
        userId: userId,
        userSlug: userInfo.name // 添加用户的昵称（slug）
    };

    wixData.insert('EventLogs', logData)
        .catch((error) => {
            console.error('Error logging event:', error);
        });
}

async function logPostCreatedEvent(postId, postTitle, postOwnerId, postPageUrl) {
    // 获取用户的公共信息
    const userInfo = await getUserPublicInfo(postOwnerId);
    if (!userInfo) {
        console.error('Error fetching user info for logging PostCreated event');
        return;
    }

    // 构造日志数据
    const logData = {
        eventType: 'PostCreated',   // 事件类型
        eventDetails: JSON.stringify({ postId, postTitle, postPageUrl }),  // 事件的详细信息，包含页面链接
        timestamp: new Date(),   // 事件时间戳
        userId: postOwnerId,     // 发帖用户ID
        userSlug: userInfo.name, // 发帖用户昵称
        postId: postId,          // 帖子ID
        postTitle: postTitle,    // 帖子标题
        postOwnerId: postOwnerId, // 发帖用户ID
        postOwnerName: userInfo.name, // 发帖用户昵称
        postPageUrl: postPageUrl // 帖子的页面URL
    };

    // 将日志数据插入到 PostLogs CMS 集合
    wixData.insert('PostLogs', logData)
        .catch((error) => {
            console.error('Error logging PostCreated event:', error);
        });
}
