// DeleteConfirmation.jsw
import wixWindow from 'wix-window';

$w.onReady(function () {
  $w("#confirmButton").onClick(() => {
    wixWindow.lightbox.close('confirm');
  });

  $w("#cancelButton").onClick(() => {
    wixWindow.lightbox.close('cancel');
  });
});
