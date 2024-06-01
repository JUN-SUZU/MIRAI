let userID = localStorage.getItem('userID');
let miraiKey = localStorage.getItem('miraiKey');
if (!userID || !miraiKey) {
    window.location.href = '/login/';
}
function send() {
    document.getElementById('userID').value = userID;
    document.getElementById('miraiKey').value = miraiKey;
    grecaptcha.enterprise.ready(async () => {
        grecaptcha.enterprise.execute('6LcJ6ukpAAAAAKGoAzD1K_wctq2FhVtxSMrywuU1', { action: 'auth' });
    });
}
