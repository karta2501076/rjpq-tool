// 使用你提供的 Firebase 配置
const firebaseConfig = {
  apiKey: "AIzaSyCpJmhpPRxgTSTpZi38DHCaV8ZaLhuKKTc",
  authDomain: "rjpq-tool-2ee82.firebaseapp.com",
  databaseURL: "https://rjpq-tool-2ee82-default-rtdb.firebaseio.com",
  projectId: "rjpq-tool-2ee82",
  storageBucket: "rjpq-tool-2ee82.firebasestorage.app",
  messagingSenderId: "349150642845",
  appId: "1:349150642845:web:14fe4a135278f82cc40a74",
  measurementId: "G-9FP8PMRQ5Q"
};

// 初始化 Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let currentRoomId = null;
let myNickname = "";
let myColor = "";
let isLocked = false;

// 建立 10 層表格
const gridBody = document.getElementById('gridBody');
for (let f = 10; f >= 1; f--) {
    let row = document.createElement('tr');
    row.innerHTML = `<td class="floor-label">F${f}</td>` + 
        [1, 2, 3, 4].map(p => `<td><button id="btn_${f}_${p}" class="p-btn" onclick="togglePlatform(${f},${p})">${p}</button></td>`).join('');
    gridBody.appendChild(row);
}

function showView(viewId) {
    ['startView', 'createView', 'joinView', 'nicknameView', 'mainGameView'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
}

function createRoom() {
    const pwd = document.getElementById('createPwd').value;
    if (pwd.length !== 4) return alert("請設定 4 碼密碼");
    const newRoomId = Math.floor(1000 + Math.random() * 9000).toString();
    db.ref(`rooms/${newRoomId}`).set({
        password: pwd,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        currentRoomId = newRoomId;
        document.getElementById('roomIdDisplay').innerText = newRoomId;
        showView('nicknameView');
    }).catch(err => {
        console.error(err);
        alert("創建失敗，請檢查網路或 Firebase 規則設定");
    });
}

function joinRoom() {
    const id = document.getElementById('joinId').value;
    const pwd = document.getElementById('joinPwd').value;
    db.ref(`rooms/${id}`).once('value', snap => {
        const data = snap.val();
        if (data && data.password === pwd) {
            currentRoomId = id;
            document.getElementById('roomIdDisplay').innerText = id;
            showView('nicknameView');
        } else {
            alert("房號或密碼錯誤");
        }
    });
}

function setNickname() {
    const nick = document.getElementById('nicknameInput').value.trim();
    if (!nick) return alert("請輸入暱稱");
    myNickname = nick;
    document.getElementById('activeRoomId').innerText = currentRoomId;
    showView('mainGameView');
    listenToRoom();
}

function listenToRoom() {
    // 監聽格子狀態
    db.ref(`rooms/${currentRoomId}/grid`).on('value', snap => {
        const gridData = snap.val() || {};
        document.querySelectorAll('.p-btn').forEach(btn => {
            btn.style.backgroundColor = "";
            const tag = btn.querySelector('.user-tag');
            if (tag) tag.remove();
        });
        Object.keys(gridData).forEach(key => {
            const [f, p] = key.split('_');
            const btn = document.getElementById(`btn_${f}_${p}`);
            if (btn) {
                btn.style.backgroundColor = gridData[key].color;
                btn.innerHTML = `${p}<div class="user-tag">${gridData[key].user}</div>`;
            }
        });
    });

    // 設定在線狀態與顏色同步
    const presenceRef = db.ref(`rooms/${currentRoomId}/users/${myNickname}`);
    presenceRef.set({ color: myColor || "#555" });
    presenceRef.onDisconnect().remove();

    db.ref(`rooms/${currentRoomId}/users`).on('value', snap => {
        const users = snap.val() || {};
        const listDiv = document.getElementById('userList');
        listDiv.innerHTML = "";
        Object.keys(users).forEach(u => {
            const badge = document.createElement('div');
            badge.className = 'user-badge';
            badge.style.backgroundColor = users[u].color;
            badge.innerText = u;
            listDiv.appendChild(badge);
        });
    });
}

function pickCustomColor() {
    myColor = document.getElementById('colorPicker').value;
    isLocked = true;
    document.getElementById('myColorStatus').classList.remove('hidden');
    document.getElementById('confirmColorBtn').classList.add('hidden');
    document.getElementById('resetColorBtn').classList.remove('hidden');
    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}/users/${myNickname}`).update({ color: myColor });
    }
}

function resetMyColor() {
    isLocked = false;
    document.getElementById('myColorStatus').classList.add('hidden');
    document.getElementById('confirmColorBtn').classList.remove('hidden');
    document.getElementById('resetColorBtn').classList.add('hidden');
}

function togglePlatform(f, p) {
    if (!isLocked) return alert("請先選定顏色並點擊確認");
    const targetRef = db.ref(`rooms/${currentRoomId}/grid/${f}_${p}`);
    targetRef.once('value', snap => {
        if (snap.exists()) {
            targetRef.remove();
        } else {
            targetRef.set({ user: myNickname, color: myColor });
        }
    });
}

function autoFillNextFloor(p) {
    if (!isLocked) return;
    db.ref(`rooms/${currentRoomId}/grid`).once('value', snap => {
        const gridData = snap.val() || {};
        for (let f = 1; f <= 10; f++) {
            if (!gridData[`${f}_${p}`]) {
                db.ref(`rooms/${currentRoomId}/grid/${f}_${p}`).set({
                    user: myNickname,
                    color: myColor
                });
                break;
            }
        }
    });
}

// 0 鍵撤回功能：由上往下找自己填的最後一格
function undoLastFill() {
    if (!currentRoomId || !myNickname) return;
    db.ref(`rooms/${currentRoomId}/grid`).once('value', snap => {
        const gridData = snap.val() || {};
        for (let f = 10; f >= 1; f--) {
            for (let p = 1; p <= 4; p++) {
                const targetKey = `${f}_${p}`;
                if (gridData[targetKey] && gridData[targetKey].user === myNickname) {
                    db.ref(`rooms/${currentRoomId}/grid/${targetKey}`).remove();
                    return; // 刪完一格就結束
                }
            }
        }
    });
}

// 鍵盤監聽
window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (['1', '2', '3', '4'].includes(e.key)) {
        autoFillNextFloor(parseInt(e.key));
    } else if (e.key === '0') {
        undoLastFill();
    }
});

function clearAllPlatforms() {
    if (confirm("確定要清空所有樓層嗎？")) {
        db.ref(`rooms/${currentRoomId}/grid`).remove();
    }
}

function leaveRoom() {
    location.reload();
}

function copyShareLink() {
    const link = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    navigator.clipboard.writeText(link).then(() => alert("房間連結已複製！"));
}
