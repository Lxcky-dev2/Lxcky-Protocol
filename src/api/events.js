class ChatMessage {
    constructor(data = {}) {
        this.player = data.player ?? data.source_name ?? null
        this.message = data.message ?? data.text ?? ''
        this.timestamp = data.timestamp ?? Date.now()
        this.raw = data.raw ?? data
    }

    get content() { return this.message }
    get author() { return this.player }
    toJSON() {
        return { player: this.player, message: this.message, timestamp: this.timestamp }
    }
}

class DeathEvent {
    constructor(data = {}) {
        this.player = data.player ?? null
        this.message = data.message ?? ''
        this.key = data.key ?? null
        this.params = Array.isArray(data.params) ? data.params : []
        this.timestamp = data.timestamp ?? Date.now()
        this.raw = data.raw ?? data
    }

    toJSON() {
        return {
            player: this.player,
            message: this.message,
            key: this.key,
            params: this.params,
            timestamp: this.timestamp
        }
    }
}

module.exports = { ChatMessage, DeathEvent }
