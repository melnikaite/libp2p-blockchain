const Transaction = require('./transaction');
const jayson = require('jayson');

class RPC {
  constructor(options) {
    Object.assign(this, {}, options);

    this.rpc = jayson.server({
      addTransaction: async (args, callback) => {
        try {
          const transaction = new Transaction(args);
          await transaction.sign(this.context.peerListener.id);
          this.context.ensureValidProducer();
          if (this.context.producer.pubKey === this.context.peerListener.id.toJSON().pubKey) {
            // transaction will be signed with this peer
            await this.context.blockchain.addTransaction(transaction);
          } else {
            // transaction will be signed by producer
            const data = JSON.stringify({ type: 'transaction', data: transaction });
            await this.context.sendTo(this.context.producer.pubKey, data)
          }
          callback(null, transaction);
        } catch (e) {
          console.log(e.stack)
          callback({ code: 500, message: e.message, stack: e.stack });
        }
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
    this.rpc.http().listen(this.context.rpcPort, () => {
      console.log(`JSON-RPC server is listening on http://localhost:${this.context.rpcPort}`);
    });
  }
}

module.exports = RPC;
