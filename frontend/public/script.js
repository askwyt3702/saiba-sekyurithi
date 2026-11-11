
// =========================
// 画面の切り替え
// =========================

const titleScreen = document.querySelector(".title-screen");
const missionScreen = document.getElementById("missionScreen");
const investigationScreen = document.getElementById("investigationScreen");

// タイトル画面 → Reactアプリ（ミッション選択）へ遷移
document.getElementById("startButton").addEventListener("click", function () {
    // Reactアプリのルート(/)がタイトル画面を持っているのでそちらへ遷移
    // ?autostart=1 パラメータでタイトル画面をスキップしてミッション選択を表示
    window.location.href = "/?autostart=1";
});

// ミッション選択画面 → タイトル画面
function backToTitle() {
    missionScreen.style.display = "none";
    titleScreen.style.display = "flex";
}

// ミッション選択画面 → 調査画面（game.html内のフォールバック）
function selectMission(id) {
    if (id === 1) {
        missionScreen.style.display = "none";
        investigationScreen.style.display = "block";

        addLog("ミッション01を開始しました。");
        addLog("ネットワークの調査を開始してください。");
    }
}

// 調査画面 → ミッション選択画面
function backToMissions() {
    investigationScreen.style.display = "none";
    missionScreen.style.display = "block";
}

// =========================
// 調査ログ
// =========================

function addLog(message) {
    const log = document.getElementById("log");
    log.textContent += "\n> " + message;
}

// =========================
// 調査対象の選択
// =========================

function selectNode(node) {
    const nodeName = document.getElementById("nodeName");
    const nodeInfo = document.getElementById("nodeInfo");

    if (node === "gateway") {
        nodeName.textContent = "GATEWAY";
        nodeInfo.textContent =
            "外部ネットワークとの接続地点。現在は正常に稼働しています。";

        addLog("GATEWAYを調査しました。");
    }

    if (node === "mail") {
        nodeName.textContent = "MAIL SERVER";
        nodeInfo.textContent =
            "メールサーバー。不審な通信の痕跡が確認されています。";

        addLog("MAIL SERVERを調査しました。不審な通信を発見！");
    }

    if (node === "database") {
        nodeName.textContent = "DATABASE";
        nodeInfo.textContent =
            "機密データを保存しているデータベースです。";

        addLog("DATABASEを調査しました。");
    }
}

/* =========================
   ネットワークスキャン
========================= */

let scanCompleted = false;

function scanNetwork() {

    if (scanCompleted) {
        addLog("スキャンはすでに完了しています。");
        return;
    }

    scanCompleted = true;

    addLog("ネットワークスキャンを開始...");
    addLog("接続されているサーバーを検出しました。");
    addLog("GATEWAY：正常");
    addLog("DATABASE：正常");
    addLog("MAIL SERVER：不審な通信を検出！");
    addLog("証拠データを発見しました。");

}
