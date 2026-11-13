
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

// ========================================
// NULL ROUTE - ANIMATED NETWORK BACKGROUND
// ========================================

(() => {
    const canvas = document.getElementById("networkCanvas");

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    let width = 0;
    let height = 0;
    let nodes = [];
    let animationId = 0;
    let time = 0;
    // 背景を漂う粒子
const particles = [];

const cubes = [];

function createCubes(){

    cubes.length = 0;

    for(let i=0;i<12;i++){

        cubes.push({

            x:(Math.random()-0.5)*width*1.8,
            y:(Math.random()-0.5)*height*1.5,

            z:Math.random()*1200+200,

            size:25+Math.random()*70,

            rot:Math.random()*Math.PI,

            speed:0.4+Math.random()*0.6

        });

    }

}

for (let i = 0; i < 80; i++) {
    particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random(),
        speed: 0.2 + Math.random() * 0.6,
        size: 1 + Math.random() * 2
    });
}

    const NODE_COUNT = 105;
    const SPHERE_POINTS = 260;

    // 画面サイズ調整
    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        width = rect.width;
        height = rect.height;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        createNodes();
        createCubes();
    }

    // 背景ノード生成
    function createNodes() {
        nodes = [];

        for (let i = 0; i < NODE_COUNT; i++) {
            nodes.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.35,
                vy: (Math.random() - 0.5) * 0.35,
                size: Math.random() * 1.8 + 0.7,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    // 中央の球体の点を生成
    const spherePoints = [];

    for (let i = 0; i < SPHERE_POINTS; i++) {
        const y = 1 - (i / (SPHERE_POINTS - 1)) * 2;
        const radius = Math.sqrt(1 - y * y);

        const angle = Math.PI * (3 - Math.sqrt(5)) * i;

        spherePoints.push({
            x: Math.cos(angle) * radius,
            y: y,
            z: Math.sin(angle) * radius
        });
    }

    function drawGrid() {

    const horizon = height * 0.33;

    ctx.strokeStyle = "rgba(0,220,255,0.08)";
    ctx.lineWidth = 1;

    // 奥へ伸びる縦線
    const columns = 26;

    for(let i=-columns;i<=columns;i++){

        const x = width/2 + i*55;

        ctx.beginPath();
        ctx.moveTo(x, height);

        ctx.lineTo(
            width/2 + i*8,
            horizon
        );

        ctx.stroke();
    }

    // 横線
    for(let i=0;i<22;i++){

        const p=i/22;

        const y=
        horizon+
        Math.pow(p,2.3)*(height-horizon);

        ctx.beginPath();

        ctx.moveTo(0,y);
        ctx.lineTo(width,y);

        ctx.stroke();

    }

}

    // 背景ネットワーク
    function drawNetwork() {
        const maxDistance = Math.min(150, width * 0.13);

        nodes.forEach(node => {
            node.x += node.vx;
            node.y += node.vy;

            if (node.x < 0 || node.x > width) node.vx *= -1;
            if (node.y < 0 || node.y > height) node.vy *= -1;

            node.x = Math.max(0, Math.min(width, node.x));
            node.y = Math.max(0, Math.min(height, node.y));
        });

        // ノード間の接続線
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < maxDistance) {
                    const alpha = (1 - distance / maxDistance) * 0.5;

                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);

                    ctx.strokeStyle = `rgba(0, 225, 255, ${alpha})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();

                    // 流れるデータ粒子
                    const progress = (time * 0.012 + i * 0.17 + j * 0.03) % 1;

                    const px = a.x + dx * progress;
                    const py = a.y + dy * progress;

                    ctx.beginPath();
                    ctx.arc(px, py, 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(100, 250, 255, ${alpha + 0.3})`;
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = "#00eaff";
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }
        }

        // ノード本体
        nodes.forEach(node => {
            const pulse = 0.5 + Math.sin(time * 0.025 + node.phase) * 0.5;

            ctx.beginPath();
            ctx.arc(node.x, node.y, node.size + pulse, 0, Math.PI * 2);

            ctx.fillStyle = `rgba(0, 235, 255, ${0.5 + pulse * 0.5})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#00eaff";
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    }
function drawParticles() {

    particles.forEach(p => {

        p.y += p.speed;

        if (p.y > height + 20) {
            p.y = -20;
            p.x = Math.random() * width;
        }

        const alpha = 0.15 + p.z * 0.5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + p.z), 0, Math.PI * 2);

        ctx.fillStyle = `rgba(0,255,220,${alpha})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#00ffee";
        ctx.fill();
        ctx.shadowBlur = 0;
    });

}

