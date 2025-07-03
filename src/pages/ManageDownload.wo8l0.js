import wixWindow from 'wix-window';

$w.onReady(function () {

    // 获取从主页面传递的下载链接
    const receivedData = wixWindow.lightbox.getContext();
    const batchDownloadUrls = receivedData.batchDownloadUrls;

    // 动态创建下载链接
    let linksHtml = "<ul>";
    batchDownloadUrls.forEach((url, index) => {
        if (url) {
            linksHtml += `<li><a href="${url}" target="_blank">Download File ${index + 1}</a></li>`;
        }
    });
    linksHtml += "</ul>";

    // 将下载链接设置到 Lightbox 中的某个元素
    $w("#downloadLinksContainer").html = linksHtml;
});