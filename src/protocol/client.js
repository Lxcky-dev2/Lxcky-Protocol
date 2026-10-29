
const { Connection } = require('./connection.js')

const { authenticate } = require('./client/auth.js')
const { createDeserializer, createSerializer } = require('./transforms/serializer.js')

const { NethernetClient } = require('./nethernet.js')
const { NethernetJSONRPC } = require('./websocket/signal-jsonrpc.js')

const JWT = require('jsonwebtoken')
const crypto = require('crypto')
const { v3, v4, NIL } = require('uuid')

const steve = require('./skins/Steve.json')

const GAME_VERSION = '1.26.60'
const PROTOCOL_VERSION = 2225

function readPacketId(buffer) {
    let value = 0
    let shift = 0

    for (let i = 0; i < buffer.length && i < 5; i++) {
        const byte = buffer[i]
        value += (byte & 0x7f) * (2 ** shift)

        if ((byte & 0x80) === 0) return value

        shift += 7
    }

    return null
}

class Client extends Connection {
    connection

    constructor(options) {
        super()

        this.options = { ...options }
        this.compressionAlgorithm = 'deflate'
        this.compressionThreshold = 512
        this.compressionLevel = options.compressionLevel

        this.nethernet = {}
        this._lastDisconnect = null
        this._lastCloseReason = null
    }

    async init() {
        if (!this.options.networkId) {
            throw new Error(
                'A resolved Realm connection with a networkId is required by the low-level client. Use the high-level Realm API with a connection resolver so callers do not need to provide networkId directly.'
            )
        }

        this.serializer = createSerializer()
        this.deserializer = createDeserializer()

        this.ecdhKeyPair = crypto.generateKeyPairSync('ec', {
            namedCurve: 'secp384r1'
        })

        this.clientX509 = this.ecdhKeyPair.publicKey
            .export({ format: 'der', type: 'spki' })
            .toString('base64')

        this.privateKeyPEM = this.ecdhKeyPair.privateKey
            .export({ format: 'pem', type: 'sec1' })

        await authenticate(this, this.options)

        this.connection = new NethernetClient({
            networkId: this.options.networkId,
            token: this.token,
            ecdhKeyPair: this.ecdhKeyPair
        })

        this.nethernet.signalling = new NethernetJSONRPC(
            this.connection.nethernet.networkId,
            this.options.authflow,
            this.options.version || GAME_VERSION,
            this.options.networkId
        )

        this.nethernet.signalling.on('error', error => {
            this.close(
                error?.message || 'The Realm signalling connection was lost.'
            )
        })

        await this.nethernet.signalling.connect()

        this.connection.nethernet.credentials =
            this.nethernet.signalling.credentials

        this.connection.nethernet.signalHandler =
            this.nethernet.signalling.write.bind(this.nethernet.signalling)

        this.nethernet.signalling.on('signal', signal => {
            this.connection.nethernet
                .handleSignal(signal)
                .catch(error => this.close(error.message))
        })

        this.connection.nethernet.on('debug', () => {})

        this.emit('connectionAllowed')
    }

    connect() {
        if (!this.connection || !this.nethernet.signalling) {
            throw new Error('Connect not currently allowed')
        }

        this.connection.onConnected = () => {
            this.write('request_network_settings', {
                client_protocol:
                    this.options.protocolVersion ?? PROTOCOL_VERSION
            })
        }

        this.connection.onCloseConnection = reason => {
            this.close(reason)
        }

        this.connection.onEncapsulated = this.onEncapsulated

        this.connection.connect().catch(error => {
            this.close(error.message)
        })
    }

    onEncapsulated = encapsulated => {
        try {
            this.handle(
                Buffer.from(
                    encapsulated.buffer,
                    encapsulated.byteOffset ?? 0,
                    encapsulated.byteLength ?? encapsulated.length
                )
            )
        } catch (error) {
            this.emit('error', error)
            this.close(error?.message || 'Realm protocol error')
        }
    }

