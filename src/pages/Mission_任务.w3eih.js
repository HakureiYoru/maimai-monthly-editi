/**
 * 评分任务页面
 * 用户个人任务界面，显示当前任务和完成进度
 */

import wixUsers from 'wix-users';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location';
import { 
  getUserTaskData,
  markTaskCompleted 
} from 'backend/ratingTaskManager.jsw';

let currentUserId = null;
let isHtmlReady = false;

$w.onReady(async function () {
  // 检查用户登录状态
  if (!wixUsers.currentUser.loggedIn) {
    // 未登录，跳转到登录页面或显示提示
    $w('#html1').hide();
    wixLocation.to('/');
    return;
  }
  
  currentUserId = wixUsers.currentUser.id;
  
  // 监听HTML组件消息
  $w('#html1').onMessage(async (event) => {
    try {
      const { type, data } = event.data;
      
      switch (type) {
        case 'TASK_PAGE_READY':
          // HTML页面准备就绪
          isHtmlReady = true;
          await initTaskPage();
          break;
          
        case 'GET_TASK_DATA':
          // 请求任务数据
          await sendTaskData();
          break;
          
        case 'GO_TO_RATE':
          // 跳转到评分页面
          await goToRatePage();
          break;
          
        default:
          console.log('未知消息类型:', type);
      }
    } catch (error) {
      console.error('处理HTML消息失败:', error);
    }
  });
  
  // 显示HTML组件
  $w('#html1').show();
});

/**
 * 初始化任务页面
 */
async function initTaskPage() {
  try {
    // 发送初始化消息到HTML组件
    $w('#html1').postMessage({
      type: 'INIT_TASK_PAGE',
      data: {
        userId: currentUserId
      }
    });
    
    console.log('任务页面初始化完成');
    
  } catch (error) {
    console.error('初始化任务页面失败:', error);
  }
}

/**
 * 发送任务数据到HTML组件
 */
async function sendTaskData() {
  try {
    // 从后端获取任务数据
    const taskData = await getUserTaskData(currentUserId);
    
    // 发送到HTML组件
    $w('#html1').postMessage({
      type: 'TASK_DATA_RESPONSE',
      data: taskData
    });
    
    console.log('任务数据已发送:', taskData);
    
  } catch (error) {
    console.error('获取任务数据失败:', error);
    
    // 发送错误状态
    $w('#html1').postMessage({
      type: 'TASK_DATA_RESPONSE',
      data: {
        error: true,
        message: '获取任务数据失败，请刷新页面重试'
      }
    });
  }
}

/**
 * 跳转到评分页面
 */
async function goToRatePage() {
  try {
    console.log('跳转到主会场');
    
    // 跳转到主会场页面（不带参数，让用户自由选择评分）
    wixLocation.to('/stage-主会场');
    
  } catch (error) {
    console.error('跳转失败:', error);
  }
}

/**
 * 刷新任务数据（可由外部调用）
 */
export function refreshTaskData() {
  if (isHtmlReady) {
    $w('#html1').postMessage({
      type: 'REFRESH_TASK',
      data: {}
    });
  }
}
