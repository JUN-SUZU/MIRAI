let userID = localStorage.getItem('userID');
let miraiKey = localStorage.getItem('miraiKey');

let url = new URL(window.location.href);
let serverID = url.searchParams.get('id');
if (!userID || !miraiKey) {
    window.location.href = '/login/';
}
if (!serverID) {
    // window.location.href = '/setting/';
}
fetch('/setting/server/api/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userID: userID, miraiKey: miraiKey, serverID: serverID }),
}).then((res) => {
    if (res.status === 200) {
        res.json().then((data) => {
            document.getElementById('serverName').innerText = data.serverName;
            if (data.country) {
                document.getElementById('country').value = data.country;
            }
            // specificCountry
            // country
            if (data.lang) {
                document.getElementById('lang').value = data.lang;
            }
            // specificLang
            // lang
            document.getElementById('danger').checked = data.danger;
            // danger
            document.getElementById('noticeDM').checked = data.notice;// true: DM, false: Channel
            document.getElementById('noticeChannel').checked = !data.notice;
            // noticeDM
            // noticeChannel
            data.channels.forEach((channel) => {
                let option = document.createElement('option');
                option.value = channel.id;
                option.innerText = channel.name;
                document.getElementById('channel').appendChild(option);
            });
            if (data.channel) {
                document.getElementById('channel').value = data.channel;
            }
            if (!data.notice) {
                document.getElementById('channel').style.display = 'block';
            }
            // channel
            data.roles.forEach((role) => {
                let option = document.createElement('option');
                option.value = role.id;
                option.innerText = role.name;
                document.getElementById('role').appendChild(option);
            });
            if (data.role) {
                document.getElementById('role').value = data.role;
            }
            // tfa
            document.getElementById('tfa').checked = data.tfa;
            // role
            // robot
            // vpn
            // exclude
            if (data.excluded.length !== 0) {
                data.excluded.forEach((excluded) => {
                    let user = document.createElement('div');
                    user.className = 'user';
                    user.id = excluded;
                    user.innerText = excluded;
                    document.getElementById('excluded').appendChild(user);
                });
            }
            // excluded
        });
    } else {
        window.location.href = '/setting/';
    }
});

function showSaveButton() {
    document.getElementById('save').style.display = 'block';
}

function countryChange() {
    if (document.getElementById('specificCountry').checked) {
        document.getElementById('country').style.display = 'block';
    } else {
        document.getElementById('country').style.display = 'none';
    }
    showSaveButton();
};
document.getElementById('country').addEventListener('change', () => {
    showSaveButton();
});
function langChange() {
    if (document.getElementById('specificLang').checked) {
        document.getElementById('lang').style.display = 'block';
    } else {
        document.getElementById('lang').style.display = 'none';
    }
    showSaveButton();
};
document.getElementById('lang').addEventListener('change', () => {
    showSaveButton();
});
document.getElementById('danger').addEventListener('change', () => {
    showSaveButton();
});
function noticeChange() {
    if (document.getElementById('noticeDM').checked) {
        document.getElementById('channel').style.display = 'none';
    } else {
        document.getElementById('channel').style.display = 'block';
    }
    showSaveButton();
};
document.getElementById('channel').addEventListener('change', () => {
    showSaveButton();
});
document.getElementById('role').addEventListener('change', () => {
    showSaveButton();
});
document.getElementById('tfa').addEventListener('change', () => {
    showSaveButton();
});
document.getElementById('robot').addEventListener('change', () => {
    showSaveButton();
});
document.getElementById('vpn').addEventListener('change', () => {
    showSaveButton();
});
document.getElementById('exclude').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        let user = document.createElement('div');
        user.className = 'user';
        user.id = document.getElementById('exclude').value;
        user.innerText = document.getElementById('exclude').value;
        document.getElementById('excluded').appendChild(user);
        document.getElementById('exclude').value = '';
        showSaveButton();
    }
});
document.getElementById('excluded').addEventListener('click', (e) => {
    if (e.target.className === 'user') {
        document.getElementById('excluded').removeChild(e.target);
        showSaveButton();
    }
});

document.getElementById('save').addEventListener('click', () => {
    let data = {
        userID: userID,
        miraiKey: miraiKey,
        serverID: serverID,
        country: document.getElementById('specificCountry').checked ? document.getElementById('country').value : null,
        lang: document.getElementById('specificLang').checked ? document.getElementById('lang').value : null,
        danger: document.getElementById('danger').checked,
        notice: document.getElementById('noticeDM').checked,
        channel: document.getElementById('noticeDM').checked ? null : document.getElementById('channel').value,
        role: document.getElementById('role').value,
        tfa: document.getElementById('tfa').checked,
        robot: document.getElementById('robot').checked,
        vpn: document.getElementById('vpn').checked,
        excluded: [],
    };
    document.getElementById('excluded').childNodes.forEach((user) => {
        data.excluded.push(user.id);
    });
    fetch('/setting/server/update/api/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    }).then(res => res.json())
        .then(data => {
            if (data.result === 'success') {
                document.getElementById('save').style.display = 'none';
            }
        });
});
