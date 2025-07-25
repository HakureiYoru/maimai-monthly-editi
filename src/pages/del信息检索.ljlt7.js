// API Reference: https://www.wix.com/velo/reference/api-overview/introduction
// "Hello, World!" Example: https://learn-code.wix.com/en/article/hello-world

import wixData from 'wix-data';
import wixWindow from 'wix-window';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';

/**
 * 本地函数：获取用户昵称，模仿getFullUserRanking的方式
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
        
        // 如果都失败了，返回"失效账号"（与getFullUserRanking保持一致）
        return '失效账号';
        
    } catch (error) {
        console.error('获取用户昵称失败:', error);
        return '失效账号';
    }
}

$w.onReady(async function () {
    // 初始化页面数据
    await loadDeleteRecords();
    
    // 设置删除记录重复器的事件处理
    $w('#delRepeater').onItemReady(async ($item, itemData, index) => {
        await setupDeleteRecordItem($item, itemData);
    });
});

/**
 * 加载删除记录数据
 */
async function loadDeleteRecords(searchValue = '') {
    try {
        let query = wixData.query('deleteInfor').descending('deletedAt');
        
        // 如果有搜索值，添加搜索条件
        if (searchValue) {
            query = query.contains('deletedComment', searchValue)
                .or(query.contains('deleteReason', searchValue))
                .or(query.eq('workNumber', parseInt(searchValue)));
        }
        
        const results = await query.find();
        
        // 设置数据到重复器
        $w('#delRepeater').data = results.items;
        
        console.log(`加载了 ${results.items.length} 条删除记录`);
        
    } catch (error) {
        console.error('加载删除记录失败:', error);
    }
}

/**
 * 设置删除记录重复器项目
 */
async function setupDeleteRecordItem($item, itemData) {
    try {
        console.log('处理删除记录:', itemData);
        console.log('originalCommentOwner:', itemData.originalCommentOwner);
        console.log('deletedBy:', itemData.deletedBy);
        
        // 获取原评论发布者信息
        const originalUserName = await getUserNickname(itemData.originalCommentOwner);
        
        // 获取处理删除的审核员信息
        const managerName = await getUserNickname(itemData.deletedBy);
        
        console.log('最终用户名:', originalUserName, managerName);
        
        // 设置显示内容，添加前缀
        $item('#oriUser').text = `原评论用户: ${originalUserName}`;
        $item('#manager').text = `处理审核员: ${managerName}`;
        
        // 设置其他信息
        $item('#workNumber').text = `作品编号: ${itemData.workNumber}`;
        $item('#deleteReason').text = `删除理由: ${itemData.deleteReason}`;
        $item('#deletedScore').text = `原评分: ${itemData.deletedScore}`;
        
        // 格式化删除时间
        const deleteDate = new Date(itemData.deletedAt);
        const formattedDate = `${deleteDate.getFullYear()}-${String(deleteDate.getMonth() + 1).padStart(2, '0')}-${String(deleteDate.getDate()).padStart(2, '0')} ${String(deleteDate.getHours()).padStart(2, '0')}:${String(deleteDate.getMinutes()).padStart(2, '0')}`;
        $item('#deleteTime').text = `删除时间: ${formattedDate}`;
        
        // 设置查看评论内容按钮事件
        $item('#checkText').onClick(() => {
            // 打开评论内容弹窗
            wixWindow.openLightbox("TextPopup", { 
                content: itemData.deletedComment 
            });
        });
        
    } catch (error) {
        console.error('设置删除记录项目时出错:', error);
        
        // 设置默认值
        $item('#oriUser').text = '获取失败';
        $item('#manager').text = '获取失败';
        $item('#workNumber').text = `作品编号: ${itemData.workNumber || '未知'}`;
        $item('#deleteReason').text = `删除理由: ${itemData.deleteReason || '未填写'}`;
        $item('#deletedScore').text = `原评分: ${itemData.deletedScore || '未知'}`;
        
        // 设置查看评论内容按钮事件
        $item('#checkText').onClick(() => {
            wixWindow.openLightbox("TextPopup", { 
                content: itemData.deletedComment || '评论内容获取失败' 
            });
        });
    }
}
