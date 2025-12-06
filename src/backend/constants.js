/**
 * 项目常量配置中心
 * 统一管理所有硬编码的配置值
 */

// HTTP响应头常量
export const HTTP_HEADERS = {
  CORS: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "*",
    "Access-Control-Max-Age": "86400",
  },
  JSON_CORS: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  },
  TEXT_CORS: {
    "Content-Type": "text/plain",
    "Access-Control-Allow-Origin": "*",
  },
};

// 积分系统常量
export const POINTS_CONFIG = {
  // 基础积分奖励
  POST_CREATE: 10, // 发帖奖励
  COMMENT_CREATE: 5, // 评论奖励
  LIKE_GIVE: 2, // 点赞给予
  UPVOTE_GIVE: 2, // 顶踩给予
  BEST_ANSWER: 40, // 最佳答案奖励

  // 积分惩罚
  COMMENT_DELETE: -15, // 删除评论扣分
  LIKE_REMOVE: -2, // 取消点赞扣分
  UPVOTE_REMOVE: -2, // 取消顶踩扣分
  BEST_ANSWER_REMOVE: -40, // 取消最佳答案扣分

  // 系统限制
  DAILY_LIMIT: 30, // 每日积分上限
  PAGE_SIZE: 1000, // 分页查询大小
};

// 查询限制常量
export const QUERY_LIMITS = {
  VOTE_QUERY_LIMIT: 300, // 投票查询限制
  CONTEST_QUERY_LIMIT: 500, // 比赛查询限制
  MEDIA_QUERY_LIMIT: 200, // 媒体查询限制
  USER_RANKING_LIMIT: 100, // 用户排名查询限制
  DISPLAY_TOP_USERS: 3, // 显示顶级用户数量
  ITEMS_PER_PAGE: 20, // 每页显示项目数
  TEAM_QUERY_LIMIT: 500, // 团队查询限制
};

// 文件类型常量
export const FILE_TYPES = {
  TXT: 1, // 文本文件
  MP3: 2, // 音频文件
  BG: 3, // 背景文件
  VIDEO: 4, // 视频文件
};

// 审核相关常量
export const APPROVAL_CONFIG = {
  MIN_VOTES_FOR_APPROVAL: 5, // 最少需要的审核票数
  VIEWED_VOTES_THRESHOLD_1: 10, // 查看数第一档阈值
  VIEWED_VOTES_THRESHOLD_2: 20, // 查看数第二档阈值
  VIEWED_VOTES_VALUE_1: 1, // 第一档对应票数
  VIEWED_VOTES_VALUE_2: 2, // 第二档对应票数
  MAX_APPROVAL_COUNT: 5, // 最大审核数量
};

// 数据库集合名称
export const COLLECTIONS = {
  USER_POINTS: "UserPoints",
  EVENT_LOGS: "EventLogs",
  POST_LOGS: "PostLogs",
  TEAM: "Team",
  TEAM_MMFC: "TeamMMFC",
  ENTER_CONTEST_034: "enterContest034",
  BOF_COMMENT: "BOFcomment",
  DELETE_INFOR: "deleteInfor",
  FORUM_POSTS: "Forum/Posts",
  FORUM_COMMENTS: "Forum/Comments",
  MEMBERS_PUBLIC_DATA: "Members/PublicData",
  FORMS_ENTER_CONTEST_07: "Forms/enterContest07",
  ONGEKI_ALBUM: "OngekiAlbum",
  JOB_APPLICATION_089: "jobApplication089",
};

// 事件类型常量
export const EVENT_TYPES = {
  POST_CREATED: "PostCreated",
  COMMENT_CREATED: "CommentCreated",
  COMMENT_LIKED: "CommentLiked",
  COMMENT_UNLIKED: "CommentUnliked",
  POST_LIKED: "PostLiked",
  POST_UNLIKED: "PostUnliked",
  COMMENT_UPVOTED: "CommentUpvoted",
  COMMENT_UNVOTED: "CommentUnvoted",
  COMMENT_DELETED: "CommentDeleted",
  COMMENT_MARKED_AS_BEST: "CommentMarkedAsBest",
  COMMENT_UNMARKED_AS_BEST: "CommentUnmarkedAsBest",
};

// 用户权限和角色
export const USER_ROLES = {
  ADMIN: "Admin",
  AUDITOR: "Auditor",
  MEMBER: "Member",
};

// 进度计算相关常量
export const PROGRESS_CONFIG = {
  HIGH_REWARD_THRESHOLD: 90, // 高奖励门槛
  MEDIUM_REWARD_THRESHOLD: 60, // 中等奖励门槛
  LOW_REWARD_THRESHOLD: 40, // 低奖励门槛
  HIGH_REWARD_POINTS: 800, // 高奖励积分
  MEDIUM_REWARD_POINTS: 600, // 中等奖励积分
  LOW_REWARD_POINTS: 400, // 低奖励积分
};

// 加密相关常量
export const CRYPTO_CONFIG = {
  SECRET_KEY: "1f2bb3f9735fc8c4b08b186f91f8f08b",
};

// 时间相关常量
export const TIME_CONFIG = {
  UPDATE_INTERVAL: 5000, // 页面更新间隔(毫秒)
  RANKING_UPDATE_INTERVAL: 60000, // 排名更新间隔(毫秒)
  COUNTDOWN_INTERVAL: 1000, // 倒计时更新间隔(毫秒)
};

// 功能开关
export const FEATURE_FLAGS = {
  MAJNET_AUTO_UPLOAD: false, // Majnet自动上传功能开关（true=启用，false=禁用）
};
