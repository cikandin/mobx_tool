// DevTools 패널 메인 스크립트
let panelCreated = false;

chrome.devtools.panels.create(
  'MobX',
  'icons/icon48.png',
  'panel.html',
  (panel) => {
    panel.onShown.addListener((panelWindow) => {
      if (!panelCreated) {
        panelCreated = true;
      }
    });
  }
);

