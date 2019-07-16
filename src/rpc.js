const Transaction = require('./transaction');
const jayson = require('jayson');
const bls = require('./bls');
const crypto = require('crypto');

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
            this.context.sendTo(this.context.producer.pubKey, data);
          }
          callback(null, transaction);
        } catch (e) {
          console.log(e.stack);
          callback({ code: 500, message: e.message, stack: e.stack });
        }
      },
      get: (args, callback) => {
        try {
          const result = args.reduce((res, prop) => res[prop], this.context.blockchain);
          callback(null, result);
        } catch (e) {
          console.log(e.stack);
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
      bls: async (args, callback) => {
        try {
          this.context.ensureValidProducer();
          if (this.context.producer.pubKey === this.context.peerListener.id.toJSON().pubKey) {
            // bls will be handled by this peer
            const session = crypto.randomBytes(16).toString('hex');
            // todo: cache shares for epoch
            const { masterPublicKey, ids, secretKeys, publicKeys } = await bls.getShares(args.numOfPlayers, args.threshold);
            Object.values(this.context.messageHandler.peerBook._peers)
              .forEach((peer, i) => {
                const data = JSON.stringify({
                  type: 'bls', data: {
                    session,
                    masterPublicKey,
                    id: ids[i],
                    publicKey: publicKeys[i],
                    secretKey: secretKeys[i],
                    message: args.message,
                  },
                });
                this.context.sendTo(peer.id.toJSON().pubKey, data);
              });

            // save own data
            const i = Object.keys(this.context.messageHandler.peerBook._peers).length;
            const data = {
              session,
              masterPublicKey,
              id: ids[i],
              publicKey: publicKeys[i],
              secretKey: secretKeys[i],
              message: args.message,
            };
            this.context.blockchain.bls = Object.assign({ signatures: [] }, data, args);
            this.context.blockchain.bls.signatures[data.id] = bls.sign(args.message, data.secretKey);

            callback(null, { session, masterPublicKey, ids });
          } else {
            // bls will be send to producer
            const data = JSON.stringify({ type: 'bls', data: args });
            this.context.sendTo(this.context.producer.pubKey, data);
            callback(null, args);
          }
        } catch (e) {
          console.log(e.stack);
          callback({ code: 500, message: e.message, stack: e.stack });
        }
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
