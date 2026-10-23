# Rift Trial — GitHub Pages

這是純前端 Canvas 遊戲，可直接部署至 GitHub Pages。

## 部署
1. 將 `index.html`、`game.js`、`style.css` 與 `README.md` 上傳至 GitHub Repository 根目錄。
2. 在 Repository 的 Settings → Pages 中，選擇 `Deploy from a branch`、`main` 與 `/ (root)`。
3. 儲存並等待部署完成。

## 本版更新
- 升級特效期間遊戲繼續運行，不暫停，並抑制升級特效期間的畫面震動。
- 右側狀態欄持續顯示五個技能的剩餘冷卻時間。
- 能力欄列出所有非生命值成長選項，冷卻縮減顯示疊加後的實際百分比。
- 按住滑鼠左鍵可連續普攻。
- Shift 隱形會中斷正在持續的普攻；隱形期間仍可衝刺，但普攻、右鍵、Q 或 E 會解除隱形。
