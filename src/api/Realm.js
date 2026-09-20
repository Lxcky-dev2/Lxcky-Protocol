'use strict'

const { EventEmitter } = require('events')
const { ClientHandler } = require('./ClientHandler')

const DEFAULT_DEVICE_PROFILE = Object.freeze({
    authTitle: '000000004c12ae6f',
    deviceType: 'Android',
    deviceOS: 1,
    maxViewDistance: 10,
    memoryTier: 3,
    platformType: 1,
    UIProfile: 1,
    deviceModel: 'SAMSUNG SM-G955U'
})

class Realm extends EventEmitter {
    constructor(options = {}) {
        super()
        this.options = { ...options }
        this.authflow = options.authflow ?? null
        this.account = options.account ?? null
        this.code = options.code ?? null
        this.info = options.info ?? null
        this.connection = options.connection ?? null
        this.status = 'disconnected'
        this.client = null
        this.handler = null
        this.deviceProfile = { ...DEFAULT_DEVICE_PROFILE, ...(options.deviceProfile ?? {}) }
        this.identity = {
            xuid: options.xuid ?? this.account?.xuid ?? null,
            gamertag: options.senderName ?? options.gamertag ?? this.account?.gamertag ?? null
        }

        const chat = (message, senderName) => this.sendChat(message, senderName)
        chat.send = (message, options = {}) => this.sendChat(message, options.senderName ?? options.name)
        this.chat = chat
    }

    get players() { return this.handler?.players ?? null }
    get connected() { return this.status === 'connected' }
    get name() { return this.info?.name ?? this.info?.name ?? null }
    get realmId() { return this.info?.id ?? this.info?.realmId ?? null }
    get rawClient() { return this.client }

    async join(options = {}) {
        if (this.connected) return this
        const authflow = options.authflow ?? this.authflow ?? this.account?.authflow
        if (!authflow) throw new Error('An authflow is required')

        const info = options.info ?? this.info
        const connection = options.connection ?? this.connection ??
            (typeof options.resolveConnection === 'function'
                ? await options.resolveConnection({ realm: info, code: options.code ?? this.code, account: this.account, authflow })
                : typeof this.options.resolveConnection === 'function'
                    ? await this.options.resolveConnection({ realm: info, code: options.code ?? this.code, account: this.account, authflow })
                    : null)

        if (!connection) {
            throw new Error('No Realm connection was provided. Pass connection or resolveConnection(). The high-level API resolves the NetherNet networkId internally from that connection.')
        }
        if (!connection.networkId) throw new Error('The resolved Realm connection is missing its internal networkId')

        this.authflow = authflow
        this.info = info
        this.connection = connection
        this.status = 'connecting'
        this.handler = new ClientHandler({ senderName: options.senderName ?? this.identity.gamertag })
        this._wireHandler(this.handler)

        try {
            const deviceProfile = { ...this.deviceProfile, ...(options.deviceProfile ?? {}) }
            await this.handler.connect(authflow, connection, deviceProfile)
            this.client = this.handler.client
            this._configureClientIdentity(this.client)
            this.status = 'connected'
        } catch (error) {
            this.status = 'disconnected'
            this.handler = null
            this.client = null
            throw error
        }
        return this
    }

    _wireHandler(handler) {
        const events = [
            'connected', 'disconnected', 'chat', 'death', 'playerJoin', 'playerLeave',
            'player', 'system', 'kick', 'error', 'close', 'start_game', 'command_output',
            'resource_packs_info', 'resource_pack_stack', 'network_settings'
        ]
        for (const event of events) handler.on(event, data => {
            if (event === 'connected') this.status = 'connected'
            if (event === 'disconnected' || event === 'close') this.status = 'disconnected'
            this.emit(event, data)
        })
        handler.on('close', reason => {
            this.client = null
            if (!this._closing) this.emit('close', reason)
        })
    }

    _configureClientIdentity(client) {
        if (!client) return
        client.username = this.identity.gamertag ?? client.username ?? ''
        client.profile = { ...(client.profile ?? {}), xuid: this.identity.xuid ?? client.profile?.xuid ?? null }
        client.realmName = this.name ?? client.realmName ?? ''
    }

    sendChat(message, senderName) {
        this._requireHandler()
        return this.handler.sendChat(message, senderName ?? this.identity.gamertag)
    }

    command(command, options = {}) {
        this._requireHandler()
        return this.handler.command(command, options)
    }

    sendCommand(command, options) { return this.command(command, options) }

    async leave(reason = 'Client leaving') {
        this._closing = true
        this.handler?.leave(reason)
        this.handler = null
        this.client = null
        this.connection = null
        this.status = 'disconnected'
        this.emit('close', reason)
        return true
    }

    _requireHandler() {
        if (!this.handler || !this.connected) throw new Error('Realm is not connected')
    }
}

module.exports = { Realm, DEFAULT_DEVICE_PROFILE }
