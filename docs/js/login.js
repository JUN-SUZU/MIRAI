let userID = localStorage.getItem('userID');
let miraiKey = localStorage.getItem('miraiKey');
if (userID && miraiKey) {
    // ログイン済みです。と表示し、OKを押すとプロフィールページに遷移キャンセルを押すとログアウトします。
    let result = confirm('You are already logged in. Do you want to log out?\n\nすでにログインしています。ログアウトしますか？');
    if (result) {
        localStorage.removeItem('userID');
        localStorage.removeItem('miraiKey');
    } else {
        window.location.href = '/profile/';
    }
}
// GETのパラメータを取得
let url = new URL(window.location.href);
let code = url.searchParams.get('code');
if (code) {
    // POSTリクエストを送信
    let options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: code }),
    };
    fetch('/login/api/', options).then((res) => {
        if (res.status === 200) {
            res.json().then((data) => {
                if (data.result === 'success') {
                    localStorage.setItem('userID', data.userID);
                    localStorage.setItem('miraiKey', data.miraiKey);
                    window.location.href = '/profile/';
                } else {
                    alert('Login failed');
                }
            });
        } else {
            alert('Login failed');
        }
    });
}
