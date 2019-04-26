const PeerId = require('peer-id');
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
      producer: {},
      proposedProducers: [],
    }, options);
    if (!PeerInfo.isPeerInfo(this.peerListener)) throw 'PeerInfo must be specified in options as a peerListener';
    if (this.bootstrapPeer && !PeerInfo.isPeerInfo(this.bootstrapPeer)) throw 'PeerInfo must be specified in options as a bootstrapPeer';

    this.peerListener.multiaddrs.add(`/ip4/0.0.0.0/tcp/${this.peerPort}`);
    this.messageHandler = new MessageHandler({
      context: this,
    });

    this.rpc = new RPC({
      context: this,
    });
    this.rpc.start();

    this.savePendingTransactions();

    this.selectProducer();

    this.validateState();

    setInterval(this.ensureValidProducer.bind(this), 1000);
  }

  async savePendingTransactions() {
    // create and broadcast new block only if this peer is producer
    if (this.blockchain.pendingTransactions.length > 0 && this.producer.pubKey === this.peerListener.id.toJSON().pubKey) {
      console.log(`Found ${this.blockchain.pendingTransactions.length} pending transactions`);
      await this.blockchain.savePendingTransactions(this.peerListener.id);
      const block = this.blockchain.getBlock();
      const data = JSON.stringify({ type: 'block', data: block });
      await this.broadcast(data);
    }
    setTimeout(this.savePendingTransactions.bind(this), 1000);
  }

  ensureValidProducer() {
    // set valid producer if current expired
    if (this.producer.expiration <= Date.now()) {
      const expiration = this.getProducerExpiration(1);
      // todo: should be most reach
      const newProducer = this.proposedProducers.filter(p => p.expiration > Date.now()).sort()[0];
      if (newProducer) {
        this.producer.pubKey = newProducer.pubKey;
        this.producer.expiration = expiration;
        const length = this.proposedProducers.length;
        PeerId.createFromPubKey(this.producer.pubKey, (err, peerId) => {
          console.log(`Selected from ${length} proposals ${peerId._idB58String} until ${new Date(this.producer.expiration)}`);
        });
      }
      this.proposedProducers.splice(0);
    }
  }

  selectProducer() {
    if ((new Date()).getSeconds() >= 55) {
      const keys = Object.keys(this.messageHandler.peerBook._peers);
      const id = Math.round(Math.random() * (keys.length - 1));
      const electionExpiration = this.getProducerExpiration(2);
      if (keys[id]) {
        const producer = this.messageHandler.peerBook._peers[keys[id]].id.toJSON().pubKey;
        this.proposedProducers.push({
          pubKey: producer,
          expiration: electionExpiration,
        });
        this.peerListener.id._privKey.sign(producer, (err, signature) => {
          if (err) return;
          signature = signature.toString('hex');
          const data = JSON.stringify({ type: 'election', data: { producer, signature } });
          this.broadcast(data);
          console.log(`Selected from ${keys.length} peers and proposed as producer ${keys[id]}`);
        });
      } else {
        this.producer.pubKey = this.peerListener.id.toJSON().pubKey;
        this.producer.expiration = electionExpiration;
        console.log(`No peers, assigning self as producer until ${new Date(this.producer.expiration)}`);
      }
    }
    setTimeout(this.selectProducer.bind(this), 5000);
  }

  getProducerExpiration(add) {
    const date = new Date();
    date.setMinutes(date.getMinutes() + add);
    date.setSeconds(0);
    return date.getTime();
  }

  // todo: periodically contact boot node or global network to make sure current peer is up to date and not in fork
  validateState() {

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

  sendTo(pubKey, data) {
    PeerId.createFromPubKey(pubKey, (err, peerId) => {
      if (err) return;
      const p = this.messageHandler.pushables[peerId._idB58String];
      p.push(data);
    });
  }
}

module.exports = Peer;
