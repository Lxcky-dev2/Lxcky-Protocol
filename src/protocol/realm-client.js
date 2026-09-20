'use strict'

const { Client } = require('./client')
const { v4 } = require('uuid')

const COMMAND_ORIGIN_UUID = v4()

function buildClientOptions(authflow, connection, deviceProfile) {
    if (!connection || !String(connection.transport || '').includes('NETHERNET')) {
        throw new Error(`This build requires a NetherNet Realm connection; received ${connection?.transport ?? 'unknown'}`)
    }

    return {
        authflow,
        networkId: connection.networkId,
        version: '1.26.50',
        protocolVersion: 2193,
        transport: 'NETHERNET_JSONRPC',
        delayedInit: true,
        authTitle: deviceProfile.authTitle,
        deviceType: deviceProfile.deviceType,
        flow: 'sisu',
        // These values are merged into the signed client JWT.
        skinData: {
            ThirdPartyNameOnly: false,
            DeviceOS: deviceProfile.deviceOS,
            DeviceModel: deviceProfile.deviceModel,
            DeviceId: v4().replace(/-/g, ''),
            UIProfile: deviceProfile.UIProfile,
            MaxViewDistance: deviceProfile.maxViewDistance,
            MemoryTier: deviceProfile.memoryTier,
            PlatformType: deviceProfile.platformType,
            GraphicsMode: 1,
            CurrentInputMode: 2,
            DefaultInputMode: 2,
            GUIScale: -1,
            LanguageCode: 'en_US',
            OverrideSkin: false,
            SelfSignedId: v4(),
            PlatformOnlineId: '',
            PlatformOfflineId: '',
            TrustedSkin: true,
            ClientIsEditorCapable: true,
            ClientEditorConnectionIntent: 2,
            CompatibleWithClientSideChunkGen: true,
            FilterProfanity: false,
            IsEduMode: false,
            IsEditorMode: false,
            TenantId: null,
            ADRole: null,
            IsPrimaryUser: true,
            OverridingPlayerAppearance: false,
            PremiumSkin: true,
            OverrideSkin: true,
            PersonaSkin: false,
            CapeOnClassicSkin: true,
            PlayerTargetSelectorExpansion: true,
        }
    }
}

function attachCommand(client) {
    client._pendingCommands = []
    client._commandOriginUUID = COMMAND_ORIGIN_UUID

    client.sendCommand = function sendCommand(command, options = {}) {
        if (!client.runtime) throw new Error('Cannot send command before the player has spawned')

        const waitForOutput = options.waitForOutput !== false
        if (!waitForOutput) {
            client.write('command_request', {
                command: String(command).startsWith('/') ? String(command) : `/${String(command)}`,
                origin: {
                    type: 'Player',
                    uuid: client._commandOriginUUID,
                    request_id: '',
                    player_entity_id: 0n
                },
                internal: false,
                version: 'Latest'
            })
            return Promise.resolve({ success: true, sent: true, message: 'Command sent' })
        }

        const timeout = options.timeout ?? 5000
        const commandPromise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const idx = client._pendingCommands.findIndex((p) => p.resolve === resolve)
                if (idx !== -1) client._pendingCommands.splice(idx, 1)
                reject(new Error(`Command execution timed out after ${timeout}ms`))
            }, timeout)

            client._pendingCommands.push({ resolve, reject, timer, command: String(command) })
        })

        client.write('command_request', {
            command: String(command).startsWith('/') ? String(command) : `/${String(command)}`,
            origin: {
                type: 'Player',
                uuid: client._commandOriginUUID,
                request_id: '',
                player_entity_id: 0n
            },
            internal: false,
            version: 'Latest'
        })

        return commandPromise
    }

    client.on('command_output', (packet) => {
        const pending = client._pendingCommands?.shift()
        if (!pending) return
        clearTimeout(pending.timer)

        const output = Array.isArray(packet?.output) ? packet.output : []
        const successCount = Number(packet?.success_count ?? 0)
        const lines = output.map((entry) => {
            const id = entry?.message_id ?? ''
            const params = Array.isArray(entry?.parameters) ? entry.parameters : []
            return id && params.length ? `${id}: ${params.join(', ')}` : (id || params.join(', '))
        }).filter(Boolean)

        const success = successCount > 0 || output.some((entry) => entry?.success === true)
        const message = lines.join('\n') || (success ? 'Command executed successfully' : 'Command failed')

        if (success) pending.resolve({ success: true, message, successCount, outputType: packet?.output_type ?? 'unknown', output })
        else pending.reject(new Error(message))
    })
}