    sendLogin() {
        const sign = data =>
            JWT.sign(data, this.ecdhKeyPair.privateKey, {
                algorithm: 'ES384',
                header: { x5u: this.clientX509 }
            })

        const packet = {
            protocol_version:
                this.options.protocolVersion ?? PROTOCOL_VERSION,
            tokens: {
                identity: JSON.stringify({
                    AuthenticationType: 0,
                    Certificate: undefined,
                    Token: this.token
                }),
                client: sign({ ClientRandomId: 'Meow' })
            }
        }

        try {
            const PlayFabId = String(
                this.tokenData?.mid || 'aed7e8a4d485a49a'
            ).toLowerCase()

            const payload = {
                ClientRandomId: 'Meow',
                GameVersion: this.options.version || GAME_VERSION,

                CurrentInputMode: 2,
                DefaultInputMode: 2,

                SelfSignedId: '',
                GUIScale: -1,
                LanguageCode: ['en_US', 'en_GB'][
                    Math.floor(Math.random() * 2)
                ],

                DeviceId: v4().replace(/-/g, ''),
                DeviceOS: 1,
                DeviceModel: 'SAMSUNG SM-G955U',
                UIProfile: 1,
                MaxViewDistance: 2,
                MemoryTier: 3,
                PlatformType: 1,

                GraphicsMode: 1,
                TrustedSkin: steve.PersonaSkin,
                OverrideSkin: false,
                FilterProfanity: false,

                ThirdPartyName: this.tokenData?.xname || 'Meow meow.',
                ProfileHash: '',

                PlatformOnlineId: '',
                PlatformOfflineId: '',

                IsEduMode: false,
                TenantId: null,
                ADRole: null,

                IsEditorMode: false,
                ClientIsEditorCapable: true,
                ClientEditorConnectionIntent: 2,

                CompatibleWithClientSideChunkGen: true,

                ...steve,
                ...this.options.skinData
            }

            const updatePlayFabId = data =>
                btoa(
                    atob(data).replaceAll(
                        'aed7e8a4d485a49a-5',
                        `${PlayFabId}-2`
                    )
                )

            payload.SkinId = `persona-${PlayFabId}-2`
            payload.SkinGeometryData = updatePlayFabId(
                payload.SkinGeometryData
            )
            payload.SkinResourcePatch = updatePlayFabId(
                payload.SkinResourcePatch
            )

            packet.tokens.client = sign(payload)
        } catch (error) {
            this.emit('error', error)
            return false
        }

        this.write('login', packet)
        return true
    }

    disconnect(reason = 'Client leaving') {
        if (!this.nethernet) return

        this.close(reason)
    }

    close(reason) {
        this._lastCloseReason = reason ?? null

        if (this.nethernet) {
            this.emit('close', reason)
        }

        this.batch = null
        this.connection?.close()

        if (this.nethernet?.signalling) {
            this.nethernet.signalling.destroy()
        }

        this.nethernet = {}
    }

    readPacket(packet) {
        let des

        try {
            des = this.deserializer.parsePacketBuffer(packet)
        } catch (e) {
            const packetId = readPacketId(packet)

            const error = new Error(
                `Failed to decode Bedrock packet ${
                    packetId == null ? 'unknown' : packetId
                } (length=${packet.length}): ${e.message}`,
                { cause: e }
            )

            this.emit('error', error)
            return
        }

        switch (des.data.name) {
            case 'network_settings': {
                const settings = des.data.params ?? {}

                this.compressionThreshold =
                    settings.compression_threshold ?? 512

                if (
                    settings.compression_algorithm === 'deflate' ||
                    settings.compression_algorithm === 0
                ) {
                    this.compressionAlgorithm = 'deflate'
                } else if (
                    settings.compression_algorithm === 'snappy' ||
                    settings.compression_algorithm === 1
                ) {
                    const error = new Error(
                        'Realm requested Snappy compression, which this client does not support'
                    )

                    this.emit('error', error)
                    this.close(error.message)
                    return
                } else {
                    const error = new Error(
                        `Realm returned an unknown compression algorithm: ${settings.compression_algorithm}`
                    )

                    this.emit('error', error)
                    this.close(error.message)
                    return
                }

                this.compressionHeader = 0
                this.compressionReady = true
                this.batch.updateCompressionSettings(this)

                this.sendLogin()
                break
            }

            case 'server_to_client_handshake':
                this.write('client_to_server_handshake', {})
                break

            case 'disconnect': {
                this._lastDisconnect = des.data.params ?? null
                this._lastCloseReason =
                    des.data.params?.message || null

                this.emit('kick', des.data.params)
                this.close(this._lastCloseReason)
                break
            }

            case 'item_registry':
                des.data.params.itemstates?.forEach(state => {
                    if (state.name === 'minecraft:shield') {
                        this.serializer.proto.setVariable(
                            'ShieldItemID',
                            state.runtime_id
                        )

                        this.deserializer.proto.setVariable(
                            'ShieldItemID',
                            state.runtime_id
                        )
                    }
                })
                break
        }

        this.emit(des.data.name, des.data.params)
    }
}

module.exports = { Client }
