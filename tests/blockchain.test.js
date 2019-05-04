const Transaction = require('../src/transaction');
const Block = require('../src/block');
const Blockchain = require('../src/blockchain');
const PeerId = require('peer-id');
const hash = require('object-hash');

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
    blockchain = new Blockchain({ storage: `./data/blockchain.test.json` });
    blockchain.state.balances[peerId.toJSON().pubKey] = Number.MAX_SAFE_INTEGER;
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
    const transaction = new Transaction({ state: { storage: { key: 'value' } } });
    await transaction.sign(peerId);
    await blockchain.addTransaction(transaction);
    await blockchain.savePendingTransactions(peerId);
    await expect(blockchain.getBlock().transactions).toEqual([transaction]);
  });

  test('skip transaction without state changes', async () => {
    const originalHash = hash(blockchain.state);
    const transaction = new Transaction({ state: {} });
    await transaction.sign(peerId);
    await blockchain.addTransaction(transaction);
    await expect(blockchain.pendingTransactions).toEqual([]);
    await expect(originalHash).toEqual(hash(blockchain.state));
  });

  test('change state storage', async () => {
    const originalHash = hash(blockchain.state);
    const transaction = new Transaction({ state: { storage: { key: 'value' } } });
    await transaction.sign(peerId);
    await blockchain.addTransaction(transaction);
    await expect(blockchain.pendingTransactions).toEqual([transaction]);
    await expect(originalHash).not.toEqual(hash(blockchain.state));
    await expect(blockchain.state.storage.key).toEqual('value');
  });

  test('change state balances', async () => {
    const originalHash = hash(blockchain.state);
    const transaction = new Transaction({ state: { balances: { key: 100 } } });
    await transaction.sign(peerId);
    await blockchain.addTransaction(transaction);
    await expect(blockchain.pendingTransactions).toEqual([transaction]);
    await expect(originalHash).not.toEqual(hash(blockchain.state));
    await expect(blockchain.state.balances.key).toEqual(100);
    await expect(blockchain.state.balances[peerId.toJSON().pubKey]).toEqual(Number.MAX_SAFE_INTEGER - 100);
  });

  test('skip transaction when insufficient funds', async () => {
    const originalHash = hash(blockchain.state);
    const transactions = [
      new Transaction({ state: { balances: { key: Number.MAX_SAFE_INTEGER } } }),
      new Transaction({ state: { balances: { key: 1 } } }),
    ];
    await Promise.all(transactions.map(t => t.sign(peerId)));
    await Promise.all(transactions.map(t => blockchain.addTransaction(t)));
    await expect(blockchain.pendingTransactions.length).toEqual(1);
    await expect(originalHash).not.toEqual(hash(blockchain.state));
    await expect(blockchain.state.balances.key).toBeGreaterThanOrEqual(1);
    await expect(blockchain.state.balances[peerId.toJSON().pubKey]).toBeGreaterThanOrEqual(0);
  });

  test('skip transaction when amount is invalid', async () => {
    const originalHash = hash(blockchain.state);
    const transaction = new Transaction({ state: { balances: { key: -1 } } });
    await transaction.sign(peerId);
    await blockchain.addTransaction(transaction);
    await expect(blockchain.pendingTransactions).toEqual([]);
    await expect(originalHash).toEqual(hash(blockchain.state));
    await expect(blockchain.state.balances.key).toBeUndefined();
    await expect(blockchain.state.balances[peerId.toJSON().pubKey]).toEqual(Number.MAX_SAFE_INTEGER);
  });

  test('save data to storage', async () => {
    const timestamp = Date.now();
    await blockchain.savePendingTransactions(peerId);
    const path = blockchain.storage.replace('./data', '../data');
    await expect(require(path)[0].timestamp).toBeGreaterThanOrEqual(timestamp);
  });
});
