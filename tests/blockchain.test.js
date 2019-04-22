const Transaction = require('../src/transaction');
const Block = require('../src/block');
const Blockchain = require('../src/blockchain');
const PeerId = require('peer-id');

describe('Blockchain', () => {
  let peerId;
  let blockchain;
  const RealDate = Date;

  beforeAll((done) => {
    PeerId.createFromPrivKey(require('../keys/peer2').privKey, (err, id) => {
      peerId = id;
      done();
    });
  });

  beforeEach(() => {
    blockchain = new Blockchain({ storage: './data/blockchain.test.json' });
  });

  afterEach(() => {
    global.Date = RealDate;
  });

  test('is valid', async () => {
    await expect(blockchain.verify()).resolves.toBe(true);
  });

  test('is valid with valid genesis block', async () => {
    await blockchain.savePendingTransactions(peerId);
    await expect(blockchain.verify()).resolves.toBe(true);
  });

  test('is not valid with invalid block', async () => {
    await blockchain.savePendingTransactions(peerId);
    blockchain.blocks[0].hash = 'hash';
    await expect(blockchain.verify()).resolves.toBe(false);
  });

  test('is valid with multiple valid blocks', async () => {
    await blockchain.savePendingTransactions(peerId);
    const block = new Block({ previousHash: blockchain.getBlock().hash, blockNumber: 1, transactions: [] });
    block.sign(peerId);
    await blockchain.addBlock(block);
    await expect(blockchain.verify()).resolves.toBe(true);
  });

  test('is not valid with foreign block', async () => {
    await blockchain.savePendingTransactions(peerId);
    const block = new Block({ previousHash: 'hash', blockNumber: 1, transactions: [] });
    block.sign(peerId);
    await expect(block.verify()).resolves.toBe(true);
    blockchain.blocks.push(block);
    await expect(blockchain.verify()).resolves.toBe(false);
  });

  test('add pending transactions to latest block', async () => {
    const transaction = new Transaction({ message: 'message' });
    await transaction.sign(peerId);
    await blockchain.addTransaction(transaction);
    await blockchain.savePendingTransactions(peerId);
    await expect(blockchain.getBlock().transactions).toEqual([transaction]);
  });

  test('save data to storage', async () => {
    const timestamp = Date.now();
    await blockchain.savePendingTransactions(peerId);
    await expect(require('../data/blockchain.test.json')[0].timestamp).toBeGreaterThanOrEqual(timestamp);
  });
});
