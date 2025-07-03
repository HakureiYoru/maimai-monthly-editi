import { lightbox } from 'wix-window';

$w.onReady(() => {
    // 从主页面获取传递过来的数据
    const receivedData = lightbox.getContext();
    
    // 确保接收到数据，并将内容放到 collapsibleText1
    if (receivedData && receivedData.content) {
        $w('#collapsibleText1').text = receivedData.content;
    }
});