function drawCubes(){

    cubes.sort((a,b)=>b.z-a.z);

    cubes.forEach(c=>{

        c.z-=c.speed;

        if(c.z<120){

            c.z=1200;
            c.x=(Math.random()-0.5)*width*1.8;
            c.y=(Math.random()-0.5)*height*1.5;
        }

        const p = 1400 / c.z;

        const x=width/2+c.x*p;

        const y=height/2+c.y*p;

        const s=c.size*p;

        c.rot+=0.003;

        ctx.save();

        ctx.translate(x,y);

        ctx.rotate(c.rot);

        ctx.strokeStyle="rgba(0,255,220,0.7)";
        ctx.lineWidth=1;

        ctx.strokeRect(-s/2,-s/2,s,s);

        ctx.globalAlpha=0.25;
        ctx.fillStyle="#001315";
        ctx.fillRect(-s/2,-s/2,s,s);

        ctx.restore();

    });

}

    // 中央のネットワーク球体
    function drawSphere() {
        const cx = width * 0.5;
        const cy = height * 0.34;
        const radius = Math.min(width, height) * 0.19;

        const rotation = time * 0.004;

        // 外側のスキャンリング
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();

            ctx.ellipse(
                cx,
                cy,
                radius * (1.18 + i * 0.13),
                radius * (0.38 + i * 0.06),
                rotation * (i % 2 === 0 ? 1 : -1),
                0,
                Math.PI * 2
            );

            ctx.strokeStyle = `rgba(0, 235, 255, ${0.25 - i * 0.05})`;
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 12;
            ctx.shadowColor = "#00eaff";
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // 球体の外周
        const glow = ctx.createRadialGradient(
            cx, cy, radius * 0.2,
            cx, cy, radius
        );

        glow.addColorStop(0, "rgba(0, 180, 210, 0.13)");
        glow.addColorStop(0.7, "rgba(0, 100, 140, 0.08)");
        glow.addColorStop(1, "rgba(0, 220, 255, 0.2)");

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.strokeStyle = "rgba(0, 235, 255, 0.65)";
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#00eaff";
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 球体内部のネットワーク
        const projected = spherePoints.map(point => {
            const x = point.x * Math.cos(rotation) - point.z * Math.sin(rotation);
            const z = point.x * Math.sin(rotation) + point.z * Math.cos(rotation);

            const perspective = 1 / (2.4 - z * 0.55);

            return {
                x: cx + x * radius * 1.35 * perspective,
                y: cy + point.y * radius * 1.35 * perspective,
                z: z,
                visible: z > -0.45
            };
        });

        // 球体の接続線
        for (let i = 0; i < spherePoints.length; i++) {
            for (let j = i + 1; j < spherePoints.length; j++) {
                const a = spherePoints[i];
                const b = spherePoints[j];

                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dz = a.z - b.z;

                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (distance < 0.19 && projected[i].visible && projected[j].visible) {
                    ctx.beginPath();
                    ctx.moveTo(projected[i].x, projected[i].y);
                    ctx.lineTo(projected[j].x, projected[j].y);

                    ctx.strokeStyle = "rgba(0, 235, 255, 0.23)";
                    ctx.lineWidth = 0.6;
                    ctx.stroke();
                }
            }
        }

        // 球体内部の光るノード
        projected.forEach(point => {
            if (!point.visible) return;

            const alpha = 0.35 + Math.max(0, point.z) * 0.65;

            ctx.beginPath();
            ctx.arc(point.x, point.y, 1.3, 0, Math.PI * 2);

            ctx.fillStyle = `rgba(80, 250, 255, ${alpha})`;
            ctx.shadowBlur = 8;
            ctx.shadowColor = "#00eaff";
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        // 中心のスキャン光
        const scanY = cy - radius + ((time * 0.8) % (radius * 2));

        ctx.beginPath();
        ctx.moveTo(cx - radius, scanY);
        ctx.lineTo(cx + radius, scanY);

        ctx.strokeStyle = "rgba(0, 255, 255, 0.35)";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#00eaff";
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // アニメーション本体
    function animate() {
        time++;

        ctx.clearRect(0, 0, width, height);

       drawGrid();
        drawCubes();
        drawParticles();
        drawNetwork();
        drawSphere();

        animationId = requestAnimationFrame(animate);
    }

    // 初期化
    resizeCanvas();
    animate();

    window.addEventListener("resize", resizeCanvas);

})();
