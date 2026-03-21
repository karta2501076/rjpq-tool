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
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentRoomId = null, myNickname = "", myColor = "", isLocked = false;

// 初始化 10 層樓的表格 UI
const gridBody = document.getElementById('gridBody');
for (let f = 10; f >= 1; f--) {
    let row = document.createElement('tr');
    row.innerHTML = `<td class="floor-label">F${f}</td>` + 
        [1, 2, 3, 4].map(p => `<td><button id="btn_${f}_${p}" class="p-btn" onclick="togglePlatform(${f},${p})">${p}</button></td>`).join('');
    gridBody.appendChild(row);
}

// 支援網址參數直接進入房間 (?room=xxxx)
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');
    if (roomIdFromUrl) {
        currentRoomId = roomIdFromUrl;
        document.getElementById('roomIdDisplay').innerText = currentRoomId;
        showView('nicknameView');
    }
};

function showView(viewId) {
    ['startView', 'createView', 'joinView', 'nicknameView', 'mainGameView'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
}

// 創建房間
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
    }).catch(() => alert("創建失敗"));
}

// 加入房間
function joinRoom() {
    const id = document.getElementById('joinId').value, pwd = document.getElementById('joinPwd').value;
    db.ref(`rooms/${id}`).once('value', snap => {
        const data = snap.val();
        if (data && data.password === pwd) { 
            currentRoomId = id; 
            document.getElementById('roomIdDisplay').innerText = id; 
            showView('nicknameView'); 
        } else alert("房號或密碼錯誤");
    });
}

// 設定暱稱並進入同步介面
function setNickname() {
    const nick = document.getElementById('nicknameInput').value.trim();
    if (!nick) return alert("請輸入暱稱");
    myNickname = nick; 
    document.getElementById('activeRoomId').innerText = currentRoomId; 
    showView('mainGameView'); 
    listenToRoom();
}

// 核心同步邏輯
function listenToRoom() {
    const roomRef = db.ref(`rooms/${currentRoomId}`);
    const gridRef = db.ref(`rooms/${currentRoomId}/grid`);
    const usersRef = db.ref(`rooms/${currentRoomId}/users`);
    const myUserRef = db.ref(`rooms/${currentRoomId}/users/${myNickname}`);

    // 1. 監聽網格狀態 (填色同步)
    gridRef.on('value', snap => {
        const data = snap.val() || {};
        document.querySelectorAll('.p-btn').forEach(btn => { 
            btn.style.backgroundColor = ""; 
            const tag = btn.querySelector('.user-tag'); 
            if (tag) tag.remove(); 
        });
        Object.keys(data).forEach(key => {
            const [f, p] = key.split('_'), btn = document.getElementById(`btn_${f}_${p}`);
            if (btn) { 
                btn.style.backgroundColor = data[key].color; 
                btn.innerHTML = `${p}<div class="user-tag">${data[key].user}</div>`; 
            }
        });
    });

    // 2. 監聽在線隊員與房間自動回收機制
    myUserRef.set({ color: myColor || "#555" });
    myUserRef.onDisconnect().remove(); // 斷線自動移除自己

    usersRef.on('value', snap => {
        const users = snap.val();
        const listEl = document.getElementById('userList');
        listEl.innerHTML = ""; 

        if (!users) {
            // 如果房間沒人了，最後一位離開的會觸發刪除整個房間節點
            roomRef.remove();
            return;
        }

        Object.keys(users).forEach(u => {
            const b = document.createElement('div'); 
            b.className = 'user-badge'; 
            b.style.backgroundColor = users[u].color; 
            b.innerText = u; 
            listEl.appendChild(b);
        });
    });
}

// 選色唯一性鎖定
function pickCustomColor() {
    const selectedColor = document.getElementById('colorPicker').value;
    db.ref(`rooms/${currentRoomId}/users`).once('value', snap => {
        const users = snap.val() || {};
        const isColorUsed = Object.keys(users).some(u => u !== myNickname && users[u].color === selectedColor);
        
        if (isColorUsed) {
            alert("此顏色已被其他隊友選用，請更換顏色！");
        } else {
            myColor = selectedColor;
            isLocked = true;
            document.getElementById('myColorStatus').classList.remove('hidden');
            document.getElementById('confirmColorBtn').classList.add('hidden');
            document.getElementById('resetColorBtn').classList.remove('hidden');
            db.ref(`rooms/${currentRoomId}/users/${myNickname}`).update({ color: myColor });
        }
    });
}

