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

  // Send a normal Minecraft /tell command
  await realm.command('/tell PlayerName Hello')

  console.log('Tell sent')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
