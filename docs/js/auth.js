const loggedIn = document.getElementById('loggedIn');// TODO: Cookie'loggedIn'の登録をお忘れなく
if (!loggedIn) {
    window.location.href = '/login/';
}
const under2 = 'おめでとう！初めての誕生日入力かもね？<br>ママやパパと一緒に、あなたが生まれた奇跡の日を教えてね！<br>あ、キーボード食べないでね～🍭';
const under5 = 'お誕生日を教えてくれる？そうすれば“あなたの日”をみんなでお祝いできるよ！<br>' +
    '魔法の数字だから、間違えないようにね✨<br>でも、もし分からなかったらパパやママに助けてもらってね！';
const under10 = '誕生日を教えてくれる？秘密にしないでね！<br>教えてくれたら、特別な日を超ハッピーにする計画ができるかも!? 🎉<br>さあ、本当の日を入れてみて！';
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('birthday').addEventListener('change', (event) => {
        const birthday = event.target.value;
        const today = new Date();
        const birth = new Date(birthday);
        let age = today.getFullYear() - birth.getFullYear();
        if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
            age--;
        }
        if (age < 2) {
            document.getElementById('alertBirthday').innerHTML = under2;
        }
        else if (age < 5) {
            document.getElementById('alertBirthday').innerHTML = under5;
        }
        else if (age < 10) {
            document.getElementById('alertBirthday').innerHTML = under10;
        }
        else {
            document.getElementById('alertBirthday').innerHTML = '';
            document.getElementsByClassName('alert__birthday')[0].style.display = 'none';
        }
        if (age < 10) {
            document.getElementsByClassName('alert__birthday')[0].style.display = 'block';
        }
    });
    document.getElementById('auth').addEventListener('submit', (event) => {
        // reCAPTCHAにチェックが入っているか確認
        if (document.getElementById('g-recaptcha-response').value === '') {
            event.preventDefault();
            return;
        }
        if (!document.getElementById('birthday').value) {
            event.preventDefault();
            return;
        }
    });
});

function send() {
    grecaptcha.enterprise.ready(async () => {
        grecaptcha.enterprise.execute('6Lc-KespAAAAAAXHezZCb2OKM63wu7MxM3Su7IU_', { action: 'auth' });
    });
}