function attachChat(client) {
    client._outgoingRelayMessages = []

    client.sendRelayMessage = async function sendRelayMessage(message, senderName) {
        if (!client.runtime) throw new Error('Cannot send chat before the player has spawned')

        const text = String(message)
        const sourceName = String(senderName || client.username || 'Realm').slice(0, 32)
        const relayText = `${sourceName}: ${text}`
        const tellrawPayload = JSON.stringify({
            rawtext: [{ text: relayText }]
        })

        // Realm chat relay deliberately uses tellraw so the authenticated Realm
        // player is the command executor while the supplied display name remains
        // the visible chat prefix. Do not wait for command_output: tellraw can
        // execute without returning a command result packet.
        await client.sendCommand(`/tellraw @a ${tellrawPayload}`, { waitForOutput: false })
    }
}

const DEATH_TEMPLATES = {
    'death.attack.mob': (p) => `${p[0]} was slain by ${p[1] ?? 'a mob'}`,
    'death.attack.player': (p) => `${p[0]} was slain by ${p[1] ?? 'a player'}`,
    'death.attack.arrow': (p) => `${p[0]} was shot by ${p[1] ?? 'an arrow'}`,
    'death.attack.lava': (p) => `${p[0]} tried to swim in lava`,
    'death.attack.onFire': (p) => `${p[0]} went up in flames`,
    'death.attack.inFire': (p) => `${p[0]} burned to death`,
    'death.attack.fireball': (p) => `${p[0]} was fireballed by ${p[1] ?? 'a mob'}`,
    'death.attack.drown': (p) => `${p[0]} drowned`,
    'death.attack.fall': (p) => `${p[0]} fell from a high place`,
    'death.attack.flyIntoWall': (p) => `${p[0]} experienced kinetic energy`,
    'death.attack.outOfWorld': (p) => `${p[0]} fell out of the world`,
    'death.attack.generic': (p) => `${p[0]} died`,
    'death.attack.magic': (p) => `${p[0]} was killed by magic`,
    'death.attack.wither': (p) => `${p[0]} withered away`,
    'death.attack.explosion': (p) => `${p[0]} blew up`,
    'death.attack.explosion.player': (p) => `${p[0]} was blown up by ${p[1] ?? 'someone'}`,
    'death.attack.magma': (p) => `${p[0]} discovered the floor was lava`,
    'death.attack.starve': (p) => `${p[0]} starved to death`,
    'death.attack.cactus': (p) => `${p[0]} was pricked to death`,
    'death.attack.anvil': (p) => `${p[0]} was squashed by a falling anvil`,
    'death.attack.fallingBlock': (p) => `${p[0]} was squashed by a falling block`,
    'death.attack.lightningBolt': (p) => `${p[0]} was struck by lightning`,
    'death.attack.freeze': (p) => `${p[0]} froze to death`,
    'death.attack.sting': (p) => `${p[0]} was stung to death`,
    'death.attack.trident': (p) => `${p[0]} was skewered by ${p[1] ?? 'a trident'}`,
    'death.attack.thrown': (p) => `${p[0]} was pummeled by ${p[1] ?? 'someone'}`,
    'death.attack.fireworks': (p) => `${p[0]} went off with a bang`,
    'death.attack.sonic_boom': (p) => `${p[0]} was obliterated by a sonically-charged shockwave`
}
 
function formatDeathMessage(key, params) {
    const template = DEATH_TEMPLATES[key]
    if (template) return template(params)
    const player = params[0] ?? 'A player'
    const readableCause = String(key).replace('death.attack.', '').replace(/[._]/g, ' ')
    return `${player} died (${readableCause || 'unknown cause'})`
}

const JOIN_TRANSLATION_KEYS = new Set(['multiplayer.player.joined', 'multiplayer.player.joined.renamed'])
const LEAVE_TRANSLATION_KEYS = new Set(['multiplayer.player.left', 'multiplayer.player.left.renamed'])

