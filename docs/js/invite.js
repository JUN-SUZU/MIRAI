const gei = (id) => document.getElementById(id);
const messageBox = (msg) => {
    const alertDiv = gei('alertMessage');
    alertDiv.innerText = msg;
    alertDiv.parentElement.style.display = 'block';
}
const closeMessageBox = () => {
    const alertDiv = gei('alertMessage');
    alertDiv.innerText = '';
    alertDiv.parentElement.style.display = 'none';
}
const linkCode = window.location.pathname.split('/')[2];
const guildId = document.getElementById('guildId').innerText;

const handleInvite = fetch('/invite/api/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ linkCode: linkCode, guildId: guildId }),
}).then(response => response.json()).then(data => {
    if (data.result != 'success') return messageBox(data.message);
    const inviteLink = data.inviteLink;
    // 新しいタブで開く
    window.open(inviteLink, '_blank');
});
