const PeerId = require('peer-id');
const PeerInfo = require('peer-info');
const Node = require('./libp2p-bundle.js');
const pull = require('pull-stream');
const Pushable = require('pull-pushable');
const async = require('async');
const Transaction = require('./transaction');
const Block = require('./block');
const Blockchain = require('./blockchain');

const pushables = {};
const protocol = '/blockchain/1.0.0';
let blockchain;

PeerId.createFromJSON(require(process.argv[2]), (err, id) => {
  if (err) throw err;

  const peerListener = new PeerInfo(id);

  peerListener.multiaddrs.add('/ip4/0.0.0.0/tcp/10333');
  const nodeListener = new Node({
    peerInfo: peerListener
  });

  nodeListener.on('peer:discovery', (peerInfo) => {
    console.log('peer:discovery', peerInfo.id.toB58String())
  });

  nodeListener.on('peer:connect', (peerInfo) => {
    console.log('peer:connect', peerInfo.id.toB58String());
    nodeListener.dialProtocol(peerInfo, protocol, (err, conn) => {
      const p = Pushable();
      pull(
        p,
        conn,
      );
      pushables[peerInfo.id.toB58String()] = p;

      // send existing blocks
      blockchain.blocks.forEach(b => p.push(JSON.stringify(b)));
    })
  });

  nodeListener.on('peer:disconnect', (peerInfo) => {
    console.log('peer:disconnect', peerInfo.id.toB58String());
    delete pushables[peerInfo.id.toB58String()];
  });

  nodeListener.on('error', (err) => {
    console.log('error', err)
  });

  // adding bootstrap peer
  if (process.argv[3]) {
    PeerId.createFromJSON({
      id: process.argv[3],
      pubKey: process.argv[4],
    }, (err, id) => {
      const peer = new PeerInfo(id);
      peer.multiaddrs.add(process.argv[5]);
      nodeListener.peerBook.put(peer)
    });
    blockchain = new Blockchain();
  } else {
    blockchain = new Blockchain();
    blockchain.savePendingTransactions(id);
  }

  nodeListener.start((err) => {
    if (err) throw err;

    nodeListener.handle(protocol, (protocol, conn) => {
      pull(
        conn,
        pull.drain(data => {
          data = JSON.parse(data);
          data.transactions = data.transactions.map(t => new Transaction(t));
          const block = new Block(data);
          blockchain.addBlock(block);
          console.dir(block, { depth: null });
        }),
      );
    });

    console.log('Listener ready, listening on:');
    peerListener.multiaddrs.forEach((ma) => {
      console.log(ma.toString())
    });

    process.stdin.setEncoding('utf8');
    process.openStdin().on('data', async (chunk) => {
      const data = chunk.toString().replace(/[\r\n]/, '');
      const transaction = new Transaction({ data });
      await transaction.sign(id);
      await blockchain.addTransaction(transaction);
      await blockchain.savePendingTransactions(id);
      async.parallel(Object.keys(pushables).map(id => {
        return (callback) => {
          const p = pushables[id];
          p.push(JSON.stringify(blockchain.getBlock()));
          callback(null, true)
        }
      }))
    })
  });

  setInterval(() => {
    // console.log(nodeListener.peerBook)
  }, 5000)
});