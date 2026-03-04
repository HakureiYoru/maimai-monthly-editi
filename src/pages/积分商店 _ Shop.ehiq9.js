import { currentMember } from "wix-members";
import { purchaseItem } from "backend/botBridge";
import { getUserPoints } from "backend/userPoints";

$w.onReady(async function () {
  let userId = null;

  // 获取当前登录用户
  try {
    const member = await currentMember.getMember();
    if (member) {
      userId = member._id;
    }
  } catch (e) {
    console.warn("获取用户信息失败", e);
  }

  // 查询积分并通知 HTML 元件完成初始化
  async function sendInitToShop() {
    let points = 0;
    if (userId) {
      try {
        const record = await getUserPoints(userId);
        points = record ? (record.points || 0) : 0;
      } catch (e) {
        console.warn("获取积分失败", e);
      }
    }
    $w("#htmlShop").postMessage({ type: "init", points });
  }

  // 监听 HTML 元件发来的消息
  $w("#htmlShop").onMessage(async (event) => {
    let data;
    try {
      data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch (e) {
      return;
    }

    // HTML 加载完毕后请求初始化数据
    if (data.action === "ready") {
      await sendInitToShop();
      return;
    }

    // 用户点击购买按钮
    if (data.action === "purchase") {
      if (!userId) {
        $w("#htmlShop").postMessage({
          type: "purchaseResult",
          success: false,
          message: "请先登录后再购买。",
        });
        return;
      }

      try {
        const result = await purchaseItem(data.itemId);
        $w("#htmlShop").postMessage({
          type: "purchaseResult",
          success: result.success,
          message: result.message,
          remainingPoints: result.remainingPoints ?? null,
        });
      } catch (e) {
        $w("#htmlShop").postMessage({
          type: "purchaseResult",
          success: false,
          message: "购买时发生错误，请稍后再试。",
        });
      }
    }
  });
});
