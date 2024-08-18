let userID = localStorage.getItem('userID');
let miraiKey = localStorage.getItem('miraiKey');
if (!userID || !miraiKey) {
    window.location.href = '/login/';
}
function send() {
    document.getElementById('userID').value = userID;
    document.getElementById('miraiKey').value = miraiKey;
    grecaptcha.enterprise.ready(async () => {
        grecaptcha.enterprise.execute('6Lc-KespAAAAAAXHezZCb2OKM63wu7MxM3Su7IU_', { action: 'auth' });
    });
    // reCAPTCHAにチェックが入っているか確認
    if (document.getElementById('g-recaptcha-response').value === '') {
        alert('reCAPTCHAにチェックを入れてください。');
        return;
    }
}
