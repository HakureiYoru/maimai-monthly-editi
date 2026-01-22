// API Reference: https://www.wix.com/velo/reference/api-overview/introduction

import wixData from 'wix-data';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';

/**
 * 获取用户昵称（支持访客占位）
 */
async function getUserNickname(userId) {
    try {
        if (!userId || userId === 'guest') {
            return '访客';
        }

        const userInfo = await getUserPublicInfo(userId);
        if (userInfo && userInfo.name) {
            return userInfo.name;
        }

        const result = await wixData.query("Members/PublicData")
            .eq("_id", userId)
            .find();

        if (result.items.length > 0 && result.items[0].nickname) {
            return result.items[0].nickname;
        }

        return '失效账号';
    } catch (error) {
        console.error('获取用户昵称失败:', error);
        return '失效账号';
    }
}

/**
 * 获取作品标题
 */
async function getWorkTitle(workNumber) {
    try {
        const result = await wixData.query("enterContest034")
            .eq("sequenceId", workNumber)
            .find();

        if (result.items.length > 0 && result.items[0].firstName) {
            return result.items[0].firstName;
        }

        return '未知标题';
    } catch (error) {
        console.error('获取作品标题失败:', error);
        return '未知标题';
    }
}

$w.onReady(async function () {
    await loadReportRecords();

    // 监听来自自定义HTML元件的消息
    const htmlElement = $w('#reportRecordsHtml');
    if (htmlElement && htmlElement.onMessage) {
        htmlElement.onMessage((event) => {
            handleHtmlMessage(event);
        });
    }
});

/**
 * 加载检举记录数据
 */
async function loadReportRecords() {
    try {
        const results = await wixData.query('reportInfor')
            .descending('reportedAt')
            .find();

        console.log(`加载了 ${results.items.length} 条检举记录`);

        const htmlElement = $w('#reportRecordsHtml');
        if (htmlElement && htmlElement.postMessage) {
            htmlElement.postMessage({
                action: 'init',
                records: results.items
            });
        }
    } catch (error) {
        console.error('加载检举记录失败:', error);
    }
}

/**
 * 处理来自HTML元件的消息
 */
async function handleHtmlMessage(event) {
    const data = event.data;

    if (data.action === 'getUserInfo') {
        const userId = data.userId;
        const userName = await getUserNickname(userId);

        const htmlElement = $w('#reportRecordsHtml');
        if (htmlElement && htmlElement.postMessage) {
            htmlElement.postMessage({
                action: 'userInfo',
                userId: userId,
                userName: userName
            });
        }
    } else if (data.action === 'getWorkTitle') {
        const workNumber = data.workNumber;
        const workTitle = await getWorkTitle(workNumber);

        const htmlElement = $w('#reportRecordsHtml');
        if (htmlElement && htmlElement.postMessage) {
            htmlElement.postMessage({
                action: 'workTitle',
                workNumber: workNumber,
                workTitle: workTitle
            });
        }
    } else if (data.action === 'updateProcessed') {
        const recordId = data.recordId;
        const processed = data.processed === true;

        if (!recordId) {
            return;
        }

        try {
            await wixData.update('reportInfor', {
                _id: recordId,
                processed: processed
            });

            const htmlElement = $w('#reportRecordsHtml');
            if (htmlElement && htmlElement.postMessage) {
                htmlElement.postMessage({
                    action: 'updateProcessedResult',
                    recordId: recordId,
                    processed: processed,
                    success: true
                });
            }
        } catch (error) {
            console.error('更新处理状态失败:', error);
            const htmlElement = $w('#reportRecordsHtml');
            if (htmlElement && htmlElement.postMessage) {
                htmlElement.postMessage({
                    action: 'updateProcessedResult',
                    recordId: recordId,
                    processed: processed,
                    success: false,
                    message: error.message || '更新失败'
                });
            }
        }
    }
}
