import { currentMember } from "wix-members";
import { purchaseItem, hasGoldSkin, getRecommendedSequenceIds } from "backend/botBridge";
import { getUserPoints } from "backend/userPoints";

$w.onReady(async function () {
  let userId = null;

  try {
    const member = await currentMember.getMember();
    if (member) {
      userId = member._id;
    }
  } catch (e) {
    console.warn("获取用户信息失败", e);
  }

  async function sendInitToShop() {
    let points = 0;
    let ownedSkins = [];
    let recommendedSequenceIds = [];
    try {
      recommendedSequenceIds = await getRecommendedSequenceIds();
    } catch (e) {
      console.warn("获取推荐榜编号失败", e);
    }
    if (userId) {
      try {
        const [record, goldOwned] = await Promise.all([
          getUserPoints(userId),
          hasGoldSkin(),
        ]);
        points = record ? (record.points || 0) : 0;
        if (goldOwned) ownedSkins.push("gold_skin");
      } catch (e) {
        console.warn("获取积分或皮肤状态失败", e);
      }
    }
    $w("#htmlShop").postMessage({ type: "init", points, ownedSkins, recommendedSequenceIds });
  }

  $w("#htmlShop").onMessage(async (event) => {
    let data;
    try {
      data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch (e) {
      return;
    }

    if (data.action === "ready") {
      await sendInitToShop();
      return;
    }

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
        const result = await purchaseItem(data.itemId, data.customMessage, data.sequenceId);
        $w("#htmlShop").postMessage({
          type: "purchaseResult",
          success: result.success,
          message: result.message,
          remainingPoints: result.remainingPoints ?? null,
          isOwned: result.isOwned || false,
          isNewSkin: result.isNewSkin || false,
          skinId: result.skinId || null,
          isAlreadyRecommended: result.isAlreadyRecommended || false,
          recommendedSequenceId: result.recommendedSequenceId ?? null,
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
