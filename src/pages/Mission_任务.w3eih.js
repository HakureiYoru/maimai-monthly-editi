/**
 * 评分任务页面
 * 用户个人任务界面，显示当前任务和完成进度
 */

import wixUsers from 'wix-users';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location';
import wixData from 'wix-data';
import { 
  getUserTaskData,
  markTaskCompleted 
} from 'backend/ratingTaskManager.jsw';

let currentUserId = null;
let isHtmlReady = false;
let isUserVerified = false;
let isLoadingTaskData = false; // 防止重复加载任务数据

/**
 * 检查用户验证状态（是否报名比赛）
 */
async function checkUserVerification() {
  if (!currentUserId) {
    isUserVerified = false;
    return false;
  }

  try {
    const results = await wixData
      .query("jobApplication089")
      .eq("_owner", currentUserId)
      .find();

    if (results.items.length > 0) {
      isUserVerified = true;
      return true;
    } else {
      isUserVerified = false;
      return false;
    }
  } catch (error) {
    console.error("检查用户验证状态失败：", error);
    isUserVerified = false;
    return false;
  }
}

$w.onReady(async function () {
  // 检查用户登录状态
  if (!wixUsers.currentUser.loggedIn) {
    // 未登录，跳转到登录页面或显示提示
    $w('#html1').hide();
    wixLocation.to('/');
    return;
  }
  
  currentUserId = wixUsers.currentUser.id;
  
  // 检查用户验证状态
  await checkUserVerification();
  
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
          
        case 'REFRESH_TASK_REQUEST':
          // 刷新任务数据（检查按钮）
          // console.log('收到刷新任务请求');
          await sendTaskData();
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
    // console.log('开始初始化任务页面, 用户ID:', currentUserId);
    
    // 等待一小段时间确保HTML完全加载
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 获取并发送任务数据
    await sendTaskData();
    
  } catch (error) {
    console.error('初始化任务页面失败:', error);
  }
}

/**
 * 发送任务数据到HTML组件
 */
async function sendTaskData() {
  try {
    // 【优化】防止重复加载 - 防抖处理
    if (isLoadingTaskData) {
      console.log('[任务加载] 正在加载中，请稍候...');
      return;
    }
    
    isLoadingTaskData = true;
    // console.log('正在获取任务数据...');
    
    // 检查用户验证状态
    if (!isUserVerified) {
      console.log('用户未验证，发送未验证状态');
      $w('#html1').postMessage({
        type: 'TASK_DATA_RESPONSE',
        data: {
          error: true,
          notVerified: true,
          message: '您尚未报名比赛，无法接受和完成任务',
          currentTasks: [],
          completedTasks: [],
          freeRatings: [],
          totalCompleted: 0,
          targetCompletion: 10
        }
      });
      isLoadingTaskData = false;
      return;
    }
    
    // 从后端获取任务数据
    const taskData = await getUserTaskData(currentUserId);
    
    // console.log('任务数据获取成功:', taskData);
    // console.log('准备发送到HTML组件...');
    
    // 发送到HTML组件
    const message = {
      type: 'TASK_DATA_RESPONSE',
      data: taskData
    };
    
    // console.log('发送消息:', message);
    $w('#html1').postMessage(message);
    
    // console.log('消息已发送');
    
    // 【优化】释放加载锁
    isLoadingTaskData = false;
    
  } catch (error) {
    console.error('获取任务数据失败:', error);
    
    // 发送错误状态
    $w('#html1').postMessage({
      type: 'TASK_DATA_RESPONSE',
      data: {
        error: true,
        message: '获取任务数据失败，请刷新页面重试',
        currentTasks: [],
        completedTasks: [],
        freeRatings: [],
        totalCompleted: 0,
        targetCompletion: 10
      }
    });
    
    // 【优化】释放加载锁（错误情况）
    isLoadingTaskData = false;
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
