// DeleteConfirmation.jsw
import wixWindow from 'wix-window';

$w.onReady(function () {
  // 获取传递过来的评论数据
  const commentData = wixWindow.lightbox.getContext();
  
  // 如果有评论数据，可以在控制台输出信息用于调试
  if (commentData) {
    const { commentId, workNumber, score, comment } = commentData;
    console.log(`准备删除评论 - 作品编号：${workNumber}，评分：${score}，评论：${comment.substring(0, 50)}...`);
  }

  $w("#confirmButton").onClick(() => {
    // 获取删除理由 - 使用纯JavaScript方式
    let deleteReason = '';
    
    // 尝试获取删除理由
    try {
      // 直接访问元素，如果不存在会抛出异常
      deleteReason = $w("#deleteReason").value || '';
    } catch (error) {
      console.log('无法获取删除理由，使用默认值');
      deleteReason = '未填写删除理由';
    }
    
    // 检查是否填写了删除理由
    if (!deleteReason || deleteReason.trim() === '') {
      console.log('请填写删除理由');
      return;
    }
    
    // 返回确认结果和删除理由
    wixWindow.lightbox.close({
      action: 'confirm',
      reason: deleteReason.trim()
    });
  });

  $w("#cancelButton").onClick(() => {
    wixWindow.lightbox.close({
      action: 'cancel',
      reason: null
    });
  });
});
