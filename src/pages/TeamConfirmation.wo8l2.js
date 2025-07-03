import wixWindow from 'wix-window';

$w.onReady(function () {
  // 获取传递给 Lightbox 的上下文
  const context = wixWindow.lightbox.getContext();

  // context 现在是一个对象，包含成员链接和队名
  const { teamName, memberLinks } = context;

  // 显示队伍成员链接
  $w("#text10").text = `当前队伍组成的成员链接：${memberLinks.join(', ')}.`;

  // 显示队名
  $w("#text11").text = `队名：${teamName}.`;

  $w("#confirmButton").onClick(() => {
    wixWindow.lightbox.close('confirm');
  });

  $w("#cancelButton").onClick(() => {
    wixWindow.lightbox.close('cancel');
  });
});
