const { LxckyAPI } = require("lxckyapi");

// Your authentication flow
const authflow = //your authflow 

// Your Realm connection/discovery function
async function resolveConnection({ code }) {
    // Replace this with your own Realm discovery logic
    return getRealmConnection(code);
}

async function main() {
    const api = new LxckyAPI({
        authflow,
        resolveConnection
    });

    const realm = await api.join({
        code: "YOUR_REALM_CODE"
    });

    // Send a message to the Realm chat
    await realm.chat.send("Hello from Lxcky");

    console.log("Message sent!");

    // Listen for messages
    realm.on("chat", (message) => {
        console.log(`[${message.player}] ${message.message}`);
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
