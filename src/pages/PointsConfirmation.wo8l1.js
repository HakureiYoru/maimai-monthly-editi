import wixWindow from 'wix-window';
import { getUserPublicInfo } from 'backend/getUserPublicInfo.jsw'; // 确保从backend导入函数

$w.onReady(async function () {
    // 获取传递到Lightbox的参数
    const context = wixWindow.lightbox.getContext();
    const { userId, pointsToAdd } = context;

    try {
        // 调用getUserPublicInfo获取用户的slug和name
        const userInfo = await getUserPublicInfo(userId);
        if (userInfo) {
            // 用户信息存在，设置详细的确认信息
            $w("#text10").text = `即将给用户 ${userInfo.name} (slug: ${userInfo.userslug}) 增加 ${pointsToAdd} 积分`;
        } else {
            // 用户信息不存在，显示默认信息
            $w("#text10").text = `即将给用户ID ${userId} 增加 ${pointsToAdd} 积分`;
        }
    } catch (error) {
        // 查询用户信息出错，显示错误信息
        $w("#text10").text = "在获取用户信息时发生错误";
        console.error("获取用户公开信息时发生错误", error);
    }

    // 确认按钮点击事件
    $w("#confirmButton").onClick(() => {
         wixWindow.lightbox.close("confirm");
    });

    // 取消按钮点击事件
    $w("#cancelButton").onClick(() => {
        wixWindow.lightbox.close("cancel");
    });
});
