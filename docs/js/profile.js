let userID = localStorage.getItem('userID');
let miraiKey = localStorage.getItem('miraiKey');
if (!userID || !miraiKey) {
    window.location.href = '/login/';
}
fetch('/account/api/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userID: userID, miraiKey: miraiKey }),
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
        });
    } else {
        window.location.href = '/login/';
    }
});
