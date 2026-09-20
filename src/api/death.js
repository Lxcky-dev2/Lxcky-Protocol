const DEATH_TEMPLATES = {
    'death.attack.mob': p => `${p[0] ?? 'A player'} was slain by ${p[1] ?? 'a mob'}`,
    'death.attack.player': p => `${p[0] ?? 'A player'} was slain by ${p[1] ?? 'a player'}`,
    'death.attack.arrow': p => `${p[0] ?? 'A player'} was shot by ${p[1] ?? 'an arrow'}`,
    'death.attack.lava': p => `${p[0] ?? 'A player'} tried to swim in lava`,
    'death.attack.onFire': p => `${p[0] ?? 'A player'} went up in flames`,
    'death.attack.inFire': p => `${p[0] ?? 'A player'} burned to death`,
    'death.attack.fireball': p => `${p[0] ?? 'A player'} was fireballed by ${p[1] ?? 'a mob'}`,
    'death.attack.drown': p => `${p[0] ?? 'A player'} drowned`,
    'death.attack.fall': p => `${p[0] ?? 'A player'} fell from a high place`,
    'death.attack.flyIntoWall': p => `${p[0] ?? 'A player'} experienced kinetic energy`,
    'death.attack.outOfWorld': p => `${p[0] ?? 'A player'} fell out of the world`,
    'death.attack.generic': p => `${p[0] ?? 'A player'} died`,
    'death.attack.magic': p => `${p[0] ?? 'A player'} was killed by magic`,
    'death.attack.wither': p => `${p[0] ?? 'A player'} withered away`,
    'death.attack.explosion': p => `${p[0] ?? 'A player'} blew up`,
    'death.attack.explosion.player': p => `${p[0] ?? 'A player'} was blown up by ${p[1] ?? 'someone'}`,
    'death.attack.magma': p => `${p[0] ?? 'A player'} discovered the floor was lava`,
    'death.attack.starve': p => `${p[0] ?? 'A player'} starved to death`,
    'death.attack.cactus': p => `${p[0] ?? 'A player'} was pricked to death`,
    'death.attack.anvil': p => `${p[0] ?? 'A player'} was squashed by a falling anvil`,
    'death.attack.fallingBlock': p => `${p[0] ?? 'A player'} was squashed by a falling block`,
    'death.attack.lightningBolt': p => `${p[0] ?? 'A player'} was struck by lightning`,
    'death.attack.freeze': p => `${p[0] ?? 'A player'} froze to death`,
    'death.attack.sting': p => `${p[0] ?? 'A player'} was stung to death`,
    'death.attack.trident': p => `${p[0] ?? 'A player'} was skewered by ${p[1] ?? 'a trident'}`,
    'death.attack.thrown': p => `${p[0] ?? 'A player'} was pummeled by ${p[1] ?? 'someone'}`,
    'death.attack.fireworks': p => `${p[0] ?? 'A player'} went off with a bang`,
    'death.attack.sonic_boom': p => `${p[0] ?? 'A player'} was obliterated by a sonically-charged shockwave`
}

function formatDeathMessage(key, params = []) {
    const template = DEATH_TEMPLATES[key]
    if (template) return template(params)
    const player = params[0] ?? 'A player'
    const readableCause = String(key ?? '').replace('death.attack.', '').replace(/[._]/g, ' ')
    return `${player} died (${readableCause || 'unknown cause'})`
}

module.exports = { DEATH_TEMPLATES, formatDeathMessage }
