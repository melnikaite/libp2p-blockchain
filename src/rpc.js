const Transaction = require('./transaction');
const jayson = require('jayson');

class RPC {
  constructor(options) {
    Object.assign(this, {
      rpcPort: 3000,
    }, options);

    this.rpc = jayson.server({
      // todo: send transaction only to block producer
      addTransaction: async (args, callback) => {
        const transaction = new Transaction(args);
        await transaction.sign(this.peerListener.id);
        await this.blockchain.addTransaction(transaction);
        callback(null, transaction);
      },
      // todo: send private direct message
      sendTo: (args, callback) => {
        callback({ code: 501, message: 'Not implemented' });
      },
      // todo: set list jobs, env variables and public keys that are allowed to request execution (block producer is allowed to execute consensus endpoint)
      setExecutionWhitelist: (args, callback) => {
        callback({ code: 501, message: 'Not implemented' });
      },
    });
  }

  start() {
    this.rpc.http().listen(this.rpcPort, () => {
      console.log(`JSON-RPC server is listening on http://localhost:${this.rpcPort}`);
    });
  }
}

module.exports = RPC;
