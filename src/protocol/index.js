const { Client } = require('./client')

function createClient(options = {}) {
  const client = new Client(options)
  Promise.resolve().then(() => client.init()).then(() => client.connect()).catch(error => client.emit('error', error))
  return client
}

module.exports = { Client, createClient }
