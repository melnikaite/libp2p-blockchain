const Pushable = require('pull-pushable');
const Node = require('./libp2p-bundle.js');
const pull = require('pull-stream');
const Transaction = require('./transaction');
const Block = require('./block');

class MessageHandler extends Node {
  constructor(options) {
    super({ peerInfo: options.context.peerListener });

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
        p.push(JSON.stringify({ type: 'history', data: this.context.blockchain.blocks }));

        // send existing producer
        this.context.ensureValidProducer();
        p.push(JSON.stringify({ type: 'producer', data: this.context.producer.pubKey }));
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
    if (this.context.bootstrapPeer) {
      // adding bootstrap peer
      this.peerBook.put(this.context.bootstrapPeer);
    } else {
      this.context.producer.pubKey = this.context.peerListener.id.toJSON().pubKey;
      this.context.producer.expiration = this.context.getProducerExpiration(1);
      // creating new chain
      this.context.blockchain.state.balances[this.context.producer.pubKey] = Number.MAX_SAFE_INTEGER;
      this.context.blockchain.savePendingTransactions(this.context.peerListener.id);
    }

    this.start((err) => {
      if (err) throw err;

      this.handle(this.protocol, (protocol, conn) => {
        pull(
          conn,
          pull.drain(data => {
            data = JSON.parse(data);
            switch (data.type) {
            case 'history':
              if (this.context.blockchain.blocks.length > 0) return;
              data.data.forEach(block => {
                block.transactions = block.transactions.map(t => new Transaction(t));
                block = new Block(block);
                this.context.blockchain.addBlock(block);
                console.dir(block, { depth: null });
              });
              break;
            case 'block':
              data.data.transactions = data.data.transactions.map(t => new Transaction(t));
              const block = new Block(data.data);
              this.context.ensureValidProducer();
              // check if producer is allowed
              if (block.signer === this.context.producer.pubKey) {
                this.context.blockchain.addBlock(block);
                // todo: resend block to the rest of network if not yet saved
                console.dir(block, { depth: null });
              }
              break;
            case 'transaction':
              this.context.ensureValidProducer();
              if (this.context.producer.pubKey !== this.context.peerListener.id.toJSON().pubKey) return;
              const transaction = new Transaction(data.data);
              this.context.blockchain.addTransaction(transaction);
              break;
            case 'producer':
              const producerExpiration = this.context.getProducerExpiration(1);
              if (!this.context.producer.pubKey) {
                this.context.producer.pubKey = data.data;
                this.context.producer.expiration = producerExpiration;
              }
              break;
            case 'election':
              if ((new Date()).getSeconds() < 55) return;
              const electionExpiration = this.context.getProducerExpiration(2);
              // todo: check data.data.signature
              // todo: add voter weight
              // todo: resend proposed peer to the rest of network if not yet saved
              this.context.proposedProducers.push({
                pubKey: data.data.producer,
                expiration: electionExpiration,
              });
              break;
            }
          }),
        );
      });

      console.log('Listener ready, listening on:');
      this.context.peerListener.multiaddrs.forEach((ma) => {
        console.log(ma.toString())
      });

      setInterval(() => {
        console.log(`Peers ${Object.keys(this.peerBook._peers).length}`);
      }, 5000);
    });
  }
}

module.exports = MessageHandler;
