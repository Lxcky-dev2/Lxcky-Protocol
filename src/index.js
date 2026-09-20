'use strict'

const { Realm, DEFAULT_DEVICE_PROFILE } = require('./api/Realm')
const { ClientHandler } = require('./api/ClientHandler')
const { Player, PlayerManager } = require('./api/Player')
const { ChatMessage, DeathEvent } = require('./api/events')
const { formatDeathMessage, DEATH_TEMPLATES } = require('./api/death')
const { Client: ProtocolClient } = require('./protocol')
const { createRealmClient } = require('./protocol/realm-client')

class LxckyAPI {
    constructor(options = {}) {
        this.options = { ...options }
        this.realms = new Map()
    }

    createRealm(options = {}) {
        const realm = new Realm({ ...this.options, ...options })
        const key = realm.realmId ?? Symbol('realm')
        this.realms.set(key, realm)
        realm.once('close', () => this.realms.delete(key))
        return realm
    }

    getRealm(id) { return this.realms.get(String(id)) ?? this.realms.get(id) ?? null }

    async join(options = {}) {
        const realm = this.createRealm(options)
        await realm.join(options)
        return realm
    }

    async disconnectAll(reason = 'API shutdown') {
        for (const realm of [...this.realms.values()]) await realm.leave(reason)
    }
}

module.exports = {
    LxckyAPI,
    Realm,
    ClientHandler,
    Player,
    PlayerManager,
    ChatMessage,
    DeathEvent,
    formatDeathMessage,
    DEATH_TEMPLATES,
    DEFAULT_DEVICE_PROFILE,
    ProtocolClient,
    createRealmClient
}
