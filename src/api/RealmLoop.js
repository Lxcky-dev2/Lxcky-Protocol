'use strict';

const EventEmitter = require('events');

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function resolveRange(value, fallback) {
    if (Array.isArray(value) && value.length >= 2) {
        return [Number(value[0]), Number(value[1])];
    }

    if (typeof value === 'number') {
        return [value, value];
    }

    return fallback;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class RealmLoop extends EventEmitter {
    constructor(api, options = {}) {
        super();

        this.api = api;
        this.code = options.code;

        this.loops = Math.max(1, Math.min(10, Number(options.loops ?? 1)));

        this.stay = resolveRange(options.stay, [15000, 30000]);
        this.reconnectDelay = resolveRange(
            options.reconnectDelay,
            [30000, 60000]
        );

        this.running = false;
        this.stopped = false;
        this.currentLoop = 0;
        this.realm = null;
    }

    async start() {
        if (this.running) {
            throw new Error('Realm loop is already running');
        }

        if (!this.code) {
            throw new Error('A Realm code is required');
        }

        this.running = true;
        this.stopped = false;
        this.currentLoop = 0;

        this.emit('start', {
            loops: this.loops,
            code: this.code
        });

        try {
            for (let i = 1; i <= this.loops; i++) {
                if (this.stopped) break;

                this.currentLoop = i;

                this.emit('iteration', {
                    loop: i,
                    total: this.loops
                });

                await this._connect();

                if (this.stopped) break;

                const stayTime = randomBetween(
                    this.stay[0],
                    this.stay[1]
                );

                this.emit('join', {
                    loop: i,
                    total: this.loops,
                    duration: stayTime,
                    realm: this.realm
                });

                await delay(stayTime);

                if (this.realm) {
                    await this._disconnect();
                }

                this.emit('leave', {
                    loop: i,
                    total: this.loops
                });

                if (this.stopped || i >= this.loops) {
                    break;
                }

                const reconnectTime = randomBetween(
                    this.reconnectDelay[0],
                    this.reconnectDelay[1]
                );

                this.emit('waiting', {
                    loop: i,
                    nextLoop: i + 1,
                    duration: reconnectTime
                });

                await delay(reconnectTime);
            }

            if (this.stopped) {
                this.emit('stopped', {
                    loop: this.currentLoop,
                    total: this.loops
                });
            } else {
                this.emit('complete', {
                    loops: this.loops
                });
            }
        } catch (error) {
            this.emit('error', error);
            throw error;
        } finally {
            if (this.realm) {
                try {
                    await this._disconnect();
                } catch {}
            }

            this.realm = null;
            this.running = false;
        }

        return this;
    }

    async stop() {
        this.stopped = true;

        if (this.realm) {
            await this._disconnect();
        }

        return this;
    }

    async _connect() {
        if (this.stopped) return;

        //Create a fresh Realm connection every iteration This
       //intentionally does not reuse the previous Realm instance.
         
        this.realm = await this.api.createRealm(this.code);

        return this.realm;
    }

    async _disconnect() {
        const realm = this.realm;
        this.realm = null;

        if (!realm) return;

        if (typeof realm.disconnect === 'function') {
            await realm.disconnect();
            return;
        }

        if (typeof realm.close === 'function') {
            await realm.close();
        }
    }
}

module.exports = RealmLoop;
