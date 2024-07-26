let userID = localStorage.getItem('userID');
let miraiKey = localStorage.getItem('miraiKey');
if (!userID || !miraiKey) {
    window.location.href = '/login/';
}

function app(){
    fetch('/account/tfa/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userID: userID, miraiKey: miraiKey, method: 'app' }),
    }).then((res) => {
        if (res.status === 200) {
            res.json().then((data) => {
                let image = document.createElement('img');
                image.src = data.QRCode;
                document.getElementById('appQRCode').appendChild(image);
                document.getElementById('appSecret').innerText = data.secret;
                document.getElementById('codeInput').style.display = 'block';
            });
        } else {
            alert('Error occurred');
            window.location.href = '/profile/';
        }
    });
}

function appCode(){
    let inputCode = document.getElementById('code').value.replace(/\s/g, '');
    if (inputCode.length !== 6 || inputCode.match(/[^0-9]/)) {
        document.getElementById('appResult').innerText = '入力エラー！半角数字6桁を入力してください。';
        return;
    }
    fetch('/account/tfa/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userID: userID, miraiKey: miraiKey, method: 'appCode', code: inputCode }),
    }).then((res) => {
        if (res.status === 200) {
            res.json().then((data) => {
                let resMSG = document.getElementById('appResult');
                if (data.result === 'success') {
                    resMSG.innerText = '成功！3秒後にリダイレクトします。';
                    setTimeout(() => {
                        window.location.href = '/profile/';
                    }, 3000);
                } else {
                    resMSG.innerText = '失敗！もう一度お試しください。';
                }
            });
        } else {
            alert('Error occurred');
            window.location.href = '/profile/';
        }
    });
}
