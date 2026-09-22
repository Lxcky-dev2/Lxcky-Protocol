const { LxckyAPI } = require('lxckyapi')

// Your authentication flow
const authflow = 

// Your Realm connection/discovery function
async function resolveConnection({ code }) {
  // Replace this with your own Realm discovery logic
  return getRealmConnection(code)
}

async function main() {
  const api = new LxckyAPI({
    authflow,
    resolveConnection
  })

  const realm = await api.join({
    code: 'YOUR_REALM_CODE'
  })

  // Send an external /tell message to a player
  await realm.externalTell(
    'PlayerName',
    'Hello from Lxcky!'
  )

  console.log('External sent')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
