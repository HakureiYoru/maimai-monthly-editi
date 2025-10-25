// API Reference: https://www.wix.com/velo/reference/api-overview/introduction
// "Hello, World!" Example: https://learn-code.wix.com/en/article/hello-world

import wixData from 'wix-data';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';

/**
 * 本地函数：获取用户昵称
 */
async function getUserNickname(userId) {
    try {
        // 首先尝试使用getUserPublicInfo
        const userInfo = await getUserPublicInfo(userId);
        if (userInfo && userInfo.name) {
            return userInfo.name;
        }
        
        // 如果getUserPublicInfo失败，尝试直接查询Members/PublicData
        const result = await wixData.query("Members/PublicData")
            .eq("_id", userId)
            .find();
            
        if (result.items.length > 0 && result.items[0].nickname) {
            return result.items[0].nickname;
        }
        
        // 如果都失败了，返回"失效账号"
        return '失效账号';
        
    } catch (error) {
        console.error('获取用户昵称失败:', error);
        return '失效账号';
    }
}

/**
 * 本地函数：获取作品标题
 */
async function getWorkTitle(workNumber) {
    try {
        // 查询 enterContest034 数据集
        const result = await wixData.query("enterContest034")
            .eq("sequenceId", workNumber)
            .find();
            
        if (result.items.length > 0 && result.items[0].firstName) {
            return result.items[0].firstName;
        }
        
        // 如果没找到，返回未知
        return '未知标题';
        
    } catch (error) {
        console.error('获取作品标题失败:', error);
        return '未知标题';
    }
}

$w.onReady(async function () {
    // 加载删除记录数据
    await loadDeleteRecords();
    
    // 监听来自自定义HTML元件的消息
    // @ts-ignore - 自定义HTML元件ID
    const htmlElement = $w('#deleteRecordsHtml');
    if (htmlElement && htmlElement.onMessage) {
        htmlElement.onMessage((event) => {
            handleHtmlMessage(event);
        });
    }
});

/**
 * 加载删除记录数据
 */
async function loadDeleteRecords() {
    try {
        // 查询所有删除记录，按删除时间倒序
        const results = await wixData.query('deleteInfor')
            .descending('deletedAt')
            .find();
        
        console.log(`加载了 ${results.items.length} 条删除记录`);
        
        // 发送数据到自定义HTML元件
        // @ts-ignore - 自定义HTML元件ID
        const htmlElement = $w('#deleteRecordsHtml');
        if (htmlElement && htmlElement.postMessage) {
            htmlElement.postMessage({
                action: 'init',
                records: results.items
            });
        }
        
    } catch (error) {
        console.error('加载删除记录失败:', error);
    }
}

/**
 * 处理来自HTML元件的消息
 */
async function handleHtmlMessage(event) {
    const data = event.data;
    
    if (data.action === 'getUserInfo') {
        // HTML元件请求获取用户信息
        const userId = data.userId;
        const userName = await getUserNickname(userId);
        
        // 返回用户信息
        // @ts-ignore - 自定义HTML元件ID
        const htmlElement = $w('#deleteRecordsHtml');
        if (htmlElement && htmlElement.postMessage) {
            htmlElement.postMessage({
                action: 'userInfo',
                userId: userId,
                userName: userName
            });
        }
        
    } else if (data.action === 'getWorkTitle') {
        // HTML元件请求获取作品标题
        const workNumber = data.workNumber;
        const workTitle = await getWorkTitle(workNumber);
        
        // 返回作品标题
        // @ts-ignore - 自定义HTML元件ID
        const htmlElement = $w('#deleteRecordsHtml');
        if (htmlElement && htmlElement.postMessage) {
            htmlElement.postMessage({
                action: 'workTitle',
                workNumber: workNumber,
                workTitle: workTitle
            });
        }
    }
}
