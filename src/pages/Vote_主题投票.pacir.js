import wixUsers from 'wix-users';
import { getUserInfo, submitVote, getVotingOptions, getVotingResults } from 'backend/votingSystem.jsw';

let currentUserId = null;

$w.onReady(function () {
    // 获取当前用户ID
    if (wixUsers.currentUser.loggedIn) {
        currentUserId = wixUsers.currentUser.id;
        console.log('[投票页面] 页面已加载，当前用户ID:', currentUserId);
    } else {
        console.log('[投票页面] 用户未登录');
        currentUserId = null;
    }
    
    // 等待HTML元件加载完成后设置消息监听
    setTimeout(() => {
        try {
            // 在浏览器环境中设置消息监听
            if (typeof window !== 'undefined') {
                window.addEventListener('message', (event) => {
                    // 检查消息是否来自HTML元件
                    if (event.data && event.data.source === 'votingSystemHtml') {
                        console.log('[投票页面] 收到来自HTML元件的消息:', event.data);
                        handleMessage(event.data);
                    }
                });
            }
            
            // 初始化投票系统
            console.log('[投票页面] 开始初始化投票系统');
            initVotingSystem();
        } catch (error) {
            console.error('[投票页面] 设置消息监听失败:', error);
        }
    }, 1500);
});

// 处理消息的统一函数
function handleMessage(messageData) {
    if (!messageData || typeof messageData !== 'object') return;
    
    const { type, data } = messageData;
    
    switch (type) {
        case 'REQUEST_USER_INFO':
            // 请求用户信息
            handleUserInfoRequest();
            break;
        case 'REQUEST_VOTING_OPTIONS':
            // 请求投票选项
            handleVotingOptionsRequest();
            break;
        case 'REQUEST_VOTING_RESULTS':
            // 请求投票结果
            handleVotingResultsRequest();
            break;
        case 'SUBMIT_VOTE':
            // 提交投票
            handleVoteSubmission(data);
            break;
        default:
            console.log('[投票页面] 未知消息类型:', type);
    }
}

// 发送消息到HTML元件的统一函数
function postMessageToHtml(type, data) {
    try {
        // 检查是否在浏览器环境
        if (typeof $w === 'undefined') {
            console.error('[投票页面] $w未定义，可能不在浏览器环境');
            return;
        }
        
        // 获取HTML元件
        const htmlComponent = $w('#votingSystemHtml');
        if (!htmlComponent) {
            console.error('[投票页面] 未找到HTML元件 #votingSystemHtml');
            return;
        }
        
        // 获取iframe元素
        const htmlElement = htmlComponent.renderedElement;
        if (htmlElement && htmlElement.contentWindow) {
            htmlElement.contentWindow.postMessage({
                type: type,
                data: data
            }, '*');
            console.log('[投票页面] 已发送消息到HTML元件:', type);
        } else {
            console.error('[投票页面] 无法获取HTML元件的iframe，元件可能尚未渲染');
        }
    } catch (error) {
        console.error('[投票页面] 发送消息失败:', error);
    }
}

// 初始化投票系统
async function initVotingSystem() {
    try {
        // 发送初始化数据到HTML元件
        postMessageToHtml('INIT_VOTING_SYSTEM', {
            currentUserId: currentUserId
        });
    } catch (error) {
        console.error('[投票页面] 初始化失败:', error);
        postMessageToHtml('ERROR', {
            message: '初始化投票系统失败，请刷新页面重试'
        });
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