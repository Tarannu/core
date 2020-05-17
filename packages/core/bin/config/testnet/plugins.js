plugins.js
module.exports = {
    // Order is IMPORTANT! 
    // Modules are loaded in the same order as they are listed
    "@arkecosystem/core-event-emitter": {},
    "@arkecosystem/core-logger-pino": {},
    "@arkecosystem/core-p2p": {}, 
    "@arkecosystem/core-blockchain": {},
    "@arkecosystem/core-snapshots": {},
    "@Tarannu/dapp-core-module-http-server-template": {},
    
    "@Tarannu/package.json": {
        // Here we set the module properties that are defined in defaults.ts file
        enabled: true,
        host: "0.0.0.0",
        port: 8081,
        
    }
};
​