const { EventEmitter } = require('events')

class Player extends EventEmitter {
    constructor(data = {}) {
        super()
        Object.assign(this, {
            uuid: data.uuid ?? null,
            gamertag: data.gamertag ?? data.username ?? null,
            xuid: data.xuid ?? null,
            platformChatId: data.platformChatId ?? null,
            buildPlatform: data.buildPlatform ?? null,
            skinData: data.skinData ?? null,
            initial: Boolean(data.initial),
            online: data.online !== false
        })
    }

    get name() { return this.gamertag }
    get username() { return this.gamertag }

    toJSON() {
        return {
            uuid: this.uuid,
            name: this.name,
            gamertag: this.gamertag,
            xuid: this.xuid,
            platformChatId: this.platformChatId,
            buildPlatform: this.buildPlatform,
            skinData: this.skinData,
            online: this.online
        }
    }
}

class PlayerManager extends EventEmitter {
    constructor() {
        super()
        this.byUuid = new Map()
        this.byName = new Map()
    }

    upsert(data) {
        const player = data instanceof Player ? data : new Player(data)
        const old = player.uuid ? this.byUuid.get(player.uuid) : null
        if (old && old !== player) {
            old.uuid = player.uuid
            old.gamertag = player.gamertag
            old.xuid = player.xuid
            old.platformChatId = player.platformChatId
            old.buildPlatform = player.buildPlatform
            old.skinData = player.skinData
            old.initial = player.initial
            old.online = player.online
            return old
        }
        if (player.uuid) this.byUuid.set(player.uuid, player)
        if (player.name) this.byName.set(player.name.toLowerCase(), player)
        return player
    }

    remove(data) {
        const player = data instanceof Player ? data : this.get(data?.uuid ?? data?.name ?? data)
        if (!player) return null
        player.online = false
        if (player.uuid) this.byUuid.delete(player.uuid)
        if (player.name) this.byName.delete(player.name.toLowerCase())
        return player
    }

    get(identifier) {
        if (!identifier) return null
        return this.byUuid.get(String(identifier)) ??
            this.byName.get(String(identifier).toLowerCase()) ?? null
    }

    has(identifier) { return Boolean(this.get(identifier)) }
    list() { return [...this.byUuid.values()] }
    get count() { return this.byUuid.size }
    clear() { this.byUuid.clear(); this.byName.clear() }
    [Symbol.iterator]() { return this.byUuid.values() }
}

module.exports = { Player, PlayerManager }
