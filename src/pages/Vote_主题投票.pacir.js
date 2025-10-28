import wixUsers from 'wix-users';
import { getUserInfo, submitVote, getVotingOptions, getVotingResults } from 'backend/votingSystem.jsw';

let currentUserId = null;
let isHtmlReady = false;

$w.onReady(function () {
    // 获取当前用户ID
    if (wixUsers.currentUser.loggedIn) {
        currentUserId = wixUsers.currentUser.id;
        //console.log('[投票页面] 页面已加载，当前用户ID:', currentUserId);
    } else {
        console.log('[投票页面] 用户未登录');
        currentUserId = null;
    }
    
    // 初始化HTML元件通信
    initHtmlComponent();
});

// 初始化HTML元件
function initHtmlComponent() {
    try {
        // 确保HTML元件存在
        if (!$w("#votingSystemHtml")) {
            console.error("[投票页面] HTML元件未找到");
            return;
        }

       // console.log("[投票页面] 开始初始化HTML元件...");

        // 监听来自HTML元件的消息
        $w("#votingSystemHtml").onMessage(async (event) => {
            const { type, data } = event.data;
           // console.log(`[投票页面] 收到消息: ${type}`, data);

            switch (type) {
                case 'VOTING_SYSTEM_READY':
                    await handleVotingSystemReady();
                    break;
                case 'REQUEST_USER_INFO':
                    await handleUserInfoRequest();
                    break;
                case 'REQUEST_VOTING_OPTIONS':
                    await handleVotingOptionsRequest();
                    break;
                case 'REQUEST_VOTING_RESULTS':
                    await handleVotingResultsRequest();
                    break;
                case 'SUBMIT_VOTE':
                    await handleVoteSubmission(data);
                    break;
                default:
                   // console.log('[投票页面] 未知消息类型:', type);
            }
        });

        //console.log("[投票页面] HTML元件初始化完成");
    } catch (error) {
        console.error("[投票页面] 初始化失败:", error);
    }
}

// 处理HTML元件准备就绪
async function handleVotingSystemReady() {
    //console.log("[投票页面] HTML元件已准备就绪");
    isHtmlReady = true;
    
    // 发送初始化数据
    postMessageToHtml('INIT_VOTING_SYSTEM', {
        currentUserId: currentUserId
    });
}

// 发送消息到HTML元件的统一函数
function postMessageToHtml(type, data) {
    try {
        // 获取HTML元件
        const htmlComponent = $w('#votingSystemHtml');
        if (!htmlComponent) {
            console.error('[投票页面] 未找到HTML元件 #votingSystemHtml');
            return;
        }
        
        // 使用Wix的postMessage API发送消息
        htmlComponent.postMessage({
            type: type,
            data: data
        });
        
       // console.log('[投票页面] 已发送消息到HTML元件:', type);
    } catch (error) {
        console.error('[投票页面] 发送消息失败:', error);
    }
}

// 处理用户信息请求
async function handleUserInfoRequest() {
    try {
        if (!currentUserId) {
            throw new Error('用户未登录');
        }
        
        const userInfo = await getUserInfo(currentUserId);
        
        postMessageToHtml('USER_INFO', userInfo);
    } catch (error) {
        console.error('[投票页面] 获取用户信息失败:', error);
        postMessageToHtml('ERROR', {
            message: '获取用户信息失败，请稍后重试'
        });
    }
}

// 处理投票选项请求
async function handleVotingOptionsRequest() {
    try {
        const options = await getVotingOptions();
        
        postMessageToHtml('VOTING_OPTIONS', options);
    } catch (error) {
        console.error('[投票页面] 获取投票选项失败:', error);
        postMessageToHtml('ERROR', {
            message: '获取投票选项失败，请稍后重试'
        });
    }
}

// 处理投票结果请求
async function handleVotingResultsRequest() {
    try {
        const results = await getVotingResults();
        
        postMessageToHtml('VOTING_RESULTS', results);
    } catch (error) {
        console.error('[投票页面] 获取投票结果失败:', error);
        postMessageToHtml('ERROR', {
            message: '获取投票结果失败，请稍后重试'
        });
    }
}

// 处理投票提交
async function handleVoteSubmission(voteData) {
    try {
        if (!currentUserId) {
            throw new Error('用户未登录');
        }
        
        const { userName, themeValue, userRank, voteWeight } = voteData;
        
        const result = await submitVote(
            currentUserId,
            userName,
            themeValue,
            userRank,
            voteWeight
        );
        
        postMessageToHtml('VOTE_SUBMISSION_RESULT', result);
    } catch (error) {
        console.error('[投票页面] 提交投票失败:', error);
        postMessageToHtml('VOTE_SUBMISSION_RESULT', {
            success: false,
            message: '提交投票失败，请稍后重试'
        });
    }
}