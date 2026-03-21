const firebaseConfig = {
  apiKey: "AIzaSyCpJmhpPRxgTSTpZi38DHCaV8ZaLhuKKTc",
  authDomain: "rjpq-tool-2ee82.firebaseapp.com",
  databaseURL: "https://rjpq-tool-2ee82-default-rtdb.firebaseio.com", 
  projectId: "rjpq-tool-2ee82",
  storageBucket: "rjpq-tool-2ee82.firebasestorage.app",
  messagingSenderId: "349150642845",
  appId: "1:349150642845:web:14fe4a135278f82cc40a74"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
let currentRoomId = null, myNickname = "", myColor = null;

window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) { 
        currentRoomId = params.get('room'); 
        showView('nicknameView'); 
    }

    window.addEventListener('keydown', (e) => {
        if (currentRoomId && myColor && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            if (['1', '2', '3', '4'].includes(e.key)) {
                autoFillNextFloor(parseInt(e.key));
            }
        }
    });
};

function showView(viewId) {
    ['startView', 'createView', 'joinView', 'nicknameView', 'mainGameView'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
    if (currentRoomId) {
        document.getElementById('roomIdDisplay').innerText = currentRoomId;
        document.getElementById('activeRoomId').innerText = currentRoomId;
    }
}

function createRoom() {
    const pwd = document.getElementById('createPwd').value;
    if (pwd.length !== 4) return alert("請輸入 4 位數密碼");
    const id = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoomId = id;
    db.ref('rooms/' + id).set({ 
        password: pwd,
        colors: { init: "system" },
        grid: { init: "system" }
    }).then(() => showView('nicknameView'));
}

function joinRoom() {
    const id = document.getElementById('joinId').value, pwd = document.getElementById('joinPwd').value;
    db.ref('rooms/' + id).once('value', snap => {
        const data = snap.val();
        if (data && data.password === pwd) { 
            currentRoomId = id; 
            showView('nicknameView'); 
        } else alert("房號或密碼錯誤");
    });
}

function setNickname() {
    const nick = document.getElementById('nicknameInput').value;
    if (!nick) return alert("請輸入暱稱");
    myNickname = nick; 
    initGrid(); 
    listenToRoom(); 
    showView('mainGameView');
}

function pickCustomColor() {
    if (!currentRoomId) return alert("房間資訊遺失");
    const color = document.getElementById('colorPicker').value.toUpperCase();
    const colorKey = color.replace('#', '');
    db.ref(`rooms/${currentRoomId}/colors/${colorKey}`).transaction((val) => {
        if (val === null) return myNickname; 
        return; 
    }, (err, committed, snap) => {
        if (err) alert("選色同步失敗");
        else if (!committed) alert(`顏色已被 ${snap.val()} 占用！`);
        else {
            myColor = color;
            updateColorUI(true);
        }
    });
}

function updateColorUI(isLocked) {
    document.getElementById('colorPicker').disabled = isLocked;
    document.getElementById('confirmColorBtn').classList.toggle('hidden', isLocked);
    document.getElementById('resetColorBtn').classList.toggle('hidden', !isLocked);
    const status = document.getElementById('myColorStatus');
    status.classList.toggle('hidden', !isLocked);
    if (isLocked) status.style.color = myColor;
}

function resetMyColor() {
    if (!myColor) return;
    if (confirm("更換顏色將清空你目前的標記，確定嗎？")) {
        const cId = currentRoomId;
        const targetColor = myColor;
        db.ref(`rooms/${cId}/colors/${targetColor.replace('#', '')}`).remove();
        db.ref(`rooms/${cId}/grid`).once('value', snap => {
            const data = snap.val();
            if (data) Object.keys(data).forEach(k => { 
                if (data[k].color === targetColor) db.ref(`rooms/${cId}/grid/${k}`).remove(); 
            });
        });
        myColor = null;
        updateColorUI(false);
    }
}

function leaveRoom() {
    if (currentRoomId && !confirm("確定要離開房間嗎？標記將被清除。")) return;
    
    const rid = currentRoomId;
    const mColor = myColor;

    if (rid && mColor) {
        // 1. 移除顏色並檢查是否為最後一人
        db.ref(`rooms/${rid}/colors/${mColor.replace('#', '')}`).remove().then(() => {
            db.ref(`rooms/${rid}/colors`).once('value', snap => {
                const colors = snap.val();
                // 如果只剩下 init 標記，代表沒人了，直接移除房間節點
                if (!colors || Object.keys(colors).length <= 1) {
                    db.ref(`rooms/${rid}`).remove();
                }
            });
        });

        // 2. 移除格子標記
        db.ref(`rooms/${rid}/grid`).once('value', snap => {
            const data = snap.val();
            if (data) Object.keys(data).forEach(k => { 
                if (data[k].color === mColor) db.ref(`rooms/${rid}/grid/${k}`).remove(); 
            });
        });
    }

    // 3. 清理本機狀態
    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}/grid`).off();
        db.ref(`rooms/${currentRoomId}/colors`).off();
    }
    currentRoomId = null; myNickname = ""; myColor = null;
    updateColorUI(false);
    const url = new URL(window.location);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url);
    showView('startView');
}

function autoFillNextFloor(platformNum) {
    db.ref(`rooms/${currentRoomId}/grid`).once('value', snap => {
        const gridData = snap.val() || {};
        let targetFloor = null;
        for (let f = 1; f <= 10; f++) {
            let filled = false;
            for (let p = 1; p <= 4; p++) {
                if (gridData[`${f}_${p}`] && gridData[`${f}_${p}`].color === myColor) {
                    filled = true; break;
                }
            }
            if (!filled) { targetFloor = f; break; }
        }
        if (targetFloor) togglePlatform(targetFloor, platformNum);
    });
}

function togglePlatform(f, p) {
    if (!myColor) return alert("請先確認顏色！");
    const path = `${f}_${p}`, ref = db.ref(`rooms/${currentRoomId}/grid/${path}`);
    ref.once('value', snap => {
        const val = snap.val();
        if (val && val.color === myColor) ref.remove();
        else if (!val) {
            db.ref(`rooms/${currentRoomId}/grid`).once('value', gSnap => {
                const gData = gSnap.val() || {};
                Object.keys(gData).forEach(k => { 
                    if (k.startsWith(f + "_") && gData[k].color === myColor) db.ref(`rooms/${currentRoomId}/grid/${k}`).remove(); 
                });
                ref.set({ color: myColor, nickname: myNickname });
            });
        }
    });
}

function listenToRoom() {
    db.ref(`rooms/${currentRoomId}/grid`).on('value', snap => {
        document.querySelectorAll('.p-btn').forEach(b => { 
            b.style.backgroundColor = ""; b.innerHTML = b.id.split('-')[2]; 
        });
        const data = snap.val();
        if (data) Object.keys(data).forEach(k => {
            if (k === "init") return;
            const btn = document.getElementById(`btn-${k.replace('_', '-')}`);
            if (btn) {
                btn.style.backgroundColor = data[k].color;
                btn.innerHTML += `<span class="user-tag">${data[k].nickname}</span>`;
            }
        });
    });

    db.ref(`rooms/${currentRoomId}/colors`).on('value', snap => {
        const userListEl = document.getElementById('userList');
        userListEl.innerHTML = "";
        const data = snap.val();
        if (data) {
            Object.keys(data).forEach(colorKey => {
                if (colorKey === "init") return;
                const badge = document.createElement('div');
                badge.className = "user-badge";
                badge.style.backgroundColor = "#" + colorKey;
                badge.innerText = data[colorKey];
                userListEl.appendChild(badge);
            });
        }
    });
}

function clearAllPlatforms() { if (confirm("確定清空全體標記嗎？")) db.ref(`rooms/${currentRoomId}/grid`).set({ init: "system" }); }
function copyShareLink() {
    navigator.clipboard.writeText(window.location.origin + window.location.pathname + "?room=" + currentRoomId).then(() => alert("連結已複製"));
}

function initGrid() {
    const tbody = document.getElementById('gridBody'); tbody.innerHTML = "";
    for (let f = 10; f >= 1; f--) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="floor-label">F${f}</td>` + 
            [1,2,3,4].map(p => `<td><button class="p-btn" id="btn-${f}-${p}" onclick="togglePlatform(${f},${p})">${p}</button></td>`).join('');
        tbody.appendChild(tr);
    }
}
