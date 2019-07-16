const Pushable = require('pull-pushable');
const Node = require('./libp2p-bundle.js');
const pull = require('pull-stream');
const Transaction = require('./transaction');
const Block = require('./block');
const bls = require('./bls');
const crypto = require('crypto');

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
          pull.log(),
        );
        this.pushables[peerInfo.id.toB58String()] = p;

        // send existing blocks
        // todo: ignore if producer
        p.push(JSON.stringify({ type: 'history', data: this.context.blockchain.blocks }));

        // send existing producer
        // todo: ignore if producer
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
          pull.asyncMap(async (buf, cb) => {
            const data = JSON.parse(buf);
            switch (data.type) {
              case 'history':
                if (this.context.blockchain.blocks.length === 0) {
                  data.data.forEach(block => {
                    block.transactions = block.transactions.map(t => new Transaction(t));
                    block = new Block(block);
                    this.context.blockchain.addBlock(block);
                    console.dir(block, { depth: null });
                  });
                }
                cb(null, buf);
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
                cb(null, buf);
                break;
              case 'transaction':
                this.context.ensureValidProducer();
                if (this.context.producer.pubKey === this.context.peerListener.id.toJSON().pubKey) {
                  const transaction = new Transaction(data.data);
                  this.context.blockchain.addTransaction(transaction);
                }
                cb(null, buf);
                break;
              case 'producer':
                const producerExpiration = this.context.getProducerExpiration(1);
                if (!this.context.producer.pubKey) {
                  this.context.producer.pubKey = data.data;
                  this.context.producer.expiration = producerExpiration;
                }
                cb(null, buf);
                break;
              case 'election':
                if ((new Date()).getSeconds() >= 55) {
                  const electionExpiration = this.context.getProducerExpiration(2);
                  // todo: check data.data.signature
                  // todo: add voter weight
                  // todo: resend proposed peer to the rest of network if not yet saved
                  this.context.proposedProducers.push({
                    pubKey: data.data.producer,
                    expiration: electionExpiration,
                  });
                }
                cb(null, buf);
                break;
              case 'bls':
                try {
                  if (data.data.masterPublicKey) {
                    // accept new share
                    Object.assign(this.context.blockchain.bls, data.data);
                    // sign message
                    this.context.blockchain.bls.signatures[data.data.id] = bls.sign(data.data.message, data.data.secretKey);
                    // send signature to producer
                    this.context.ensureValidProducer();
                    const args = JSON.stringify({
                      type: 'bls', data: {
                        session: this.context.blockchain.bls.session,
                        id: data.data.id,
                        publicKey: data.data.publicKey,
                        signature: this.context.blockchain.bls.signatures[data.data.id],
                      }
                    });
                    this.context.sendTo(this.context.producer.pubKey, args);
                  } else if (data.data.signature) {
                    // accept signatures and save to bls
                    this.context.blockchain.bls.signatures[data.data.id] = data.data.signature;
                    if (Object.keys(this.context.blockchain.bls.signatures).length >= this.context.blockchain.bls.threshold) {
                      // when threshold is reached verify and create transaction
                      this.context.ensureValidProducer();
                      if (this.context.producer.pubKey === this.context.peerListener.id.toJSON().pubKey) {
                        const recoveredSignature = bls.recover(Object.values(this.context.blockchain.bls.signatures), Object.keys(this.context.blockchain.bls.signatures));
                        if (bls.verify(recoveredSignature, this.context.blockchain.bls.masterPublicKey, this.context.blockchain.bls.message)) {
                          const args = { state: { storage: { [this.context.blockchain.bls.session]: this.context.blockchain.bls.message } } };
                          const transaction = new Transaction(args);
                          await transaction.sign(this.context.peerListener.id);
                          this.context.blockchain.addTransaction(transaction);
                        }
                      }
                    }
                  } else {
                    // new session
                    this.context.ensureValidProducer();
                    if (this.context.producer.pubKey === this.context.peerListener.id.toJSON().pubKey) {
                      // bls will be handled by this peer
                      const session = crypto.randomBytes(16).toString('hex');
                      // todo: cache shares for epoch
                      const { masterPublicKey, ids, secretKeys, publicKeys } = await bls.getShares(data.data.numOfPlayers, data.data.threshold);
                      Object.values(this.context.messageHandler.peerBook._peers)
                        .forEach((peer, i) => {
                          const args = JSON.stringify({
                            type: 'bls',
                            data: {
                              session,
                              masterPublicKey,
                              id: ids[i],
                              publicKey: publicKeys[i],
                              secretKey: secretKeys[i],
                              message: data.data.message,
                            },
                          });
                          this.context.sendTo(peer.id.toJSON().pubKey, args);
                        });

                      // save own data
                      const i = Object.keys(this.context.messageHandler.peerBook._peers).length;
                      const args = {
                        session,
                        masterPublicKey,
                        id: ids[i],
                        publicKey: publicKeys[i],
                        secretKey: secretKeys[i],
                        message: data.data.message,
                      };
                      this.context.blockchain.bls = Object.assign({ signatures: [] }, args, data.data);
                      this.context.blockchain.bls.signatures[args.id] = bls.sign(data.data.message, args.secretKey);
                    }
                  }
                } catch (e) {
                  console.log(e);
                }
                cb(null, buf);
                break;
              default:
                cb(null, buf);
                break;
            }
          }),
          pull.onEnd(),
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
