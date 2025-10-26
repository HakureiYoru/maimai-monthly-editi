/**
 * 前端常量配置
 * 从后端常量中选取前端需要的部分
 */

// 查询限制常量 - 前端需要
export const QUERY_LIMITS = {
    VOTE_QUERY_LIMIT: 300,     // 投票查询限制
    CONTEST_QUERY_LIMIT: 500,  // 比赛查询限制
    MEDIA_QUERY_LIMIT: 200,    // 媒体查询限制
    USER_RANKING_LIMIT: 100,   // 用户排名查询限制
    DISPLAY_TOP_USERS: 3,      // 显示顶级用户数量
    ITEMS_PER_PAGE: 20,        // 每页显示项目数
    TEAM_QUERY_LIMIT: 500,     // 团队查询限制
    FORUM_RANKING_LIMIT: 50,   // 论坛排名查询限制
    MAX_APPROVAL_COUNT: 5      // 最大审核数量
};

// 时间相关常量 - 前端需要
export const TIME_CONFIG = {
    UPDATE_INTERVAL: 5000,        // 页面更新间隔(毫秒)
    RANKING_UPDATE_INTERVAL: 60000, // 排名更新间隔(毫秒)
    COUNTDOWN_INTERVAL: 1000,     // 倒计时更新间隔(毫秒)
    USER_INFO_UPDATE_INTERVAL: 30000, // 用户信息更新间隔(毫秒)
    TIMER_UPDATE_INTERVAL: 1000   // 计时器更新间隔(毫秒)
};

// 文件类型常量 - 前端需要
export const FILE_TYPES = {
    TXT: 1,     // 文本文件
    MP3: 2,     // 音频文件
    BG: 3,      // 背景文件
    VIDEO: 4    // 视频文件
}; 

// 评分与排名相关常量 - 前端需要
export const RATING_CONFIG = {
    MIN_RATINGS_FOR_RANKING: 5 // 达到该人数后显示等级并参与正式排名
};