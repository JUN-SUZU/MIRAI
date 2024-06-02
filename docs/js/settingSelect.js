let userID = localStorage.getItem('userID');
let miraiKey = localStorage.getItem('miraiKey');
if (!userID || !miraiKey) {
    window.location.href = '/login/';
}
fetch('/setting/servers/api/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ preflight: true }),
}).then((res) => {
    if (res.status === 200) {
        res.json().then((data) => {
            if (data.result === 'success') {
                setTimeout(() => {
                    getServerList();
                }, 2000);
            }
        });
    }
});
function getServerList() {
    fetch('/setting/servers/api/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userID: userID, miraiKey: miraiKey }),
    })
        .then(res => res.json())
        .then((res) => {
            console.log(res);
            let servers = res;
            servers.forEach(server => {
                let option = document.createElement('a');
                option.href = `/setting/server/?id=${server.id}`;
                option.innerText = server.name;
                document.getElementById('servers').appendChild(option);
            });
        });
}
