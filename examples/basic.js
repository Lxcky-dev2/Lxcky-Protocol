const { LxckyAPI } = require('lxckyapi')

async function main() {
  // authflow should be created with your Xbox/Minecraft authentication library.
  // getRealmConnection should be your Realm-discovery function.
  const api = new LxckyAPI({
    authflow,
    resolveConnection: async ({ code }) => getRealmConnection(code)
  })

  const realm = await api.join({ code: 'YOUR_REALM_CODE' })

  realm.on('chat', message => {
    console.log(`[chat] ${message.player}: ${message.message}`)
  })
  realm.on('playerJoin', player => console.log(`[join] ${player.name}`))
  realm.on('playerLeave', player => console.log(`[leave] ${player.name}`))

  console.log(`Connected to ${realm.name ?? 'Realm'}`)
}

main().catch(console.error)
