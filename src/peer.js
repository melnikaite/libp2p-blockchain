const PeerInfo = require('peer-info');
const Blockchain = require('./blockchain');
const MessageHandler = require('./message-handler');
const RPC = require('./rpc');

class Peer {
  /**
   *
   * @param {PeerInfo} options.peerListener
   * @param {PeerInfo} options.bootstrapPeer
   */
  constructor(options = {}) {
    Object.assign(this, {
      blockchain: new Blockchain(),
      peerPort: 10333,
      rpcPort: 3000,
    }, options);
    if (!PeerInfo.isPeerInfo(this.peerListener)) throw 'PeerInfo must be specified in options as a peerListener';

    this.peerListener.multiaddrs.add(`/ip4/0.0.0.0/tcp/${this.peerPort}`);
    this.messageHandler = new MessageHandler({
      peerListener: this.peerListener,
      blockchain: this.blockchain,
      bootstrapPeer: this.bootstrapPeer,
    });

    this.rpc = new RPC({
      peerListener: this.peerListener,
      blockchain: this.blockchain,
    });
    this.rpc.start();

    this.savePendingTransactions();

    this.selectProducer();
  }

  async savePendingTransactions() {
    if (this.blockchain.pendingTransactions.length > 0) {
      console.log(`Found ${this.blockchain.pendingTransactions.length} pending transactions`);
      await this.blockchain.savePendingTransactions(this.peerListener.id);
      const block = this.blockchain.getBlock();
      const data = JSON.stringify(block);
      // todo: add message type
      await this.broadcast(data);
    }
    setTimeout(this.savePendingTransactions.bind(this), 1000);
  }

  // todo: broadcast selected from peerBook producer at 00 minutes
  selectProducer() {
  }

  broadcast(data) {
    return Promise.all(Object.keys(this.messageHandler.pushables).map(id => {
      return new Promise(resolve => {
        const p = this.messageHandler.pushables[id];
        p.push(data);
        resolve(true);
      });
    }));
  }
}

module.exports = Peer;
