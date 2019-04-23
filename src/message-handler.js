const Pushable = require('pull-pushable');
const Node = require('./libp2p-bundle.js');
const pull = require('pull-stream');
const Transaction = require('./transaction');
const Block = require('./block');

class MessageHandler extends Node {
  constructor(options) {
    super({peerInfo: options.peerListener});

    Object.assign(this, {
      pushables: [],
      protocol: '/blockchain/1.0.0',
    }, options);

    this.on('peer:discovery', (peerInfo) => {
      console.log('peer:discovery', peerInfo.id.toB58String())
    });

    this.on('peer:connect', (peerInfo) => {
      console.log('peer:connect', peerInfo.id.toB58String());
      // todo: save peer to persisted storage
      this.dialProtocol(peerInfo, this.protocol, (err, conn) => {
        const p = Pushable();
        pull(
          p,
          conn,
        );
        this.pushables[peerInfo.id.toB58String()] = p;

        // send existing blocks
        this.blockchain.blocks.forEach(b => p.push(JSON.stringify(b)));
      })
    });

    this.on('peer:disconnect', (peerInfo) => {
      console.log('peer:disconnect', peerInfo.id.toB58String());
      delete this.pushables[peerInfo.id.toB58String()];
    });

    this.on('error', (err) => {
      console.log('error', err)
    });

    // todo: load known peers from persisted storage
    if (this.bootstrapPeer) {
      // adding bootstrap peer
      this.peerBook.put(this.bootstrapPeer);
    } else {
      // creating new chain
      this.blockchain.savePendingTransactions(this.peerListener.id);
    }

    this.start((err) => {
      if (err) throw err;

      this.handle(this.protocol, (protocol, conn) => {
        pull(
          conn,
          pull.drain(data => {
            data = JSON.parse(data);
            // todo: check message type
            // todo: handle election messages
            data.transactions = data.transactions.map(t => new Transaction(t));
            const block = new Block(data);
            this.blockchain.addBlock(block);
            console.dir(block, { depth: null });
          }),
        );
      });

      console.log('Listener ready, listening on:');
      this.peerListener.multiaddrs.forEach((ma) => {
        console.log(ma.toString())
      });

      setInterval(() => {
        console.log(`Peers ${Object.keys(this.peerBook._peers).length}`);
      }, 5000);
    });
  }
}

module.exports = MessageHandler;
