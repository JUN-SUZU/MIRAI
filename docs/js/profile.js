let userID = localStorage.getItem('userID');
let miraiKey = localStorage.getItem('miraiKey');
if (!userID || !miraiKey) {
    window.location.href = '/login/';
}
let anotherAccount = localStorage.getItem('anotherAccount') || null;
fetch('/account/api/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userID: userID, miraiKey: miraiKey, anotherAccount: anotherAccount }),
}).then((res) => {
    if (res.status === 200) {
        res.json().then((data) => {
            document.getElementById('username').innerText = data.username;
            document.getElementById('globalName').innerText = data.globalName;
            document.getElementById('avatar').src = data.avatar;
            if (data.authorized) {
                document.getElementById('noneAuth').style.display = 'none';
                document.getElementById('authDate').innerText = data.authDate;
            }
            else {
                document.getElementById('auth').style.display = 'none';
            }
            if (data.tfa) {
                document.getElementById('noneTfa').style.display = 'none';
                document.getElementById('tfaDate').innerText = data.tfaDate;
                document.getElementById('tfaMethod').innerText = data.tfaMethod === 'app' ? 'Authenticator App' : 'Email';
            }
            else {
                document.getElementById('tfa').style.display = 'none';
            }
        });
    } else if (res.status === 403) {
        localStorage.removeItem('userID');
        localStorage.removeItem('miraiKey');
        window.location.href = '/login/';
    }
});
document.getElementById('logout').onclick = () => {
    fetch('/account/logout/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userID: userID, miraiKey: miraiKey }),
    }).then((res) => {
        if (res.status === 200) {
            localStorage.setItem('anotherAccount', Number(userID).toString(36));
        }
    }).catch(() => {
        console.log('Error occurred');
    });
    localStorage.removeItem('userID');
    localStorage.removeItem('miraiKey');
    window.location.href = '/login/';
}
