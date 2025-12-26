import wixUsers from 'wix-users';
import { getUserInfo, submitVote, getVotingOptions, getVotingResults } from 'backend/votingSystem.jsw';
import { getVote2Status, submitVote2, getVote2Options, getVote2Results } from 'backend/votingSystemLite.jsw';

let currentUserId = null;
let isHtmlReady = false;
let isVote2HtmlReady = false;

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
    initVote2HtmlComponent();
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
function initVote2HtmlComponent() {
    try {
        if (!$w("#vote2")) {
            console.error("[Vote2] HTML component #vote2 not found");
            return;
        }

        $w("#vote2").onMessage(async (event) => {
            const { type, data } = event.data;

            switch (type) {
                case 'VOTE2_READY':
                    await handleVote2Ready();
                    break;
                case 'VOTE2_REQUEST_STATUS':
                    await handleVote2StatusRequest();
                    break;
                case 'VOTE2_REQUEST_OPTIONS':
                    await handleVote2OptionsRequest();
                    break;
                case 'VOTE2_REQUEST_RESULTS':
                    await handleVote2ResultsRequest();
                    break;
                case 'VOTE2_SUBMIT':
                    await handleVote2Submission(data);
                    break;
                default:
            }
        });
    } catch (error) {
        console.error("[Vote2] Failed to init HTML component", error);
    }
}

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
function postMessageToVote2(type, data) {
    try {
        const htmlComponent = $w('#vote2');
        if (!htmlComponent) {
            console.error('[Vote2] HTML component #vote2 not found');
            return;
        }

        htmlComponent.postMessage({
            type: type,
            data: data
        });
    } catch (error) {
        console.error('[Vote2] Failed to post message', error);
    }
}

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

async function handleVote2Ready() {
    isVote2HtmlReady = true;
    postMessageToVote2('VOTE2_INIT', {
        currentUserId: currentUserId
    });
}

async function handleVote2StatusRequest() {
    try {
        if (!currentUserId) {
            throw new Error('用户未登录');
        }

        const status = await getVote2Status(currentUserId);
        postMessageToVote2('VOTE2_STATUS', status);
    } catch (error) {
        console.error('[Vote2] 获取用户状态失败:', error);
        postMessageToVote2('VOTE2_ERROR', {
            message: '获取用户状态失败，请稍后重试'
        });
    }
}

async function handleVote2OptionsRequest() {
    try {
        const options = await getVote2Options();
        postMessageToVote2('VOTE2_OPTIONS', options);
    } catch (error) {
        console.error('[Vote2] 获取投票选项失败:', error);
        postMessageToVote2('VOTE2_ERROR', {
            message: '获取投票选项失败，请稍后重试'
        });
    }
}

async function handleVote2ResultsRequest() {
    try {
        const results = await getVote2Results();
        postMessageToVote2('VOTE2_RESULTS', results);
    } catch (error) {
        console.error('[Vote2] 获取投票结果失败:', error);
        postMessageToVote2('VOTE2_ERROR', {
            message: '获取投票结果失败，请稍后重试'
        });
    }
}

async function handleVote2Submission(voteData) {
    try {
        if (!currentUserId) {
            throw new Error('用户未登录');
        }

        const { userName, themeValue } = voteData;
        const result = await submitVote2(
            currentUserId,
            userName,
            themeValue
        );

        postMessageToVote2('VOTE2_SUBMISSION_RESULT', result);
    } catch (error) {
        console.error('[Vote2] 提交投票失败:', error);
        postMessageToVote2('VOTE2_SUBMISSION_RESULT', {
            success: false,
            message: '提交投票失败，请稍后重试'
        });
    }
}