function attachRealmEvents(client) {
    client.playerNamesByUuid = new Map()
    client.playerProfilesByUuid = new Map()
    client._playerListSeeded = false

    client.on('text', (packet) => {
        if (packet.type === 'chat') {
            if (client.username && packet.source_name === client.username) return

            const now = Date.now()
            const echoedIndex = client._outgoingRelayMessages?.findIndex((entry) =>
                entry.expiresAt > now && entry.sourceName === packet.source_name && entry.message === packet.message
            ) ?? -1
            if (echoedIndex >= 0) {
                client._outgoingRelayMessages.splice(echoedIndex, 1)
                return
            }

            if (client._outgoingRelayMessages?.length) {
                client._outgoingRelayMessages = client._outgoingRelayMessages.filter((entry) => entry.expiresAt > now)
            }

            client.emit('realm_chat', { player: packet.source_name, message: packet.message })
            return
        }

        if (packet.type === 'translation' || packet.type === 'system') {
            const key = packet.message
            const params = Array.isArray(packet.parameters) ? packet.parameters : []
            if (JOIN_TRANSLATION_KEYS.has(key) || LEAVE_TRANSLATION_KEYS.has(key)) return
            if (typeof key === 'string' && key.startsWith('death.')) {
                client.emit('realm_death', { player: params[0], message: formatDeathMessage(key, params), key, params })
                return
            }
            client.emit('realm_system', { key, params })
        }
    })

    client.on('player_list', (packet) => {
        const records = Array.isArray(packet.records) ? packet.records : []
        const isInitialRoster = !client._playerListSeeded

        for (const record of records) {
            if (record.type === 'add') {
                client.playerNamesByUuid.set(record.uuid, record.username)
                client.playerProfilesByUuid ??= new Map()
                client.playerProfilesByUuid.set(record.uuid, {
                    uuid: record.uuid,
                    gamertag: record.username,
                    xuid: record.xbox_user_id || null,
                    platformChatId: record.platform_chat_id || null,
                    buildPlatform: record.build_platform ?? null,
                    skinData: record.skin_data ?? null
                })
                client.emit('realm_player', { action: 'join', ...client.playerProfilesByUuid.get(record.uuid), initial: isInitialRoster })
                if (!isInitialRoster && record.username !== client.username) client.emit('realm_join', { player: record.username, profile: client.playerProfilesByUuid.get(record.uuid) })
            } else if (record.type === 'remove') {
                const profile = client.playerProfilesByUuid?.get(record.uuid)
                const name = profile?.gamertag ?? client.playerNamesByUuid.get(record.uuid) ?? 'A player'
                client.playerNamesByUuid.delete(record.uuid)
                client.playerProfilesByUuid?.delete(record.uuid)
                client.emit('realm_player', { action: 'leave', uuid: record.uuid, gamertag: name, xuid: profile?.xuid ?? null, platformChatId: profile?.platformChatId ?? null, buildPlatform: profile?.buildPlatform ?? null, skinData: profile?.skinData ?? null, initial: false })
                if (name !== client.username) client.emit('realm_leave', { player: name, profile })
            }
        }

        client._playerListSeeded = true
    })
}

async function createRealmClient(authflow, connection, deviceProfile) {
    const options = buildClientOptions(authflow, connection, deviceProfile)
    const client = new Client(options)

    client.kicked = false
    client._perxa = true
    attachCommand(client)
    attachChat(client)
    attachRealmEvents(client)

    client.currentPosition = { x: 0, y: 0, z: 0 }
    client.runtime = 0n

    client.once('start_game', ({ player_position = { x: 0, y: 0, z: 0 }, runtime_entity_id = 0, current_tick = 0 } = {}) => {
        client.currentPosition = player_position
        client.runtime = BigInt(runtime_entity_id)
        client.tick = typeof current_tick === 'bigint' ? current_tick : BigInt(current_tick || 0)
    })

    client.once('resource_packs_info', () => {
        const finish = () => {
            client.write('resource_pack_client_response', {
                response_status: 'completed',
                response_status_name: 'resourcepackstackfinished',
                resourcepackids: []
            })
        }

        client.once('resource_pack_stack', () => {
            finish()
            client.write('request_chunk_radius', { chunk_radius: 16, max_radius: 8 })
        })

        finish()
    })

    client.on('respawn', (data) => {
        if (!client.runtime) return
        if (data.state === 0) {
            client.write('respawn', {
                runtime_entity_id: client.runtime,
                state: 2,
                position: client.currentPosition
            })
        } else if (data.state === 1) {
            client.write('player_action', {
                runtime_entity_id: client.runtime,
                action: 'respawn',
                position: client.currentPosition,
                result_position: client.currentPosition,
                face: -1
            })
        }
    })

    client.on('error', (error) => {
        client._lastProtocolError = error
    })

    // Initialize the low-level protocol client before opening the transport.
    await client.init()
    client.connect()

    return client
}

module.exports = { createRealmClient }
