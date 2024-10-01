const fs = require('fs');
let dcc = 0;

class Database {
    constructor() {
        this.accountData = JSON.parse(fs.readFileSync('./data/account.json', 'utf8'));
        this.serverData = JSON.parse(fs.readFileSync('./data/server.json', 'utf8'));
        this.blacklistData = JSON.parse(fs.readFileSync('./data/blacklist.json', 'utf8'));
        this.ipData = JSON.parse(fs.readFileSync('./data/ip.json', 'utf8'));
    }

    read(kind) {
        switch (kind) {
            case 'account':
                this.accountData = JSON.parse(fs.readFileSync('./data/account.json', 'utf8'));
            case 'server':
                this.serverData = JSON.parse(fs.readFileSync('./data/server.json', 'utf8'));
            case 'blacklist':
                this.blacklistData = JSON.parse(fs.readFileSync('./data/blacklist.json', 'utf8'));
            case 'ip':
                this.ipData = JSON.parse(fs.readFileSync('./data/ip.json', 'utf8'));

        }
    }

    write(kind) {
        switch (kind) {
            case 'account':
                fs.writeFileSync('./data/account.json', JSON.stringify(this.accountData, null, 4));
            case 'server':
                fs.writeFileSync('./data/server.json', JSON.stringify(this.serverData, null, 4));
            case 'blacklist':
                fs.writeFileSync('./data/blacklist.json', JSON.stringify(this.blacklistData, null, 4));
            case 'ip':
                fs.writeFileSync('./data/ip.json', JSON.stringify(this.ipData, null, 4));
        }
    }

    auth(userID, miraiKey) {
        if(this.accountData[userID] && this.accountData[userID].sessions[miraiKey] && this.accountData[userID].sessions[miraiKey].enabled) return true;
        else return false;
    }
}

module.exports = Database;