// 重選顏色：清空個人填色紀錄
function resetMyColor() {
    if (!confirm("重選顏色將會清空你目前已填寫的所有平台，確定嗎？")) return;

    isLocked = false; 
    document.getElementById('myColorStatus').classList.add('hidden');
    document.getElementById('confirmColorBtn').classList.remove('hidden');
    document.getElementById('resetColorBtn').classList.add('hidden');

    db.ref(`rooms/${currentRoomId}/grid`).once('value', snap => {
        const gridData = snap.val() || {};
        const updates = {};
        Object.keys(gridData).forEach(key => {
            if (gridData[key].user === myNickname) updates[key] = null;
        });
        db.ref(`rooms/${currentRoomId}/grid`).update(updates);
    });
}

// 手動填色防呆
function togglePlatform(f, p) {
    if (!isLocked) return alert("請先選定顏色並點擊確認");
    db.ref(`rooms/${currentRoomId}/grid`).once('value', snap => {
        const gridData = snap.val() || {};
        const targetKey = `${f}_${p}`;
        if (gridData[targetKey]) {
            if (gridData[targetKey].user === myNickname) db.ref(`rooms/${currentRoomId}/grid/${targetKey}`).remove();
            return;
        }
        for (let i = 1; i <= 4; i++) {
            if (gridData[`${f}_${i}`] && gridData[`${f}_${i}`].color === myColor) return;
        }
        db.ref(`rooms/${currentRoomId}/grid/${targetKey}`).set({ user: myNickname, color: myColor });
    });
}

// 快捷鍵防呆跳層優化：遇阻礙直接沒反應
function autoFillNextFloor(p) {
    if (!isLocked) return;
    db.ref(`rooms/${currentRoomId}/grid`).once('value', snap => {
        const gridData = snap.val() || {};
        let nextFloorForMe = 1;
        for (let f = 1; f <= 10; f++) {
            let myColorExists = false;
            for (let i = 1; i <= 4; i++) {
                if (gridData[`${f}_${i}`] && gridData[`${f}_${i}`].color === myColor) {
                    myColorExists = true; break;
                }
            }
            if (!myColorExists) { nextFloorForMe = f; break; }
            if (f === 10) return;
        }

        const targetKey = `${nextFloorForMe}_${p}`;
        // 如果該平台已經有人填過，直接沒動作
        if (gridData[targetKey]) return; 

        db.ref(`rooms/${currentRoomId}/grid/${targetKey}`).set({ user: myNickname, color: myColor });
    });
}

// 取消上一層填色 (按 0)
function undoLastFill() {
    if (!currentRoomId || !myNickname) return;
    db.ref(`rooms/${currentRoomId}/grid`).once('value', snap => {
        const data = snap.val() || {};
        for (let f = 10; f >= 1; f--) {
            for (let p = 1; p <= 4; p++) {
                if (data[`${f}_${p}`] && data[`${f}_${p}`].user === myNickname) {
                    db.ref(`rooms/${currentRoomId}/grid/${f}_${p}`).remove(); 
                    return;
                }
            }
        }
    });
}

// 鍵盤監聽
window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (['1', '2', '3', '4'].includes(e.key)) autoFillNextFloor(parseInt(e.key));
    else if (e.key === '0') undoLastFill();
});

function clearAllPlatforms() { if (confirm("確定要清空所有樓層嗎？")) db.ref(`rooms/${currentRoomId}/grid`).remove(); }

function leaveRoom() {
    if (currentRoomId && myNickname) {
        db.ref(`rooms/${currentRoomId}/users/${myNickname}`).remove().then(() => location.reload());
    } else location.reload();
}

function copyShareLink() {
    const link = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    navigator.clipboard.writeText(link).then(() => alert("連結已複製"));
}
