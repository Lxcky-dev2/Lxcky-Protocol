'use strict'

const { EventEmitter } = require('events')
const { PlayerManager } = require('./Player')
const { ChatMessage, DeathEvent } = require('./events')
const { formatDeathMessage } = require('./death')
const { createRealmClient } = require('../protocol/realm-client')

class ClientHandler extends EventEmitter {
    constructor(options = {}) {
        super()
        this.options = { ...options }
        this.client = null
        this.players = new PlayerManager()
        this.connected = false
        this._bound = []
    }

    async connect(authflow, connection, deviceProfile = {}) {
        if (this.client) throw new Error('ClientHandler is already connected')
        const client = await createRealmClient(authflow, connection, deviceProfile)
        return this.attach(client)
    }

    attach(client) {
        if (!client || typeof client.on !== 'function') throw new TypeError('A valid Realm client is required')
        if (this.client === client) return this
        if (this.client) this.detach()
        this.client = client
        this.connected = false
        this._syncPlayersFromClient(client)
        this._attach(client)
        return this
    }

    _syncPlayersFromClient(client) {
        const profiles = client?.playerProfilesByUuid
        const names = client?.playerNamesByUuid
        if (!(profiles instanceof Map) && !(names instanceof Map)) return
        const uuids = new Set([
            ...(profiles instanceof Map ? profiles.keys() : []),
            ...(names instanceof Map ? names.keys() : [])
        ])
        for (const uuid of uuids) {
            const profile = profiles instanceof Map ? profiles.get(uuid) ?? {} : {}
            const gamertag = profile.gamertag ?? profile.username ?? (names instanceof Map ? names.get(uuid) : null)
            if (!gamertag) continue
            this.players.upsert({ ...profile, uuid, gamertag, initial: true, online: true })
        }
    }

    detach() {
        if (!this.client) return
        for (const [event, handler] of this._bound) {
            if (typeof this.client.off === 'function') this.client.off(event, handler)
            else this.client.removeListener?.(event, handler)
        }
        this._bound = []
        this.client = null
        this.connected = false
    }

    _on(event, handler) {
        this.client.on(event, handler)
        this._bound.push([event, handler])
    }

    _attach(client) {
        this._on('realm_chat', data => this.emit('chat', new ChatMessage(data)))
        this._on('realm_death', data => {
            const key = data?.key ?? null
            const params = Array.isArray(data?.params) ? data.params : (data?.player ? [data.player] : [])
            this.emit('death', new DeathEvent({
                player: data?.player ?? params[0] ?? null,
                key,
                params,
                message: data?.message ?? formatDeathMessage(key, params),
                raw: data
            }))
        })
        this._on('realm_system', data => this.emit('system', {
            key: data?.key ?? null,
            params: Array.isArray(data?.params) ? data.params : [],
            timestamp: Date.now(),
            raw: data
        }))
        this._on('realm_player', data => {
            const player = this.players.upsert({
                uuid: data?.uuid,
                gamertag: data?.gamertag,
                xuid: data?.xuid,
                platformChatId: data?.platformChatId,
                buildPlatform: data?.buildPlatform,
                skinData: data?.skinData,
                initial: Boolean(data?.initial),
                online: data?.action !== 'leave'
            })
            if (data?.action === 'leave') this.players.remove(player)
            this.emit('player', { action: data?.action, player, initial: Boolean(data?.initial), raw: data })
        })
        this._on('realm_join', data => {
            const player = this.players.upsert({
                uuid: data?.profile?.uuid,
                gamertag: data?.player ?? data?.profile?.gamertag,
                xuid: data?.profile?.xuid,
                platformChatId: data?.profile?.platformChatId,
                buildPlatform: data?.profile?.buildPlatform,
                skinData: data?.profile?.skinData,
                initial: false,
                online: true
            })
            this.emit('playerJoin', player)
        })
        this._on('realm_leave', data => {
            const existing = this.players.get(data?.profile?.uuid ?? data?.player)
            const player = existing ?? this.players.upsert({
                uuid: data?.profile?.uuid,
                gamertag: data?.player ?? data?.profile?.gamertag,
                xuid: data?.profile?.xuid,
                platformChatId: data?.profile?.platformChatId,
                buildPlatform: data?.profile?.buildPlatform,
                skinData: data?.profile?.skinData,
                online: false
            })
            this.players.remove(player)
            this.emit('playerLeave', player)
        })
        this._on('start_game', data => {
            this.connected = true
            this.emit('connected', data)
        })
        for (const event of ['kick', 'error', 'command_output', 'resource_packs_info', 'resource_pack_stack', 'network_settings']) {
            this._on(event, data => this.emit(event, data))
        }
        this._on('close', reason => {
            const wasConnected = this.connected
            this.connected = false
            this.emit('disconnected', { reason: reason ?? null, wasConnected })
            this.emit('close', reason)
        })
        return this
    }

    sendChat(message, senderName = this.options.senderName) {
        this._assertConnected()
        const text = String(message ?? '').trim()
        if (!text) throw new Error('Chat message cannot be empty')
        return this.client.sendRelayMessage(text, senderName || this.client.username)
    }

    command(command, options = {}) {
        this._assertConnected()
        const value = String(command ?? '').trim()
        if (!value) throw new Error('Minecraft command cannot be empty')
        return this.client.sendCommand(value, {
            timeout: options.timeout ?? 8000,
            waitForOutput: options.waitForOutput !== false,
            ...options
        })
    }

    leave(reason = 'Client leaving') {
        if (!this.client) return
        const client = this.client
        client._intentionalDisconnect = true
        client._noReconnect = true
        client.disconnect?.(reason)
        this.connected = false
        this.players.clear()
        this.detach()
    }

    _assertConnected() {
        if (!this.client || !this.connected) throw new Error('Realm client is not connected')
    }
}

module.exports = { ClientHandler }
